import { describe, it, expect } from "vitest"
import { casaBusca, chaveBusca, regexBusca } from "../app/lib/buscaConversa"

describe("busca de conversas", () => {
  it("acha Allison buscando alisson (letra dobrada e acento não importam)", () => {
    expect(casaBusca({ nome: "Allison Pessoa - Similares" }, "alisson")).toBe(true)
    expect(casaBusca({ nome: "Allison Pessoa - Similares" }, "alisson pessoa")).toBe(true)
    expect(casaBusca({ nome: "Gisele Araújo" }, "araujo")).toBe(true)
    expect(casaBusca({ nome: "Walisson Carlos" }, "pessoa")).toBe(false)
  })
  it("acha pelo telefone, mesmo digitado com espaço e traço", () => {
    const c = { nome: "Fulano", telefone: "5511987654321", jid: "5511987654321@s.whatsapp.net" }
    expect(casaBusca(c, "98765-4321")).toBe(true)
    expect(casaBusca(c, "1234")).toBe(false)
  })
  it("número no meio de texto não vira busca por telefone", () => {
    expect(casaBusca({ nome: "Ana", telefone: "5511900001000" }, "caixa 1000")).toBe(false)
  })
  it("a expressão do banco casa igual à busca da tela", () => {
    const re = new RegExp(regexBusca("alisson")!, "i")
    expect(re.test("Allison Pessoa")).toBe(true)
    expect(re.test("Alisson")).toBe(true)
    expect(new RegExp(regexBusca("joao")!, "i").test("João Pedro")).toBe(true)
    expect(regexBusca("al")).toBeNull()
    expect(chaveBusca("Café")).toBe("cafe")
  })
})
