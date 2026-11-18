import { describe, it, expect } from "vitest"
import { motivoRecusa } from "@/app/lib/mercadoPago"

describe("Mercado Pago", () => {
  it("explica a recusa em português, com saída genérica", () => {
    expect(motivoRecusa("cc_rejected_insufficient_amount")).toMatch(/limite/)
    expect(motivoRecusa("cc_rejected_call_for_authorize")).toMatch(/banco/)
    expect(motivoRecusa("algo_novo")).toMatch(/Tente outro cartão/)
  })
})
