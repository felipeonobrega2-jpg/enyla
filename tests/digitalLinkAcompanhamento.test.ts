import { describe, it, expect } from "vitest"
import { linkAcompanhamento, linkPedido, tokenDigital, tokenDigitalValido } from "../app/lib/digitalLink"

describe("link de acompanhamento (#230)", () => {
  it("usa o mesmo token do link de fechamento, em rota separada", () => {
    const l = linkAcompanhamento("DIG-0001")
    expect(l).toContain("/d/DIG-0001/acompanhar?t=")
    expect(l.endsWith(tokenDigital("DIG-0001"))).toBe(true)
    expect(tokenDigitalValido("DIG-0001", new URL(l).searchParams.get("t"))).toBe(true)
    expect(tokenDigitalValido("DIG-0002", new URL(l).searchParams.get("t"))).toBe(false)
    expect(linkPedido("DIG-0001")).not.toContain("acompanhar")
  })
})
