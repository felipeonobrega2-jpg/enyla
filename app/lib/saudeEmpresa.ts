// Saúde da empresa: os indicadores que dizem se o negócio está bem além do faturamento. Janela móvel (90 dias por
// padrão) comparada com a anterior de mesmo tamanho. Puro: recebe kanban, lançamentos e pedidos já montados.

import type { KanbanCard, LancamentoFinanceiro } from "../types"
import { Pedido, Periodo, parseData, noPeriodo, orcamentosDoPeriodo, nomeChave } from "./negocio"

const DIA = 86_400_000

export type Saude = {
  orcamentosPorVenda: number | null      // orçamentos criados ÷ pedidos fechados no período
  orcamentos: number
  pedidos: number
  pedidosPorSemana: number
  entregaDias: number | null             // mediana de dias do fechamento até a entrega (entregues no período)
  entregues: number
  entregaNoPrazoPct: number | null       // entregues até a data prevista (dos que tinham previsão)
  recebimentoDias: number | null         // média ponderada (R$) de dias do fechamento até o dinheiro entrar
  pagamentoDias: number | null           // idem até você pagar os custos diretos do pedido
  cicloDias: number | null               // recebimento − pagamento: positivo = você banca o pedido esse tanto de dias
}

export type Concentracao = {
  total: number
  clientes: number
  maior: { nome: string; valor: number; pct: number } | null
  top3Pct: number
}

const dias = (de: string | undefined, ate: string | undefined) => {
  const a = parseData(de), b = parseData(ate)
  return a && b ? (b.getTime() - a.getTime()) / DIA : null
}
const mediana = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
// Média ponderada pelo valor de cada lançamento pago
const ponderada = (pares: { d: number; v: number }[]) => {
  const peso = pares.reduce((s, p) => s + p.v, 0)
  return peso > 0 ? pares.reduce((s, p) => s + p.d * p.v, 0) / peso : null
}

export function saudeDoPeriodo(kanban: KanbanCard[], pedidos: Pedido[], p: Periodo): Saude {
  const orcamentos = orcamentosDoPeriodo(kanban, p).length
  const fechados = pedidos.filter(x => noPeriodo(x.dataFechamento, p))
  const semanas = p.from && p.to ? Math.max(1, (p.to.getTime() - p.from.getTime()) / (7 * DIA)) : 1

  const entregues = pedidos.filter(x => x.dataEntregaReal && noPeriodo(x.dataEntregaReal, p))
  const tempos = entregues.map(x => dias(x.dataFechamento, x.dataEntregaReal)).filter((d): d is number => d != null && d >= 0)
  const comPrevisao = entregues.filter(x => x.dataEntregaPrevista)
  const noPrazo = comPrevisao.filter(x => x.dataEntregaReal!.slice(0, 10) <= x.dataEntregaPrevista!.slice(0, 10)).length

  // Ciclo de caixa dos pedidos fechados no período: quando o dinheiro entrou e quando você pagou os custos
  const pago = (l: LancamentoFinanceiro) => l.status === "pago" && !!l.dataPagamento
  const rec = fechados.flatMap(x => x.receitas.filter(pago).map(l => ({ d: dias(x.dataFechamento, l.dataPagamento) ?? NaN, v: l.valor })))
  const pag = fechados.flatMap(x => x.despesas.filter(pago).map(l => ({ d: dias(x.dataFechamento, l.dataPagamento) ?? NaN, v: l.valor })))
  const recebimentoDias = ponderada(rec.filter(x => Number.isFinite(x.d)))
  const pagamentoDias = ponderada(pag.filter(x => Number.isFinite(x.d)))

  return {
    orcamentos, pedidos: fechados.length,
    orcamentosPorVenda: fechados.length ? orcamentos / fechados.length : null,
    pedidosPorSemana: fechados.length / semanas,
    entregaDias: mediana(tempos), entregues: entregues.length,
    entregaNoPrazoPct: comPrevisao.length ? (noPrazo / comPrevisao.length) * 100 : null,
    recebimentoDias, pagamentoDias,
    cicloDias: recebimentoDias != null && pagamentoDias != null ? recebimentoDias - pagamentoDias : null,
  }
}

// Quanto do vendido no período depende de um cliente só (e dos 3 maiores)
export function concentracao(pedidos: Pedido[], p: Periodo): Concentracao {
  const porCliente = new Map<string, { nome: string; valor: number }>()
  for (const x of pedidos) {
    if (!noPeriodo(x.dataFechamento, p) || x.venda <= 0) continue
    const k = nomeChave(x.nomeCliente)
    const c = porCliente.get(k) ?? { nome: x.nomeCliente, valor: 0 }
    c.valor += x.venda
    porCliente.set(k, c)
  }
  const lista = [...porCliente.values()].sort((a, b) => b.valor - a.valor)
  const total = lista.reduce((s, c) => s + c.valor, 0)
  if (!total) return { total: 0, clientes: 0, maior: null, top3Pct: 0 }
  return {
    total, clientes: lista.length,
    maior: { ...lista[0], pct: (lista[0].valor / total) * 100 },
    top3Pct: (lista.slice(0, 3).reduce((s, c) => s + c.valor, 0) / total) * 100,
  }
}

// Janela móvel terminando hoje e a anterior de mesmo tamanho
export function janelas(diasJanela: number, hoje = new Date()): { atual: Periodo; anterior: Periodo } {
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59)
  const ini = new Date(fim.getTime() - diasJanela * DIA + 1000)
  return { atual: { from: ini, to: fim }, anterior: { from: new Date(ini.getTime() - diasJanela * DIA), to: new Date(ini.getTime() - 1000) } }
}
