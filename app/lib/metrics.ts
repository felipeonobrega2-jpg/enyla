/**
 * Camada canônica de métricas — única fonte de verdade.
 * Toda tela deve consumir daqui. Nenhum componente calcula agregados por conta própria.
 *
 * Glossário:
 *   Receita realizada     = cards fechados por dataFechamento, excl. terceirizados
 *   Custo direto          = lancamentos despesa com cardId/loteId vinculado
 *   Custo fixo            = lancamentos despesa sem cardId/loteId (overhead, pago no período)
 *   Margem de contribuição= receita − custo direto  (NÃO é lucro)
 *   Lucro líquido         = margem de contribuição − custo fixo
 */

import { KanbanCard, LancamentoFinanceiro } from "../types"

// ─── Helpers internos ─────────────────────────────────────────────────────────

function inRange(date: string, from: Date | null, to: Date | null): boolean {
  const d = new Date(date + "T12:00:00")
  if (from && d < from) return false
  if (to   && d > to)   return false
  return true
}

// ─── Custo fixo do período ────────────────────────────────────────────────────

/**
 * Custo fixo = despesas pagas, sem cardId nem loteId, com dataPagamento no período.
 * São os overheads não atribuíveis a um pedido específico (salários, marketing, aluguel, etc).
 */
export function custoFixoPeriodo(
  lancamentos: LancamentoFinanceiro[],
  from: Date | null,
  to: Date | null,
): number {
  return lancamentos
    .filter(l => {
      if (l.tipo !== "despesa" || l.status !== "pago") return false
      if (l.cardId || l.loteId) return false // custo direto, não fixo
      const ref = l.dataPagamento ?? l.dataVencimento
      return !!ref && inRange(ref, from, to)
    })
    .reduce((s, l) => s + l.valor, 0)
}

// ─── Custo direto por cards ───────────────────────────────────────────────────

/**
 * Custo direto = despesas pagas vinculadas a cardIds ou loteIds específicos.
 * Não filtra por data — todos os custos do pedido são atribuídos ao pedido.
 */
export function custoDiretoPorCards(
  lancamentos: LancamentoFinanceiro[],
  cardIds: Set<string>,
  loteIds: Set<string>,
): number {
  return lancamentos
    .filter(l =>
      l.tipo === "despesa" &&
      l.status === "pago" &&
      ((l.cardId && cardIds.has(l.cardId)) || (l.loteId && loteIds.has(l.loteId)))
    )
    .reduce((s, l) => s + l.valor, 0)
}

// ─── DRE Gerencial do período ─────────────────────────────────────────────────

export type DreGerencial = {
  receita: number
  custoDireto: number
  custoFixo: number
  margemContrib: number
  margemContribPct: number
  lucroLiquido: number
  margemLiquidaPct: number
}

/**
 * DRE gerencial completo para um período.
 *
 * @param confirmedCards  cards fechados no período (filtrados externamente por dataFechamento)
 * @param lancamentos     todos os lançamentos
 * @param sobrasReceita   receitas extras (lancamentos categoria="sobra") já somados
 * @param from            início do período
 * @param to              fim do período
 */
export function dreGerencial(
  confirmedCards: KanbanCard[],
  lancamentos: LancamentoFinanceiro[],
  sobrasReceita: number,
  from: Date | null,
  to: Date | null,
): DreGerencial {
  const receita     = confirmedCards.reduce((s, c) => s + c.preco, 0) + sobrasReceita
  const cardIds     = new Set(confirmedCards.map(c => c.id))
  const loteIds     = new Set(confirmedCards.map(c => c.loteId).filter(Boolean) as string[])
  const custoDireto = custoDiretoPorCards(lancamentos, cardIds, loteIds)
  const custoFixo   = custoFixoPeriodo(lancamentos, from, to)
  const margemContrib   = receita - custoDireto
  const lucroLiquido    = margemContrib - custoFixo
  return {
    receita,
    custoDireto,
    custoFixo,
    margemContrib,
    margemContribPct: receita > 0 ? (margemContrib / receita) * 100 : 0,
    lucroLiquido,
    margemLiquidaPct: receita > 0 ? (lucroLiquido / receita) * 100 : 0,
  }
}

// ─── Rateio por pedido ────────────────────────────────────────────────────────

/**
 * Fração do custo fixo atribuída a um pedido, proporcional à sua receita.
 * Método: proporcional à receita (padrão). Parametrizável no futuro.
 */
export function rateioPorPedido(
  pedidoReceita: number,
  receitaTotalPeriodo: number,
  custoFixoPeriodo: number,
): number {
  if (receitaTotalPeriodo === 0) return 0
  return (pedidoReceita / receitaTotalPeriodo) * custoFixoPeriodo
}
