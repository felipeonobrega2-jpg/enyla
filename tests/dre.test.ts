import { describe, it, expect } from "vitest"
import { dreDoPeriodo, idsNeutros, idsEntradaNaoReceita, calcularRecebidoTotal } from "@/app/lib/financeiro"
import { caixaDoPeriodo } from "@/app/lib/negocio"
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

describe("DRE: categorias neutras", () => {
  const ls = [
    receita({ valor: 1000 }), despesa({ valor: 400, categoria: "aluguel" }),
    receita({ valor: 777, categoria: "ajuste-neutro" }), despesa({ valor: 555, categoria: "transferencia-entre-contas-proprias" }),
    receita({ valor: 333, categoria: "marcada" }), despesa({ valor: 222, categoria: "marcada" }),
  ]
  const calc = (neutras?: Set<string>) => dreDoPeriodo({ lancamentos: ls, noPeriodo: () => true, nomeCategoria: id => id, neutras })
  it("pelo nome da categoria (sem marcação)", () => {
    const d = calc()
    expect(d.receita).toBe(1333)
    expect(d.despesaOperacional).toBe(622)
  })
  it("pela marcação neutra, nos dois lados", () => {
    const d = calc(idsNeutros([{ id: "marcada", nome: "Qualquer", neutra: true }]))
    expect(d.receita).toBe(1000)
    expect(d.despesaOperacional).toBe(400)
    expect(d.resultado).toBe(600)
  })
})

describe("DRE: aporte (entrada-nao-receita)", () => {
  const ls = [
    receita({ valor: 1000, cardId: "c1" }), receita({ valor: 300 }),
    receita({ valor: 1486.63, categoria: "entrada-nao-receita" }),
    receita({ valor: 200, categoria: "aporte-felipe" }),
  ]
  const calc = (entradasNaoReceita?: Set<string>) => dreDoPeriodo({ lancamentos: ls, noPeriodo: () => true, nomeCategoria: id => id, entradasNaoReceita })
  it("fica fora de receitaOutras, receita e resultado, e aparece em entradaNaoReceita", () => {
    const d = calc()
    expect(d.receitaOutras).toBe(500)
    expect(d.receita).toBe(1500)
    expect(d.resultado).toBe(1500)
    expect(d.entradaNaoReceita).toBeCloseTo(1486.63)
  })
  it("categoria marcada por natureza também sai", () => {
    const d = calc(idsEntradaNaoReceita([{ id: "aporte-felipe", natureza: "entrada-nao-receita" }]))
    expect(d.receitaOutras).toBe(300)
    expect(d.entradaNaoReceita).toBeCloseTo(1686.63)
  })
  it("recebido do mês fora do aporte; o dinheiro segue nos lançamentos (caixa/saldo)", () => {
    const p = { from: new Date("2026-01-01T00:00:00"), to: new Date("2026-12-31T23:59:59") }
    const com = [receita({ valor: 1000 }), receita({ valor: 1486.63, categoria: "entrada-nao-receita" })]
    expect(caixaDoPeriodo(com, p).recebido).toBe(1000)
    expect(calcularRecebidoTotal(com)).toBe(1000)
    expect(com.reduce((s, l) => s + l.valor, 0)).toBeCloseTo(2486.63)  // saldo de conta ainda conta a entrada
  })
})
