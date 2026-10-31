import { describe, it, expect } from "vitest"
import { sugerirAjustes, aplicarSugestao, desfazerAjuste } from "@/app/lib/aprendizado"
import { Comparacao } from "@/app/lib/calibragem"
import { config } from "./fixtures"

// Pedido comparável: papel e impressão lançados; impressão prevista com o impressor que de fato fez
function comp(numero: string, quantidade: number, prevImp: number, realImp: number, jogos = 1): Comparacao {
  return {
    pedido: { numero, quantidade, dataFechamento: "2026-09-01" } as Comparacao["pedido"],
    previsto: { papel: 500, impressao: prevImp }, real: { papel: 500, impressao: realImp }, custosReais: [],
    previstoItens: [{ etapa: "impressao", fornecedorId: "jero", valor: prevImp, estimado: false }],
    materiais: ["cartao300"], facaPelaTabela: true, fornecedorReal: { impressao: "jero" }, jogosChapa: jogos, folhasImpressas: 1000,
    previstoTotal: 500 + prevImp, realTotal: 500 + realImp, pctCategorizado: 1,
  }
}

describe("motor que aprende", () => {
  const cfg = config()
  it("pedidos que concordam viram ajuste de preço, e desfazer volta ao original", () => {
    const s = sugerirAjustes([comp("A", 1000, 350, 245), comp("B", 2000, 350, 250), comp("C", 4000, 350, 240)], cfg)
      .find(x => x.chave === "servico|impressao|jero")!
    expect(s.inconsistente).toBeUndefined()
    expect(s.fator).toBeCloseTo(0.7, 1)
    const c2 = aplicarSugestao(cfg, s, "2026-11-02")
    const regra = c2.producao.fornecedores.find(f => f.id === "jero")!.servicos.impressao!
    expect(regra.valor).toBeCloseTo(350 * s.fator, 1)
    const c3 = desfazerAjuste(c2, c2.producao.aprendizado!.ajustes[0].id)
    expect(c3.producao.fornecedores.find(f => f.id === "jero")!.servicos.impressao!.valor).toBe(350)
  })
  it("várias artes cobradas em jogos de chapa: aponta a regra, não mexe no preço (caso Jerograf)", () => {
    const s = sugerirAjustes([comp("A", 1000, 1050, 350, 3), comp("B", 4400, 1050, 350, 3), comp("C", 4800, 1050, 350, 3), comp("D", 4000, 350, 350, 1)], cfg)
      .find(x => x.chave === "servico|impressao|jero")!
    expect(s.inconsistente?.motivo).toMatch(/jogos/)
    expect(s.mudancas).toHaveLength(0)
  })
  it("ponto fora da curva fica de fora e é apontado", () => {
    const s = sugerirAjustes([comp("A", 1000, 350, 245), comp("B", 2000, 350, 250), comp("C", 4000, 350, 240), comp("X", 3000, 350, 1400)], cfg)
      .find(x => x.chave === "servico|impressao|jero")!
    expect(s.foraDaCurva?.map(f => f.numero)).toEqual(["X"])
  })
})
