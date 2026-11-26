import { describe, it, expect } from "vitest"
import { followUpDigitalBarrado, FOLLOWUP_DIGITAL_LIGADO } from "@/app/lib/digital"

const pedido = { id: "D-TESTE", status: "aguardando_sinal" }

describe("follow-up da Digital desligado", () => {
  it("a constante está desligada", () => expect(FOLLOWUP_DIGITAL_LIGADO).toBe(false))
  it("pedido Digital aguardando sinal: barrado (lembrete e reenvio)", () => {
    expect(followUpDigitalBarrado({ etiquetas: [] }, null, pedido)).toBe(true)
  })
  it("lead Digital sem pedido (etiqueta Digital): barrado", () => {
    expect(followUpDigitalBarrado({ etiquetas: ["Digital", "F1"] }, null, undefined)).toBe(true)
  })
  it("lead Digital sem pedido (perfil pequeno no registro): barrado", () => {
    expect(followUpDigitalBarrado({ etiquetas: [] }, "pequeno", undefined)).toBe(true)
  })
  it("lead Offset sem pedido: segue o follow-up normal", () => {
    expect(followUpDigitalBarrado({ etiquetas: ["ICP", "F1"] }, "icp", undefined)).toBe(false)
    expect(followUpDigitalBarrado({ etiquetas: null }, undefined, undefined)).toBe(false)
  })
  it("religado: nada é barrado", () => {
    expect(followUpDigitalBarrado({ etiquetas: ["Digital"] }, "pequeno", pedido, true)).toBe(false)
  })
})
