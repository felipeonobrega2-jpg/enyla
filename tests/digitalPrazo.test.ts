import { describe, it, expect } from "vitest"
import { prazoDoPedido } from "../app/lib/digitalPrazo"
import { somarDiasUteis } from "../app/lib/diasUteis"

describe("prazoDoPedido", () => {
  const aprovado = { situacaoArte: "aprovada", arteAprovadaEm: "2026-11-23T15:00:00.000Z" }
  it("config vazia: a confirmar mesmo com a arte aprovada", () => {
    for (const cfg of [undefined, null, 0]) expect(prazoDoPedido(aprovado, cfg)).toMatchObject({ data: null, texto: "a confirmar" })
  })
  it("config preenchida + arte aprovada: aprovação + dias úteis", () => {
    expect(prazoDoPedido(aprovado, 7)).toEqual({ data: somarDiasUteis("2026-11-23", 7), texto: somarDiasUteis("2026-11-23", 7), origem: "calculado" })
    expect(prazoDoPedido({ ...aprovado, situacaoArte: "prova autorizada" }, 7).data).toBe(somarDiasUteis("2026-11-23", 7))
  })
  it("arte não aprovada: a confirmar", () => {
    for (const s of [undefined, "sem arte", "enviada", "ajustes pedidos"]) expect(prazoDoPedido({ ...aprovado, situacaoArte: s }, 7).texto).toBe("a confirmar")
  })
  it("aprovada sem data de aprovação: a confirmar (não inventa data)", () => {
    expect(prazoDoPedido({ situacaoArte: "aprovada" }, 7).texto).toBe("a confirmar")
  })
  it("prazoEntrega gravado na mão prevalece (mesmo sem config e sem arte aprovada)", () => {
    expect(prazoDoPedido({ prazoEntregaEm: "2026-11-26" }, null)).toEqual({ data: "2026-11-26", texto: "2026-11-26", origem: "gravado" })
    expect(prazoDoPedido({ ...aprovado, prazoEntregaEm: "2026-12-01" }, 7).data).toBe("2026-12-01")
  })
})
