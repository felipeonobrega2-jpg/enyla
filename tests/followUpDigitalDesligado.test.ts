import { describe, it, expect } from "vitest"
import { FOLLOWUP_DIGITAL_LIGADO, followUpDigitalBarrado, lembreteDigitalAgora, pedidoPendente, type PedidoDigital } from "@/app/lib/digital"

const agora = Date.parse("2026-11-26T12:00:00Z")
const pedido = { id: "DIG-0001", jid: "5511900000001@s.whatsapp.net", status: "aguardando_sinal", em: "2026-11-25T12:00:00Z" } as PedidoDigital

describe("follow-up da Digital desligado (ordem do Felipe, 26/11/2026)", () => {
  it("a constante nasce desligada", () => {
    expect(FOLLOWUP_DIGITAL_LIGADO).toBe(false)
  })
  it("lead com pedido Digital aguardando_sinal fica barrado (sem lembrete nem reenvio)", () => {
    expect(pedidoPendente([pedido], pedido.jid, agora)).not.toBeNull()
    expect(followUpDigitalBarrado([pedido], pedido.jid, agora)).toBe(true)
  })
  it("lead sem pedido Digital segue com o follow-up normal", () => {
    expect(followUpDigitalBarrado([pedido], "5511900000002@s.whatsapp.net", agora)).toBe(false)
    expect(followUpDigitalBarrado(undefined, pedido.jid, agora)).toBe(false)
  })
  it("pedido já pago ou vencido não barra o lead", () => {
    expect(followUpDigitalBarrado([{ ...pedido, status: "producao" } as PedidoDigital], pedido.jid, agora)).toBe(false)
    expect(followUpDigitalBarrado([{ ...pedido, em: "2026-01-01T00:00:00Z" }], pedido.jid, agora)).toBe(false)
  })
  it("o código dos lembretes continua existindo", () => {
    expect(typeof lembreteDigitalAgora).toBe("function")
  })
})
