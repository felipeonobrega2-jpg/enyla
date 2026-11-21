// Modo automático do agente de leads: quando um lead novo manda mensagem, espera ele terminar de digitar,
// pede a resposta ao atendente e, se passar por todas as travas (agenteLeads.travaDoEnvio), envia pelo seu número.
// Também organiza o funil: lead bom → MQL (daí em diante é você), lead pequeno → Descartado,
// sem resposta → F1, F2, F3 e Sem resposta. As etiquetas vão também para o WhatsApp Business, quando existem lá.
// Tudo fica registrado (Configurações → Agente de leads) com o motivo de ter enviado ou segurado.

import { lerConfigLinha } from "./configAtomica"
import { cotarItens, montarPedidosDoGrupo, mudouOGrupo, trouxeDadosNovos, pedidosDoGrupo, textoLinkGrupo, registrarNegociacao, totalPedido } from "./digital"
import { cotarDigital, montarPedido, pedidoDaConversa, mudouACotacao, textoLinkPedido, valoresDoPedido, PedidoDigital, pedidoPendente, textoLembreteDigital, itensDoLembrete, lembreteDigitalAgora, ADIOU, prometeLinkSemLink, TEXTO_PEDE_MEDIDA } from "./digital"
import { linkPedido } from "./digitalLink"
import { faltaParaProposta, faltaParaOrcar } from "./propostaPronta"
import { emCampanha, type EstadoCampanha } from "./campanhaDigital"
import type { RegraDigital } from "./precoDigital"
import { supabase } from "./supabase"
import { evo } from "./evolution"
import { gravarLote, WaMessage, deveIgnorar } from "./whatsappDados"
import { atender, lerConfigAtendente } from "./atendenteServidor"
import { etapaDoLead } from "./etapaLead"
import { lerRegistros, gravarRegistro, lerIdsAgente, guardarIdAgente, reservarTratada, liberarTratada, temTabelas } from "./registroAgente"
import { garantirTelefone } from "./contatosServidor"
import { textoAvisoReativacao } from "./reativacao"
import {
  AgenteAuto, RegistroAgente, PerfilLead, travaDoEnvio, partesDaResposta, valoresEmReais, ehMensagemAutomaticaDoWhatsapp, TEXTO_SEM_IA, filtroEfetivo,
  organizarLead, semFollowUp, ETIQUETA_PERFIL, ehQualificado, jaViuVitrine, VITRINE_PADRAO, textoAvisoMql, ehSemCredito, proximoFollowUp, horarioDeFollowUp, dentroDoHorario, ehEtiquetaDoAgente, COR_ETIQUETA_AGENTE, ETIQUETAS_AGENTE,
  marcar, marcosDoRegistro, Marcos, paradoParaRetomar,
} from "./agenteLeads"
import { corrigirCumprimento, type DadosPedido } from "./atendente"
import { mudarConfig } from "./configAtomica"
import { notificar, LINK_SISTEMA } from "./notificar"
import { limparEmojis, leadEstaRindo } from "./estilo"
import { escolherMidia, MidiaAgente } from "./midiaAgente"

const DIAS_CONVERSA_NOVA = 4
// MQL: o agente conduz até ter tudo para orçar; passou disso sem fechar os dados, a conversa é sua
const MAX_PERGUNTAS_MQL = 8
const PASSO_LEVANTANDO = "Levantando para orçar"
const perguntasLevantando = (cfg: CfgAgente, jid: string) =>
  (cfg.agenteLog ?? []).filter(l => l.jid === jid && l.enviou && l.passo === PASSO_LEVANTANDO && Date.now() - new Date(l.em).getTime() < 7 * 86_400_000).length
const HORAS_RETOMAR = 24
const RETOMADAS_POR_RODADA = 2   // por rodada (a cada 5 min), uma de cada vez
const DIAS_FOLLOW_UP = 14            // follow-up vale para lead que chegou nos últimos 14 dias
const MINUTOS_VOCE_NA_CONVERSA = 10
const MAX_REGISTROS = 300
const MAX_IDS_AGENTE = 1500
const MAX_POR_DIA_DIGITAL = 25
// Travas em que a resposta ficou para você decidir: essas viram aviso no seu WhatsApp
const TRAVAS_COM_AVISO = ["precisa de você", "a IA pediu", "citou valor", "resposta longa", "já respondeu"]
export { PRODUTO_RECUSADO } from "./metaMql"
import { PRODUTO_RECUSADO } from "./metaMql"
import { temSinalDeVolume } from "./classificarLead"
const MIN_ENTRE_RODADAS = 6          // follow-ups: no máximo uma rodada a cada 6 min (2 por rodada ≈ 20/h, dentro do limite de envios ativos)
const HORAS_REPOUSO_TENTATIVA = 3     // tentado (enviou ou pulou): sai da frente por 3 h, para a fila andar

export type Registro = RegistroAgente & { ids?: string[] }
export type CfgAgente = { pedidosDigitais?: PedidoDigital[]; digital?: RegraDigital; agenteAuto?: AgenteAuto; agenteLog?: Registro[]; agenteMarcos?: Marcos; filtroLeads?: string; etiquetasWhatsapp?: { nome: string; cor: string }[]; agenteFollowupEm?: string; agenteSemCreditoEm?: string; agenteRetomadaEm?: string; agenteRetomadas?: string[]; agenteIds?: string[]; agenteTratadas?: string[] }
export type Conversa = { jid: string; nome: string | null; telefone: string | null; etiquetas: string[] | null; status_lead: string | null }

// O registro do agente e os ids das mensagens dele vêm das tabelas próprias (quando existem); o resto, da configuração
export async function lerCfg() {
  const cfg = await lerConfigAtendente() as Awaited<ReturnType<typeof lerConfigAtendente>> & CfgAgente
  const [log, ids] = await Promise.all([lerRegistros(), lerIdsAgente()])
  if (log) cfg.agenteLog = log
  if (ids) cfg.agenteIds = ids
  return cfg
}

export async function gravarCfg(mudar: (d: Record<string, unknown> & CfgAgente) => Partial<CfgAgente> | null) {
  await mudarConfig(d => mudar(d as Record<string, unknown> & CfgAgente))
}

// Registro + garante que as etiquetas do agente existem (com cor) na lista de etiquetas do WhatsApp
export const registrar = async (r: Registro) => {
  const naTabela = await gravarRegistro(r)
  return gravarCfg(d => {
    const defs = [...(d.etiquetasWhatsapp ?? [])]
    for (const [nome, cor] of Object.entries(COR_ETIQUETA_AGENTE)) if (!defs.some(e => e.nome === nome)) defs.push({ nome, cor })
    // Só regrava o AppConfig (600 KB) quando algo mudou de verdade: passo, motivo de segurar, etiqueta nova, ou o
    // marco tem 6 h+. Regravar a cada registro estourou o disco do banco em 19/11 (tudo ficou lento)
    const antes = d.agenteMarcos?.[r.jid]
    const marcos = marcar(d.agenteMarcos ?? marcosDoRegistro(d.agenteLog ?? []), r)
    const depois = marcos[r.jid]
    const igual = !!antes && !!d.agenteMarcos && JSON.stringify(antes.passos ?? {}) === JSON.stringify(depois.passos ?? {})
      && (antes.segurou?.motivo ?? null) === (depois.segurou?.motivo ?? null) && Date.now() - new Date(antes.em).getTime() < 6 * 3_600_000
    if (naTabela && igual && defs.length === (d.etiquetasWhatsapp ?? []).length) return null
    return {
      etiquetasWhatsapp: defs, ...(naTabela ? {} : { agenteLog: [r, ...(d.agenteLog ?? [])].slice(0, MAX_REGISTROS) }),
      agenteMarcos: marcos,
    }
  })
}

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
export async function aplicar(c: Conversa, etiquetasPedidas: string[], etapa: string | null, statusFinal?: string | null) {
  const antes = c.etiquetas ?? []
  // Etapa num lugar só: a etiqueta MQL/Descartado é o reflexo do status que fica gravado
  const { etiquetasCoerentes } = await import("./etapaLead")
  const etiquetas = etiquetasCoerentes(statusFinal !== undefined ? statusFinal : (etapa ?? c.status_lead), etiquetasPedidas)
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

// Mudança manual (tela do WhatsApp, próximo passo): grava a etapa e as etiquetas coerentes, e sincroniza no WhatsApp.
// etiquetas undefined = mantém as atuais. Se só as etiquetas vierem, a etapa segue a etiqueta de reflexo (MQL/Descartado).
export async function definirEtapaManual(jid: string, status: string | null | undefined, etiquetas?: string[]) {
  const c = await lerConversa(jid)
  if (!c) return
  let st = status
  if (st === undefined && etiquetas) {
    st = etiquetas.includes("MQL") ? "mql" : etiquetas.includes("Descartado") ? "descartado"
      : c.status_lead === "mql" || c.status_lead === "descartado" ? null : c.status_lead
  }
  await aplicarStatus(c, etiquetas ?? c.etiquetas ?? [], st)
}

// Como aplicar, mas status null tira da etapa (ex.: MQL sem prova volta para automática); undefined não mexe
export async function aplicarStatus(c: Conversa, etiquetas: string[], status: string | null | undefined) {
  await aplicar(c, etiquetas, status ?? null, status === undefined ? c.status_lead : status)
  if (status === null && c.status_lead) {
    await supabase.from("whatsapp_conversas").update({ status_lead: null }).eq("jid", c.jid)
    c.status_lead = null
  }
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

// ── Proteção do número (Evolution no modo QR) ────────────────────────────────
// O WhatsApp remove o aparelho conectado quando vê padrão de robô: muitas mensagens seguidas, logo depois de conectar.
// Toda mensagem automática passa por aqui: no máximo LIMITE_HORA por hora (menos nas primeiras horas depois de
// conectar de novo, o "aquecimento") e nunca duas a menos de INTERVALO_MIN_SEG uma da outra. O que passa do
// limite não se perde: fica como "não enviou" e é tentado de novo nas próximas rodadas.
// Responder quem escreveu é o que menos parece robô: 60 por hora. O que a ENYLA puxa (follow-up, reativação,
// convite de parceiro) fica em 24 por hora. Depois de reconectar, o aquecimento vale para tudo.
// Responder quem escreveu: teto alto (rede de segurança) e o espaçamento natural entre mensagens.
// Lead quente (MQL/ICP/Oportunidade/médio, pedido digital ou proposta em andamento) não tem teto.
const LIMITE_HORA = 120
const LIMITE_HORA_AQUECENDO = 20
const HORAS_AQUECENDO = 2
const FRACAO_PROATIVO = 0.2        // 24 por hora para o proativo (follow-up, reativação, convite)
const INTERVALO_MIN_SEG = 8
export const ESPERA_MAX_VEZ_SEG = 20   // cabe no minuto da Vercel; passou disso, tenta na próxima rodada

// Lead quente: responde sempre, sem teto por hora (só o espaçamento natural)
export function leadQuente(a: { etiquetas?: string[] | null; status_lead?: string | null; perfil?: string | null; jid: string; pedidosDigitais?: { jid: string; status: string; teste?: boolean }[]; propostas?: { jid: string; status: string; em: string; enviadaEm?: string }[] }) {
  // Etapa num lugar só: bom negócio de agora (perdido/descartado não é quente só pela etiqueta antiga)
  if (etapaDoLead({ status_lead: a.status_lead, etiquetas: a.etiquetas }) === "bom") return true
  if (a.perfil && ["icp", "oportunidade", "medio"].includes(a.perfil)) return true
  if ((a.pedidosDigitais ?? []).some(p => p.jid === a.jid && !p.teste && ["aguardando_sinal", "sinal_pago", "arte", "producao"].includes(p.status))) return true
  return (a.propostas ?? []).some(p => p.jid === a.jid && p.status === "enviada" && Date.now() - new Date(p.enviadaEm ?? p.em).getTime() < 14 * 86_400_000)
}

// Envios da última hora na tabela leve (linhas "envio:<horário>"): o AppConfig de 600 KB não é regravado a cada
// mensagem (19/11: isso estourou o disco do banco). Sem a tabela, cai no jeito antigo (AppConfig).
async function vezPelaTabela(essencial: boolean, proativo: boolean): Promise<{ esperaMs: number } | { erro: string } | null> {
  if (!await temTabelas()) return null
  const agora = Date.now()
  // Só pelo prefixo: comparar faixa de texto ("envio:" até "envio;") não funciona com a ordenação do banco, que ignora
  // a pontuação (21/11: voltava vazio e o limite por hora não valia). A tabela só guarda 2 h de envios.
  const { data, error } = await supabase.from("agente_tratadas").select("id").like("id", "envio:%").limit(2000)
  if (error) return null
  const todos = (data ?? []).map(x => ({ id: x.id as string, t: new Date((x.id as string).slice(6, 30)).getTime() })).filter(x => !isNaN(x.t))
  const lista = todos.filter(x => x.t >= agora - 3_600_000).map(x => new Date(x.t).toISOString())
  const cfg = await supabase.from("AppConfig").select("data->whatsappConexao").eq("id", 1).maybeSingle()
  const con = (cfg.data as { whatsappConexao?: { aquecerDesde?: string; aquecimentoV?: number } } | null)?.whatsappConexao
  const desdeAq = con?.aquecimentoV === 2 ? con.aquecerDesde : undefined
  const aquecendo = !!desdeAq && agora - new Date(desdeAq).getTime() < HORAS_AQUECENDO * 3_600_000
  const limite = Math.floor((aquecendo ? LIMITE_HORA_AQUECENDO : LIMITE_HORA) * (proativo ? FRACAO_PROATIVO : 1))
  if (!essencial && (proativo || aquecendo) && lista.length >= limite) return { erro: `não enviou (limite de ${limite} por hora${proativo ? " para follow-up" : ""}${aquecendo ? ", aquecendo depois de conectar" : ""})` }
  const ultima = Math.max(0, ...lista.map(t => new Date(t).getTime()).filter(n => !isNaN(n)))
  const vez = Math.max(agora, ultima + (INTERVALO_MIN_SEG + Math.random() * 7) * 1000)
  if (vez - agora > ESPERA_MAX_VEZ_SEG * 1000 && !essencial) return { erro: "não enviou (fila de envio cheia)" }
  const id = `envio:${new Date(vez).toISOString()}:${Math.random().toString(36).slice(2, 7)}`
  if (await reservarTratada(id) === null) return null
  // limpeza: envios com mais de 2 h saem da tabela
  const velhos = todos.filter(x => x.t < agora - 2 * 3_600_000).map(x => x.id).slice(0, 300)
  if (velhos.length) void supabase.from("agente_tratadas").delete().in("id", velhos).then(() => null)
  return { esperaMs: vez - agora }
}

export async function reservarVezDeEnviar(opcoes: { essencial?: boolean; proativo?: boolean } = {}): Promise<{ esperaMs: number } | { erro: string }> {
  const { essencial = false, proativo = false } = opcoes
  const pelaTabela = await vezPelaTabela(essencial, proativo).catch(() => null)
  if (pelaTabela) return pelaTabela
  let res: { esperaMs: number } | { erro: string } = { erro: "não enviou (limite por hora)" }
  await mudarConfig((d: Record<string, unknown> & { agenteEnviosHora?: string[]; whatsappConexao?: { estado?: string; aquecerDesde?: string; aquecimentoV?: number } }) => {
    const agora = Date.now()
    const lista = (d.agenteEnviosHora ?? []).filter(t => new Date(t).getTime() > agora - 3_600_000)
    const con = d.whatsappConexao as { aquecerDesde?: string; aquecimentoV?: number } | undefined
    // Só vale o aquecimento marcado pela regra nova (aparelho removido); o antigo ligava em oscilação
    const desde = con?.aquecimentoV === 2 ? con.aquecerDesde : undefined
    const aquecendo = !!desde && agora - new Date(desde).getTime() < HORAS_AQUECENDO * 3_600_000
    const limite = Math.floor((aquecendo ? LIMITE_HORA_AQUECENDO : LIMITE_HORA) * (proativo ? FRACAO_PROATIVO : 1))
    // Responder quem escreveu não tem teto por hora (só o espaçamento entre mensagens); o teto vale para o que a ENYLA
    // puxa (follow-up, reativação, convite) e para o aquecimento logo depois de reconectar o número
    if (!essencial && (proativo || aquecendo) && lista.length >= limite) { res = { erro: `não enviou (limite de ${limite} por hora${proativo ? " para follow-up" : ""}${aquecendo ? ", aquecendo depois de conectar" : ""})` }; return null }
    const ultima = Math.max(0, ...lista.map(t => new Date(t).getTime()))
    const vez = Math.max(agora, ultima + (INTERVALO_MIN_SEG + Math.random() * 7) * 1000)
    if (vez - agora > ESPERA_MAX_VEZ_SEG * 1000 && !essencial) { res = { erro: "não enviou (fila de envio cheia)" }; return null }
    res = { esperaMs: vez - agora }
    return { agenteEnviosHora: [...lista, new Date(vez).toISOString()].slice(-200) }
  })
  return res
}

export async function enviar(c: Conversa, texto: string, lida?: string, opcoes: { essencial?: boolean; proativo?: boolean } = {}): Promise<{ ids: string[]; erro?: string }> {
  const number = c.telefone || c.jid
  const ids: string[] = []
  const vez = await reservarVezDeEnviar(opcoes)
  if ("erro" in vez) return { ids, erro: vez.erro }
  if (vez.esperaMs > 0) await new Promise(res => setTimeout(res, vez.esperaMs))
  await marcarLida(c, lida)
  // Uma mensagem só (as partes viram parágrafos): metade do volume, menos cara de robô.
  // Cumprimento pela hora do envio (a resposta pode ter sido preparada antes, ou a IA ter copiado o do cliente)
  for (const [i, parte] of [partesDaResposta(corrigirCumprimento(texto)).join("\n\n")].filter(Boolean).entries()) {
    if (i) await new Promise(res => setTimeout(res, 800 + Math.random() * 1500))
    // "delay" faz o Evolution mostrar "digitando…" antes de enviar
    const env = await evo<WaMessage>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number, text: parte, delay: Math.round(tempoDigitando(parte)) }) })
    if (!env.ok || !env.corpo?.key?.id) return { ids, erro: `não enviou (${env.status})` }
    ids.push(env.corpo.key.id)
    await gravarLote([{ ...env.corpo, key: { ...env.corpo.key, remoteJid: c.jid, fromMe: true } }])
    // Guarda à parte tudo o que o agente mandou: é assim que ele distingue a mensagem dele da sua
    if (!await guardarIdAgente(env.corpo.key.id)) await gravarCfg(d => ({ agenteIds: [env.corpo!.key.id, ...(d.agenteIds ?? [])].slice(0, MAX_IDS_AGENTE) })).catch(() => null)
  }
  return { ids }
}

// Imagem ou PDF pela URL (arte para aprovar), com legenda; também fica guardada como mensagem do agente
export async function enviarArquivo(c: Conversa, url: string, mime: string, legenda: string, nome = "arte", opcoes: { essencial?: boolean; proativo?: boolean } = {}): Promise<{ ids: string[]; erro?: string }> {
  const number = c.telefone || c.jid
  const vez = await reservarVezDeEnviar(opcoes)
  if ("erro" in vez) return { ids: [], erro: vez.erro }
  if (vez.esperaMs > 0) await new Promise(res => setTimeout(res, vez.esperaMs))
  const mediatype = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : "document"
  const env = await evo<WaMessage>("/message/sendMedia/{i}", { method: "POST", body: JSON.stringify({ number, mediatype, mimetype: mime, media: url, caption: legenda || undefined, fileName: mediatype === "document" ? nome : undefined }) })
  if (!env.ok || !env.corpo?.key?.id) return { ids: [], erro: `não enviou (${env.status})` }
  await gravarLote([{ ...env.corpo, key: { ...env.corpo.key, remoteJid: c.jid, fromMe: true } }])
  if (!await guardarIdAgente(env.corpo.key.id)) await gravarCfg(d => ({ agenteIds: [env.corpo!.key.id, ...(d.agenteIds ?? [])].slice(0, MAX_IDS_AGENTE) })).catch(() => null)
  return { ids: [env.corpo.key.id] }
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

export async function avisarMql(cfg: CfgAgente, c: Conversa, r: { lead: { perfil: PerfilLead; quantidade_total: number | null; motivo: string }; dados?: DadosPedido }, pronto = false) {
  // No celular pelo ntfy (chega mesmo com o WhatsApp caído): só perfil e quantidade, sem nome nem telefone
  const rotulo = r.lead.perfil === "icp" ? "ICP" : r.lead.perfil === "oportunidade" ? "Oportunidade" : "MQL"
  await notificar(pronto ? `${rotulo} pronto para orçar` : `Novo ${rotulo}`, `${r.lead.quantidade_total ? `${r.lead.quantidade_total.toLocaleString("pt-BR")} caixas` : "Bom negócio"}${r.dados?.resumo ? ` · ${r.dados.resumo.slice(0, 90)}` : ""}`, { prioridade: "alta", tags: ["star"] }).catch(() => null)
  const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
  if (!destino) return
  const texto = textoAvisoMql({ nome: c.nome, telefone: c.telefone, perfil: r.lead.perfil, quantidade: r.lead.quantidade_total, motivo: r.lead.motivo, resumo: r.dados?.resumo, dados: pronto ? r.dados : undefined })
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
  // A cada hora enquanto durar (o de 6 em 6 h passava batido e os leads ficavam horas sem resposta)
  if (cfg.agenteSemCreditoEm && Date.now() - new Date(cfg.agenteSemCreditoEm).getTime() < 3_600_000) return
  await gravarCfg(() => ({ agenteSemCreditoEm: new Date().toISOString() }))
  await notificar("IA parada: sem crédito na Anthropic", "Os leads estão ficando sem resposta. Recarregue em console.anthropic.com (Billing) e ligue a recarga automática.", { prioridade: "urgente", tags: ["rotating_light"] }).catch(() => null)
  const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
  if (!destino) return
  await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text:
    "⚠️ *A IA do sistema parou: sem crédito ou limite de gasto atingido na Anthropic.*\nO agente parou de responder os leads (as saudações do anúncio continuam saindo). Em console.anthropic.com, confira o saldo (Billing) e o limite de gasto mensal (Limits); se puder, ligue a recarga automática." }) }).catch(() => null)
}

// A última mensagem de verdade: o "Estou fora do horário" do WhatsApp Business sai na hora, como se fosse sua, e
// fazia o agente achar que você já tinha respondido (o lead da noite ficava sem a abertura)
const ultimaDa = async (jid: string) => {
  const { data } = await supabase.from("whatsapp_mensagens").select("id, from_me, ts, corpo, tipo").eq("jid", jid).order("ts", { ascending: false }).limit(6)
  const m = (data ?? []).find(x => !(x.from_me && ehMensagemAutomaticaDoWhatsapp(x.corpo, x.tipo)))
  return m ? { id: m.id as string, from_me: m.from_me as boolean, ts: m.ts as string } : null
}

const primeiraDa = async (jid: string) =>
  (await supabase.from("whatsapp_mensagens").select("ts").eq("jid", jid).order("ts", { ascending: true }).limit(1).maybeSingle()).data

// Você mandou mensagem nesta conversa nas últimas `horas` (o que não foi o agente)
// Conversa que o Felipe passou para o agente ("assuma"): o agente atende mesmo ele tendo escrito antes
export const conversaAssumida = async (jid: string) =>
  !!(await supabase.from("agente_tratadas").select("id").eq("id", `assumida|${jid}`).maybeSingle()).data
export async function assumirConversa(jid: string) {
  await supabase.from("agente_tratadas").upsert({ id: `assumida|${jid}` }, { onConflict: "id", ignoreDuplicates: true })
}

export async function voceAtende(jid: string, cfg: CfgAgente, horas = 24) {
  if (await conversaAssumida(jid)) return false
  const ids = new Set([...(cfg.agenteLog ?? []).flatMap(l => l.ids ?? []), ...(cfg.agenteIds ?? [])])
  const desde = new Date(Date.now() - horas * 3_600_000).toISOString()
  const { data } = await supabase.from("whatsapp_mensagens").select("id, corpo, tipo").eq("jid", jid).eq("from_me", true).gte("ts", desde).limit(200)
  return (data ?? []).some(m => !ids.has(m.id) && !ehMensagemAutomaticaDoWhatsapp(m.corpo, m.tipo))
}

async function voceNaConversa(jid: string, log: Registro[], cfg?: CfgAgente) {
  if (await conversaAssumida(jid)) return false
  const idsDoAgente = new Set([...log.flatMap(l => l.ids ?? []), ...(cfg?.agenteIds ?? [])])
  const desde = new Date(Date.now() - MINUTOS_VOCE_NA_CONVERSA * 60_000).toISOString()
  const { data: minhas } = await supabase.from("whatsapp_mensagens").select("id, corpo, tipo").eq("jid", jid).eq("from_me", true).gte("ts", desde)
  return (minhas ?? []).some(m => !idsDoAgente.has(m.id) && !ehMensagemAutomaticaDoWhatsapp(m.corpo, m.tipo))
}

const contexto = (cfg: CfgAgente, log: Registro[], jid: string) => ({
  enviadasHoje: log.filter(l => l.enviou && new Date(l.em).getTime() > Date.now() - 86_400_000).length,
  // Cliente conversando não fica falando sozinho (20/11, Adriano parou em "já respondeu 7× hoje" no meio da conversa)
  maxPorDia: Math.max(cfg.agenteAuto?.maxPorDia ?? 6, 30),
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
  if (!cfg.agenteAuto?.ligado || !dentroDoHorario(cfg.agenteAuto.horario)) {
    // Desligado (ou fora do horário dele), o agente não responde; mas resposta a uma retomada ainda vira aviso para você.
    // Fora do horário, quem ficou esperando é respondido quando o horário abrir (retomar parados, aos poucos).
    const jid = await aindaEhAUltima(msgId)
    const c = jid ? await lerConversa(jid) : null
    if (c) await respondeuRetomada(cfg, c, msgId).catch(() => null)
    return
  }
  // O número pessoal do Felipe (WhatsApp institucional) é o assistente dele, nunca um lead
  {
    const { data: m } = await supabase.from("whatsapp_mensagens").select("jid").eq("id", msgId).maybeSingle()
    const pessoal = (cfg.agenteAuto as { avisoNumero?: string } | undefined)?.avisoNumero?.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")
    if (pessoal && pessoal.length >= 10 && String(m?.jid ?? "").split("@")[0].replace(/^55(?=\d{10,11}$)/, "") === pessoal) return
  }
  // Ritmo de gente (somado à 2ª etapa): de dia ~40 s a 1 min; de madrugada mais devagar (~1 a 1,5 min)
  const hSP = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false })) % 24
  await (hSP >= 8 && hSP < 22 ? espera(20, 32) : espera(35, 50))
  if (!await aindaEhAUltima(msgId)) return   // chegou outra: a última é quem dispara
  await fetch(`${origem}/api/whatsapp/webhook/responder?token=${encodeURIComponent(process.env.WHATSAPP_WEBHOOK_SECRET ?? "")}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msgId }), signal: AbortSignal.timeout(8000),
  }).catch(() => null)
}

const emojiCtx = (ms: { from_me: boolean; corpo: string | null }[], cfg: { estiloFelipe?: { emojis?: string[] } }) => ({
  primeira: !ms.some(m => m.from_me),
  leadRindo: leadEstaRindo(ms.filter(m => !m.from_me).slice(-3).map(m => m.corpo)),
  seus: cfg.estiloFelipe?.emojis ?? [],
})

// Reserva atômica da mensagem: se outra execução já pegou esta mensagem, esta desiste
async function reservarMensagem(msgId: string): Promise<boolean> {
  const naTabela = await reservarTratada(msgId)
  if (naTabela !== null) return naTabela
  let minha = false
  await mudarConfig((d: Record<string, unknown> & CfgAgente) => {
    if ((d.agenteTratadas ?? []).includes(msgId)) { minha = false; return null }
    minha = true
    return { agenteTratadas: [msgId, ...(d.agenteTratadas ?? [])].slice(0, 500) }
  })
  return minha
}

// 2ª etapa: mais um tempo (como quem viu e vai responder), pensa, lê e digita
// IA fora: "já te respondo" uma vez (se nada nosso saiu nos últimos 10 min) e a mensagem na fila respostasPendentes
export { TEXTO_SEM_IA }
async function segurarSemIA(c: Conversa, msgId: string) {
  const { data: nossas } = await supabase.from("whatsapp_mensagens").select("id").eq("jid", c.jid).eq("from_me", true).gte("criado_em", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1)
  let ja = false
  await mudarConfig((d: Record<string, unknown> & { respostasPendentes?: { msgId: string; jid: string; em: string; segurou?: boolean }[] }) => {
    const fila = d.respostasPendentes ?? []
    ja = fila.some(f => f.jid === c.jid && f.segurou)
    return { respostasPendentes: [...fila.filter(f => f.jid !== c.jid), { msgId, jid: c.jid, em: new Date().toISOString(), segurou: ja || !nossas?.length }].slice(-150) }
  })
  if (!ja && !nossas?.length) await enviar(c, TEXTO_SEM_IA).catch(() => null)
}
// Trava da resposta atrasada na tabela agente_tratadas (leve), não no AppConfig: com várias respostas ao mesmo tempo,
// regravar o AppConfig inteiro (600 KB) a cada trava engasgou o banco (19/11)
const chaveAtrasada = (msgId: string, janela = Math.floor(Date.now() / 600_000)) => `atrasada:${msgId}:${janela}`
async function reservarAtrasada(msgId: string) {
  const anterior = await reservarTratada(chaveAtrasada(msgId, Math.floor(Date.now() / 600_000) - 1))
  if (anterior === false) return false   // a janela anterior (últimos 10 min) já pegou
  if (anterior === true) await liberarTratada(chaveAtrasada(msgId, Math.floor(Date.now() / 600_000) - 1))
  return (await reservarTratada(chaveAtrasada(msgId))) !== false
}
// Resposta atrasada que falhou de novo (IA ainda fora, cota cheia): volta para a fila, sem mandar nada ao lead
async function voltarParaFila(jid: string, msgId: string) {
  // libera a trava: a próxima rodada tenta de novo
  await liberarTratada(chaveAtrasada(msgId)).catch(() => null)
  await liberarTratada(chaveAtrasada(msgId, Math.floor(Date.now() / 600_000) - 1)).catch(() => null)
  await mudarConfig((d: Record<string, unknown> & { respostasPendentes?: { msgId: string; jid: string; em: string; segurou?: boolean }[] }) => {
    const fila = d.respostasPendentes ?? []
    const antes = fila.find(f => f.jid === jid)
    return { respostasPendentes: [...fila.filter(f => f.jid !== jid), { msgId, jid, em: antes?.em ?? new Date().toISOString(), segurou: true }].slice(-150) }
  })
}

// "Desculpa a demora" antes da primeira frase (sem repetir se a IA já pediu desculpa)
export function comDesculpa(texto: string): string {
  const t = texto.trim()
  if (/desculp|perd[aã]o pela demora/i.test(t.slice(0, 80))) return t
  const sem = t.replace(/^(oi|ol[aá]|opa|bom dia|boa tarde|boa noite)[^\n.!?]*[,.!?]?\s*/i, "")
  const saudacao = t.length - sem.length > 0 ? t.slice(0, t.length - sem.length).trim().replace(/[,.]$/, "!") + " " : ""
  const resto = sem ? sem[0].toUpperCase() + sem.slice(1) : ""
  return `${saudacao}Desculpa a demora pra te responder! ${resto}`.trim()
}

// atrasada: resposta que não saiu na hora (ex.: IA sem crédito). Sai já, sem a espera, mesmo que a mensagem já
// tenha sido "reservada" pela tentativa que falhou, e começa pedindo desculpa pela demora. As travas são as de sempre
// (cliente antigo, conversa sua, MQL, limites): só muda o tempo e a primeira frase.
export async function responderSozinho(msgId: string, opts: { atrasada?: boolean } = {}) {
  const cfg = await lerCfg()
  const auto = cfg.agenteAuto
  if (!auto?.ligado || !dentroDoHorario(auto.horario)) return
  const inicio = Date.now()
  if (!opts.atrasada) await espera(10, 25)
  const jid = await aindaEhAUltima(msgId)
  if (!jid) return
  // Cada mensagem do lead é respondida uma vez só (dois disparos ao mesmo tempo: só um passa)
  if (!await reservarMensagem(msgId) && !opts.atrasada) return
  // Atrasada passa por cima da reserva (a tentativa que falhou já reservou): trava própria de 10 min por mensagem,
  // para duas rodadas ao mesmo tempo não mandarem a mesma resposta duas vezes
  if (opts.atrasada && !await reservarAtrasada(msgId)) return

  // Filtro barato antes de chamar a IA: só contato novo (fornecedor e cliente antigo nunca)
  const primeira = await primeiraDa(jid)
  // Respondeu à campanha digital (conversa antiga): o agente atende como conversa nova
  // Conversa em que o agente já está atendendo (respondeu nas últimas 48 h) também é dele, mesmo com contato antigo:
  // 19/11, depois da recuperação o cliente respondia e a próxima resposta só saía 20 min depois, pelo vigia
  const agenteAtendendo = (cfg.agenteLog ?? []).some(l => l.jid === jid && l.enviou && Date.now() - new Date(l.em).getTime() < 48 * 3_600_000)
  const conversaNova = (!!primeira && Date.now() - new Date(primeira.ts).getTime() < DIAS_CONVERSA_NOVA * 86_400_000)
    || agenteAtendendo || emCampanha((cfg as { campanhaDigital?: EstadoCampanha }).campanhaDigital, jid)
  const c = await lerConversa(jid)
  if (!c) return
  // Respondeu: sai do follow-up (vale também para lead que você está atendendo)
  await aplicar(c, semFollowUp(c.etiquetas ?? []), null)
  await respondeuRetomada(cfg, c, msgId).catch(() => null)
  // MQL: daqui em diante é você (o agente não responde), mas com medida e quantidade a proposta já fica pronta para aprovar
  // (vale também para o bom negócio antigo a quem o agente pediu a medida: a resposta dele vira proposta)
  const pediuMedida = !!(cfg as { medidaPedida?: Record<string, string> }).medidaPedida?.[jid]
  // MQL ainda sem tudo para orçar: o agente segue levantando (quantidade, medida, referência, acabamento) até ficar
  // pronto; com tudo, a proposta fica pronta e a conversa é sua
  let coletandoMql: string | null = null
  // MQL de verdade: status mql que a classificação atual não rebaixou (etiqueta "Lead pequeno"/Digital vale mais que
  // o status antigo; 19/11, Master Bacth: 100 un de amostra ficou como MQL e o agente prometeu orçamento do Felipe)
  const mqlAtual = c.status_lead === "mql" && etapaDoLead(c) === "bom"
  if ((conversaNova && mqlAtual) || pediuMedida) {
    const { data: pa } = await supabase.from("whatsapp_conversas").select("proxima_acao").eq("jid", jid).maybeSingle()
    const antes = (() => { try { return (JSON.parse(pa?.proxima_acao ?? "") as { r?: { dados?: import("./atendente").DadosPedido } }).r?.dados ?? null } catch { return null } })()
    // Até o Felipe ter tudo para orçar com precisão (medida, quantidade, foto/referência, acabamento, modelos, arte).
    // Teto: depois de muitas perguntas sem fechar, a conversa volta para você (não vira interrogatório).
    const falta = pediuMedida ? null : faltaParaOrcar(antes)
    if (!falta || perguntasLevantando(cfg, jid) >= MAX_PERGUNTAS_MQL) {
      // Orçamento do Offset é do Felipe (proposta automática desligada até melhorar)
      if (!opts.atrasada) return   // esperando há 20+ min: o agente responde (sem preço) e a proposta segue com você
    } else coletandoMql = falta
  }
  if (!conversaNova && !opts.atrasada) return
  // Você escreveu nesta conversa nas últimas 24 h (celular ou tela do sistema): a conversa é sua, o agente não entra.
  // Lead do digital é a exceção: esse é todo do agente.
  // Atrasada (o cliente esperou 20+ min e ninguém respondeu): ninguém fica sem resposta, o agente responde mesmo
  // em conversa sua (só não entra se você escreveu nos últimos minutos: voceNaConversa, abaixo)
  if (!opts.atrasada && !(c.etiquetas ?? []).includes(ETIQUETAS_AGENTE.digital) && await voceAtende(jid, cfg))
    return registrar({ em: new Date().toISOString(), jid, nome: c.nome, perfil: "indefinido", enviou: false, texto: "", motivo: "conversa sua (você escreveu nas últimas 24 h)" })

  const log = (cfg.agenteLog ?? []).filter(l => l.jid === jid)
  const manualRecente = await voceNaConversa(jid, log, cfg)
  if (manualRecente) return

  // Atrasada: a IA sabe quanto tempo passou e responde ligada ao resto da conversa (19/11: respostas da recuperação
  // soavam soltas, como se a mensagem tivesse acabado de chegar)
  let atrasoMin: number | undefined
  if (opts.atrasada) {
    const { data: m } = await supabase.from("whatsapp_mensagens").select("ts").eq("id", msgId).maybeSingle()
    if (m?.ts) atrasoMin = Math.round((Date.now() - new Date(m.ts as string).getTime()) / 60_000)
  }
  const a = await atender(jid, { cfg, automatico: true, ...(coletandoMql ? { coletandoMql } : {}), ...(atrasoMin ? { atrasoMin } : {}) }).catch(e => ({ ok: false as const, erro: String(e), status: 500 }))
  if (!a.ok) {
    if (ehSemCredito(a.erro)) {
      await avisarSemCredito(cfg)
      // O lead não fica no vácuo: um "já te respondo" (sem IA), e a mensagem entra na fila para o vigia responder
      // de verdade assim que a IA voltar
      if (!opts.atrasada) await segurarSemIA(c, msgId).catch(() => null)
    }
    if (opts.atrasada) await voltarParaFila(jid, msgId).catch(() => null)
    return registrar({ em: new Date().toISOString(), jid, nome: c.nome, perfil: "indefinido", enviou: false, texto: "", motivo: ehSemCredito(a.erro) ? "IA sem crédito na Anthropic" : `IA falhou: ${a.erro.slice(0, 120)}` })
  }
  const { r, conversa } = a
  // A IA respondeu: o aviso de "sem crédito" sai da tela (ficava 3 h mesmo depois da recarga)
  if (cfg.agenteSemCreditoEm) await gravarCfg(() => ({ agenteSemCreditoEm: null } as never)).catch(() => null)
  // Perfil do lead: o classificador é a fonte (prova do volume no que o cliente disse; menos de 1.000 nunca é MQL).
  // Chamado quando o atendimento viu bom negócio ou pequeno, ou o lead acabou de falar de volume.
  if (r.lead.perfil !== "nao_lead" && !conversa.clienteCadastrado && (ehQualificado(r.lead.perfil) || r.lead.perfil === "pequeno"
    || temSinalDeVolume(conversa.mensagens.filter(m => !m.from_me).slice(-3).map(m => m.corpo)))) {
    const cl = await import("./classificarLeadServidor").then(m => m.classificarConversa(jid, { aplicar: false })).catch(() => null)
    if (cl) r.lead = { ...r.lead, perfil: cl.classificacao.perfil, quantidade_total: cl.classificacao.quantidade_total, motivo: cl.classificacao.motivo }
  }

  // Braço digital: lead pequeno com quantidade e ml (ou medidas) recebe o orçamento da tabela da Villa e o link do
  // sinal, sem você. Mandou as medidas do frasco ou mudou a quantidade antes de pagar: recota.
  let novoPedido: PedidoDigital | null = null
  let semTabela: string | null = null
  const anterior = pedidoDaConversa(cfg.pedidosDigitais, jid)
  const digitalPequeno = auto.pequenoParceiro === false && r.lead.perfil === "pequeno" && !conversa.clienteCadastrado
  // Produto que não fazemos (cigarro): nunca cota sozinho, a resposta da IA recusa com educação
  const naoFazemos = PRODUTO_RECUSADO.test([r.dados?.produto, r.dados?.resumo, ...conversa.mensagens.filter(m => !m.from_me).slice(-6).map(m => m.corpo)].filter(Boolean).join(" "))
  // Mais de uma caixa (ex.: 30 ml e 50 ml): um pedido para cada, mensagem única identificando cada caixa
  // Mandou foto ou arquivo (frasco com régua, desenho da caixa): nunca cota pela medida padrão do ml; se a IA não leu
  // a medida, a resposta dela pede altura e largura
  const mandouArquivo = conversa.mensagens.slice(-12).some(m => !m.from_me && /image|document/i.test(m.tipo))
  let novoGrupo: PedidoDigital[] | null = null
  let segurouPelaFoto = false   // cotava pela medida padrão, mas o cliente mandou foto/arquivo
  // Recota só quando o cliente trouxe dado novo depois da nossa última mensagem (número, foto, arquivo, áudio).
  // Pergunta sem dado ("quanto tempo me entregam?") é respondida pela IA; o orçamento em aberto fica como está.
  const trouxeDados = trouxeDadosNovos(conversa.mensagens)
  const grupo = digitalPequeno && !naoFazemos ? cotarItens(r.dados, cfg.digital) : null
  // A IA disse que é decisão sua (caixa cartonada/rígida, berço, kit, acabamento especial): nada de orçamento automático
  const decisaoSua = r.alerta === "decisao_sua"
  if (grupo && !decisaoSua) {
    if (!grupo.ok && !/falta/.test(grupo.motivo)) semTabela = grupo.motivo
    const anteriores = anterior ? pedidosDoGrupo(cfg.pedidosDigitais, anterior) : []
    if (grupo.ok && mandouArquivo && grupo.itens.some(i => i.cot.padrao)) segurouPelaFoto = true
    if (grupo.ok && !(mandouArquivo && grupo.itens.some(i => i.cot.padrao)) && (!anteriores.length || (trouxeDados && mudouOGrupo(anteriores, grupo.itens)))) {
      const reservados = await import("./digitalServidor").then(m => m.reservarIdsDigitais(montarPedidosDoGrupo(cfg.pedidosDigitais ?? [], jid, conversa.nome, grupo.itens), cfg.pedidosDigitais ?? []))
      novoGrupo = reservados
      r.resposta = textoLinkGrupo(reservados, reservados.map(p => linkPedido(p.id)))
      r.alerta = "nenhum"; r.pode_enviar_sozinho = true
    }
  } else if (digitalPequeno && !naoFazemos && !decisaoSua) {
    const cot = cotarDigital(r.dados, cfg.digital)
    if (!cot.ok && !cot.motivo.startsWith("falta")) semTabela = cot.motivo
    // Já tem grupo (mais de uma caixa) aberto: uma leitura com uma caixa só não desfaz o grupo
    const emGrupo = !!anterior && pedidosDoGrupo(cfg.pedidosDigitais, anterior).length > 1
    if (cot.ok && !emGrupo && mandouArquivo && cot.padrao) segurouPelaFoto = true
    if (cot.ok && !emGrupo && !(mandouArquivo && cot.padrao) && (!anterior || (trouxeDados && mudouACotacao(anterior, cot)))) {
      novoPedido = (await import("./digitalServidor").then(m => m.reservarIdsDigitais([montarPedido(cfg.pedidosDigitais ?? [], jid, conversa.nome, r.dados, cot)], cfg.pedidosDigitais ?? [])))[0]
      r.resposta = textoLinkPedido(novoPedido, linkPedido(novoPedido.id))
      r.alerta = "nenhum"; r.pode_enviar_sozinho = true
    }
  }
  if (novoGrupo) novoPedido = novoGrupo[0]
  // Digital: cliente pediu desconto com orçamento esperando o sinal → fica no pedido para você decidir (Painel e
  // celular); a resposta neutra dele ("vou ver aqui o que consigo") pode sair
  if (digitalPequeno && !novoPedido && r.alerta === "desconto") {
    const pend = pedidoPendente(cfg.pedidosDigitais, jid)
    if (pend) {
      const texto = [...conversa.mensagens].reverse().find(m => !m.from_me && m.corpo)?.corpo ?? ""
      const pedidoTotal = totalPedido(r.contraproposta, pend.quantidade)
      let registrou = false
      await gravarCfg(d => ({ pedidosDigitais: (d.pedidosDigitais ?? []).map(p => { if (p.id !== pend.id) return p; const n = registrarNegociacao(p, texto, pedidoTotal); if (n) registrou = true; return n ?? p }) }))
      if (registrou) await notificar(`Digital: ${conversa.nome ?? "cliente"} quer negociar`,
        `${pend.id} · ${pend.quantidade.toLocaleString("pt-BR")} caixinhas · está ${pend.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${pedidoTotal ? ` · pediu ${pedidoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (${(pedidoTotal / pend.quantidade).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/un)` : ""}. Aprove ou recuse no Painel.`,
        { prioridade: "alta", link: `${LINK_SISTEMA}/?aba=painel`, tags: ["handshake"] }).catch(() => null)
      r.alerta = "nenhum"; r.pode_enviar_sozinho = true
    }
  }
  // Emoji só do jeito que você usa (👋 na primeira mensagem, risada quando o lead ri)
  if (!novoPedido) r.resposta = limparEmojis(r.resposta, emojiCtx(conversa.mensagens, cfg))
  // "Desculpa a demora" só quando a demora foi de verdade (1 h+) e sem repetir: se já pedimos desculpa nas últimas
  // 24 h nesta conversa, não pede de novo (19/11: saiu duas vezes seguidas, a segunda depois de 21 min)
  if (opts.atrasada && r.resposta.trim()) {
    const ultimaDele = [...conversa.mensagens].reverse().find(m => !m.from_me)
    const esperou = ultimaDele?.ts ? Date.now() - new Date(ultimaDele.ts).getTime() : 0
    const jaPediu = conversa.mensagens.some(m => m.from_me && /desculp/i.test(m.corpo ?? "") && m.ts && Date.now() - new Date(m.ts).getTime() < 86_400_000)
    // A IA já recebe o atraso e decide a desculpa no texto; aqui só garante quando ela esqueceu numa espera longa (3 h+)
    if (esperou >= 3 * 3_600_000 && !jaPediu && !/desculp|perd[aã]o/i.test(r.resposta)) r.resposta = comDesculpa(r.resposta)
  }
  const ctx = contexto(cfg, log, jid)
  for (const p of novoGrupo ?? (novoPedido ? [novoPedido] : [])) ctx.precosDoFiltro.push(...valoresDoPedido(p))
  if (digitalPequeno) {
    // Lead digital é todo do agente: conversa até o pagamento (mais mensagens por dia) e a IA hesitante não segura
    ctx.maxPorDia = Math.max(ctx.maxPorDia, MAX_POR_DIA_DIGITAL)
    if (!r.pode_enviar_sozinho && (r.alerta === "nenhum" || r.alerta === "preco")) r.pode_enviar_sozinho = true
    // A IA falou do orçamento/link sem link na mensagem (13/11: "segue o orçamento" 3× e o cliente "não chegou link
    // nenhum"): com pedido esperando o sinal, o link vai junto; se a foto segurou a cotação, pede a medida;
    // senão fica com você (com aviso), em vez de o cliente procurar um link que não veio
    if (!novoPedido && prometeLinkSemLink(r.resposta)) {
      const pend = pedidoPendente(cfg.pedidosDigitais, jid)
      if (pend) r.resposta = `${r.resposta.trim()}\n${linkPedido(pend.id)}`
      else if (segurouPelaFoto) r.resposta = TEXTO_PEDE_MEDIDA
      else { r.pode_enviar_sozinho = false; r.motivo_alerta = "falou do orçamento/link, mas nenhum orçamento saiu" }
    }
  }

  // MQL que acabou de passar o que faltava: a proposta fica pronta para você e o aviso chega no seu WhatsApp
  // Proposta de rascunho assim que há quantidade e medida (vai se atualizando com acabamento e modelos);
  // quando chega o último dado, o aviso de "pronto para orçar" vai para o seu WhatsApp
  if (coletandoMql && !conversa.clienteCadastrado && !faltaParaProposta(r.dados)) {
    if (!faltaParaOrcar(r.dados)) await avisarMql(cfg, c, r, true).catch(() => null)
  }
  const levantando = !conversa.clienteCadastrado && (!!coletandoMql || ehQualificado(r.lead.perfil)) && !!faltaParaOrcar(r.dados)
    && perguntasLevantando(cfg, jid) < MAX_PERGUNTAS_MQL
  const trava = travaDoEnvio({
    ligado: true, resposta: r.resposta, alerta: r.alerta, podeSozinho: r.pode_enviar_sozinho, lead: r.lead,
    conversaNova, clienteCadastrado: conversa.clienteCadastrado, manualRecente, emMql: false, ...ctx,
    // Lead bom ainda sem quantidade e medida: o agente segue levantando até a proposta poder ser montada
    coletando: levantando,
    // Digital / quantidade pequena é todo da IA (pedido do Felipe, 19/11): só o firme segura
    naoDeixarEsperando: !!opts.atrasada || r.lead.perfil === "pequeno" || (c.etiquetas ?? []).includes(ETIQUETAS_AGENTE.digital),
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
    // Digital: tira também o status MQL antigo (19/11, Master Bacth ficou "MQL" com etiqueta Lead pequeno)
    if (auto.pequenoParceiro === false) { const o = organizarLead(c.etiquetas ?? [], "pequeno", true); return aplicarStatus(c, o.etiquetas, c.status_lead === "mql" ? null : undefined) }
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
  // Só no começo da conversa (no máximo 2 mensagens nossas até aqui): no meio do papo soa robótico
  const nossas = conversa.mensagens.filter(m => m.from_me)
  const querVitrine = !!vitrine && organiza && nossas.length <= 2 && !jaViuVitrine(nossas.map(m => m.corpo))
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
  // Lead pequeno/digital não vira aviso para você: você fica só com o que vale a pena
  const ehPequeno = r.lead.perfil === "pequeno" || (c.etiquetas ?? []).includes(ETIQUETAS_AGENTE.digital)
  if (trava && !viraMql && !ehPequeno && TRAVAS_COM_AVISO.some(t => trava.startsWith(t))) await avisarSegurado(cfg, c, trava + (r.motivo_alerta ? ` · ${r.motivo_alerta}` : ""), r.resposta).catch(() => null)
  // Digital sem preço na tabela (quantidade acima da tabela, caixa maior que A3): aviso uma vez por conversa
  if (semTabela && !log.some(l => l.passo === "Sem tabela")) {
    await avisarSegurado(cfg, c, `orçamento digital sem preço na tabela: ${semTabela}`, trava || velha ? "" : r.resposta).catch(() => null)
    await registrar({ ...base, texto: "", enviou: false, motivo: `Digital sem preço na tabela (${semTabela}): avisei você`, passo: "Sem tabela" })
  }
  if (trava || velha) return registrar({ ...base, enviou: false, motivo: trava ?? "chegou mensagem nova enquanto preparava" + (r.motivo_alerta ? ` · ${r.motivo_alerta}` : "") })

  // Instagram na mesma mensagem da primeira resposta (um envio só: metade da cota e menos cara de robô)
  const quente = leadQuente({ etiquetas: c.etiquetas, status_lead: c.status_lead, perfil: r.lead.perfil, jid, pedidosDigitais: cfg.pedidosDigitais, propostas: (cfg as { propostasProntas?: { jid: string; status: string; em: string; enviadaEm?: string }[] }).propostasProntas })
  const env = await enviar(c, querVitrine ? `${r.resposta.trim()}\n\n${vitrine}` : r.resposta, msgId, { essencial: quente })
  if (opts.atrasada && !env.ids.length) await voltarParaFila(jid, msgId).catch(() => null)
  await pequeno(env.ids.length > 0)
  // Orçamento digital enviado: o pedido fica esperando o sinal (o anterior desta conversa, se havia, é trocado)
  if (novoPedido && env.ids.length) {
    const novos = novoGrupo ?? [novoPedido]
    await gravarCfg(d => ({ pedidosDigitais: [...novos, ...(d.pedidosDigitais ?? []).map(p => p.jid === jid && p.status === "aguardando_sinal" ? { ...p, status: "cancelado" as const } : p)] }))
  }
  return registrar({ ...base, enviou: env.ids.length > 0, ids: env.ids, motivo: env.erro ?? r.lead.motivo, ...(levantando ? { passo: PASSO_LEVANTANDO } : {}) })
}

// Nenhum lead novo fica sem resposta. Rodada a cada 5 min (carona no webhook): conversa nova (até 72 h) cuja última
// mensagem é do lead e que ninguém respondeu — o agente perdeu o gatilho, você entrou e saiu (ele se afasta 10 min),
// a IA falhou — volta para o agente. Fica com você se você escreveu do celular nas últimas 24 h (exceto lead digital,
// que é todo do agente), se é MQL, descartado, perdido ou fornecedor. Cada mensagem é retomada uma vez só.
// Trava atômica da rodada: com vários eventos ao mesmo tempo (reconexão, rajada), só uma execução passa.
// Ler e depois gravar deixava duas passarem juntas e o mesmo follow-up saía duas vezes.
async function pegarRodada(campo: "agenteRetomadaEm" | "agenteFollowupEm", minutos: number) {
  // Trava na tabela leve (uma linha por janela de tempo): o AppConfig não é regravado a cada evento do webhook
  const naTabela = await reservarTratada(`rodada:${campo}:${Math.floor(Date.now() / (minutos * 60_000))}`)
  if (naTabela !== null) return naTabela
  let minha = false
  await mudarConfig((d: Record<string, unknown> & CfgAgente) => {
    const ult = d[campo]
    if (ult && Date.now() - new Date(ult).getTime() < minutos * 60_000) return null
    minha = true
    return { [campo]: new Date().toISOString() }
  })
  return minha
}

export async function talvezRetomarParados(origem: string) {
  const cfg = await lerCfg()
  if (!cfg.agenteAuto?.ligado || !dentroDoHorario(cfg.agenteAuto.horario)) return
  if (!await pegarRodada("agenteRetomadaEm", 3)) return
  const agora = Date.now()
  const { data: convs } = await supabase.from("whatsapp_conversas").select("jid, etiquetas, status_lead, ultima_recebida_at, ultima_enviada_at")
    .gte("ultima_recebida_at", new Date(agora - HORAS_RETOMAR * 3_600_000).toISOString()).order("ultima_recebida_at", { ascending: false }).limit(300)
  // A última "enviada" da conversa pode ser só automática do WhatsApp Business ("fora do horário", botões sem
  // texto, que chegam até horas depois): a conversa entra e a mensagem certa é conferida abaixo, ignorando essas
  const candidatas = (convs ?? []).filter(c => !deveIgnorar(c.jid) && !["mql", "descartado", "perdido"].includes(c.status_lead ?? "")
    && !(c.etiquetas ?? []).includes("Fornecedora") && !!c.ultima_recebida_at)
  const logTodo = cfg.agenteLog ?? []
  // Retomada cuja resposta não saiu (WhatsApp fora do ar) não conta: tenta de novo
  const naoSaiu = new Set(logTodo.filter((l, i) => /^não enviou/.test(l.motivo ?? "") && !logTodo.slice(0, i).some(x => x.jid === l.jid && x.enviou)).map(l => l.jid))
  const feitasTodas = cfg.agenteRetomadas ?? []
  const digital = cfg.agenteAuto.pequenoParceiro === false
  let disparadas = 0
  for (const c of candidatas) {
    if (disparadas >= RETOMADAS_POR_RODADA) break
    const feitas = new Set(naoSaiu.has(c.jid) ? [] : feitasTodas)
    const { data: todas } = await supabase.from("whatsapp_mensagens").select("id, from_me, ts, corpo, tipo").eq("jid", c.jid).order("ts", { ascending: false }).limit(40)
    const ms = (todas ?? []).filter(m => !(m.from_me && ehMensagemAutomaticaDoWhatsapp(m.corpo, m.tipo)))
    const u = ms[0]
    if (!u || u.from_me || feitas.has(u.id) || agora - new Date(u.ts).getTime() < 5 * 60_000) continue   // já respondida, já retomada ou recém-chegada
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
    // Uma de cada vez, com intervalo: rajada de mensagens do mesmo número é o que faz o WhatsApp desconfiar
    if (disparadas > 0) await new Promise(r => setTimeout(r, 25_000 + Math.random() * 15_000))
    disparadas++
    // Tentativa nova de uma que não saiu: libera a mensagem para ser respondida de novo
    const liberou = naoSaiu.has(c.jid) && await liberarTratada(u.id)
    await gravarCfg(d => ({
      agenteRetomadas: [u.id, ...(d.agenteRetomadas ?? []).filter(x => x !== u.id)].slice(0, 5000),
      ...(naoSaiu.has(c.jid) && !liberou ? { agenteTratadas: (d.agenteTratadas ?? []).filter(x => x !== u.id) } : {}),
    }))
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
  if (!cfg.agenteAuto?.ligado || !horarioDeFollowUp() || !dentroDoHorario(cfg.agenteAuto.horario)) return
  if (!await pegarRodada("agenteFollowupEm", MIN_ENTRE_RODADAS)) return
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
  const falhas = new Set((cfg.agenteLog ?? []).filter(l => !l.enviou && /^não enviou/.test(l.motivo ?? "")).map(l => `${l.jid}|${l.em}`))
  // Campanha digital é uma mensagem só: quem recebeu e não respondeu não ganha follow-up (contato frio = risco ao número)
  const campanha = (cfg as { campanhaDigital?: EstadoCampanha }).campanhaDigital?.enviados ?? {}
  const tentados = (cfg as { agenteFollowupTentados?: Record<string, string> }).agenteFollowupTentados ?? {}
  const candidatos = (data ?? []).filter(c =>
    !c.fechada_em && !["descartado", "perdido", "orcamento", "negociando", "pedido"].includes(c.status_lead ?? "")
    && !(campanha[c.jid] && !(c.ultima_recebida_at && c.ultima_recebida_at > campanha[c.jid].em))
    && (!c.ultima_recebida_at || c.ultima_recebida_at < c.ultima_enviada_at))
    .map(c => ({ c: c as Conversa, enviada: c.ultima_enviada_at as string, passo: proximoFollowUp(c.etiquetas ?? [], (Date.now() - new Date(c.ultima_enviada_at).getTime()) / 3_600_000) }))
    // já tentou este passo depois da sua última mensagem (e segurou): não tenta de novo.
    // Tentativa que não saiu (WhatsApp fora do ar: "não enviou") não conta: tenta de novo quando voltar.
    .filter(x => {
      if (!x.passo) return false
      const chave = x.passo.tipo === "encerrar" ? "Sem resposta" : `F${x.passo.nivel}`
      const em = marcos[x.c.jid]?.passos?.[chave] ?? ""
      if (!(em > x.enviada)) return true
      return falhas.has(`${x.c.jid}|${em}`)
    })
    // Orçamento digital esperando o sinal segue o ritmo dele (2 lembretes, espaçados) e não ocupa a vez dos outros
    .filter(x => { const pd = pedidoPendente(cfg.pedidosDigitais, x.c.jid); return !pd || lembreteDigitalAgora(pd, x.enviada) != null })
    // Rodízio: quem foi tentado há pouco (enviou, ou foi pulado em silêncio) não fica travando a frente da fila
    .filter(x => { const t = tentados[x.c.jid]; return !t || Date.now() - new Date(t).getTime() > HORAS_REPOUSO_TENTATIVA * 3_600_000 })
    // Prioridade: lembrete de pedido digital esperando o sinal (dinheiro na mesa); depois quem espera há mais tempo
    .sort((a, b) => (pedidoPendente(cfg.pedidosDigitais, b.c.jid) ? 1 : 0) - (pedidoPendente(cfg.pedidosDigitais, a.c.jid) ? 1 : 0) || a.enviada.localeCompare(b.enviada))
    .slice(0, 2)   // cabe no minuto da Vercel; o resto vai na próxima rodada
  if (candidatos.length) {
    const agoraIso = new Date().toISOString()
    await gravarCfg(d => {
      const t = (d as { agenteFollowupTentados?: Record<string, string> }).agenteFollowupTentados ?? {}
      const vivos = Object.fromEntries(Object.entries(t).filter(([, em]) => Date.now() - new Date(em).getTime() < 86_400_000))
      for (const x of candidatos) vivos[x.c.jid] = agoraIso
      return { agenteFollowupTentados: vivos } as Partial<CfgAgente>
    })
  }

  // Um de cada vez, com intervalo (nunca dois no mesmo segundo): ritmo de gente, para o WhatsApp não desconfiar
  let primeiro = true
  for (const x of candidatos) {
    if (!primeiro) await new Promise(r => setTimeout(r, 15_000 + Math.random() * 10_000))
    primeiro = false
    await umFollowUp(x).catch(e => console.error("[follow-up]", e))
  }

  async function umFollowUp({ c, passo, enviada }: (typeof candidatos)[number]) {
    // A data da última "enviada" pode ser só automática do WhatsApp Business (botões sem texto): se quem falou
    // por último de verdade foi o lead, ele está esperando resposta (retomar parados), não é caso de cobrar
    const ultimaDeVerdade = await ultimaDa(c.jid)
    if (!ultimaDeVerdade?.from_me) return
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
    // Conversa que você está atendendo (escreveu nas últimas 24 h): sem follow-up do agente (o digital segue)
    if (!(c.etiquetas ?? []).includes(ETIQUETAS_AGENTE.digital) && await voceAtende(c.jid, cfg)) return
    // Orçamento digital esperando o sinal: o follow-up é o lembrete do pedido (texto fixo com o link, sem IA)
    const pd = pedidoPendente(cfg.pedidosDigitais, c.jid)
    if (pd) {
      const lemb = lembreteDigitalAgora(pd, enviada)
      if (!lemb) return
      const marcarPd = (m: Partial<PedidoDigital>) => gravarCfg(d => ({ pedidosDigitais: (d.pedidosDigitais ?? []).map(p => p.id === pd.id ? { ...p, ...m } : p) }))
      // Você escreveu na conversa depois da cotação (celular ou tela): o pedido é seu, sem lembrete automático
      const { data: depois } = await supabase.from("whatsapp_mensagens").select("id, from_me, corpo, ts").eq("jid", c.jid).gt("ts", pd.em).order("ts", { ascending: false }).limit(40)
      const ids = new Set(cfg.agenteIds ?? [])
      if ((depois ?? []).some(m => m.from_me && !ids.has(m.id))) {
        await marcarPd({ lembreteParado: true })
        return registrar({ ...base, perfil: "pequeno", enviou: false, texto: "", motivo: `Lembrete do ${pd.id} parado: você assumiu a conversa`, passo: `F${nivel}` })
      }
      // Disse que vai se organizar / pagar depois: um lembrete só, sem pressa, 3 dias depois do que ele falou
      const doLead = (depois ?? []).filter(m => !m.from_me).slice(0, 4)
      const adiou = doLead.some(m => ADIOU.test(m.corpo ?? ""))
      if (adiou && !pd.lembreteDepois) {
        await marcarPd({ lembreteDepois: new Date(new Date(doLead[0].ts).getTime() + 72 * 3_600_000).toISOString() })
        return
      }
      if (await voceNaConversa(c.jid, log, cfg)) return registrar({ ...base, perfil: "pequeno", enviou: false, texto: "", motivo: `F${nivel} segurado: você está nessa conversa agora`, passo: `F${nivel}` })
      // Grupo (mais de uma caixa): um lembrete só, com o link de cada caixa ainda esperando o sinal
      const doGrupo = pedidosDoGrupo(cfg.pedidosDigitais, pd).filter(p => p.status === "aguardando_sinal")
      const itens = itensDoLembrete(doGrupo.length > 1 ? doGrupo : [pd], linkPedido)
      const texto = textoLembreteDigital({ ...pd, jid: c.jid, quantidade: doGrupo.reduce((s, p) => s + p.quantidade, 0) || pd.quantidade }, adiou ? 2 : lemb, itens, { adiou })
      if (adiou) await marcarPd({ lembreteParado: true })   // depois deste, para
      const env = await enviar(c, texto, undefined, { proativo: true })
      if (env.ids.length) {
        await aplicar(c, passo!.etiquetas, null)
        const ids = new Set(doGrupo.map(p => p.id).concat(pd.id))
        await gravarCfg(d => ({ pedidosDigitais: (d.pedidosDigitais ?? []).map(p => ids.has(p.id) ? { ...p, lembretes: [...(p.lembretes ?? []), { nivel, em: new Date().toISOString() }] } : p) }))
      }
      return registrar({ ...base, perfil: "pequeno", texto, enviou: env.ids.length > 0, ids: env.ids, motivo: env.erro ?? `F${nivel}: lembrete do pedido ${pd.id}`, passo: `F${nivel}` })
    }
    const primeira = await primeiraDa(c.jid)
    const recente = !!primeira && Date.now() - new Date(primeira.ts).getTime() < DIAS_FOLLOW_UP * 86_400_000
    const a = await atender(c.jid, { cfg, automatico: true, followUp: nivel }).catch(() => null)
    if (!a?.ok) return
    const { r, conversa } = a
    r.resposta = limparEmojis(r.resposta, emojiCtx(conversa.mensagens, cfg))
    const trava = travaDoEnvio({
      ligado: true, resposta: r.resposta, alerta: r.alerta, podeSozinho: r.pode_enviar_sozinho, lead: r.lead,
      conversaNova: recente, clienteCadastrado: conversa.clienteCadastrado, manualRecente: await voceNaConversa(c.jid, log, cfg), emMql: false,
      ...contexto(cfg, log, c.jid),
    })
    const dados = { ...base, perfil: r.lead.perfil, texto: r.resposta, passo: `F${nivel}` }
    if (trava) return registrar({ ...dados, enviou: false, motivo: `F${nivel} segurado: ${trava}` })
    const env = await enviar(c, r.resposta, undefined, { proativo: true })
    if (env.ids.length) await aplicar(c, passo!.etiquetas, null)
    // F2 leva junto um vídeo de produção da biblioteca (o menos usado), quando houver
    let video = ""
    if (env.ids.length && nivel === 2) {
      const v = escolherMidia((cfg as { midiaAgente?: MidiaAgente[] }).midiaAgente, "video")
      if (v) {
        await new Promise(res => setTimeout(res, 2500 + Math.random() * 2500))
        const ev = await enviarArquivo(c, v.url, v.mime, "", v.nome, { proativo: true }).catch(() => null)
        if (ev?.ids.length) {
          env.ids.push(...ev.ids); video = ` + vídeo “${v.descricao.slice(0, 40)}”`
          await gravarCfg(d => ({ midiaAgente: ((d as { midiaAgente?: MidiaAgente[] }).midiaAgente ?? []).map(m => m.id === v.id ? { ...m, usos: (m.usos ?? 0) + 1 } : m) } as Partial<CfgAgente>)).catch(() => null)
        }
      }
    }
    return registrar({ ...dados, enviou: env.ids.length > 0, ids: env.ids, motivo: env.erro ?? `F${nivel}: sem resposta${video}` })
  }
}

// Depois do SQL: o que ainda ficou na configuração (gravado entre a cópia e a troca) vai para as tabelas e as listas
// antigas saem da configuração. Roda uma vez (quando acha as listas lá).
let registroMovido = false
export async function talvezMoverRegistroAntigo() {
  if (registroMovido || !await temTabelas()) return
  const { data } = await lerConfigLinha()
  const d = (data?.data ?? {}) as CfgAgente
  if (!d.agenteLog && !d.agenteIds && !d.agenteTratadas) { registroMovido = true; return }
  for (const r of d.agenteLog ?? []) await gravarRegistro(r)
  for (const id of d.agenteIds ?? []) await guardarIdAgente(id)
  for (const id of (d.agenteTratadas ?? []).slice(0, 200)) await reservarTratada(id)
  // undefined some na gravação (o JSON não leva a chave)
  await mudarConfig(() => ({ agenteLog: undefined, agenteIds: undefined, agenteTratadas: undefined }))
}

// O agente assume a conversa e continua de onde o Felipe parou (a última mensagem pode ser dele). Se a última for do
// cliente, responde como sempre; se for do Felipe, a IA escreve o próximo passo (orçamento, pergunta que falta).
export async function assumirEContinuar(jid: string): Promise<{ ok: boolean; texto?: string; motivo?: string }> {
  await assumirConversa(jid)
  const ult = await ultimaDa(jid)
  if (ult && !ult.from_me) { await responderSozinho(ult.id, { atrasada: true }); return { ok: true, motivo: "respondeu a última mensagem do cliente" } }
  const cfg = await lerCfg()
  const c = await lerConversa(jid)
  if (!c) return { ok: false, motivo: "conversa não encontrada" }
  const a = await atender(jid, { cfg, automatico: true, assumir: true }).catch(e => ({ ok: false as const, erro: String(e), status: 500 }))
  if (!a.ok) return { ok: false, motivo: a.erro }
  const texto = a.r.resposta?.trim()
  if (!texto) return { ok: true, motivo: "a IA achou que não há o que mandar agora" }
  const quente = leadQuente({ etiquetas: c.etiquetas, status_lead: c.status_lead, perfil: a.r.lead.perfil, jid, pedidosDigitais: cfg.pedidosDigitais })
  const env = await enviar(c, limparEmojis(texto, emojiCtx(a.conversa.mensagens, cfg)), undefined, { essencial: quente })
  await registrar({ em: new Date().toISOString(), jid, nome: c.nome, perfil: a.r.lead.perfil, texto, enviou: env.ids.length > 0, ids: env.ids, motivo: env.erro ?? "assumiu a conversa do Felipe" })
  return { ok: env.ids.length > 0, texto, motivo: env.erro }
}
