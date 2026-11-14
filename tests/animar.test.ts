import { describe, it, expect } from "vitest"
import { progresso, linhaRumo, textoResumoDia } from "../app/lib/animar"

const marcos = [{ id: "a", nome: "Primeiros 100k", valor: 100_000 }, { id: "b", nome: "Meio Milhão", valor: 500_000 }]

describe("animar", () => {
  it("linha de comemoração com o próximo marco e a meta do mês", () => {
    const p = progresso(298_000, marcos, 6_200, 10_000)
    expect(p.proximo?.nome).toBe("Meio Milhão")
    const t = linhaRumo(1110, p)
    expect(t).toContain("rumo ao Meio Milhão"); expect(t).toContain("faltam"); expect(t).toContain("62% da meta")
  })
  it("meta batida e sem marco à frente", () => {
    expect(linhaRumo(500, progresso(600_000, marcos, 12_000, 10_000))).toContain("meta do mês batida")
  })
  it("resumo do dia: vendas, agente, placar e o que fica", () => {
    const t = textoResumoDia({
      offset: { n: 1, valor: 6540 }, digital: { n: 2, valor: 2220 }, caixa: 3000,
      agente: { conversas: 14, orcamentosDigitais: 5, propostas: 1, medidas: 2 },
      placar: { orcamentos: 58, pagos: 2, vendido: 2220, custoIA: 300 },
      amanha: { responder: 4, orcar: 2, retomar: 3 }, progresso: progresso(298_000, marcos, 6_200, 10_000), link: "L",
    })
    expect(t).toContain("8.760"); expect(t).toContain("14 conversas"); expect(t).toContain("7× o custo"); expect(t).toContain("4 para responder"); expect(t).toContain("Meio Milhão")
  })
  it("dia sem venda", () => {
    const t = textoResumoDia({ offset: { n: 0, valor: 0 }, digital: { n: 0, valor: 0 }, caixa: 0, agente: { conversas: 0, orcamentosDigitais: 0, propostas: 0, medidas: 0 },
      placar: { orcamentos: 0, pagos: 0, vendido: 0, custoIA: 0 }, amanha: { responder: 0, orcar: 0, retomar: 0 }, progresso: null, link: "L" })
    expect(t).toContain("Nenhuma venda"); expect(t).toContain("nada pendente")
  })
})
