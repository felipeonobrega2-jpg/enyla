import { describe, it, expect } from "vitest"
import { calcularPedidosFechados, pedidosAbertos, calcularVencidos, calcularResumoFinanceiro } from "@/app/lib/financeiro"
import { montarPedidos, recebiveis } from "@/app/lib/negocio"
import { card, receita } from "./fixtures"

// Carteira com os casos que já deram divergência entre telas
const lote = card({ numero: "A1", preco: 6000, loteId: "L1", loteNumero: "OHP-001", coluna: 9 })
const coberta = card({ numero: "A2", preco: 4100, coluna: 9 })
const devendo = card({ numero: "A3", preco: 6560, coluna: 9 })
const pix = card({ numero: "A4", preco: 3000, coluna: 9 })
const kanban = [lote, coberta, devendo, pix, card({ numero: "O1", preco: 999, coluna: 0 })]
const lancamentos = [
  receita({ valor: 6000, loteId: "L1" }), receita({ valor: 1769.04, loteId: "L1", cardId: lote.id, categoria: "sobra" }),
  receita({ valor: 4550, cardId: coberta.id }), receita({ valor: 450, cardId: coberta.id, categoria: "sobra", status: "pendente", dataPagamento: undefined }),
  receita({ valor: 6300, cardId: devendo.id }), receita({ valor: 650, cardId: devendo.id, categoria: "sobra", status: "pendente", dataPagamento: undefined, dataVencimento: "2020-01-01" }),
  receita({ valor: 3000, cardId: pix.id, categoria: "pix_link", status: "pendente", dataPagamento: undefined, dataVencimento: "2020-06-18" }),
]

describe("Financeiro bate com a conta principal", () => {
  const pedidos = montarPedidos(kanban, lancamentos)
  const fechados = calcularPedidosFechados(kanban, lancamentos)

  it("quanto falta em cada pedido é o mesmo do Painel", () => {
    for (const p of pedidos) expect(fechados.find(f => f.key === p.key)?.restante).toBeCloseTo(p.aReceber)
  })
  it("pedidos quitados (sobra à parte ou junto) não aparecem em aberto", () => {
    expect(pedidosAbertos(fechados).map(f => f.label).sort()).toEqual(["A3", "A4"])
  })
  it("vencidos: sobra pendente conta, Pix vencido não", () => {
    const v = calcularVencidos(kanban, lancamentos)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ cardNumero: "A3", total: 650 })
    expect(v.reduce((s, x) => s + x.total, 0)).toBeCloseTo(recebiveis(pedidos, lancamentos).vencido)
  })
  it("resumo da assistente usa os mesmos totais", () => {
    const r = calcularResumoFinanceiro(kanban, lancamentos, [])
    const rec = recebiveis(pedidos, lancamentos)
    expect(r.aReceberTotal).toBeCloseTo(rec.aReceber)
    expect(r.emAtrasoTotal).toBeCloseTo(rec.vencido)
  })
})
