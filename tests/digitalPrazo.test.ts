import { describe, it, expect } from "vitest"
import { prazoDoPedido } from "../app/lib/digitalPrazo"
import { somarDiasUteis } from "../app/lib/diasUteis"

const aprovada = { situacaoArte: "aprovada" as const, arteAprovadaEm: "2026-03-16T15:00:00.000Z" }

describe("prazoDoPedido", () => {
  it("config vazia → a confirmar, mesmo com arte aprovada", () => {
    for (const cfg of [undefined, null, 0, NaN]) expect(prazoDoPedido(aprovada, cfg as never)).toEqual({ data: null, texto: "a confirmar", origem: "a_confirmar" })
  })
  it("config preenchida + arte aprovada → aprovação + dias úteis", () => {
    const r = prazoDoPedido(aprovada, 10)
    expect(r.data).toBe(somarDiasUteis("2026-03-16", 10))
    expect(r.origem).toBe("calculado")
    expect(prazoDoPedido({ ...aprovada, situacaoArte: "prova autorizada" }, 10).data).toBe(r.data)
  })
  it("arte não aprovada → a confirmar", () => {
    for (const s of [undefined, "sem arte", "enviada", "ajustes pedidos"] as const) expect(prazoDoPedido({ ...aprovada, situacaoArte: s }, 10).texto).toBe("a confirmar")
  })
  it("aprovada sem data de aprovação não inventa data", () => {
    expect(prazoDoPedido({ situacaoArte: "aprovada" }, 10).texto).toBe("a confirmar")
  })
  it("prazoEntrega gravado na mão prevalece", () => {
    expect(prazoDoPedido({ ...aprovada, prazoEntrega: "2026-04-30" }, 10)).toEqual({ data: "2026-04-30", texto: "30/04/2026", origem: "gravado" })
    expect(prazoDoPedido({ prazoEntrega: "2026-04-30" }, undefined).origem).toBe("gravado")
    expect(prazoDoPedido({ ...aprovada, prazoEntrega: "" }, undefined).texto).toBe("a confirmar")
  })
})
