import { describe, it, expect } from "vitest"
import { parcelasDa, entradaPct, textoCondicao, valoresDasParcelas, vencimentoDa, condicaoValida, type CondicaoPagamento } from "../app/lib/condicaoPagamento"

const c3060: CondicaoPagamento = { tipo: "personalizada", parcelas: [{ pct: 34, dias: 30, base: "aprovacao" }, { pct: 33, dias: 60, base: "aprovacao" }, { pct: 33, dias: 90, base: "aprovacao" }] }

describe("condição de pagamento do orçamento", () => {
  it("padrão = sinal da configuração na aprovação e o resto na entrega", () => {
    expect(parcelasDa(undefined, 50)).toEqual([{ pct: 50, dias: 0, base: "aprovacao" }, { pct: 50, dias: 0, base: "entrega" }])
    expect(entradaPct(undefined, 50)).toBe(50)
    expect(textoCondicao({ tipo: "padrao" }, 50)).toBe("50% na aprovação e 50% na entrega")
  })
  it("personalizada em dias", () => {
    const c: CondicaoPagamento = { tipo: "personalizada", parcelas: [{ pct: 30, dias: 0, base: "aprovacao" }, { pct: 70, dias: 30, base: "entrega" }] }
    expect(entradaPct(c, 50)).toBe(30)
    expect(textoCondicao(c, 50)).toBe("30% na aprovação e 70% em 30 dias após a entrega")
    expect(textoCondicao(c3060, 50)).toBe("34% em 30 dias após a aprovação, 33% em 60 dias após a aprovação e 33% em 90 dias após a aprovação")
    expect(entradaPct(c3060, 50)).toBe(0)
  })
  it("valores fecham o total em centavos", () => {
    const v = valoresDasParcelas(c3060, 50, 1000.01)
    expect(v.map(x => x.valor)).toEqual([340, 330, 330.01])
    expect(v.reduce((s, x) => s + Math.round(x.valor * 100), 0)).toBe(100001)
  })
  it("vencimento conta da aprovação ou da entrega prevista", () => {
    expect(vencimentoDa({ pct: 50, dias: 30, base: "aprovacao" }, "2026-11-27", "2026-12-10")).toBe("2026-12-27")
    expect(vencimentoDa({ pct: 50, dias: 30, base: "entrega" }, "2026-11-27", "2026-12-10")).toBe("2027-01-09")
    expect(vencimentoDa({ pct: 50, dias: 0, base: "entrega" }, "2026-11-27", null)).toBe("2026-11-27")
  })
  it("só vale se fechar 100%", () => {
    expect(condicaoValida(c3060)).toBe(true)
    expect(condicaoValida({ tipo: "personalizada", parcelas: [{ pct: 30, dias: 0, base: "aprovacao" }] })).toBe(false)
    expect(condicaoValida(undefined)).toBe(true)
  })
})
