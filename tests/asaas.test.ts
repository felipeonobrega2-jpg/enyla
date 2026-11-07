import { describe, it, expect } from "vitest"
import { lerReferencia, tokenWebhookValido } from "../app/lib/asaas"
describe("asaas", () => {
  it("lê só a referência do sistema", () => {
    expect(lerReferencia("DIG-0003:sinal")).toEqual({ id: "DIG-0003", parte: "sinal" })
    expect(lerReferencia("DIG-0003:restante")!.parte).toBe("restante")
    expect(lerReferencia("ORC-1")).toBeNull()
  })
  it("token do webhook", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = "x".repeat(40)
    expect(tokenWebhookValido("x".repeat(40))).toBe(true)
    expect(tokenWebhookValido("y".repeat(40))).toBe(false)
    expect(tokenWebhookValido(null)).toBe(false)
  })
})
