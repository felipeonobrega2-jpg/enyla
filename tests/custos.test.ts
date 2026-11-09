import { describe, expect, test } from "vitest"
import { CUSTOS_PADRAO, preco, lucro, custoRodada, multiplicadorParaManter, normalizarCustos, REFERENCIA, type CaixaRef } from "@/app/caixaria/lib/custos"

// Valores tirados do site (caixaria/lib/preco.ts) com os custos padrão: as duas contas têm de bater
const cem: CaixaRef = REFERENCIA
const cinquenta: CaixaRef = { tipo: "simples", frente_mm: 55, lateral_mm: 55, altura_mm: 110 }

describe("custos da Caixaria = conta do site", () => {
  test("rodada padrão R$ 1.340", () => expect(custoRodada(CUSTOS_PADRAO)).toBe(1340))
  test("100 ml", () => {
    expect(preco(CUSTOS_PADRAO, cem, 1000)!.pix).toBeCloseTo(1289.9)
    expect(preco(CUSTOS_PADRAO, cem, 1000, true)).toMatchObject({ pix: 1489.9, cartao: 1609.9 })
    expect(preco(CUSTOS_PADRAO, cem, 2000)).toMatchObject({ pix: 2279.9, cartao: 2469.9 })
    expect(preco(CUSTOS_PADRAO, cem, 4000)).toMatchObject({ pix: 4139.9, cartao: 4479.9 })
  })
  test("50 ml", () => {
    expect(preco(CUSTOS_PADRAO, cinquenta, 2000)).toMatchObject({ pix: 1709.9, cartao: 1849.9 })
    expect(preco(CUSTOS_PADRAO, cinquenta, 2000, true)).toMatchObject({ pix: 1969.9 })
  })
  test("expressa paga a chapa inteira", () => {
    const n = lucro(CUSTOS_PADRAO, cem, 1000)!, e = lucro(CUSTOS_PADRAO, cem, 1000, true)!
    expect(n.producao).toBeCloseTo(1340 / 4 + 75 + 70)
    expect(e.producao).toBeCloseTo(1340 + 75 + 70)
  })
  test("manter o preço com custos maiores", () => {
    const novo = { ...CUSTOS_PADRAO, laminacaoPorFolha: 0.5, logistica: 100 }
    const m = multiplicadorParaManter(novo, cem, 1289.9)
    expect(preco({ ...novo, multiplicador: m }, cem, 1000)!.pix).toBeCloseTo(1289.9)
  })
  test("normalizar ignora lixo", () => {
    const c = normalizarCustos({ impressao: -5, papelPorFolha: 0.8, multiplicador: 0, descontos: { 2000: 0.9 } } as never)
    expect(c).toMatchObject({ impressao: 350, papelPorFolha: 0.8, multiplicador: 2.6875 })
    expect(c.descontos[2000]).toBe(0.05)
  })
})
