import { describe, it, expect } from "vitest"
import { documentoValido, mascararDocumento } from "../app/lib/documento"
describe("CPF/CNPJ", () => {
  it("valida o dígito", () => {
    expect(documentoValido("529.982.247-25")).toBe(true)
    expect(documentoValido("529.982.247-24")).toBe(false)
    expect(documentoValido("11.222.333/0001-81")).toBe(true)
    expect(documentoValido("111.111.111-11")).toBe(false)
  })
  it("mascara para a página", () => expect(mascararDocumento("52998224725")).toBe("***.982.***-**"))
})
