import { describe, it, expect } from "vitest"
import { chaveTelefone, vinculosPorTelefone } from "../app/lib/vinculoWhatsapp"

describe("chaveTelefone", () => {
  it("o mesmo número com ou sem o 9, com ou sem DDI e máscara", () => {
    expect(chaveTelefone("(11) 98765-4321")).toBe("1187654321")
    expect(chaveTelefone("5511987654321")).toBe("1187654321")
    expect(chaveTelefone("551187654321")).toBe("1187654321")
    expect(chaveTelefone("123")).toBeNull()
    expect(chaveTelefone(null)).toBeNull()
  })
})

describe("vinculosPorTelefone", () => {
  const clientes = [{ nome: "Cliente Um", telefone: "(11) 98765-4321" }, { nome: "Cliente Dois", telefone: "21 99999-0000" }, { nome: "Sem Fone", telefone: null }]
  it("liga pelo telefone gravado e pelo jid antigo", () => {
    expect(vinculosPorTelefone([
      { jid: "a@lid", telefone: "5511987654321" },
      { jid: "552199990000@s.whatsapp.net", telefone: null },
      { jid: "b@lid", telefone: null },
    ], clientes)).toEqual({ "a@lid": "Cliente Um", "552199990000@s.whatsapp.net": "Cliente Dois" })
  })
  it("não mexe em conversa já ligada nem na marcada como não cliente", () => {
    expect(vinculosPorTelefone([{ jid: "a@lid", telefone: "5511987654321" }, { jid: "c@lid", telefone: "5511987654321" }], clientes, { "a@lid": "Outro", "c@lid": "" })).toEqual({})
  })
  it("telefone repetido em dois clientes não liga ninguém; grupo nunca", () => {
    const dup = [...clientes, { nome: "Cliente Três", telefone: "11987654321" }]
    expect(vinculosPorTelefone([{ jid: "a@lid", telefone: "5511987654321" }, { jid: "1@g.us", telefone: "5521999990000" }], dup)).toEqual({})
  })
})
