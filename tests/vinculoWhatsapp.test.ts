import { describe, it, expect } from "vitest"
import { clienteDaConversa, ligacaoForte } from "@/app/lib/vinculoWhatsapp"

const clientes = ["Raniere Péricles", "Adilson", "Ana Silva", "Ana Souza"]

describe("cliente da conversa do WhatsApp", () => {
  it("nome idêntico (sem acento/maiúscula) e nome contido sem ambiguidade", () => {
    expect(clienteDaConversa({ jid: "1@lid", nome: "raniere pericles" }, clientes)?.nome).toBe("Raniere Péricles")
    expect(clienteDaConversa({ jid: "2@lid", nome: "Adilson Figueiredo" }, clientes)?.nome).toBe("Adilson")
  })
  it("não liga quando é só número ou ambíguo", () => {
    expect(clienteDaConversa({ jid: "3@lid", nome: "184112514089011" }, clientes)).toBeNull()
    expect(clienteDaConversa({ jid: "4@lid", nome: "Ana" }, clientes)).toBeNull()
  })
  it("vínculo manual vence; vazio marca que não é cliente", () => {
    expect(clienteDaConversa({ jid: "5@lid", nome: "Fulano" }, clientes, { "5@lid": "Ana Souza" })).toEqual({ nome: "Ana Souza", manual: true })
    expect(clienteDaConversa({ jid: "1@lid", nome: "Raniere Péricles" }, clientes, { "1@lid": "" })).toBeNull()
  })
  it("ligação forte para o agente: só o primeiro nome batendo pode ser outra pessoa", () => {
    expect(ligacaoForte({ nome: "Mauricio Daniel" }, { nome: "Maurício", manual: false })).toBe(false)
    expect(ligacaoForte({ nome: "Maurício" }, { nome: "Maurício", manual: false })).toBe(true)
    expect(ligacaoForte({ nome: "Raniere Pericles Jr" }, { nome: "Raniere Péricles", manual: false })).toBe(true)
    expect(ligacaoForte({ nome: "Fulano" }, { nome: "Adilson", manual: true })).toBe(true)
  })
})
