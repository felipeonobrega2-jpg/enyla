import { describe, it, expect } from "vitest"
import { saldoDoTexto, situacaoMeta, precisaAvisar, textoAvisoMeta } from "@/app/lib/metaSaldo"

describe("crédito da Meta", () => {
  it("lê o saldo do texto da Meta", () => {
    expect(saldoDoTexto("Saldo disponível (R$276,38 BRL)")).toBe(276.38)
    expect(saldoDoTexto("Saldo disponível (R$ 1.276,38 BRL)")).toBe(1276.38)
    expect(saldoDoTexto("Visa •••• 1234")).toBeNull()
  })
  const conta = { account_status: 1, is_prepay_account: true, spend_cap: "666607", amount_spent: "642327", funding_source_details: { display_string: "Saldo disponível (R$276,38 BRL)" } }
  it("vale o que acabar primeiro: saldo ou limite de gasto", () => {
    const s = situacaoMeta(conta, 50)
    expect(s.saldo).toBe(276.38)
    expect(s.limiteRestante).toBeCloseTo(242.8)
    expect(s.restante).toBeCloseTo(242.8)
    expect(precisaAvisar(s)).toBeNull()                // ~4,8 dias a R$ 50/dia
  })
  it("menos de 2 dias de anúncio: acabando, e diz que é o limite de gasto", () => {
    const s = situacaoMeta(conta, 150)
    expect(precisaAvisar(s)).toBe("acabando")
    expect(textoAvisoMeta(s, "acabando")).toMatch(/limite de gasto/)
  })
  it("zerado ou conta inativa: parada", () => {
    expect(precisaAvisar(situacaoMeta({ ...conta, spend_cap: "642327" }, 50))).toBe("parada")
    expect(precisaAvisar(situacaoMeta({ ...conta, account_status: 2 }, 50))).toBe("parada")
  })
  it("menos de R$ 100: acabando mesmo sem histórico de gasto", () => {
    expect(precisaAvisar(situacaoMeta({ ...conta, spend_cap: "0", funding_source_details: { display_string: "Saldo disponível (R$80,00 BRL)" } }, 0))).toBe("acabando")
  })
})
