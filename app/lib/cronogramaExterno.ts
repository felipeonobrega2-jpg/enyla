// Porta externa: cronograma de produção Offset por etapa e por lote (GET ?o=cronograma; POST {acao:'cronograma'}).
// Etapas = colunas 2 (Arte/Dieline) a 8 (Expedição) de COLUNAS_KANBAN. Datas previstas e reais ficam em
// AppConfig.cronogramaOffset[loteNumero][coluna] (chave JSON nova, aditiva). A ação só grava datas e etapa:
// não move dinheiro, não manda mensagem, não move card e não apaga nada (data gravada só se corrige, nunca se limpa).
// Sem dado pessoal de cliente na resposta (só lote, etapa, datas e contagem de pedidos).
import { supabase } from "./supabase"
import { lerCampos, mudarConfig } from "./configAtomica"
import { hojeBrasilia } from "./etapasProducao"
import { COLUNAS_KANBAN } from "@/app/types"

export type EnvioFornecedor = { fornecedorId: string; enviadoEm?: string; ordemId?: string }
export type EtapaGravada = {
  previsto?: string; real?: string
  envioFornecedor?: EnvioFornecedor   // gancho para #180 (ordenar_fornecedor): o envio pode ser ligado à etapa
  historico: { autor: string; emIso: string; previsto?: string; real?: string; envioFornecedor?: EnvioFornecedor }[]
}
export type CronogramaGravado = Record<string, Record<string, EtapaGravada>>
export type EtapaLida = { etapa: string; coluna: number; previsto: string | null; real: string | null; atrasada: boolean; diasAtraso: number; envioFornecedor: EnvioFornecedor | null }
export type LoteLido = { loteNumero: string; pedidos: number; etapaAtual: string | null; etapas: EtapaLida[]; atrasos: number }
export type ResultadoLeitura = { status: 200; corpo: { hoje: string; lotes: LoteLido[]; atrasadas: { loteNumero: string; etapa: string; diasAtraso: number }[] } }
export type ResultadoGravacao =
  | { ok: true; resultado: string; loteNumero: string; etapa: string; gravado: EtapaGravada }
  | { ok: false; status: 400 | 404; erro: string }

export const ETAPAS_CRONOGRAMA = [2, 3, 4, 5, 6, 7, 8]
const DATA = /^\d{4}-\d{2}-\d{2}$/
const dataOk = (v: unknown): v is string => typeof v === "string" && DATA.test(v) && !Number.isNaN(Date.parse(v))
const texto = (v: unknown) => typeof v === "string" ? v.trim() : ""
const dias = (de: string, ate: string) => Math.round((Date.parse(ate + "T12:00:00Z") - Date.parse(de + "T12:00:00Z")) / 86400000)

/** Atraso: compara a data real (ou hoje, se ainda não houve retorno) com a prevista. Sem previsto, nunca atrasa. */
export function atraso(previsto: string | null | undefined, real: string | null | undefined, hoje: string): { atrasada: boolean; diasAtraso: number } {
  if (!previsto) return { atrasada: false, diasAtraso: 0 }
  const d = dias(previsto, real ?? hoje)
  return d > 0 ? { atrasada: true, diasAtraso: d } : { atrasada: false, diasAtraso: 0 }
}

type CardLote = { numero: string; loteNumero: string | null; coluna: number }

export function montarCronograma(cards: CardLote[], grav: CronogramaGravado, hoje: string): ResultadoLeitura["corpo"] {
  const porLote = new Map<string, CardLote[]>()
  for (const c of cards) if (c.loteNumero) porLote.set(c.loteNumero, [...(porLote.get(c.loteNumero) ?? []), c])
  for (const k of Object.keys(grav)) if (!porLote.has(k)) porLote.set(k, [])   // lote só com cronograma gravado
  const lotes: LoteLido[] = [...porLote].sort((a, b) => a[0].localeCompare(b[0])).map(([loteNumero, cs]) => {
    const g = grav[loteNumero] ?? {}
    const etapas = ETAPAS_CRONOGRAMA.map<EtapaLida>(coluna => {
      const e = g[String(coluna)]
      const previsto = e?.previsto ?? null, real = e?.real ?? null
      return { etapa: COLUNAS_KANBAN[coluna], coluna, previsto, real, ...atraso(previsto, real, hoje), envioFornecedor: e?.envioFornecedor ?? null }
    }).filter(e => e.previsto || e.real || e.envioFornecedor)
    const atual = cs.length ? Math.min(...cs.map(c => c.coluna)) : null
    return { loteNumero, pedidos: cs.length, etapaAtual: atual != null ? COLUNAS_KANBAN[atual] ?? String(atual) : null, etapas, atrasos: etapas.filter(e => e.atrasada).length }
  })
  const atrasadas = lotes.flatMap(l => l.etapas.filter(e => e.atrasada).map(e => ({ loteNumero: l.loteNumero, etapa: e.etapa, diasAtraso: e.diasAtraso }))).sort((a, b) => b.diasAtraso - a.diasAtraso)
  return { hoje, lotes, atrasadas }
}

export async function leituraCronograma(hoje = hojeBrasilia()): Promise<ResultadoLeitura> {
  const [{ data }, cfg] = await Promise.all([
    supabase.from("KanbanCard").select("numero, loteNumero, coluna").not("loteNumero", "is", null).gte("coluna", 1).lte("coluna", 8),
    lerCampos<{ cronogramaOffset?: CronogramaGravado }>(["cronogramaOffset"]),
  ])
  return { status: 200, corpo: montarCronograma((data ?? []) as CardLote[], cfg.cronogramaOffset ?? {}, hoje) }
}

export async function gravarCronograma(diretor: string, b: Record<string, unknown>): Promise<ResultadoGravacao> {
  const loteNumero = texto(b.loteNumero)
  if (!loteNumero) return { ok: false, status: 400, erro: "loteNumero: obrigatório." }
  const coluna = b.etapa
  if (typeof coluna !== "number" || !ETAPAS_CRONOGRAMA.includes(coluna)) return { ok: false, status: 400, erro: "etapa: número de 2 (Arte/Dieline) a 8 (Expedição)." }
  const mudanca: Partial<Pick<EtapaGravada, "previsto" | "real" | "envioFornecedor">> = {}
  for (const k of ["previsto", "real"] as const) {
    if (b[k] === undefined) continue
    if (!dataOk(b[k])) return { ok: false, status: 400, erro: `${k}: data AAAA-MM-DD (datas gravadas não se apagam, só se corrigem).` }
    mudanca[k] = b[k] as string
  }
  if (b.envioFornecedor !== undefined) {
    const e = (b.envioFornecedor && typeof b.envioFornecedor === "object" ? b.envioFornecedor : {}) as Record<string, unknown>
    const fornecedorId = texto(e.fornecedorId)
    if (!fornecedorId) return { ok: false, status: 400, erro: "envioFornecedor.fornecedorId: obrigatório." }
    if (e.enviadoEm !== undefined && !dataOk(e.enviadoEm)) return { ok: false, status: 400, erro: "envioFornecedor.enviadoEm: data AAAA-MM-DD." }
    mudanca.envioFornecedor = { fornecedorId, ...(e.enviadoEm ? { enviadoEm: e.enviadoEm as string } : {}), ...(texto(e.ordemId) ? { ordemId: texto(e.ordemId) } : {}) }
  }
  if (!Object.keys(mudanca).length) return { ok: false, status: 400, erro: "Mande ao menos um de: previsto, real, envioFornecedor." }
  const { data } = await supabase.from("KanbanCard").select("numero").eq("loteNumero", loteNumero)
  if (!(data ?? []).length) return { ok: false, status: 404, erro: `Lote ${loteNumero} não encontrado.` }
  let gravado!: EtapaGravada
  await mudarConfig<{ cronogramaOffset?: CronogramaGravado }>(cfg => {
    const todos = cfg.cronogramaOffset ?? {}
    const atual = todos[loteNumero]?.[String(coluna)]
    gravado = { ...atual, ...mudanca, historico: [...(atual?.historico ?? []), { autor: diretor, emIso: new Date().toISOString(), ...mudanca }] }
    return { cronogramaOffset: { ...todos, [loteNumero]: { ...todos[loteNumero], [String(coluna)]: gravado } } }
  })
  return { ok: true, resultado: `Cronograma do lote ${loteNumero}, etapa ${COLUNAS_KANBAN[coluna]}: gravado.`, loteNumero, etapa: COLUNAS_KANBAN[coluna], gravado }
}

export const AJUDA_CRONOGRAMA = "Cronograma de produção Offset por lote e etapa (Arte/Dieline a Expedição): previsto, real, atrasada e diasAtraso (data real, ou hoje se ainda não houve retorno, depois da prevista), envioFornecedor se houver, e a lista atrasadas. Sem dado pessoal de cliente"
