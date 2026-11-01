import { describe, it, expect } from "vitest"
import { simular, BaseSimulador, alavancasIniciais } from "@/app/lib/simulador"

const base: BaseSimulador = { meses: 6, orcamentosNovosMes: 10, taxaNovo: 0.1, ticketNovo: 5000, vendaRecorrenteMes: 10000, ticketRecorrente: 4000, margemPct: 0.5, fixosMes: 1000 }

describe("simulador", () => {
  const a = alavancasIniciais(base)
  it("mês típico: novos × taxa × ticket + recompras", () => {
    const r = simular(base, a)
    expect(r.vendas).toBe(15000)
    expect(r.margem).toBe(7500)
    expect(r.lucro).toBe(6500)
  })
  it("aumento de preço vira margem; o palpite de perda reduz o fechamento", () => {
    const r = simular(base, { ...a, precoPct: 10 })
    expect(r.vendas).toBeCloseTo(16500)
    expect(r.margem).toBeCloseTo(16500 - 15000 * 0.5)
    expect(simular(base, { ...a, precoPct: 10, perdaPorAumento: 4 }).taxaEfetiva).toBeCloseTo(0.06)
  })
  it("reativar clientes e anúncio", () => {
    const r = simular(base, { ...a, reativadosMes: 2, anuncioMes: 500 })
    expect(r.vendas).toBe(23000)
    expect(r.lucro).toBe(23000 * 0.5 - 1000 - 500)
  })
})
