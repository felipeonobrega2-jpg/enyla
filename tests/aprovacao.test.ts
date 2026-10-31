import { describe, it, expect, beforeAll } from "vitest"
beforeAll(() => { process.env.NEXTAUTH_SECRET = "segredo-de-teste" })
import { tokenAprovacao, tokenValido, validaAte } from "@/app/lib/aprovacao"

describe("aprovação online", () => {
  it("o código só vale para o próprio orçamento", () => {
    const t = tokenAprovacao("ORC-1")
    expect(tokenValido("ORC-1", t)).toBe(true)
    expect(tokenValido("ORC-2", t)).toBe(false)
    expect(tokenValido("ORC-1", "")).toBe(false)
    expect(tokenValido("ORC-1", "abc")).toBe(false)
  })
  it("validade a partir da data do orçamento (formato BR ou ISO)", () => {
    expect(validaAte("31/10/2026, 17:44:51", 7)).toBe("2026-11-07")
    expect(validaAte("2026-10-31T20:44:53", 7)).toBe("2026-11-07")
  })
})
