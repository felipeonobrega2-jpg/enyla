import { describe, it, expect } from "vitest"
import { registrarEdicao } from "../app/lib/gravarDigitalExterno"

describe("registrarEdicao", () => {
  it("duas gravações seguidas deixam dois itens e preservam o edicaoAcomp antigo", () => {
    const antigo = { por: "COO", em: "2026-11-20T10:00:00", motivo: "primeira" }
    let p: { edicaoAcomp?: typeof antigo; edicoesAcomp?: typeof antigo[] } = { edicaoAcomp: antigo }
    const e1 = { por: "CTO", em: "2026-11-25T10:00:00", motivo: "segunda", prazoEntregaAntes: null }
    p = { ...p, ...registrarEdicao(p, e1) }
    expect(p.edicoesAcomp).toEqual([antigo, e1])
    const e2 = { por: "COO", em: "2026-11-26T09:00:00", motivo: "terceira", situacaoArteAntes: "enviada" }
    p = { ...p, ...registrarEdicao(p, e2) }
    expect(p.edicoesAcomp).toEqual([antigo, e1, e2]); expect(p.edicaoAcomp).toBe(e2)
  })
  it("pedido sem edição anterior começa a lista", () => {
    const e = { por: "CTO", em: "x", motivo: "m" }
    expect(registrarEdicao({}, e)).toEqual({ edicaoAcomp: e, edicoesAcomp: [e] })
  })
})
