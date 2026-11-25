// Prazo da Digital (25/11/2026): config 200 / 7 / 10 / 15, contagem só da arte aprovada, "até dd/mm" com o teto.
import { describe, it, expect } from "vitest"
import { PRAZO_PADRAO_DIGITAL, prazoDigital, prazoPadraoDe, prazoVisivelDigital } from "../app/lib/prazoDigital"
import { somarDiasUteis } from "../app/lib/diasUteis"

describe("prazoDigital", () => {
  it("config inicial", () => expect(PRAZO_PADRAO_DIGITAL).toEqual({ limite: 200, min: 7, max: 10, acima: 15 }))
  it("até 200: 7 a 10; acima: 15", () => {
    expect(prazoDigital(200)).toEqual({ min: 7, max: 10, texto: "7 a 10 dias úteis" })
    expect(prazoDigital(201)).toEqual({ min: 15, max: 15, texto: "15 dias úteis" })
  })
  it("a config gravada vence; campo inválido cai no inicial", () => {
    expect(prazoPadraoDe({ digital: { prazoPadrao: { max: 12, acima: -1 } } })).toEqual({ limite: 200, min: 7, max: 12, acima: 15 })
  })
})

describe("prazoVisivelDigital", () => {
  const ap = "2026-03-02T15:00:00.000Z"   // segunda
  it("200 caixas aprovadas: aprovação + 10 dias úteis", () => {
    const r = prazoVisivelDigital({ quantidade: 200, situacaoArte: "aprovada", arteAprovadaEm: ap })
    expect(r).toEqual({ origem: "calculado", data: somarDiasUteis("2026-03-02", 10), texto: "até 16/03" })
  })
  it("201 caixas: aprovação + 15 dias úteis", () => {
    expect(prazoVisivelDigital({ quantidade: 201, situacaoArte: "prova autorizada", arteAprovadaEm: ap }).data).toBe(somarDiasUteis("2026-03-02", 15))
  })
  it("arte não aprovada: a confirmar", () => {
    for (const s of ["sem arte", "enviada", "ajustes pedidos", undefined]) expect(prazoVisivelDigital({ quantidade: 100, situacaoArte: s, arteAprovadaEm: undefined })).toMatchObject({ origem: "a confirmar", data: null, texto: "a confirmar" })
    expect(prazoVisivelDigital({ quantidade: 100, situacaoArte: "enviada", arteAprovadaEm: ap }).texto).toBe("a confirmar")
  })
  it("prazoEntrega gravado vale mais que o cálculo", () => {
    expect(prazoVisivelDigital({ quantidade: 200, situacaoArte: "aprovada", arteAprovadaEm: ap, prazoEntrega: "2026-11-26" })).toEqual({ origem: "gravado", data: "2026-11-26", texto: "até 26/11" })
    expect(prazoVisivelDigital({ quantidade: 200, situacaoArte: "enviada", prazoEntrega: "2026-11-26" }).texto).toBe("até 26/11")
  })
  it("feriado no meio não entra na soma", () => {
    // 10/11/2026 (terça) + 5 dias úteis: 15/11 (domingo) já é fim de semana; 20/11 (Consciência Negra, sexta) não conta
    expect(somarDiasUteis("2026-11-16", 5)).toBe("2026-11-24")
    expect(prazoVisivelDigital({ quantidade: 100, situacaoArte: "aprovada", arteAprovadaEm: "2026-11-16" }, { digital: { prazoPadrao: { max: 5 } } }).data).toBe("2026-11-24")
  })
})
