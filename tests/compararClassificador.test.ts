import { describe, it, expect } from "vitest"
import {
  idAnonimo, resumirClassificacao, compararComBase, divergencias, estimarCusto, tokensAprox, relatorioMarkdown, tabelaEstimativa,
  somarUsoModelo, SAIDA_MEDIA_TOKENS, type Linha, type Resumo,
} from "../app/lib/compararClassificador"

const r = (perfil: Resumo["perfil"], quantidade: number | null, mql: boolean, etiquetas: string[] = []): Resumo => ({ perfil, quantidade, mql, etiquetas })
const O = "claude-opus-5-5", S = "claude-sonnet-5-5", H = "claude-haiku-5-5"

describe("idAnonimo", () => {
  it("é estável com o mesmo sal e muda com outro; não contém o jid", () => {
    const jid = "5511999998888@s.whatsapp.net"
    expect(idAnonimo(jid, "a")).toBe(idAnonimo(jid, "a"))
    expect(idAnonimo(jid, "a")).not.toBe(idAnonimo(jid, "b"))
    expect(idAnonimo(jid, "a")).toMatch(/^[0-9a-f]{10}$/)
    expect(idAnonimo(jid, "a")).not.toContain("5511")
  })
})

describe("resumirClassificacao", () => {
  it("valida como em produção: sem prova no texto do cliente, vira indefinido e não é MQL", () => {
    const bruto = { perfil: "icp" as const, quantidade_total: 10000, recorrente: false, evidencia: "10 mil caixas", motivo: "x", fornecedor: false }
    expect(resumirClassificacao(bruto, ["oi"], [], null, false).mql).toBe(false)
    const ok = resumirClassificacao(bruto, ["quero 10 mil caixas"], [], null, false)
    expect(ok.perfil).toBe("icp")
    expect(ok.mql).toBe(true)
  })
})

describe("comparação", () => {
  const linhas: Linha[] = [
    { id: "a", por: { [O]: r("icp", 10000, true, ["ICP"]), [S]: r("icp", 10000, true, ["ICP"]), [H]: r("medio", 3000, true, ["Lead médio"]) } },
    { id: "b", por: { [O]: r("pequeno", 500, false), [S]: r("indefinido", null, false), [H]: null } },
    { id: "c", por: { [O]: null, [S]: r("icp", 1, true), [H]: r("icp", 1, true) } },
  ]
  it("conta concordância por campo e falhas", () => {
    const s = compararComBase(linhas, S)
    expect(s.comparadas).toBe(2)
    expect(s.concordancia).toEqual({ perfil: 1, quantidade_total: 1, mql: 2, etiquetas: 2 })
    const h = compararComBase(linhas, H)
    expect(h.comparadas).toBe(1)
    expect(h.falhas).toBe(1)
    expect(h.concordancia.perfil).toBe(0)
  })
  it("monta a matriz de confusão Opus × outro", () => {
    expect(compararComBase(linhas, S).confusao.pequeno.indefinido).toBe(1)
    expect(compararComBase(linhas, S).confusao.icp.icp).toBe(1)
  })
  it("lista divergências só com id anônimo e campos", () => {
    const d = divergencias(linhas, [S, H])
    expect(d.map(x => `${x.id}:${x.modelo}`)).toEqual(["a:" + H, "b:" + S])
    expect(d[0].campos).toEqual(["perfil", "quantidade_total", "etiquetas"])
  })
})

describe("estimativa de custo", () => {
  it("usa a tabela PRECO_IA", () => {
    const e = estimarCusto([1_000_000], [O, S, H])
    const saida = SAIDA_MEDIA_TOKENS
    expect(e[0].usd).toBeCloseTo((1_000_000 * 4 + saida * 20) / 1e6, 6)
    expect(e[1].usd).toBeCloseTo((1_000_000 * 2 + saida * 10) / 1e6, 6)
    expect(e[2].usd).toBeCloseTo((1_000_000 * 0.1 + saida * 0.5) / 1e6, 6)
  })
  it("modelo fora da tabela fica sem custo; tokens aproximados", () => {
    expect(estimarCusto([100], ["x"])[0].usd).toBeNull()
    expect(tokensAprox("a".repeat(35))).toBe(10)
  })
  it("tabela de estimativa lista os três modelos", () => {
    const t = tabelaEstimativa(2, [1000, 2000])
    for (const m of [O, S, H]) expect(t).toContain(m)
    expect(t).toContain("Conversas selecionadas: 2")
  })
  it("soma o uso real por modelo", () => {
    const u = somarUsoModelo({ chamadas: 0, entrada: 0, saida: 0, usd: 0 }, S, { input_tokens: 1000, output_tokens: 100 })
    expect(u).toMatchObject({ chamadas: 1, entrada: 1000, saida: 100 })
    expect(u.usd).toBeCloseTo((1000 * 2 + 100 * 10) / 1e6, 6)
  })
})

describe("relatório", () => {
  it("não vaza jid, telefone, nome nem trecho de conversa", () => {
    const jid = "5511999998888@s.whatsapp.net"
    const linhas: Linha[] = [{ id: idAnonimo(jid, "sal"), por: { [O]: r("icp", 5000, true), [S]: r("medio", 2000, true), [H]: r("icp", 5000, true) } }]
    const md = relatorioMarkdown({ linhas, uso: {}, janelaDias: 45, geradoEm: "2026-11-24" })
    expect(md).not.toContain("5511")
    expect(md).not.toContain("whatsapp.net")
    expect(md).toContain(idAnonimo(jid, "sal"))
    expect(md).toContain("Matriz de confusão")
  })
})
