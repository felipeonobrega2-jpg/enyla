import { describe, it, expect } from "vitest"
import { formDoAtendimento, temDados, DadosPedido } from "@/app/lib/atendente"

const d = (p: Partial<DadosPedido>): DadosPedido => ({ produto: "", volume_ml: null, caixa_cm: null, frasco_cm: null, quantidade: null, tem_arte: null, resumo: "", ...p })

describe("atendente → orçamento", () => {
  it("medidas da caixa e quantidade preenchem o orçamento", () => {
    expect(formDoAtendimento(d({ caixa_cm: { frente: 8, lateral: 4, altura: 17 }, quantidade: 2000, resumo: "Perfume 100ml" })))
      .toMatchObject({ frente: 8, lateral: 4, alturaBox: 17, quantidades: [2000], obsInterna: "Perfume 100ml" })
  })
  it("medida absurda ou quantidade estranha não entram", () => {
    const f = formDoAtendimento(d({ caixa_cm: { frente: 100, lateral: 4, altura: 17 }, quantidade: 3 }))
    expect(f.frente).toBeUndefined()
    expect(f.quantidades).toBeUndefined()
  })
  it("frasco e arte vão para a observação interna", () => {
    expect(formDoAtendimento(d({ resumo: "Perfume árabe", frasco_cm: "5x5x12", tem_arte: false })).obsInterna)
      .toBe("Perfume árabe · Frasco: 5x5x12 · Arte por nossa conta")
  })
  it("temDados", () => {
    expect(temDados(d({}))).toBe(false)
    expect(temDados(d({ quantidade: 1000 }))).toBe(true)
  })
})
