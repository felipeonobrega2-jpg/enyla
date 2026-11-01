// Fase 4 — o que faz um orçamento fechar.
// Cada orçamento decidido vira uma linha: ganhou, recusou ou ficou sem resposta; quantidade; quanto o preço
// ficou acima do custo do motor (markup); e se o cliente já tinha comprado antes.
// Com poucas vendas, a tela mostra os números com o tamanho da amostra, sem prometer precisão.

import { KanbanCard, Calculo, COL_FECHADO, COL_ENTREGUE } from "../types"
import { isPerdido, isExpirado, isTerceirizado, nomeChave, parseData } from "./negocio"
import { categoriaPerda } from "./coleta"

export type Desfecho = "ganho" | "recusado" | "semResposta"
export type FaixaQtd = "ate1k" | "1a3k" | "3a6k" | "6k+"
export type FaixaMarkup = "ate1.8" | "1.8a2.2" | "2.2a2.6" | "2.6+"

export type LinhaOrcamento = {
  card: KanbanCard
  desfecho: Desfecho
  faixaQtd: FaixaQtd
  markup: number | null         // preço ÷ custo do motor na mesma quantidade
  faixaMarkup: FaixaMarkup | null
  recorrente: boolean           // já tinha pedido fechado antes deste orçamento
  unitario: number
}

export const ROTULO_QTD: Record<FaixaQtd, string> = { ate1k: "Até 1 mil", "1a3k": "1 a 3 mil", "3a6k": "3 a 6 mil", "6k+": "6 mil ou mais" }
export const ROTULO_MARKUP: Record<FaixaMarkup, string> = { "ate1.8": "Até 1,8× o custo", "1.8a2.2": "1,8× a 2,2×", "2.2a2.6": "2,2× a 2,6×", "2.6+": "2,6× ou mais" }

export const faixaQtd = (q: number): FaixaQtd => q < 1000 ? "ate1k" : q < 3000 ? "1a3k" : q < 6000 ? "3a6k" : "6k+"
export const faixaMarkup = (m: number): FaixaMarkup => m < 1.8 ? "ate1.8" : m < 2.2 ? "1.8a2.2" : m < 2.6 ? "2.2a2.6" : "2.6+"

const ganhou = (c: KanbanCard) => c.coluna >= COL_FECHADO && c.coluna <= COL_ENTREGUE
const isoDe = (c: KanbanCard) => parseData(c.data)?.toLocaleDateString("sv-SE") ?? ""

// Custo do motor na quantidade do card (linha exata ou a mais próxima)
export function custoDoMotor(calculo: Pick<Calculo, "tabela"> | undefined, quantidade: number): number | null {
  const tab = calculo?.tabela ?? []
  if (!tab.length) return null
  const lin = tab.reduce((m, t) => Math.abs(t.quantidade - quantidade) < Math.abs(m.quantidade - quantidade) ? t : m)
  return lin.quantidade === quantidade && lin.custoTotalSemFaca > 0 ? lin.custoTotalSemFaca : null
}

export function linhasDeOrcamento(kanban: KanbanCard[], historico: { numero?: string; calculo?: Pick<Calculo, "tabela"> }[]): LinhaOrcamento[] {
  const calc = new Map(historico.filter(h => h.numero).map(h => [h.numero!, h.calculo]))
  // Primeira compra de cada cliente (para saber se o orçamento era de cliente novo)
  const primeira = new Map<string, string>()
  for (const c of kanban) {
    if (!ganhou(c) || isTerceirizado(c) || !c.dataFechamento) continue
    const k = nomeChave(c.nomeCliente), d = c.dataFechamento.slice(0, 10)
    if (!primeira.has(k) || d < primeira.get(k)!) primeira.set(k, d)
  }
  return kanban.filter(c => !isTerceirizado(c) && c.preco > 0 && c.quantidade > 0 && (ganhou(c) || isPerdido(c) || isExpirado(c))).map(c => {
    const custo = custoDoMotor(calc.get(c.numero), c.quantidade)
    const markup = custo ? c.preco / custo : null
    const primeiraCompra = primeira.get(nomeChave(c.nomeCliente))
    return {
      card: c, desfecho: ganhou(c) ? "ganho" : isPerdido(c) ? "recusado" : "semResposta",
      faixaQtd: faixaQtd(c.quantidade), markup, faixaMarkup: markup ? faixaMarkup(markup) : null,
      recorrente: !!primeiraCompra && primeiraCompra < isoDe(c), unitario: c.preco / c.quantidade,
    }
  })
}

export type Taxa = { total: number; ganhos: number; recusados: number; semResposta: number; taxa: number | null }
export function taxa(ls: LinhaOrcamento[]): Taxa {
  const ganhos = ls.filter(l => l.desfecho === "ganho").length
  const recusados = ls.filter(l => l.desfecho === "recusado").length
  return { total: ls.length, ganhos, recusados, semResposta: ls.length - ganhos - recusados, taxa: ls.length ? ganhos / ls.length : null }
}

export const AMOSTRA_MINIMA = 8   // abaixo disso a taxa aparece, mas marcada como pouca amostra

const mediana = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

// Referência para o orçamento que está sendo feito
export function referenciaParaOrcamento(linhas: LinhaOrcamento[], args: { nomeCliente: string; quantidade: number; kanban: KanbanCard[] }) {
  const k = nomeChave(args.nomeCliente)
  const recorrente = args.kanban.some(c => ganhou(c) && !isTerceirizado(c) && nomeChave(c.nomeCliente) === k)
  const segmento = taxa(linhas.filter(l => l.recorrente === recorrente))
  const mesmaFaixa = linhas.filter(l => l.faixaQtd === faixaQtd(args.quantidade) && l.markup)
  const markupGanhos = mediana(mesmaFaixa.filter(l => l.desfecho === "ganho").map(l => l.markup!))
  const ultimo = args.kanban.filter(c => ganhou(c) && !isTerceirizado(c) && nomeChave(c.nomeCliente) === k && c.quantidade > 0)
    .sort((a, b) => (b.dataFechamento ?? "").localeCompare(a.dataFechamento ?? ""))[0]
  return {
    recorrente, segmento,
    markupGanhos, amostraMarkup: mesmaFaixa.filter(l => l.desfecho === "ganho").length,
    ultimoPedido: ultimo ? { numero: ultimo.numero, quantidade: ultimo.quantidade, unitario: ultimo.preco / ultimo.quantidade, data: ultimo.dataFechamento } : null,
    porMotivoPreco: linhas.filter(l => l.desfecho === "recusado" && categoriaPerda(l.card) === "preco").length,
  }
}
