import { describe, it, expect } from "vitest"
import { validarCartao, luhn } from "@/app/lib/cartaoAprovacao"

const ok = { numero: "4111 1111 1111 1111", nomeCartao: "MARIA EXEMPLO", validade: "12/30", cvv: "123", nome: "Maria Exemplo", documento: "529.982.247-25", email: "maria@exemplo.com", celular: "(11) 91234-5678", cep: "01310-100", numeroEndereco: "100" }

describe("cartão na página de aprovação", () => {
  it("aceita dados completos e normaliza", () => {
    const r = validarCartao(ok, new Date("2026-11-18"))
    expect(r).toMatchObject({ dados: { numero: "4111111111111111", mes: "12", ano: "2030", documento: "52998224725", celular: "11912345678", cep: "01310100" } })
  })
  it("recusa antes de ir ao Asaas: número errado, vencido, CPF inválido, nome incompleto", () => {
    expect(luhn("4111111111111112")).toBe(false)
    expect(validarCartao({ ...ok, numero: "4111 1111 1111 1112" })).toEqual({ erro: "Número do cartão inválido." })
    expect(validarCartao({ ...ok, validade: "10/26" }, new Date("2026-11-18"))).toEqual({ erro: "Cartão vencido." })
    expect(validarCartao({ ...ok, documento: "111.111.111-11" })).toEqual({ erro: "CPF ou CNPJ do titular inválido." })
    expect(validarCartao({ ...ok, nome: "Maria" })).toEqual({ erro: "Informe o nome completo do titular." })
  })
  it("aceita CNPJ do titular", () => {
    expect(validarCartao({ ...ok, documento: "11.222.333/0001-81" }, new Date("2026-11-18"))).toHaveProperty("dados")
  })
})
