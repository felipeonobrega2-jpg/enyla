// Prazo visível do Digital (#164/#162): puro, dados fictícios.
import { describe, it, expect } from "vitest"
import { prazoVisivel } from "../app/lib/digitalPrazo"
import { PRAZO_PADRAO_DIGITAL, prazoDigital, prazoPadraoDaConfig } from "../app/lib/prazoDigital"
import { somarDiasUteis, definirFeriadosLocais } from "../app/lib/diasUteis"

describe("config do prazo", () => {
  it("valores iniciais 200 / 7 / 10 / 15 e config vazia cai neles", () => {
    expect(PRAZO_PADRAO_DIGITAL).toEqual({ limite: 200, min: 7, teto: 10, acima: 15 })
    expect(prazoPadraoDaConfig({})).toEqual(PRAZO_PADRAO_DIGITAL)
    expect(prazoPadraoDaConfig({ digital: { prazoPadrao: { teto: 12, acima: -3 } } })).toEqual({ limite: 200, min: 7, teto: 12, acima: 15 })
  })
  it("prazoDigital: até 200 = 7 a 10; acima = 15", () => {
    expect(prazoDigital(200)).toMatchObject({ min: 7, max: 10 })
    expect(prazoDigital(201)).toMatchObject({ min: 15, max: 15, texto: "15 dias úteis" })
  })
})

describe("prazoVisivel", () => {
  const aprovado = { situacaoArte: "aprovada", arteAprovadaEm: "2026-03-02T15:00:00.000Z", quantidade: 200 }   // segunda
  it("200 caixas aprovadas: aprovação + 10 dias úteis", () => {
    const r = prazoVisivel(aprovado)
    expect(r).toEqual({ data: somarDiasUteis("2026-03-02", 10), texto: "até 16/03", origem: "calculado" })
  })
  it("201 caixas: aprovação + 15 dias úteis; prova autorizada também conta", () => {
    expect(prazoVisivel({ ...aprovado, quantidade: 201, situacaoArte: "prova autorizada" }).data).toBe(somarDiasUteis("2026-03-02", 15))
  })
  it("arte não aprovada ou sem situação: a confirmar", () => {
    for (const s of ["sem arte", "enviada", "ajustes pedidos", undefined, null]) expect(prazoVisivel({ ...aprovado, situacaoArte: s })).toEqual({ data: null, texto: "a confirmar", origem: "a_confirmar" })
  })
  it("aprovada sem data de aprovação: a confirmar (não inventa)", () => {
    expect(prazoVisivel({ ...aprovado, arteAprovadaEm: undefined }).texto).toBe("a confirmar")
  })
  it("prazoEntrega gravado na mão prevalece, mesmo com arte não aprovada", () => {
    expect(prazoVisivel({ ...aprovado, prazoEntrega: "2026-11-26" })).toEqual({ data: "2026-11-26", texto: "até 26/11", origem: "gravado" })
    expect(prazoVisivel({ situacaoArte: "enviada", prazoEntrega: "2026-11-26" }).data).toBe("2026-11-26")
    expect(prazoVisivel({ ...aprovado, prazoEntrega: "" }).origem).toBe("calculado")
  })
  it("regra da config é usada e feriado no meio não entra na soma", () => {
    definirFeriadosLocais({ extras: ["2026-03-04"] })
    try {
      const r = prazoVisivel({ ...aprovado, quantidade: 50 }, { limite: 200, min: 7, teto: 3, acima: 15 })
      expect(r.data).toBe("2026-03-06")   // 03, 05, 06 (dia 04 é feriado)
    } finally { definirFeriadosLocais(null) }
  })
})
