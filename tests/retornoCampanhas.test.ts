import { describe, it, expect } from "vitest"
import { retornoPorCampanha, roiReal } from "@/app/lib/retornoCampanhas"
import { montarPedidos } from "@/app/lib/negocio"
import { card, despesa } from "./fixtures"

describe("retorno real das campanhas", () => {
  it("usa a margem (venda − custo) e estima pela média quando não há custo lançado", () => {
    const a = card({ numero: "A1", nomeCliente: "Ana", preco: 1000, coluna: 9, dataFechamento: "2026-09-01" })
    const b = card({ numero: "B1", nomeCliente: "Bia", preco: 2000, coluna: 9, dataFechamento: "2026-09-10" })
    const pedidos = montarPedidos([a, b], [despesa({ valor: 600, cardId: a.id, cardNumero: "A1", categoria: "fornecedor", status: "pago" })])
    const r = retornoPorCampanha(pedidos, [{ nome: "Ana", origemCampanhaId: "c1" }, { nome: "Bia", origemCampanhaId: "c1" }, { nome: "Caio", origemCampanhaId: "c1" }])
    expect(r.c1.clientes).toBe(3)
    expect(r.c1.compradores).toBe(2)
    expect(r.c1.venda).toBe(3000)
    expect(r.c1.margem).toBeCloseTo(400 + 2000 * 0.4)   // Bia sem custo: margem média (40%)
    expect(r.c1.margemEstimada).toBe(true)
    expect(roiReal(r.c1, 600)).toBeCloseTo(1)           // (1200 − 600) ÷ 600
  })
})
