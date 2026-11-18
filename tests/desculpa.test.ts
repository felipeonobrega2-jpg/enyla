import { describe, it, expect } from "vitest"
import { comDesculpa } from "@/app/lib/agenteAuto"

describe("resposta atrasada", () => {
  it("põe a desculpa depois da saudação, sem repetir", () => {
    expect(comDesculpa("Oi, Gilmar! A caixa de 100ml sai por...")).toBe("Oi, Gilmar! Desculpa a demora pra te responder! A caixa de 100ml sai por...")
    expect(comDesculpa("me conta a medida do frasco?")).toBe("Desculpa a demora pra te responder! Me conta a medida do frasco?")
    expect(comDesculpa("Oi! Desculpa a demora, já te explico")).toBe("Oi! Desculpa a demora, já te explico")
  })
})
