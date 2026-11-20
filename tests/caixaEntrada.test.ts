import { describe, it, expect } from "vitest"
import { ordenar, prioridade, escondido, adiarAte, grupoDoTipo } from "@/app/lib/caixaEntrada"

describe("caixa de entrada do Painel", () => {
  it("dinheiro e bom negócio na frente; sistema fora do ar acima de tudo; relacionamento por último", () => {
    const l = ordenar([
      { chave: "a", tipo: "avaliado" }, { chave: "b", tipo: "responder" }, { chave: "c", tipo: "aprovado", valor: 1760 },
      { chave: "d", tipo: "sistema", nivel: "perigo" }, { chave: "e", tipo: "atrasado", nivel: "perigo" }, { chave: "f", tipo: "propostaPronta", valor: 9540 },
    ])
    expect(l.map(x => x.chave)).toEqual(["d", "c", "f", "b", "e", "a"])
  })
  it("valor maior sobe dentro do mesmo tipo", () => {
    expect(prioridade({ tipo: "pagamento", valor: 10000 })).toBeGreaterThan(prioridade({ tipo: "pagamento", valor: 500 }))
  })
  it("resolvido some; adiado volta quando passa a hora; repetido aparece uma vez", () => {
    const agora = new Date("2026-11-20T15:00:00Z").getTime()
    const ocultos = { r: "sempre", a: "2026-11-20T18:00:00Z", v: "2026-11-20T12:00:00Z" }
    expect(escondido("r", ocultos, agora)).toBe(true)
    expect(escondido("a", ocultos, agora)).toBe(true)
    expect(escondido("v", ocultos, agora)).toBe(false)
    expect(ordenar([{ chave: "x", tipo: "orcar" }, { chave: "x", tipo: "orcar" }], {}, agora)).toHaveLength(1)
  })
  it("lembrar amanhã cai às 8 h de Brasília; grupos", () => {
    expect(adiarAte("amanha", new Date("2026-11-20T22:30:00Z"))).toBe("2026-11-21T11:00:00.000Z")
    expect(grupoDoTipo("cobrancaVencida")).toBe("dinheiro")
    expect(grupoDoTipo("orcar")).toBe("vendas")
    expect(grupoDoTipo("atrasado")).toBe("producao")
  })
})
