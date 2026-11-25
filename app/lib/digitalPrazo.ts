// Digital: situação da arte, prazo de entrega e a gravação à mão (painel e porta gravar_digital). Funções puras.
// O prazo que o cliente vê vem daqui. Sem prazo padrão configurado (AppConfig digital.prazoPadraoDiasUteis, vazio por
// padrão) ou sem arte aprovada, é "a confirmar": nenhuma data é inventada. Não usa prazoDigital.ts.
import { somarDiasUteis } from "./diasUteis"
import type { GravacaoDigital, SituacaoArte } from "./digital"

export const SITUACOES_ARTE: SituacaoArte[] = ["sem arte", "enviada", "ajustes pedidos", "aprovada", "prova autorizada"]
export const ARTE_APROVADA: SituacaoArte[] = ["aprovada", "prova autorizada"]
export const A_CONFIRMAR = "a confirmar"

const DATA = /^\d{4}-\d{2}-\d{2}$/
const dataValida = (s: string) => DATA.test(s) && !isNaN(Date.parse(s + "T12:00:00Z")) && new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s
const brasilia = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const diaDe = (s?: string | null) => !s ? null : DATA.test(s) ? s : isNaN(Date.parse(s)) ? null : brasilia(new Date(s))

type PedidoPrazo = { situacaoArte?: SituacaoArte | ""; prazoEntrega?: string; arteAprovadaEm?: string; gravacoesDigital?: GravacaoDigital[] }
export type PrazoDigital = { prazo: string | null; texto: string; origem: "gravado" | "calculado" | "a_confirmar" }

/** Dias úteis do prazo padrão da Digital: número inteiro positivo, ou null se a config estiver vazia/inválida. */
export const prazoPadraoDias = (digital?: { prazoPadraoDiasUteis?: unknown } | null): number | null => {
  const n = Number(digital?.prazoPadraoDiasUteis)
  return digital?.prazoPadraoDiasUteis != null && digital.prazoPadraoDiasUteis !== "" && Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

export function prazoDoPedido(p: PedidoPrazo, prazoPadraoDiasUteis: number | null | undefined): PrazoDigital {
  const gravado = (p.prazoEntrega ?? "").trim()
  if (gravado && dataValida(gravado)) return { prazo: gravado, texto: gravado, origem: "gravado" }
  const aprovada = !!p.situacaoArte && ARTE_APROVADA.includes(p.situacaoArte as SituacaoArte)
  const dias = prazoPadraoDiasUteis != null && prazoPadraoDiasUteis > 0 ? prazoPadraoDiasUteis : null
  if (aprovada && dias) {
    // Data da aprovação: a do fluxo (arteAprovadaEm) ou, se a situação foi marcada à mão, o dia em que foi gravada
    const marcada = [...(p.gravacoesDigital ?? [])].reverse().find(g => g.situacaoArte && ARTE_APROVADA.includes(g.situacaoArte as SituacaoArte))
    const base = diaDe(p.arteAprovadaEm) ?? diaDe(marcada?.em)
    if (base) { const prazo = somarDiasUteis(base, dias); return { prazo, texto: prazo, origem: "calculado" } }
  }
  return { prazo: null, texto: A_CONFIRMAR, origem: "a_confirmar" }
}

export type EntradaGravar = { id?: unknown; situacaoArte?: unknown; prazoEntrega?: unknown; motivo?: unknown }
/** Valida o corpo de gravar_digital. Devolve o erro ou os campos a gravar ("" em prazoEntrega limpa o prazo). */
export function validarGravarDigital(b: EntradaGravar): { erro: string } | { id: string; motivo: string; situacaoArte?: SituacaoArte; prazoEntrega?: string } {
  const id = typeof b.id === "string" ? b.id.trim() : ""
  if (!/^DIG-\d+$/i.test(id)) return { erro: "id: pedido digital (DIG-xxxx) obrigatório." }
  const motivo = typeof b.motivo === "string" ? b.motivo.trim() : ""
  if (!motivo) return { erro: "motivo: obrigatório." }
  if (motivo.length > 300) return { erro: "motivo: no máximo 300 caracteres." }
  const out: { id: string; motivo: string; situacaoArte?: SituacaoArte; prazoEntrega?: string } = { id: id.toUpperCase(), motivo }
  if (b.situacaoArte !== undefined) {
    if (typeof b.situacaoArte !== "string" || !SITUACOES_ARTE.includes(b.situacaoArte as SituacaoArte)) return { erro: `situacaoArte: ${SITUACOES_ARTE.join(" | ")}.` }
    out.situacaoArte = b.situacaoArte as SituacaoArte
  }
  if (b.prazoEntrega !== undefined) {
    if (typeof b.prazoEntrega !== "string" || (b.prazoEntrega.trim() && !dataValida(b.prazoEntrega.trim()))) return { erro: "prazoEntrega: data AAAA-MM-DD ou vazio." }
    out.prazoEntrega = b.prazoEntrega.trim()
  }
  if (out.situacaoArte === undefined && out.prazoEntrega === undefined) return { erro: "situacaoArte e/ou prazoEntrega: informe ao menos um." }
  return out
}

/** Grava só situacaoArte/prazoEntrega no pedido, com quem gravou, quando (Brasília) e o motivo. Não toca em pagamento, status, custo nem mensagem. */
export function aplicarGravacaoDigital<T extends PedidoPrazo>(p: T, campos: { situacaoArte?: SituacaoArte; prazoEntrega?: string; motivo: string }, por: string, agora = new Date()): T {
  const reg: GravacaoDigital = { por, em: agora.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T") + "-03:00", motivo: campos.motivo,
    ...(campos.situacaoArte !== undefined ? { situacaoArte: campos.situacaoArte } : {}), ...(campos.prazoEntrega !== undefined ? { prazoEntrega: campos.prazoEntrega } : {}) }
  return { ...p, ...(campos.situacaoArte !== undefined ? { situacaoArte: campos.situacaoArte } : {}), ...(campos.prazoEntrega !== undefined ? { prazoEntrega: campos.prazoEntrega } : {}),
    gravacoesDigital: [...(p.gravacoesDigital ?? []), reg].slice(-20) }
}
