// Modo automático do agente de leads: quando um lead novo manda mensagem, espera ele terminar de digitar,
// pede a resposta ao atendente e, se passar por todas as travas (agenteLeads.travaDoEnvio), envia pelo seu número.
// Também organiza o funil: lead bom → MQL (daí em diante é você), lead pequeno → Descartado,
// sem resposta → F1, F2, F3 e Sem resposta. As etiquetas vão também para o WhatsApp Business, quando existem lá.
// Tudo fica registrado (Configurações → Agente de leads) com o motivo de ter enviado ou segurado.

import { supabase } from "./supabase"
import { evo } from "./evolution"
import { gravarLote, WaMessage } from "./whatsappDados"
import { atender, lerConfigAtendente } from "./atendenteServidor"
import {
  AgenteAuto, RegistroAgente, PerfilLead, travaDoEnvio, partesDaResposta, valoresEmReais, ehMensagemAutomaticaDoWhatsapp, filtroEfetivo,
  organizarLead, semFollowUp, ETIQUETA_PERFIL, proximoFollowUp, horarioDeFollowUp, ehEtiquetaDoAgente, COR_ETIQUETA_AGENTE,
} from "./agenteLeads"

const DIAS_CONVERSA_NOVA = 4
const DIAS_FOLLOW_UP = 14            // follow-up vale para lead que chegou nos últimos 14 dias
const MINUTOS_VOCE_NA_CONVERSA = 10
const MAX_REGISTROS = 300
const MIN_ENTRE_RODADAS = 10         // follow-ups: no máximo uma rodada a cada 10 min

type Registro = RegistroAgente & { ids?: string[] }
type CfgAgente = { agenteAuto?: AgenteAuto; agenteLog?: Registro[]; filtroLeads?: string; etiquetasWhatsapp?: { nome: string; cor: string }[]; agenteFollowupEm?: string }
type Conversa = { jid: string; nome: string | null; telefone: string | null; etiquetas: string[] | null; status_lead: string | null }

async function lerCfg() { return await lerConfigAtendente() as Awaited<ReturnType<typeof lerConfigAtendente>> & CfgAgente }

async function gravarCfg(mudar: (d: Record<string, unknown> & CfgAgente) => Partial<CfgAgente>) {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const d = (data?.data ?? {}) as Record<string, unknown> & CfgAgente
  await supabase.from("AppConfig").update({ data: { ...d, ...mudar(d) } }).eq("id", 1)
}

// Registro + garante que as etiquetas do agente existem (com cor) na lista de etiquetas do WhatsApp
const registrar = (r: Registro) => gravarCfg(d => {
  const defs = [...(d.etiquetasWhatsapp ?? [])]
  for (const [nome, cor] of Object.entries(COR_ETIQUETA_AGENTE)) if (!defs.some(e => e.nome === nome)) defs.push({ nome, cor })
  return { etiquetasWhatsapp: defs, agenteLog: [r, ...(d.agenteLog ?? [])].slice(0, MAX_REGISTROS) }
})

const lerConversa = async (jid: string) =>
  (await supabase.from("whatsapp_conversas").select("jid, nome, telefone, etiquetas, status_lead").eq("jid", jid).maybeSingle()).data as Conversa | null

// ── Etiquetas no WhatsApp Business (Evolution). Só funciona com etiquetas criadas no app com o mesmo nome. ──
type EtiquetaWa = { id: string; name: string }
let cacheWa: { em: number; lista: EtiquetaWa[] } | null = null
async function etiquetasDoWhatsapp() {
  if (cacheWa && Date.now() - cacheWa.em < 10 * 60_000) return cacheWa.lista
  const r = await evo<EtiquetaWa[]>("/label/findLabels/{i}")
  cacheWa = { em: Date.now(), lista: Array.isArray(r.corpo) ? r.corpo : [] }
  return cacheWa.lista
}
async function sincronizarNoWhatsapp(number: string, antes: string[], depois: string[]) {
  const mudancas = [
    ...depois.filter(e => !antes.includes(e)).map(e => ({ e, action: "add" })),
    ...antes.filter(e => !depois.includes(e)).map(e => ({ e, action: "remove" })),
  ].filter(m => ehEtiquetaDoAgente(m.e))
  if (!mudancas.length) return
  const lista = await etiquetasDoWhatsapp().catch(() => [])
  const id = (nome: string) => lista.find(l => l.name?.trim().toLowerCase() === nome.toLowerCase())?.id
  for (const m of mudancas) {
    const labelId = id(m.e)
    if (labelId) await evo("/label/handleLabel/{i}", { method: "POST", body: JSON.stringify({ number, labelId, action: m.action }) }).catch(() => null)
  }
}

// Troca as etiquetas (e a etapa do funil, se veio) no sistema e no WhatsApp
async function aplicar(c: Conversa, etiquetas: string[], etapa: string | null) {
  const antes = c.etiquetas ?? []
  const mesmas = antes.length === etiquetas.length && antes.every(e => etiquetas.includes(e))
  const campos: Record<string, unknown> = {}
  if (!mesmas) campos.etiquetas = etiquetas
  if (etapa && etapa !== c.status_lead) { campos.status_lead = etapa; campos.ultima_classificacao_at = new Date().toISOString() }
  if (!Object.keys(campos).length) return
  await supabase.from("whatsapp_conversas").update(campos).eq("jid", c.jid)
  if (!mesmas) await sincronizarNoWhatsapp(c.telefone || c.jid, antes, etiquetas)
  c.etiquetas = etiquetas
  if (etapa) c.status_lead = etapa
}

const organizar = (c: Conversa, perfil: PerfilLead) => {
  const o = organizarLead(c.etiquetas ?? [], perfil)
  return aplicar(c, o.etiquetas, o.etapa)
}

async function enviar(c: Conversa, texto: string): Promise<{ ids: string[]; erro?: string }> {
  const number = c.telefone || c.jid
  const ids: string[] = []
  for (const [i, parte] of partesDaResposta(texto).entries()) {
    if (i) await new Promise(res => setTimeout(res, 1500))
    const env = await evo<WaMessage>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number, text: parte }) })
    if (!env.ok || !env.corpo?.key?.id) return { ids, erro: `não enviou (${env.status})` }
    ids.push(env.corpo.key.id)
    await gravarLote([{ ...env.corpo, key: { ...env.corpo.key, remoteJid: c.jid, fromMe: true } }])
  }
  return { ids }
}

const ultimaDa = async (jid: string) =>
  (await supabase.from("whatsapp_mensagens").select("id, from_me, ts").eq("jid", jid).order("ts", { ascending: false }).limit(1).maybeSingle()).data

const primeiraDa = async (jid: string) =>
  (await supabase.from("whatsapp_mensagens").select("ts").eq("jid", jid).order("ts", { ascending: true }).limit(1).maybeSingle()).data

async function voceNaConversa(jid: string, log: Registro[]) {
  const idsDoAgente = new Set(log.flatMap(l => l.ids ?? []))
  const desde = new Date(Date.now() - MINUTOS_VOCE_NA_CONVERSA * 60_000).toISOString()
  const { data: minhas } = await supabase.from("whatsapp_mensagens").select("id, corpo").eq("jid", jid).eq("from_me", true).gte("ts", desde)
  return (minhas ?? []).some(m => !idsDoAgente.has(m.id) && !ehMensagemAutomaticaDoWhatsapp(m.corpo))
}

const contexto = (cfg: CfgAgente, log: Registro[]) => ({
  enviadasHoje: log.filter(l => l.enviou && new Date(l.em).getTime() > Date.now() - 86_400_000).length,
  maxPorDia: cfg.agenteAuto?.maxPorDia ?? 6,
  jaEncerrouPequeno: log.some(l => l.enviou && l.perfil === "pequeno"),
  precosDoFiltro: valoresEmReais(filtroEfetivo(cfg.filtroLeads)),
})

// ── Lead mandou mensagem ─────────────────────────────────────────────────────
export async function responderSozinho(msgId: string) {
  const cfg = await lerCfg()
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
  const primeira = await primeiraDa(jid)
  const conversaNova = !!primeira && Date.now() - new Date(primeira.ts).getTime() < DIAS_CONVERSA_NOVA * 86_400_000
  const c = await lerConversa(jid)
  if (!c) return
  // Respondeu: sai do follow-up (vale também para lead que você está atendendo)
  await aplicar(c, semFollowUp(c.etiquetas ?? []), null)
  if (!conversaNova || c.status_lead === "mql") return   // MQL: daqui em diante é você

  const log = (cfg.agenteLog ?? []).filter(l => l.jid === jid)
  const manualRecente = await voceNaConversa(jid, log)
  if (manualRecente) return

  const a = await atender(jid, { cfg, automatico: true }).catch(e => ({ ok: false as const, erro: String(e), status: 500 }))
  if (!a.ok) return registrar({ em: new Date().toISOString(), jid, nome: c.nome, perfil: "indefinido", enviou: false, texto: "", motivo: `IA falhou: ${a.erro}` })
  const { r, conversa } = a

  const trava = travaDoEnvio({
    ligado: true, resposta: r.resposta, alerta: r.alerta, podeSozinho: r.pode_enviar_sozinho, lead: r.lead,
    conversaNova, clienteCadastrado: conversa.clienteCadastrado, manualRecente, emMql: false, ...contexto(cfg, log),
  })
  // Lead pequeno só vai para Descartado depois de orientado (senão sumiria da sua lista sem resposta)
  const organiza = !conversa.clienteCadastrado && r.lead.perfil !== "nao_lead"
  if (organiza && r.lead.perfil !== "pequeno") await organizar(c, r.lead.perfil)
  const pequeno = async (orientado: boolean) => {
    if (!organiza || r.lead.perfil !== "pequeno") return
    if (orientado || log.some(l => l.enviou && l.perfil === "pequeno")) return organizar(c, "pequeno")
    return aplicar(c, [...(c.etiquetas ?? []).filter(e => !ehEtiquetaDoAgente(e) || e.startsWith("F")), ETIQUETA_PERFIL.pequeno!], null)
  }

  // Chegou mensagem nova (ou você respondeu) enquanto a IA pensava: a resposta ficou velha
  const agora = await ultimaDa(jid)
  const velha = !agora || agora.id !== msgId
  const base = { em: new Date().toISOString(), jid, nome: conversa.nome, perfil: r.lead.perfil, texto: r.resposta }
  if (trava || velha) await pequeno(false)
  if (trava || velha) return registrar({ ...base, enviou: false, motivo: trava ?? "chegou mensagem nova enquanto preparava" + (r.motivo_alerta ? ` · ${r.motivo_alerta}` : "") })

  const env = await enviar(c, r.resposta)
  await pequeno(env.ids.length > 0)
  return registrar({ ...base, enviou: env.ids.length > 0, ids: env.ids, motivo: env.erro ?? r.lead.motivo })
}

// ── Lead parou de responder: F1, F2, F3 e Sem resposta ───────────────────────
let ultimaRodadaLocal = 0

// Chamado a cada evento do webhook (e pelo cron diário): roda no máximo a cada 10 min
export async function talvezFollowUps() {
  if (Date.now() - ultimaRodadaLocal < MIN_ENTRE_RODADAS * 60_000) return
  ultimaRodadaLocal = Date.now()
  const cfg = await lerCfg()
  if (!cfg.agenteAuto?.ligado || !horarioDeFollowUp()) return
  if (cfg.agenteFollowupEm && Date.now() - new Date(cfg.agenteFollowupEm).getTime() < MIN_ENTRE_RODADAS * 60_000) return
  await gravarCfg(() => ({ agenteFollowupEm: new Date().toISOString() }))
  await followUps(cfg)
}

export async function followUps(cfg: Awaited<ReturnType<typeof lerCfg>>) {
  // Só leads que o agente já atendeu (estão no registro) e não descartados. No MQL (seu) ele só etiqueta, não envia.
  const jidsDoAgente = [...new Set((cfg.agenteLog ?? []).map(l => l.jid))]
  if (!jidsDoAgente.length) return
  const { data } = await supabase.from("whatsapp_conversas")
    .select("jid, nome, telefone, etiquetas, status_lead, ultima_recebida_at, ultima_enviada_at, fechada_em")
    .in("jid", jidsDoAgente.slice(0, 300))
    .not("ultima_enviada_at", "is", null)
    .gte("ultima_enviada_at", new Date(Date.now() - DIAS_FOLLOW_UP * 86_400_000).toISOString())
  const candidatos = (data ?? []).filter(c =>
    !c.fechada_em && !["descartado", "perdido", "orcamento", "negociando", "pedido"].includes(c.status_lead ?? "")
    && (!c.ultima_recebida_at || c.ultima_recebida_at < c.ultima_enviada_at))
    .map(c => ({ c: c as Conversa, enviada: c.ultima_enviada_at as string, passo: proximoFollowUp(c.etiquetas ?? [], (Date.now() - new Date(c.ultima_enviada_at).getTime()) / 3_600_000) }))
    // já tentou este passo depois da sua última mensagem (e segurou): não tenta de novo
    .filter(x => x.passo && !(cfg.agenteLog ?? []).some(l => l.jid === x.c.jid && l.em > x.enviada && l.passo === (x.passo!.tipo === "encerrar" ? "Sem resposta" : `F${x.passo!.nivel}`)))
    .slice(0, 3)   // cabe no minuto da Vercel; o resto vai na próxima rodada

  await Promise.all(candidatos.map(async ({ c, passo }) => {
    const base = { em: new Date().toISOString(), jid: c.jid, nome: c.nome }
    if (passo!.tipo === "encerrar") {
      await aplicar(c, passo!.etiquetas, "perdido")
      return registrar({ ...base, perfil: "indefinido", enviou: false, texto: "", motivo: "3 follow-ups sem resposta: foi para Perdido", passo: "Sem resposta" })
    }
    const nivel = passo!.nivel
    if (c.status_lead === "mql") {
      await aplicar(c, passo!.etiquetas, null)
      return registrar({ ...base, perfil: "icp", enviou: false, texto: "", motivo: `F${nivel}: MQL sem resposta, é com você`, passo: `F${nivel}` })
    }
    const log = (cfg.agenteLog ?? []).filter(l => l.jid === c.jid)
    const primeira = await primeiraDa(c.jid)
    const recente = !!primeira && Date.now() - new Date(primeira.ts).getTime() < DIAS_FOLLOW_UP * 86_400_000
    const a = await atender(c.jid, { cfg, automatico: true, followUp: nivel }).catch(() => null)
    if (!a?.ok) return
    const { r, conversa } = a
    const trava = travaDoEnvio({
      ligado: true, resposta: r.resposta, alerta: r.alerta, podeSozinho: r.pode_enviar_sozinho, lead: r.lead,
      conversaNova: recente, clienteCadastrado: conversa.clienteCadastrado, manualRecente: await voceNaConversa(c.jid, log), emMql: false,
      ...contexto(cfg, log),
    })
    const dados = { ...base, perfil: r.lead.perfil, texto: r.resposta, passo: `F${nivel}` }
    if (trava) return registrar({ ...dados, enviou: false, motivo: `F${nivel} segurado: ${trava}` })
    const env = await enviar(c, r.resposta)
    if (env.ids.length) await aplicar(c, passo!.etiquetas, null)
    return registrar({ ...dados, enviou: env.ids.length > 0, ids: env.ids, motivo: env.erro ?? `F${nivel}: sem resposta` })
  }))
}
