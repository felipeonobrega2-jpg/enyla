// Prazo de entrega do Digital que o cliente vê no link de acompanhamento (#162). Funções puras, nada é gravado.
// Regras: gravado na mão (painel ou porta) vale sempre; senão, só depois da arte aprovada e só se a config
// `digital.prazoPadraoDiasUteis` (AppConfig) estiver preenchida: data da aprovação + esses dias úteis.
// Tudo o mais é "a confirmar". Nunca inventa data. Não usa prazoDigital.ts (esse é estimativa interna).
import { somarDiasUteis } from "./diasUteis"
import type { SituacaoArte } from "./digital"

export const SITUACOES_ARTE: readonly SituacaoArte[] = ["sem arte", "enviada", "ajustes pedidos", "aprovada", "prova autorizada"]
export const ARTE_APROVADA: readonly SituacaoArte[] = ["aprovada", "prova autorizada"]
export const A_CONFIRMAR = "a confirmar"

export type PrazoCalculado = { data: string | null; texto: string; origem: "gravado" | "calculado" | "a_confirmar" }
type Entrada = { situacaoArte?: SituacaoArte | null; prazoEntrega?: string | null; arteAprovadaEm?: string | null }

const ehData = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T12:00:00Z"))
const diaBrasilia = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : isNaN(Date.parse(s)) ? "" : new Date(s).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const confirmar: PrazoCalculado = { data: null, texto: A_CONFIRMAR, origem: "a_confirmar" }
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

export const arteAprovada = (p: Pick<Entrada, "situacaoArte">) => !!p.situacaoArte && ARTE_APROVADA.includes(p.situacaoArte)

/** `diasUteisPadrao` vem de AppConfig `digital.prazoPadraoDiasUteis`; vazio/zero/inválido = sem prazo calculado. */
export function prazoDoPedido(p: Entrada, diasUteisPadrao?: number | null): PrazoCalculado {
  if (ehData(p.prazoEntrega)) return { data: p.prazoEntrega, texto: br(p.prazoEntrega), origem: "gravado" }
  if (!arteAprovada(p)) return confirmar
  const dias = typeof diasUteisPadrao === "number" && Number.isFinite(diasUteisPadrao) && diasUteisPadrao > 0 ? diasUteisPadrao : 0
  const aprovada = p.arteAprovadaEm ? diaBrasilia(p.arteAprovadaEm) : ""
  if (!dias || !aprovada) return confirmar
  const data = somarDiasUteis(aprovada, dias)
  return { data, texto: br(data), origem: "calculado" }
}
