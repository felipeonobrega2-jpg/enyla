import { describe, it, expect } from "vitest"
import { montarPedidos, recebiveis, margemContribuicao } from "@/app/lib/negocio"
import { card, receita, despesa } from "./fixtures"

describe("pedidos e recebíveis", () => {
  it("sobra paga à parte quita o pedido (caso OHP-001 / RAN-003)", () => {
    const c = card({ numero: "P1", preco: 6000, loteId: "L1", loteNumero: "OHP-001", coluna: 9 })
    const lancs = [
      receita({ valor: 3000, loteId: "L1" }), receita({ valor: 3000, loteId: "L1" }),
      receita({ valor: 1769.04, loteId: "L1", cardId: c.id, categoria: "sobra" }),
    ]
    const [p] = montarPedidos([c], lancs)
    expect(p.sobras).toBeCloseTo(1769.04)
    expect(p.venda).toBeCloseTo(7769.04)
    expect(p.aReceber).toBe(0)
  })

  it("sobra pendente coberta pelo pagamento do pedido conta como quitada", () => {
    const c = card({ numero: "P2", preco: 4100, coluna: 9 })
    const sobra = receita({ valor: 450, cardId: c.id, categoria: "sobra", status: "pendente", dataPagamento: undefined })
    const lancs = [receita({ valor: 4550, cardId: c.id }), sobra]
    const [p] = montarPedidos([c], lancs)
    expect(p.sobrasQuitadas).toEqual([sobra.id])
    expect(recebiveis([p], lancs).aConferir).toHaveLength(0)
  })

  it("sobra pendente sem pagamento continua a receber", () => {
    const c = card({ numero: "P3", preco: 6560, coluna: 9 })
    const lancs = [receita({ valor: 6300, cardId: c.id }), receita({ valor: 650, cardId: c.id, categoria: "sobra", status: "pendente", dataPagamento: undefined, dataVencimento: "2020-01-01" })]
    const [p] = montarPedidos([c], lancs)
    expect(p.sobrasQuitadas).toHaveLength(0)
    expect(p.aReceber).toBeCloseTo(910)
    expect(p.vencido).toBeCloseTo(650)
  })

  it("link Pix vencido não é dívida", () => {
    const c = card({ numero: "P4", preco: 3000, coluna: 9 })
    const pix = receita({ valor: 3000, cardId: c.id, categoria: "pix_link", status: "pendente", dataPagamento: undefined, dataVencimento: "2020-06-18" })
    const [p] = montarPedidos([c], [pix])
    expect(p.cobrado).toBe(0)
    expect(p.vencido).toBe(0)
    expect(p.semCobranca).toBe(3000)
    const solto = receita({ valor: 1845, categoria: "pix_link", status: "pendente", dataPagamento: undefined, dataVencimento: "2020-06-20" })
    expect(recebiveis([p], [pix, solto]).aConferir).toHaveLength(0)
  })

  it("margem usa a venda com sobras (o custo inclui as unidades extras)", () => {
    const c = card({ numero: "P5", preco: 6000, coluna: 9 })
    const lancs = [receita({ valor: 2000, cardId: c.id, categoria: "sobra" }), despesa({ valor: 4000, cardId: c.id })]
    const m = margemContribuicao(montarPedidos([c], lancs))
    expect(m.pct).toBeCloseTo(50)
  })

  it("orçamento aberto não é pedido", () => {
    expect(montarPedidos([card({ numero: "O1", preco: 1000, coluna: 0 }), card({ numero: "O2", preco: 1000, coluna: 11 })], [])).toHaveLength(0)
  })
})
