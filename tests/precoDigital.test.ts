import { describe, it, expect } from "vitest"
import { facaAberta, folhaDaFaca, custoVilla, precoDigital } from "../app/lib/precoDigital"

const folha = (a: number, l: number, p: number) => { const f = facaAberta(a, l, p); return folhaDaFaca(f.largura, f.altura) }

describe("preço digital (tabela da Villa)", () => {
  it("a folha sai do tamanho da caixa aberta", () => {
    expect(folha(6, 2.7, 2.7)).toBe("A4")      // 15 ml
    expect(folha(10, 5, 5)).toBe("A4")         // faca 21,5 × 20 cm
    expect(folha(13, 6.7, 3.8)).toBe("A3")     // faca 22,5 × 20,6 cm: passa da A4
    expect(folha(25, 12, 10)).toBeNull()       // maior que A3
  })
  it("custo pela faixa da tabela", () => {
    expect(custoVilla(20, "A4")).toEqual({ faixa: 20, custo: 119.94 })
    expect(custoVilla(75, "A4")).toEqual({ faixa: 100, custo: 399.95 })
    expect(custoVilla(150, "A4")).toBeNull()
    expect(custoVilla(100, "A3")?.custo).toBe(499.95)
    expect(custoVilla(500, "A3")?.custo).toBe(1750)
  })
  it("preço = custo + arte 70 + margem 150", () => {
    expect(precoDigital(100, "A4")?.total).toBe(619.95)
    expect(precoDigital(50, "A3")?.total).toBe(569.95)
    expect(precoDigital(100, "A3", { arte: 0, margem: 200 })?.total).toBe(699.95)
    expect(precoDigital(200, "A4")).toBeNull()
  })
})

describe("custo real com o Leandro (12/11): preço de venda não muda", () => {
  it("A4: R$ 3,50 a caixa, arte inclusa; o preço continua o mesmo", () => {
    const p = precoDigital(100, "A4")!
    expect(p.total).toBeCloseTo(399.95 + 70 + 150)
    expect(p.custo).toBe(350)
    expect(p.arte).toBe(0)
    expect(p.margem).toBeCloseTo(p.total - 350)
    expect(precoDigital(50, "A4")!.custo).toBe(175)
  })
  it("A4 vendida pela tabela A3 (acima de 100 un): preço da A3, custo da A4", () => {
    const p = precoDigital(200, "A3", undefined, "A4")!
    expect(p.total).toBeCloseTo(1220)
    expect(p.custo).toBe(700)
    expect(p.margem).toBeCloseTo(520)
  })
  it("A3 segue a tabela", () => {
    expect(precoDigital(100, "A3")!.custo).toBeCloseTo(499.95)
  })
})
