import { describe, it, expect } from "vitest"
import { podeExcluirCard, confirmacaoExcluirCard, TITULO_EXCLUIR_CARD } from "../app/lib/excluirCard"

describe("X de excluir do card", () => {
  it("o diretor não vê o X", () => expect(podeExcluirCard("diretor")).toBe(false))
  it("o admin vê o X", () => expect(podeExcluirCard("admin")).toBe(true))
  it("sem papel lido, não aparece", () => {
    expect(podeExcluirCard(undefined)).toBe(false)
    expect(podeExcluirCard(null)).toBe(false)
  })
  it("título e confirmação deixam claro que apaga de vez", () => {
    expect(TITULO_EXCLUIR_CARD).toBe("Excluir definitivamente")
    const t = confirmacaoExcluirCard("Ana")
    expect(t).toContain('"Ana"')
    expect(t).toContain("o pedido, o histórico e a proposta somem sem volta".replace("o pedido", "O pedido"))
    expect(t).toContain("Marcar como perdido")
  })
})
