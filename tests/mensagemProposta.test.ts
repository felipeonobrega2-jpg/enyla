import { describe, it, expect } from "vitest"
import { mensagemProposta, especificacaoDaProposta } from "../app/lib/mensagemProposta"
import type { FormData, Calculo } from "../app/types"

const form = {
  nomeCliente: "Perfumaria Modelo", tipoCaixa: "fundo-automatico", frente: 6, alturaBox: 10.5, lateral: 3,
  materialNome: "Triplex 300g", incluirVerniz: true, vernizTipo: "UV Localizado", laminacao: true, laminacaoTipo: "Soft Touch",
  outrosAcabamentos: ["Hot Stamping"], acompanhamentos: ["Berço interno"], numSKUs: 4, comFaca: false,
} as unknown as FormData
const calculo = { sweetSpotIdealQtd: 2000, tabela: [{ quantidade: 2000, precoSemFaca: 1700, unitarioSemFaca: 0.85, precoComFaca: 0, unitarioComFaca: 0 }] } as unknown as Calculo

describe("mensagem da proposta", () => {
  it("traz caixa, material e acabamentos", () => {
    expect(especificacaoDaProposta(form)).toEqual([
      "*Caixa com fundo automático* · 6 × 10,5 × 3 cm (L × A × P)",
      "Material: Triplex 300g",
      "Acabamentos: Verniz UV Localizado, laminação soft touch, hot stamping",
      "Acompanha: berço interno",
      "4 modelos de arte",
    ])
    const m = mensagemProposta(form, calculo, "ORC-1", "https://x/aprovar")
    expect(m).toContain("Material: Triplex 300g")
    expect(m.indexOf("Acabamentos")).toBeLessThan(m.indexOf("2.000 unidades"))
  })
  it("sem acabamento: só o que existe", () => {
    const f = { ...form, incluirVerniz: false, laminacao: false, outrosAcabamentos: [], acompanhamentos: [], numSKUs: 1, materialNome: "" } as FormData
    expect(especificacaoDaProposta(f)).toEqual(["*Caixa com fundo automático* · 6 × 10,5 × 3 cm (L × A × P)"])
  })
})
