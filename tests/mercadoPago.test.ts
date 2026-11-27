import { describe, it, expect, vi, afterEach } from "vitest"
import { createHmac } from "crypto"
import { voltaMercadoPago, conferirMercadoPago, criarLinkMercadoPago, assinaturaMercadoPagoValida } from "../app/lib/mercadoPago"

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const resposta = (corpo: unknown, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => corpo })

describe("Mercado Pago no cartão", () => {
  it("volta do checkout vira o formato da InfinitePay", () => {
    expect(voltaMercadoPago({ payment_id: "123", external_reference: "ORC-1_abc" })).toEqual({ order_nsu: "ORC-1_abc", transaction_nsu: "123", slug: "mp" })
    expect(voltaMercadoPago({ collection_id: "9", external_reference: "DIG-0003-sinal_x" })?.transaction_nsu).toBe("9")
    expect(voltaMercadoPago({ payment_id: "null", external_reference: "ORC-1_abc" })).toBeNull()
    expect(voltaMercadoPago({})).toBeNull()
  })
  it("só vale pago: aprovado e da mesma referência", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN", "APP_USR-x")
    vi.stubGlobal("fetch", vi.fn(async () => resposta({ id: 5, status: "approved", transaction_amount: 1234.5, installments: 3, payment_method_id: "visa", external_reference: "ORC-1_abc" })))
    expect(await conferirMercadoPago({ nsu: "ORC-1_abc", pagamentoId: "5" })).toEqual({ pago: true, valorCentavos: 123450, pagoCentavos: 123450, parcelas: 3, metodo: "credit_card" })
    expect((await conferirMercadoPago({ nsu: "OUTRO_1", pagamentoId: "5" })).pago).toBe(false)
    expect((await conferirMercadoPago({ nsu: "ORC-1_abc", pagamentoId: "5; drop" })).pago).toBe(false)
  })
  it("pendente não é pago", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN", "APP_USR-x")
    vi.stubGlobal("fetch", vi.fn(async () => resposta({ id: 5, status: "in_process", transaction_amount: 10, external_reference: "A_1" })))
    expect((await conferirMercadoPago({ nsu: "A_1", pagamentoId: "5" })).pago).toBe(false)
  })
  it("cria o link só com cartão, até 12x, com a referência e a volta", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN", "APP_USR-x")
    const f = vi.fn(async (_u: string, _i: RequestInit) => resposta({ id: "p1", init_point: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=p1" }))
    vi.stubGlobal("fetch", f)
    const r = await criarLinkMercadoPago({ nsu: "ORC-1_abc", valor: 1000.005, descricao: "Pedido", voltarPara: "https://app/aprovar/ORC-1?t=x", notificar: "https://app/api/mercadopago/webhook", cliente: { name: "Ana Maria Souza" } })
    expect(r).toEqual({ url: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=p1" })
    const corpo = JSON.parse(String(f.mock.calls[0][1].body))
    expect(corpo.external_reference).toBe("ORC-1_abc")
    expect(corpo.payment_methods.installments).toBe(12)
    expect(corpo.payment_methods.excluded_payment_types.map((x: { id: string }) => x.id)).toContain("bank_transfer")
    expect(corpo.back_urls.success).toBe("https://app/aprovar/ORC-1?t=x")
    expect(corpo.payer).toEqual({ name: "Ana", surname: "Maria Souza" })
  })
  it("assinatura do webhook", () => {
    vi.stubEnv("MP_WEBHOOK_SECRET", "segredo")
    const v1 = createHmac("sha256", "segredo").update("id:77;request-id:r1;ts:100;").digest("hex")
    expect(assinaturaMercadoPagoValida(`ts=100,v1=${v1}`, "r1", "77")).toBe(true)
    expect(assinaturaMercadoPagoValida(`ts=100,v1=${v1}`, "r1", "78")).toBe(false)
    expect(assinaturaMercadoPagoValida(null, "r1", "77")).toBe(false)
  })
})
