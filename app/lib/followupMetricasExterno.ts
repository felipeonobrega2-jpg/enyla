// Leitura ?o=followup_metricas na porta externa (chaves do CMO, CCO e CTO). SÓ LÊ: não envia, não grava, não cobra.
// Agregado do Follow-up por etapa (F1, F2, F3) e por dia, com e sem vídeo. Sem nome, telefone, jid ou número de pedido na saída.
// Fonte: o registro do agente (agente_registro), que já guarda a etapa (`passo`) de cada envio desde sempre; por isso o
// histórico vale (historico_por_etapa: true). Vídeo: o registro do F2 marca "+ vídeo" no motivo (F1 e F3 nunca levaram).
import { supabase } from "./supabase"
import { lerCampos } from "./configAtomica"
import { temTabelas, type Registro } from "./registroAgente"
import type { IdDiretor } from "./diretoria"

export const ETAPAS = ["F1", "F2", "F3"] as const
export type Etapa = (typeof ETAPAS)[number]
export const DIRETORES_FOLLOWUP_METRICAS: IdDiretor[] = ["cmo", "cco", "cto"]
const DIA_MS = 86_400_000
const JANELA_RESPOSTA_MS = 7 * DIA_MS   // resposta conta até o próximo envio do mesmo lead, ou 7 dias

export const AJUDA_FOLLOWUP_METRICAS = "SÓ AS CHAVES DO CMO, CCO E CTO (as outras recebem 403). Só leitura e só agregado, sem dado de cliente: Follow-up por etapa F1, F2 e F3 e por dia, com e sem vídeo. Janela: de (ou desde) e ate, AAAA-MM-DD, fuso de Brasília, ambos inclusos; padrão: últimos 30 dias; máximo 366 dias. Por etapa: enviados, respondidos (o lead escreveu depois do envio, até o próximo envio ou 7 dias), semResposta (enviados sem resposta de leads que acabaram em Sem resposta/Perdido), taxaResposta (0 a 1), comVideo e semVideo com os mesmos números, e porDia. historico_por_etapa: true quando o registro do agente identifica a etapa de cada envio; false (com historico_motivo) quando não. orcamentoPedido vem null: o registro do agente não guarda o pedido de orçamento por passo"

const DIA = /^\d{4}-\d{2}-\d{2}$/
const brasilia = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 10)
const inicioDoDia = (d: string) => new Date(`${d}T00:00:00-03:00`).getTime()

export type Janela = { de: string; ate: string; desdeMs: number; ateMs: number }
export function janelaDe(p: URLSearchParams, agora = new Date()): Janela | { erro: string } {
  const de0 = p.get("de") ?? p.get("desde"), ate0 = p.get("ate")
  for (const v of [de0, ate0]) if (v && (!DIA.test(v) || Number.isNaN(inicioDoDia(v)))) return { erro: "de e ate são datas AAAA-MM-DD (fuso de Brasília)." }
  const ate = ate0 || brasilia(agora.toISOString())
  const de = de0 || brasilia(new Date(inicioDoDia(ate) - 29 * DIA_MS).toISOString())
  const desdeMs = inicioDoDia(de), ateMs = inicioDoDia(ate) + DIA_MS
  if (ateMs <= desdeMs) return { erro: "ate não pode ser antes de de." }
  if ((ateMs - desdeMs) / DIA_MS > 366) return { erro: "Janela de no máximo 366 dias." }
  return { de, ate, desdeMs, ateMs }
}

type Contagem = { enviados: number; respondidos: number; semResposta: number; taxaResposta: number | null }
const zero = (): Contagem => ({ enviados: 0, respondidos: 0, semResposta: 0, taxaResposta: null })
const taxa = (c: Contagem) => { c.taxaResposta = c.enviados ? Math.round(c.respondidos / c.enviados * 1000) / 1000 : null }

export type Resposta = { jid: string; ts: string }
export type Metricas = {
  de: string; ate: string
  historico_por_etapa: boolean; historico_motivo?: string
  total: Contagem
  etapas: Record<Etapa, Contagem & { comVideo: Contagem; semVideo: Contagem; orcamentoPedido: null; porDia: Record<string, Contagem & { comVideo: number; semVideo: number }> }>
}

const etapaDe = (r: Registro): Etapa | null => ETAPAS.find(e => e === r.passo) ?? null
const comVideo = (r: Registro) => /\+ vídeo/i.test(r.motivo ?? "")

// Pura (testável): registros do agente + respostas dos leads (só jid e hora) viram o agregado. Nada de cliente na saída.
export function montarMetricas(registros: Registro[], respostas: Resposta[], j: Pick<Janela, "de" | "ate" | "desdeMs" | "ateMs">, opc: { historicoPorEtapa?: boolean; motivo?: string } = {}): Metricas {
  const porJid = new Map<string, number[]>()
  for (const r of registros) if (r.enviou && etapaDe(r)) { const l = porJid.get(r.jid) ?? []; l.push(new Date(r.em).getTime()); porJid.set(r.jid, l) }
  for (const l of porJid.values()) l.sort((a, b) => a - b)
  const respJid = new Map<string, number[]>()
  for (const x of respostas) { const l = respJid.get(x.jid) ?? []; l.push(new Date(x.ts).getTime()); respJid.set(x.jid, l) }
  const encerrados = new Set(registros.filter(r => r.passo === "Sem resposta").map(r => r.jid))

  const etapas = Object.fromEntries(ETAPAS.map(e => [e, { ...zero(), comVideo: zero(), semVideo: zero(), orcamentoPedido: null, porDia: {} }])) as Metricas["etapas"]
  const total = zero()
  for (const r of registros) {
    const e = etapaDe(r)
    const t = new Date(r.em).getTime()
    if (!e || !r.enviou || t < j.desdeMs || t >= j.ateMs) continue
    const envios = porJid.get(r.jid) ?? []
    const proximo = envios.find(x => x > t)
    const limite = Math.min(proximo ?? Infinity, t + JANELA_RESPOSTA_MS)
    const respondeu = (respJid.get(r.jid) ?? []).some(x => x > t && x <= limite)
    const semResp = !respondeu && encerrados.has(r.jid)
    const dia = brasilia(r.em)
    const g = etapas[e]
    const d = (g.porDia[dia] ??= { ...zero(), comVideo: 0, semVideo: 0 })
    const v = comVideo(r) ? g.comVideo : g.semVideo
    for (const c of [g, v, d, total]) { c.enviados++; if (respondeu) c.respondidos++; if (semResp) c.semResposta++ }
    if (comVideo(r)) d.comVideo++; else d.semVideo++
  }
  for (const g of Object.values(etapas)) { taxa(g); taxa(g.comVideo); taxa(g.semVideo); for (const d of Object.values(g.porDia)) taxa(d) }
  taxa(total)
  return { de: j.de, ate: j.ate, historico_por_etapa: opc.historicoPorEtapa ?? true, ...(opc.motivo ? { historico_motivo: opc.motivo } : {}), total, etapas }
}

type Linha = { em: string; jid: string; nome: string | null; perfil: string | null; enviou: boolean; texto: string | null; motivo: string | null; passo: string | null }
async function registrosDaJanela(desdeIso: string, ateIso: string): Promise<{ regs: Registro[]; completo: boolean }> {
  if (!await temTabelas()) {
    const { agenteLog } = await lerCampos<{ agenteLog?: Registro[] }>(["agenteLog"])
    return { regs: (agenteLog ?? []).filter(r => r.em >= desdeIso && r.em < ateIso), completo: false }
  }
  const out: Registro[] = []
  // 1 dia antes: o "próximo envio" e o "Sem resposta" depois da janela também contam; busca até 8 dias depois
  for (let de = 0; de < 100000; de += 1000) {
    const { data, error } = await supabase.from("agente_registro").select("em, jid, nome, perfil, enviou, texto, motivo, passo")
      .gte("em", desdeIso).lt("em", new Date(new Date(ateIso).getTime() + 8 * DIA_MS).toISOString()).order("em", { ascending: true }).range(de, de + 999)
    if (error) return { regs: out, completo: false }
    out.push(...(data as Linha[]).map(l => ({ em: new Date(l.em).toISOString(), jid: l.jid, nome: l.nome, perfil: (l.perfil ?? "indefinido") as Registro["perfil"], enviou: l.enviou, texto: l.texto ?? "", motivo: l.motivo ?? "", ...(l.passo ? { passo: l.passo } : {}) })))
    if (!data || data.length < 1000) break
  }
  return { regs: out, completo: true }
}

async function respostasDosLeads(jids: string[], desdeIso: string, ateIso: string): Promise<Resposta[]> {
  const out: Resposta[] = []
  const fim = new Date(new Date(ateIso).getTime() + 8 * DIA_MS).toISOString()
  for (let i = 0; i < jids.length; i += 100) {
    const { data } = await supabase.from("whatsapp_mensagens").select("jid, ts").in("jid", jids.slice(i, i + 100)).eq("from_me", false).gte("ts", desdeIso).lt("ts", fim).limit(20000)
    out.push(...((data ?? []) as Resposta[]))
  }
  return out
}

export async function lerFollowupMetricas(diretor: IdDiretor, p: URLSearchParams, agora = new Date()): Promise<{ status: number; corpo: Record<string, unknown> }> {
  if (!DIRETORES_FOLLOWUP_METRICAS.includes(diretor)) return { status: 403, corpo: { erro: "?o=followup_metricas é só para as chaves do CMO, CCO e CTO." } }
  const j = janelaDe(p, agora)
  if ("erro" in j) return { status: 400, corpo: { erro: j.erro } }
  const desdeIso = new Date(j.desdeMs).toISOString(), ateIso = new Date(j.ateMs).toISOString()
  const { regs, completo } = await registrosDaJanela(desdeIso, ateIso)
  const jids = [...new Set(regs.filter(r => r.enviou && etapaDe(r)).map(r => r.jid))]
  const respostas = jids.length ? await respostasDosLeads(jids, desdeIso, ateIso) : []
  const m = montarMetricas(regs, respostas, j, completo ? {} : { historicoPorEtapa: false, motivo: "O registro do agente em tabela não está disponível; só a lista curta da configuração (últimos 300 registros) foi lida, então a janela pode estar incompleta." })
  return { status: 200, corpo: { ...m, fonte: "agente_registro (etapa em cada envio) + respostas em whatsapp_mensagens (só contagem)" } }
}
