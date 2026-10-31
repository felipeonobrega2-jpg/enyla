import { describe, it, expect } from "vitest"
import { dreDoPeriodo } from "@/app/lib/financeiro"
import { receita, despesa } from "./fixtures"

const lancs = [
  receita({ valor: 10000, cardId: "c1" }), receita({ valor: 650, cardId: "c1", categoria: "sobra" }), receita({ valor: 300 }),
  receita({ valor: 25514, formaPagamento: "conta", fornecedorId: "jero" }),              // abatimento da conta corrente: não é receita
  despesa({ valor: 3000, cardId: "c1", subcategoria: "Papel" }), despesa({ valor: 1000, categoria: "fornecedor" }),
  despesa({ valor: 5000, formaPagamento: "conta", fornecedorId: "jero", status: "pago" }), // débito na conta: não é caixa
  despesa({ valor: 799.9, categoria: "aluguel" }), despesa({ valor: 300, categoria: "terc" }), despesa({ valor: 200, categoria: "aluguel", status: "pendente" }),
  receita({ valor: 999, dataPagamento: "2025-01-01", dataVencimento: "2025-01-01" }),     // fora do período
]
const dre = dreDoPeriodo({
  lancamentos: lancs, noPeriodo: l => (l.dataPagamento ?? l.dataVencimento) >= "2026-01-01",
  parcerias: 500, nomeCategoria: id => ({ aluguel: "Aluguel", fornecedor: "Fornecedor", terc: "Terceirização de Material" } as Record<string, string>)[id] ?? id, impostoPct: 6,
})

describe("DRE", () => {
  it("receita separa pedidos, sobras, outras e parcerias; conta corrente fica fora", () => {
    expect(dre.receitaPedidos).toBe(10000)
    expect(dre.receitaSobras).toBe(650)
    expect(dre.receitaOutras).toBe(300)
    expect(dre.receita).toBe(11450)
  })
  it("custo de produção = despesas ligadas a pedido ou de fornecedor; o resto é operacional", () => {
    expect(dre.custoProducao).toBe(4300)
    expect(dre.custosProducao.map(x => x.nome)).toEqual(["Papel", "Fornecedor", "Terceirização de Material"])
    expect(dre.despesaOperacional).toBeCloseTo(799.9)
    expect(dre.margemBruta).toBe(7150)
    expect(dre.resultado).toBeCloseTo(6350.1)
    expect(dre.impostoEstimado).toBeCloseTo(687)
  })
})
