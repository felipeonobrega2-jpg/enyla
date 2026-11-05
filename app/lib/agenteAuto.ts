// Modo automático do agente de leads: quando um lead novo manda mensagem, espera ele terminar de digitar,
// pede a resposta ao atendente e, se passar por todas as travas (agenteLeads.travaDoEnvio), envia pelo seu número.
// Tudo fica registrado (Configurações → Agente de leads) com o motivo de ter enviado ou segurado.

import { supabase } from "./supabase"
import { evo } from "./evolution"
import { gravarLote, WaMessage } from "./whatsappDados"
import { atender, lerConfigAtendente } from "./atendenteServidor"
import { AgenteAuto, RegistroAgente, ETIQUETA_PERFIL, travaDoEnvio, partesDaResposta, valoresEmReais, ehMensagemAutomaticaDoWhatsapp, filtroEfetivo } from "./agenteLeads"

const DIAS_CONVERSA_NOVA = 4
const MINUTOS_VOCE_NA_CONVERSA = 10
const MAX_REGISTROS = 300

type CfgAgente = { agenteAuto?: AgenteAuto; agenteLog?: (RegistroAgente & { ids?: string[] })[]; filtroLeads?: string; etiquetasWhatsapp?: { nome: string; cor: string }[] }

const COR_ETIQUETA: Record<string, string> = { "ICP": "#009351", "Lead médio": "#8456e8", "Lead pequeno": "#a0a0aa" }

async function registrar(r: RegistroAgente & { ids?: string[] }) {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const d = (data?.data ?? {}) as Record<string, unknown> & CfgAgente
  const etiquetas = [...(d.etiquetasWhatsapp ?? [])]
  const nova = ETIQUETA_PERFIL[r.perfil]
  if (nova && !etiquetas.some(e => e.nome === nova)) etiquetas.push({ nome: nova, cor: COR_ETIQUETA[nova] })
  await supabase.from("AppConfig").update({ data: { ...d, etiquetasWhatsapp: etiquetas, agenteLog: [r, ...(d.agenteLog ?? [])].slice(0, MAX_REGISTROS) } }).eq("id", 1)
}

// A conversa recebe a etiqueta do perfil (tira a de perfil antigo)
async function etiquetar(jid: string, perfil: RegistroAgente["perfil"]) {
  const nova = ETIQUETA_PERFIL[perfil]
  if (!nova) return
  const { data } = await supabase.from("whatsapp_conversas").select("etiquetas").eq("jid", jid).maybeSingle()
  const todas = Object.values(ETIQUETA_PERFIL)
  const atuais = ((data?.etiquetas ?? []) as string[]).filter(e => !todas.includes(e))
  await supabase.from("whatsapp_conversas").update({ etiquetas: [...atuais, nova] }).eq("jid", jid)
}

const ultimaDa = async (jid: string) =>
  (await supabase.from("whatsapp_mensagens").select("id, from_me").eq("jid", jid).order("ts", { ascending: false }).limit(1).maybeSingle()).data

export async function responderSozinho(msgId: string) {
  const cfg = await lerConfigAtendente() as Awaited<ReturnType<typeof lerConfigAtendente>> & CfgAgente
  const auto = cfg.agenteAuto
  if (!auto?.ligado) return

  // Espera o lead terminar (costumam mandar 2–3 mensagens seguidas); só a última dispara a resposta
  await new Promise(r => setTimeout(r, Math.min(40, Math.max(5, auto.esperaSeg ?? 20)) * 1000))
  // A conversa pelo id gravado (a gravação pode ter juntado o @lid com o número)
  const { data: msg } = await supabase.from("whatsapp_mensagens").select("jid").eq("id", msgId).maybeSingle()
  if (!msg?.jid) return
  const jid = msg.jid as string
  const ultima = await ultimaDa(jid)
  if (!ultima || ultima.id !== msgId || ultima.from_me) return

  // Filtro barato antes de chamar a IA: só contato novo (fornecedor e cliente antigo nunca)
  const { data: primeira } = await supabase.from("whatsapp_mensagens").select("ts").eq("jid", jid).order("ts", { ascending: true }).limit(1).maybeSingle()
  const conversaNova = !!primeira && Date.now() - new Date(primeira.ts).getTime() < DIAS_CONVERSA_NOVA * 86_400_000
  if (!conversaNova) return

  const log = (cfg.agenteLog ?? []).filter(l => l.jid === jid)
  const idsDoAgente = new Set(log.flatMap(l => l.ids ?? []))
  const desde = new Date(Date.now() - MINUTOS_VOCE_NA_CONVERSA * 60_000).toISOString()
  const { data: minhas } = await supabase.from("whatsapp_mensagens").select("id, corpo").eq("jid", jid).eq("from_me", true).gte("ts", desde)
  const manualRecente = (minhas ?? []).some(m => !idsDoAgente.has(m.id) && !ehMensagemAutomaticaDoWhatsapp(m.corpo))
  if (manualRecente) return

  const a = await atender(jid, { cfg, automatico: true }).catch(e => ({ ok: false as const, erro: String(e), status: 500 }))
  if (!a.ok) return registrar({ em: new Date().toISOString(), jid, nome: null, perfil: "indefinido", enviou: false, texto: "", motivo: `IA falhou: ${a.erro}` })
  const { r, conversa } = a

  const dia = Date.now() - 86_400_000
  const trava = travaDoEnvio({
    ligado: true, resposta: r.resposta, alerta: r.alerta, podeSozinho: r.pode_enviar_sozinho, lead: r.lead,
    conversaNova, clienteCadastrado: conversa.clienteCadastrado, manualRecente,
    enviadasHoje: log.filter(l => l.enviou && new Date(l.em).getTime() > dia).length, maxPorDia: auto.maxPorDia ?? 6,
    jaEncerrouPequeno: log.some(l => l.enviou && l.perfil === "pequeno"),
    precosDoFiltro: valoresEmReais(filtroEfetivo(cfg.filtroLeads)),
  })
  await etiquetar(jid, r.lead.perfil)

  // Chegou mensagem nova (ou você respondeu) enquanto a IA pensava: a resposta ficou velha
  const agora = await ultimaDa(jid)
  const velha = !agora || agora.id !== msgId
  const base = { em: new Date().toISOString(), jid, nome: conversa.nome, perfil: r.lead.perfil, texto: r.resposta }
  if (trava || velha) return registrar({ ...base, enviou: false, motivo: trava ?? "chegou mensagem nova enquanto preparava" + (r.motivo_alerta ? ` · ${r.motivo_alerta}` : "") })

  const { data: c } = await supabase.from("whatsapp_conversas").select("telefone").eq("jid", jid).maybeSingle()
  const number = c?.telefone || jid
  const ids: string[] = []
  for (const [i, parte] of partesDaResposta(r.resposta).entries()) {
    if (i) await new Promise(res => setTimeout(res, 1500))
    const env = await evo<WaMessage>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number, text: parte }) })
    if (!env.ok || !env.corpo?.key?.id) return registrar({ ...base, enviou: ids.length > 0, ids, motivo: `não enviou (${env.status})` })
    ids.push(env.corpo.key.id)
    await gravarLote([{ ...env.corpo, key: { ...env.corpo.key, remoteJid: jid, fromMe: true } }])
  }
  return registrar({ ...base, enviou: true, ids, motivo: r.lead.motivo })
}
