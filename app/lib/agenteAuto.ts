// Modo automático do agente de leads: quando um lead novo manda mensagem, espera ele terminar de digitar,
// pede a resposta ao atendente e, se passar por todas as travas (agenteLeads.travaDoEnvio), envia pelo seu número.
// Também organiza o funil: lead bom → MQL (daí em diante é você), lead pequeno → Descartado,
// sem resposta → F1, F2, F3 e Sem resposta. As etiquetas vão também para o WhatsApp Business, quando existem lá.
// Tudo fica registrado (Configurações → Agente de leads) com o motivo de ter enviado ou segurado.

import { cotarDigital, montarPedido, pedidoDaConversa, mudouACotacao, textoLinkPedido, valoresDoPedido, PedidoDigital, pedidoPendente, textoLembreteDigital } from "./digital"
import { linkPedido } from "./digitalLink"
import type { RegraDigital } from "./precoDigital"
import { supabase } from "./supabase"
import { evo } from "./evolution"
import { gravarLote, WaMessage, deveIgnorar } from "./whatsappDados"
import { atender, lerConfigAtendente } from "./atendenteServidor"
import { garantirTelefone } from "./contatosServidor"
import { textoAvisoReativacao } from "./reativacao"
import {
  AgenteAuto, RegistroAgente, PerfilLead, travaDoEnvio, partesDaResposta, valoresEmReais, ehMensagemAutomaticaDoWhatsapp, filtroEfetivo,
  organizarLead, semFollowUp, ETIQUETA_PERFIL, ehQualificado, jaViuVitrine, VITRINE_PADRAO, textoAvisoMql, ehSemCredito, proximoFollowUp, horarioDeFollowUp, ehEtiquetaDoAgente, COR_ETIQUETA_AGENTE, ETIQUETAS_AGENTE,
  marcar, marcosDoRegistro, Marcos, paradoParaRetomar,
} from "./agenteLeads"
import { corrigirCumprimento } from "./atendente"
import { mudarConfig } from "./configAtomica"

const DIAS_CONVERSA_NOVA = 4
const HORAS_RETOMAR = 24
const DIAS_FOLLOW_UP = 14            // follow-up vale para lead que chegou nos últimos 14 dias
const MINUTOS_VOCE_NA_CONVERSA = 10
const MAX_REGISTROS = 300
const MAX_IDS_AGENTE = 1500
const MAX_POR_DIA_DIGITAL = 25
// Travas em que a resposta ficou para você decidir: essas viram aviso no seu WhatsApp
const TRAVAS_COM_AVISO = ["precisa de você", "a IA pediu", "citou valor", "resposta longa", "já respondeu"]
const MIN_ENTRE_RODADAS = 10         // follow-ups: no máximo uma rodada a cada 10 min

export type Registro = RegistroAgente & { ids?: string[] }
export type CfgAgente = { pedidosDigitais?: PedidoDigital[]; digital?: RegraDigital; agenteAuto?: AgenteAuto; agenteLog?: Registro[]; agenteMarcos?: Marcos; filtroLeads?: string; etiquetasWhatsapp?: { nome: string; cor: string }[]; agenteFollowupEm?: string; agenteSemCreditoEm?: string; agenteRetomadaEm?: string; agenteRetomadas?: string[]; agenteIds?: string[]; agenteTratadas?: string[] }
export type Conversa = { jid: string; nome: string | null; telefone: string | null; etiquetas: string[] | null; status_lead: string | null }

export async function lerCfg() { return await lerConfigAtendente() as Awaited<ReturnType<typeof lerConfigAtendente>> & CfgAgente }

export async function gravarCfg(mudar: (d: Record<string, unknown> & CfgAgente) => Partial<CfgAgente>) {
  await mudarConfig(d => mudar(d as Record<string, unknown> & CfgAgente))
}

// Registro + garante que as etiquetas do agente existem (com cor) na lista de etiquetas do WhatsApp
export const registrar = (r: Registro) => gravarCfg(d => {
  const defs = [...(d.etiquetasWhatsapp ?? [])]
  for (const [nome, cor] of Object.entries(COR_ETIQUETA_AGENTE)) if (!defs.some(e => e.nome === nome)) defs.push({ nome, cor })
  return {
    etiquetasWhatsapp: defs, agenteLog: [r, ...(d.agenteLog ?? [])].slice(0, MAX_REGISTROS),
    agenteMarcos: marcar(d.agenteMarcos ?? marcosDoRegistro(d.agenteLog ?? []), r),
  }
})

export const lerConversa = async (jid: string) =>
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

// Manda para o WhatsApp Business as etiquetas do agente que já estão no sistema (arrumação em lote).
// Em páginas: devolve quantas conversas foram e se ainda há mais.
export async function enviarEtiquetasAoWhatsapp(pagina: number, tamanho = 30) {
  const nomes = Object.keys(COR_ETIQUETA_AGENTE)
  const { data, count } = await supabase.from("whatsapp_conversas").select("jid, telefone, etiquetas", { count: "exact" })
    .overlaps("etiquetas", nomes).order("jid").range(pagina * tamanho, pagina * tamanho + tamanho - 1)
  const lista = await etiquetasDoWhatsapp().catch(() => [])
  if (!lista.length) return { feitas: 0, total: count ?? 0, mais: false, erro: "Não achei etiquetas no seu WhatsApp Business. Crie no app as etiquetas com os mesmos nomes." }
  const faltando = nomes.filter(n => !lista.some(l => l.name?.trim().toLowerCase() === n.toLowerCase()))
  const fila = [...(data ?? [])]
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (fila.length) {
      const c = fila.shift()!
      await sincronizarNoWhatsapp(c.telefone || c.jid, [], (c.etiquetas ?? []) as string[])
    }
  }))
  return { feitas: (data ?? []).length, total: count ?? 0, mais: (pagina + 1) * tamanho < (count ?? 0), faltando }
}

// Troca as etiquetas (e a etapa do funil, se veio) no sistema e no WhatsApp
export async function aplicar(c: Conversa, etiquetas: string[], etapa: string | null) {
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

// Como uma pessoa no WhatsApp: lê a mensagem, fica "digitando…" o tempo do tamanho do texto, pausa entre as mensagens
const tempoDigitando = (t: string) => Math.min(4000, 1200 + t.length * 25 + Math.random() * 800)

async function marcarLida(c: Conversa, msgId?: string) {
  if (!msgId) return
  await evo("/chat/markMessageAsRead/{i}", { method: "POST", body: JSON.stringify({ readMessages: [{ remoteJid: c.jid, fromMe: false, id: msgId }] }) }).catch(() => null)
}

export async function enviar(c: Conversa, texto: string, lida?: string): Promise<{ ids: string[]; erro?: string }> {
  const number = c.telefone || c.jid
  const ids: string[] = []
  await marcarLida(c, lida)
  // Cumprimento pela hora do envio (a resposta pode ter sido preparada antes, ou a IA ter copiado o do cliente)
  for (const [i, parte] of partesDaResposta(corrigirCumprimento(texto)).entries()) {
    if (i) await new Promise(res => setTimeout(res, 800 + Math.random() * 1500))
    // "delay" faz o Evolution mostrar "digitando…" antes de enviar
    const env = await evo<WaMessage>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number, text: parte, delay: Math.round(tempoDigitando(parte)) }) })
    if (!env.ok || !env.corpo?.key?.id) return { ids, erro: `não enviou (${env.status})` }
    ids.push(env.corpo.key.id)
    await gravarLote([{ ...env.corpo, key: { ...env.corpo.key, remoteJid: c.jid, fromMe: true } }])
    // Guarda à parte tudo o que o agente mandou: é assim que ele distingue a mensagem dele da sua
    await gravarCfg(d => ({ agenteIds: [env.corpo!.key.id, ...(d.agenteIds ?? [])].slice(0, MAX_IDS_AGENTE) })).catch(() => null)
  }
  return { ids }
}

// ── Aviso de MQL no seu WhatsApp ───────────────────────────────────────────────
// O seu número (dono da conexão), para o aviso ir no chat "Você" quando não há outro número configurado
let cacheDono: string | null = null
export async function seuNumero() {
  if (cacheDono) return cacheDono
  const r = await evo<unknown>(`/instance/fetchInstances?instanceName=${encodeURIComponent(process.env.EVOLUTION_INSTANCE ?? "")}`)
  const lista = (Array.isArray(r.corpo) ? r.corpo : [r.corpo]) as { ownerJid?: string; owner?: string; instance?: { owner?: string; ownerJid?: string } }[]
  const jid = lista.map(i => i?.ownerJid ?? i?.owner ?? i?.instance?.ownerJid ?? i?.instance?.owner).find(Boolean)
  cacheDono = jid ? jid.split("@")[0].split(":")[0] : null
  return cacheDono
}

// A conversa fica como não lida no seu celular (você vê na lista que tem lead esperando)
export async function marcarNaoLida(c: Conversa, msgId: string) {
  const { data: m } = await supabase.from("whatsapp_mensagens").select("ts").eq("id", msgId).maybeSingle()
  await evo("/chat/markChatUnread/{i}", { method: "POST", body: JSON.stringify({
    chat: c.jid, lastMessage: { key: { remoteJid: c.jid, fromMe: false, id: msgId }, messageTimestamp: m?.ts ? Math.floor(new Date(m.ts).getTime() / 1000) : undefined },
  }) }).catch(() => null)
}

async function avisarMql(cfg: CfgAgente, c: Conversa, r: { lead: { perfil: PerfilLead; quantidade_total: number | null; motivo: string }; dados?: { resumo?: string } }) {
  const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
  if (!destino) return
  const texto = textoAvisoMql({ nome: c.nome, telefone: c.telefone, perfil: r.lead.perfil, quantidade: r.lead.quantidade_total, motivo: r.lead.motivo, resumo: r.dados?.resumo })
  await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text: texto }) }).catch(() => null)
}

// A IA ficou sem crédito: avisa você no WhatsApp (no máximo a cada 6 h). As saudações seguem saindo sem IA.
// Aviso de resposta segurada: quem é, por quê e o que a IA ia mandar (você copia, ajusta e manda)
async function avisarSegurado(cfg: CfgAgente, c: Conversa, motivo: string, sugestao: string) {
  const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
  if (!destino) return
  const tel = (c.telefone || c.jid).replace(/@.*/, "")
  const texto = [`⏸️ *Segurei a resposta* · ${c.nome ?? tel}`, `wa.me/${tel}`, `Motivo: ${motivo}`, sugestao.trim() ? `\nIa mandar:\n${sugestao.trim()}` : ""].filter(Boolean).join("\n")
  await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text: texto }) })
}

async function avisarSemCredito(cfg: CfgAgente) {
  if (cfg.agenteSemCreditoEm && Date.now() - new Date(cfg.agenteSemCreditoEm).getTime() < 6 * 3_600_000) return
  await gravarCfg(() => ({ agenteSemCreditoEm: new Date().toISOString() }))
  const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
  if (!destino) return
  await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text:
    "⚠️ *A IA do sistema parou: sem crédito ou limite de gasto atingido na Anthropic.*\nO agente parou de responder os leads (as saudações do anúncio continuam saindo). Em console.anthropic.com, confira o saldo (Billing) e o limite de gasto mensal (Limits); se puder, ligue a recarga automática." }) }).catch(() => null)
}

const ultimaDa = async (jid: string) =>
  (await supabase.from("whatsapp_mensagens").select("id, from_me, ts").eq("jid", jid).order("ts", { ascending: false }).limit(1).maybeSingle()).data

const primeiraDa = async (jid: string) =>
  (await supabase.from("whatsapp_mensagens").select("ts").eq("jid", jid).order("ts", { ascending: true }).limit(1).maybeSingle()).data

async function voceNaConversa(jid: string, log: Registro[], cfg?: CfgAgente) {
  const idsDoAgente = new Set([...log.flatMap(l => l.ids ?? []), ...(cfg?.agenteIds ?? [])])
  const desde = new Date(Date.now() - MINUTOS_VOCE_NA_CONVERSA * 60_000).toISOString()
  const { data: minhas } = await supabase.from("whatsapp_mensagens").select("id, corpo").eq("jid", jid).eq("from_me", true).gte("ts", desde)
  return (minhas ?? []).some(m => !idsDoAgente.has(m.id) && !ehMensagemAutomaticaDoWhatsapp(m.corpo))
}

const contexto = (cfg: CfgAgente, log: Registro[], jid: string) => ({
  enviadasHoje: log.filter(l => l.enviou && new Date(l.em).getTime() > Date.now() - 86_400_000).length,
  maxPorDia: cfg.agenteAuto?.maxPorDia ?? 6,
  // Vendendo em digital, o lead pequeno segue na conversa até o orçamento (não é só uma mensagem)
  jaEncerrouPequeno: cfg.agenteAuto?.pequenoParceiro !== false && (log.some(l => l.enviou && l.perfil === "pequeno") || !!cfg.agenteMarcos?.[jid]?.passos?.["Pequeno"]),
  // Valores do orçamento digital desta conversa também podem sair (a IA responde dúvidas sobre ele)
  precosDoFiltro: [...valoresEmReais(filtroEfetivo(cfg.filtroLeads)), ...(pedidoDaConversa(cfg.pedidosDigitais, jid) ? valoresDoPedido(pedidoDaConversa(cfg.pedidosDigitais, jid)!) : [])],
})

// ── Lead mandou mensagem ─────────────────────────────────────────────────────
// Ritmo de gente: a resposta sai entre ~40 s e ~70 s depois da última mensagem do lead, nunca no mesmo tempo.
// Como cada execução na Vercel tem 1 minuto, a espera vai em duas etapas: o webhook espera a 1ª parte e chama
// /api/whatsapp/webhook/responder, que espera a 2ª, pensa e digita.
const espera = (min: number, max: number) => new Promise(r => setTimeout(r, (min + Math.random() * (max - min)) * 1000))

// A conversa pelo id gravado (a gravação pode ter juntado o @lid com o número); null se a mensagem já não é a última
async function aindaEhAUltima(msgId: string) {
  const { data: msg } = await supabase.from("whatsapp_mensagens").select("jid").eq("id", msgId).maybeSingle()
  if (!msg?.jid) return null
  const ultima = await ultimaDa(msg.jid as string)
  return ultima && ultima.id === msgId && !ultima.from_me ? msg.jid as string : null
}

// 1ª etapa (no webhook): espera o lead terminar de escrever (costumam mandar 2–3 mensagens seguidas)
export async function agendarResposta(msgId: string, origem: string) {
  const cfg = await lerCfg()
  if (!cfg.agenteAuto?.ligado) {
    // Desligado, o agente não responde; mas resposta a uma retomada ainda vira aviso para você
    const jid = await aindaEhAUltima(msgId)
    const c = jid ? await lerConversa(jid) : null
    if (c) await respondeuRetomada(cfg, c, msgId).catch(() => null)
    return
  }
  await espera(20, 28)
  if (!await aindaEhAUltima(msgId)) return   // chegou outra: a última é quem dispara
  await fetch(`${origem}/api/whatsapp/webhook/responder?token=${encodeURIComponent(process.env.WHATSAPP_WEBHOOK_SECRET ?? "")}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msgId }), signal: AbortSignal.timeout(8000),
  }).catch(() => null)
}

// Reserva atômica da mensagem: se outra execução já pegou esta mensagem, esta desiste
async function reservarMensagem(msgId: string): Promise<boolean> {
  let minha = false
  await mudarConfig((d: Record<string, unknown> & CfgAgente) => {
    if ((d.agenteTratadas ?? []).includes(msgId)) { minha = false; return null }
    minha = true
    return { agenteTratadas: [msgId, ...(d.agenteTratadas ?? [])].slice(0, 500) }
  })
  return minha
}

// 2ª etapa: mais um tempo (como quem viu e vai responder), pensa, lê e digita
export async function responderSozinho(msgId: string) {
  const cfg = await lerCfg()
  const auto = cfg.agenteAuto
  if (!auto?.ligado) return
  const inicio = Date.now()
  await espera(10, 25)
  const jid = await aindaEhAUltima(msgId)
  if (!jid) return
  // Cada mensagem do lead é respondida uma vez só (dois disparos ao mesmo tempo: só um passa)
  if (!await reservarMensagem(msgId)) return

  // Filtro barato antes de chamar a IA: só contato novo (fornecedor e cliente antigo nunca)
  const primeira = await primeiraDa(jid)
  const conversaNova = !!primeira && Date.now() - new Date(primeira.ts).getTime() < DIAS_CONVERSA_NOVA * 86_400_000
  const c = await lerConversa(jid)
  if (!c) return
  // Respondeu: sai do follow-up (vale também para lead que você está atendendo)
  await aplicar(c, semFollowUp(c.etiquetas ?? []), null)
  await respondeuRetomada(cfg, c, msgId).catch(() => null)
  if (!conversaNova || c.status_lead === "mql") return   // MQL: daqui em diante é você

  const log = (cfg.agenteLog ?? []).filter(l => l.jid === jid)
  const manualRecente = await voceNaConversa(jid, log, cfg)
  if (manualRecente) return

  const a = await atender(jid, { cfg, automatico: true }).catch(e => ({ ok: false as const, erro: String(e), status: 500 }))
  if (!a.ok) {
    if (ehSemCredito(a.erro)) await avisarSemCredito(cfg)
    return registrar({ em: new Date().toISOString(), jid, nome: c.nome, perfil: "indefinido", enviou: false, texto: "", motivo: ehSemCredito(a.erro) ? "IA sem crédito na Anthropic" : `IA falhou: ${a.erro.slice(0, 120)}` })
  }
  const { r, conversa } = a

  // Braço digital: lead pequeno com quantidade e ml (ou medidas) recebe o orçamento da tabela da Villa e o link do
  // sinal, sem você. Mandou as medidas do frasco ou mudou a quantidade antes de pagar: recota.
  let novoPedido: PedidoDigital | null = null
  let semTabela: string | null = null
  const anterior = pedidoDaConversa(cfg.pedidosDigitais, jid)
  const digitalPequeno = auto.pequenoParceiro === false && r.lead.perfil === "pequeno" && !conversa.clienteCadastrado
  if (digitalPequeno) {
    const cot = cotarDigital(r.dados, cfg.digital)
    if (!cot.ok && !cot.motivo.startsWith("falta")) semTabela = cot.motivo
    if (cot.ok && (!anterior || mudouACotacao(anterior, cot))) {
      novoPedido = montarPedido(cfg.pedidosDigitais ?? [], jid, conversa.nome, r.dados, cot)
      r.resposta = textoLinkPedido(novoPedido, linkPedido(novoPedido.id))
      r.alerta = "nenhum"; r.pode_enviar_sozinho = true
    }
  }
  const ctx = contexto(cfg, log, jid)
  if (novoPedido) ctx.precosDoFiltro.push(...valoresDoPedido(novoPedido))
  if (digitalPequeno) {
    // Lead digital é todo do agente: conversa até o pagamento (mais mensagens por dia) e a IA hesitante não segura
    ctx.maxPorDia = Math.max(ctx.maxPorDia, MAX_POR_DIA_DIGITAL)
    if (!r.pode_enviar_sozinho && (r.alerta === "nenhum" || r.alerta === "preco")) r.pode_enviar_sozinho = true
  }

  const trava = travaDoEnvio({
    ligado: true, resposta: r.resposta, alerta: r.alerta, podeSozinho: r.pode_enviar_sozinho, lead: r.lead,
    conversaNova, clienteCadastrado: conversa.clienteCadastrado, manualRecente, emMql: false, ...ctx,
  })
  // Lead pequeno só vai para Descartado depois de orientado (senão sumiria da sua lista sem resposta)
  const organiza = !conversa.clienteCadastrado && r.lead.perfil !== "nao_lead"
  const viraMql = organiza && ehQualificado(r.lead.perfil) && c.status_lead !== "mql"
  if (organiza && r.lead.perfil !== "pequeno") await organizar(c, r.lead.perfil)
  // Fornecedor novo ganha a sua etiqueta "Fornecedora" (e o agente não mexe mais)
  if (r.lead.perfil === "nao_lead" && r.lead.fornecedor && !(c.etiquetas ?? []).includes("Fornecedora")) await aplicar(c, [...(c.etiquetas ?? []), "Fornecedora"], null)
  const pequeno = async (orientado: boolean) => {
    if (!organiza || r.lead.perfil !== "pequeno") return
    // Você vende em digital: etiqueta Digital, fica aberto (não vai para Descartado)
    if (auto.pequenoParceiro === false) { const o = organizarLead(c.etiquetas ?? [], "pequeno", true); return aplicar(c, o.etiquetas, o.etapa) }
    if (orientado || log.some(l => l.enviou && l.perfil === "pequeno")) return organizar(c, "pequeno")
    return aplicar(c, [...(c.etiquetas ?? []).filter(e => !ehEtiquetaDoAgente(e) || e.startsWith("F")), ETIQUETA_PERFIL.pequeno!], null)
  }

  // Chegou mensagem nova (ou você respondeu) enquanto a IA pensava: a resposta ficou velha
  const agora = await ultimaDa(jid)
  const velha = !agora || agora.id !== msgId
  const base = { em: new Date().toISOString(), jid, nome: conversa.nome, perfil: r.lead.perfil, texto: r.resposta }
  // Vitrine: todo lead recebe o Instagram uma vez, logo depois da primeira resposta.
  // Bom negócio (que o agente não responde) recebe só o Instagram, como quem manda o portfólio antes de você chegar.
  const vitrine = (auto.vitrine ?? VITRINE_PADRAO).trim()
  const querVitrine = !!vitrine && organiza && !jaViuVitrine(conversa.mensagens.filter(m => m.from_me).map(m => m.corpo))
  const mandarVitrine = async () => {
    await new Promise(res => setTimeout(res, 1500 + Math.random() * 2000))
    return enviar(c, vitrine)
  }

  if (trava || velha) await pequeno(false)
  if (!velha && querVitrine && ehQualificado(r.lead.perfil)) {
    const v = await mandarVitrine()
    if (v.ids.length) await registrar({ ...base, texto: vitrine, enviou: true, ids: v.ids, motivo: "Instagram (vitrine) enquanto você assume", passo: "Instagram" })
  }
  // Lead bom: aviso no seu WhatsApp e a conversa fica não lida no seu celular
  if (viraMql) {
    await garantirTelefone(c.jid).catch(() => null)   // MQL fica com o telefone guardado no sistema
    await marcarNaoLida(c, msgId)
    await avisarMql(cfg, c, r)
  }
  // Segurou para você: aviso na hora no seu WhatsApp (nada fica esquecido no registro)
  if (trava && !viraMql && TRAVAS_COM_AVISO.some(t => trava.startsWith(t))) await avisarSegurado(cfg, c, trava + (r.motivo_alerta ? ` · ${r.motivo_alerta}` : ""), r.resposta).catch(() => null)
  // Digital sem preço na tabela (quantidade acima da tabela, caixa maior que A3): aviso uma vez por conversa
  if (semTabela && !log.some(l => l.passo === "Sem tabela")) {
    await avisarSegurado(cfg, c, `orçamento digital sem preço na tabela: ${semTabela}`, trava || velha ? "" : r.resposta).catch(() => null)
    await registrar({ ...base, texto: "", enviou: false, motivo: `Digital sem preço na tabela (${semTabela}): avisei você`, passo: "Sem tabela" })
  }
  if (trava || velha) return registrar({ ...base, enviou: false, motivo: trava ?? "chegou mensagem nova enquanto preparava" + (r.motivo_alerta ? ` · ${r.motivo_alerta}` : "") })

  const env = await enviar(c, r.resposta, msgId)
  await pequeno(env.ids.length > 0)
  // Orçamento digital enviado: o pedido fica esperando o sinal (o anterior desta conversa, se havia, é trocado)
  if (novoPedido && env.ids.length) {
    const np = novoPedido
    await gravarCfg(d => ({ pedidosDigitais: [np, ...(d.pedidosDigitais ?? []).map(p => p.jid === jid && p.status === "aguardando_sinal" ? { ...p, status: "cancelado" as const } : p)].slice(0, 500) }))
  }
  // Instagram só se ainda cabe no minuto da Vercel (senão vai na próxima resposta)
  if (env.ids.length && querVitrine && Date.now() - inicio < 47_000) {
    const v = await mandarVitrine()
    env.ids.push(...v.ids)
  }
  return registrar({ ...base, enviou: env.ids.length > 0, ids: env.ids, motivo: env.erro ?? r.lead.motivo })
}

// Nenhum lead novo fica sem resposta. Rodada a cada 5 min (carona no webhook): conversa nova (até 72 h) cuja última
// mensagem é do lead e que ninguém respondeu — o agente perdeu o gatilho, você entrou e saiu (ele se afasta 10 min),
// a IA falhou — volta para o agente. Fica com você se você escreveu do celular nas últimas 24 h (exceto lead digital,
// que é todo do agente), se é MQL, descartado, perdido ou fornecedor. Cada mensagem é retomada uma vez só.
export async function talvezRetomarParados(origem: string) {
  const cfg = await lerCfg()
  if (!cfg.agenteAuto?.ligado) return
  if (cfg.agenteRetomadaEm && Date.now() - new Date(cfg.agenteRetomadaEm).getTime() < 5 * 60_000) return
  await gravarCfg(() => ({ agenteRetomadaEm: new Date().toISOString() }))
  const agora = Date.now()
  const { data: convs } = await supabase.from("whatsapp_conversas").select("jid, etiquetas, status_lead, ultima_recebida_at, ultima_enviada_at")
    .gte("ultima_recebida_at", new Date(agora - HORAS_RETOMAR * 3_600_000).toISOString()).order("ultima_recebida_at", { ascending: false }).limit(300)
  const candidatas = (convs ?? []).filter(c => !deveIgnorar(c.jid) && !["mql", "descartado", "perdido"].includes(c.status_lead ?? "")
    && !(c.etiquetas ?? []).includes("Fornecedora") && (!c.ultima_enviada_at || c.ultima_enviada_at <= c.ultima_recebida_at))
  const logTodo = cfg.agenteLog ?? []
  const feitas = new Set(cfg.agenteRetomadas ?? [])
  const digital = cfg.agenteAuto.pequenoParceiro === false
  let disparadas = 0
  for (const c of candidatas) {
    if (disparadas >= 6) break
    const { data: ms } = await supabase.from("whatsapp_mensagens").select("id, from_me, ts").eq("jid", c.jid).order("ts", { ascending: false }).limit(40)
    const u = ms?.[0]
    if (!u) continue
    const primeira = await primeiraDa(c.jid)
    const log = logTodo.filter(l => l.jid === c.jid)
    const ehDigital = digital && ((c.etiquetas ?? []).includes(ETIQUETAS_AGENTE.digital) || log[0]?.perfil === "pequeno")
    const ok = paradoParaRetomar({
      ultima: u, agora, feitas, primeiraEm: primeira?.ts ?? null, diasConversaNova: DIAS_CONVERSA_NOVA, horas: HORAS_RETOMAR,
      ultimoRegistro: log[0] ?? null, digital: ehDigital,
      suasDoCelular: (ms ?? []).filter(m => m.from_me && !/^3EB0/i.test(m.id) && agora - new Date(m.ts).getTime() < 86_400_000).length,
    })
    if (!ok) continue
    if (await voceNaConversa(c.jid, log, cfg)) continue
    disparadas++
    await gravarCfg(d => ({ agenteRetomadas: [u.id, ...(d.agenteRetomadas ?? [])].slice(0, 300) }))
    await fetch(`${origem}/api/whatsapp/webhook/responder?token=${encodeURIComponent(process.env.WHATSAPP_WEBHOOK_SECRET ?? "")}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msgId: u.id }), signal: AbortSignal.timeout(8000),
    }).catch(() => null)
  }
}

// Respondeu a uma retomada (reativação): volta para MQL, fica não lida no seu celular e você recebe o aviso (uma vez)
async function respondeuRetomada(cfg: CfgAgente, c: Conversa, msgId: string) {
  const passos = cfg.agenteMarcos?.[c.jid]?.passos ?? {}
  const retomadaEm = passos["Reativação"]
  if (!retomadaEm || Date.now() - new Date(retomadaEm).getTime() > 30 * 86_400_000) return
  if (passos["Respondeu"] && passos["Respondeu"] > retomadaEm) return
  const retomada = { perfil: (cfg.agenteLog ?? []).find(l => l.jid === c.jid && l.passo === "Reativação")?.perfil ?? "icp" as const }
  const atual = (await lerConversa(c.jid)) ?? c
  const etiquetas = [...new Set([...(atual.etiquetas ?? []), ETIQUETAS_AGENTE.mql])]
  await aplicar(atual, etiquetas, "mql")
  await garantirTelefone(c.jid).catch(() => null)
  await marcarNaoLida(c, msgId)
  const { data: m } = await supabase.from("whatsapp_mensagens").select("corpo").eq("id", msgId).maybeSingle()
  const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
  const motivo = (atual.etiquetas ?? []).find(e => ["ICP", "Oportunidade", "Lead médio"].includes(e)) ?? "MQL"
  if (destino) await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text: textoAvisoReativacao({ nome: c.nome, telefone: atual.telefone, motivo, mensagem: m?.corpo ?? null }) }) }).catch(() => null)
  await registrar({ em: new Date().toISOString(), jid: c.jid, nome: c.nome, perfil: retomada.perfil, enviou: false, texto: "", motivo: "Respondeu à retomada: voltou para MQL, é com você", passo: "Respondeu" })
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
  // Quem recebeu retomada fica fora: é contato antigo (o agente não responde) e quem cobra é você
  const marcos = cfg.agenteMarcos ?? marcosDoRegistro(cfg.agenteLog ?? [])
  const jidsDoAgente = Object.entries(marcos).filter(([, m]) => !m.passos?.["Reativação"]).sort((a, b) => b[1].em.localeCompare(a[1].em)).map(([j]) => j)
  if (!jidsDoAgente.length) return
  const { data } = await supabase.from("whatsapp_conversas")
    .select("jid, nome, telefone, etiquetas, status_lead, ultima_recebida_at, ultima_enviada_at, fechada_em")
    .in("jid", jidsDoAgente.slice(0, 600))
    .not("ultima_enviada_at", "is", null)
    .gte("ultima_enviada_at", new Date(Date.now() - DIAS_FOLLOW_UP * 86_400_000).toISOString())
  const candidatos = (data ?? []).filter(c =>
    !c.fechada_em && !["descartado", "perdido", "orcamento", "negociando", "pedido"].includes(c.status_lead ?? "")
    && (!c.ultima_recebida_at || c.ultima_recebida_at < c.ultima_enviada_at))
    .map(c => ({ c: c as Conversa, enviada: c.ultima_enviada_at as string, passo: proximoFollowUp(c.etiquetas ?? [], (Date.now() - new Date(c.ultima_enviada_at).getTime()) / 3_600_000) }))
    // já tentou este passo depois da sua última mensagem (e segurou): não tenta de novo
    .filter(x => x.passo && !((marcos[x.c.jid]?.passos?.[x.passo!.tipo === "encerrar" ? "Sem resposta" : `F${x.passo!.nivel}`] ?? "") > x.enviada))
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
    // Orçamento digital esperando o sinal: o follow-up é o lembrete do pedido (texto fixo com o link, sem IA)
    const pd = pedidoPendente(cfg.pedidosDigitais, c.jid)
    if (pd) {
      if (await voceNaConversa(c.jid, log, cfg)) return registrar({ ...base, perfil: "pequeno", enviou: false, texto: "", motivo: `F${nivel} segurado: você está nessa conversa agora`, passo: `F${nivel}` })
      const texto = textoLembreteDigital(pd, nivel, linkPedido(pd.id))
      const env = await enviar(c, texto)
      if (env.ids.length) {
        await aplicar(c, passo!.etiquetas, null)
        await gravarCfg(d => ({ pedidosDigitais: (d.pedidosDigitais ?? []).map(p => p.id === pd.id ? { ...p, lembretes: [...(p.lembretes ?? []), { nivel, em: new Date().toISOString() }] } : p) }))
      }
      return registrar({ ...base, perfil: "pequeno", texto, enviou: env.ids.length > 0, ids: env.ids, motivo: env.erro ?? `F${nivel}: lembrete do pedido ${pd.id}`, passo: `F${nivel}` })
    }
    const primeira = await primeiraDa(c.jid)
    const recente = !!primeira && Date.now() - new Date(primeira.ts).getTime() < DIAS_FOLLOW_UP * 86_400_000
    const a = await atender(c.jid, { cfg, automatico: true, followUp: nivel }).catch(() => null)
    if (!a?.ok) return
    const { r, conversa } = a
    const trava = travaDoEnvio({
      ligado: true, resposta: r.resposta, alerta: r.alerta, podeSozinho: r.pode_enviar_sozinho, lead: r.lead,
      conversaNova: recente, clienteCadastrado: conversa.clienteCadastrado, manualRecente: await voceNaConversa(c.jid, log, cfg), emMql: false,
      ...contexto(cfg, log, c.jid),
    })
    const dados = { ...base, perfil: r.lead.perfil, texto: r.resposta, passo: `F${nivel}` }
    if (trava) return registrar({ ...dados, enviou: false, motivo: `F${nivel} segurado: ${trava}` })
    const env = await enviar(c, r.resposta)
    if (env.ids.length) await aplicar(c, passo!.etiquetas, null)
    return registrar({ ...dados, enviou: env.ids.length > 0, ids: env.ids, motivo: env.erro ?? `F${nivel}: sem resposta` })
  }))
}
