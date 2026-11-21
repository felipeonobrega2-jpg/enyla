import { describe, it, expect } from "vitest"
import { efeitoDasRegras, regraVale, type RegraCaixa } from "../app/lib/aprendiz"
import { ordenar } from "../app/lib/caixaEntrada"

const r = (x: Partial<RegraCaixa>): RegraCaixa => ({ id: "r", descricao: "", acao: "esconder", em: "", ...x })

describe("aprendiz: regras da caixa", () => {
  it("regra sem critério não vale (não esconde tudo)", () => {
    expect(regraVale(r({}), { tipo: "orcar" })).toBe(false)
  })
  it("esconde pelo tipo + perfil; palavra sem acento; só a pessoa; vence", () => {
    const agora = new Date("2026-11-21T12:00:00Z").getTime()
    expect(regraVale(r({ tipo: "orcamentoVencendo", perfil: "medio" }), { tipo: "orcamentoVencendo", perfil: "medio" }, agora)).toBe(true)
    expect(regraVale(r({ tipo: "orcamentoVencendo", perfil: "medio" }), { tipo: "orcamentoVencendo", perfil: "icp" }, agora)).toBe(false)
    expect(regraVale(r({ contem: "amostra gratis" }), { tipo: "x", sub: "pediu Amostra Grátis" }, agora)).toBe(true)
    expect(regraVale(r({ jid: "1" }), { tipo: "x", jid: "2" }, agora)).toBe(false)
    expect(regraVale(r({ tipo: "x", ate: "2026-11-20T00:00:00Z" }), { tipo: "x" }, agora)).toBe(false)
  })
  it("subir e baixar mudam a ordem no grupo; esconder tira; alerta do sistema nunca some", () => {
    const regras = [r({ id: "a", acao: "subir", contem: "kraft" }), r({ id: "b", acao: "esconder", tipo: "retomar" }), r({ id: "c", acao: "esconder", grupo: "sistema" })]
    expect(efeitoDasRegras(regras, { tipo: "responder", sub: "quer kraft" }).ajuste).toBe(60)
    const l = ordenar([
      { chave: "1", tipo: "responder", sub: "oi" }, { chave: "2", tipo: "responder", sub: "caixa kraft" },
      { chave: "3", tipo: "retomar" }, { chave: "4", tipo: "sistema", nivel: "perigo" as const },
    ], {}, Date.now(), regras)
    expect(l.filter(x => x.grupo === "vendas").map(x => x.chave)).toEqual(["2", "1"])
    expect(l.map(x => x.chave).sort()).toEqual(["1", "2", "4"])
  })
})
