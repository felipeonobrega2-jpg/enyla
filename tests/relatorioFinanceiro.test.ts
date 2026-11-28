import { describe, it, expect } from "vitest"
import { previsaoMensal, recebiveisAbertos, retiradasDoPeriodo, gastoIADoPeriodo, metaDoMes } from "@/app/lib/relatorioFinanceiro"
import { montarPedidos } from "@/app/lib/negocio"
import { card, despesa, receita, config } from "./fixtures"

const HOJE = new Date("2026-11-10T12:00:00")
const PER = { from: new Date(2026, 10, 1), to: new Date(2026, 10, 30, 23, 59, 59) }
const nome = (id: string) => id

describe("previsão mês a mês", () => {
  it("soma cobranças e gastos fixos por mês e acumula o saldo", () => {
    const cfg = config({ gastosFixos: [{ id: "g1", nome: "Aluguel galpao", valor: 1000, diaVencimento: 20, ativa: true }] as never, contas: [{ id: "c1", nome: "Itaú", tipo: "corrente", ativa: true, saldo: 5000 }] as never })
    const c = card({ numero: "ORC-1", preco: 2000, coluna: 7, dataEntregaPrevista: "2026-12-05" })
    const p = previsaoMensal({ kanban: [c], lancamentos: [], historico: [], config: cfg, hoje: HOJE, ateMes: "2027-02" })
    expect(p.meses.map(m => m.mes)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"])
    expect(p.meses.map(m => m.saidasFixas)).toEqual([1000, 1000, 1000, 1000])
    expect(p.meses[1].entradas).toBe(2000)
    expect(p.meses[0].saldoFinal).toBe(4000)
    expect(p.meses[3].saldoFinal).toBe(5000 - 4000 + 2000)
  })
  it("sem saldo informado em conta o saldo é null, não zero", () => {
    const p = previsaoMensal({ kanban: [], lancamentos: [], historico: [], config: config({ contas: [] }), hoje: HOJE, ateMes: "2027-02" })
    expect(p.saldoAtual).toBeNull()
    expect(p.meses.every(m => m.saldoFinal === null)).toBe(true)
  })
})

describe("recebíveis em aberto", () => {
  it("usa só o primeiro nome e conta os dias em atraso", () => {
    const c = card({ numero: "ORC-2", nomeCliente: "Maria da Silva", preco: 1000, coluna: 5 })
    const l = receita({ valor: 1000, status: "pendente", dataPagamento: undefined, dataVencimento: "2026-11-05", cardId: c.id })
    const r = recebiveisAbertos(montarPedidos([c], [l]), [l], HOJE)
    expect(r[0]).toMatchObject({ cliente: "Maria", lote: "ORC-2", valor: 1000, vencimento: "2026-11-05", diasAtraso: 5 })
  })
  it("sem cobrança lançada o vencimento é null", () => {
    const c = card({ numero: "ORC-3", preco: 500, coluna: 5 })
    expect(recebiveisAbertos(montarPedidos([c], []), [], HOJE)[0]).toMatchObject({ vencimento: null, diasAtraso: null })
  })
})

describe("retiradas e IA", () => {
  it("soma retiradas do período; sem lançamento é null", () => {
    const ls = [despesa({ valor: 3000, categoria: "retirada-felipe", dataPagamento: "2026-11-05" }), despesa({ valor: 2000, categoria: "pro-labore", dataPagamento: "2026-11-20" }),
      despesa({ valor: 999, categoria: "retirada-felipe", dataPagamento: "2026-10-20" }), despesa({ valor: 50, categoria: "materiais", dataPagamento: "2026-11-06" })]
    expect(retiradasDoPeriodo(ls, PER, nome).total).toBe(5000)
    expect(retiradasDoPeriodo([], PER, nome).total).toBeNull()
  })
  it("gasto de IA pelos lançamentos; sem lançamento é null", () => {
    const ls = [despesa({ valor: 400, subcategoria: "IA (Anthropic)", dataPagamento: "2026-11-03" }), despesa({ valor: 80, descricao: "Claude Max", dataPagamento: "2026-11-04" })]
    expect(gastoIADoPeriodo(ls, PER)).toBe(480)
    expect(gastoIADoPeriodo([], PER)).toBeNull()
  })
})

describe("meta do mês", () => {
  it("meta, realizado e quanto falta", () => {
    const c = card({ numero: "ORC-4", preco: 4000, coluna: 5, dataFechamento: "2026-11-02" } as never)
    const m = metaDoMes({ pedidos: montarPedidos([c], []), lancamentos: [], metaMensal: 10000, hoje: HOJE })
    expect(m.meta).toBe(10000)
    expect(m.realizado! + m.falta!).toBe(10000)
  })
  it("sem meta definida tudo é null", () => {
    const m = metaDoMes({ pedidos: [], lancamentos: [], metaMensal: 0, hoje: HOJE })
    expect([m.meta, m.realizado, m.falta]).toEqual([null, null, null])
  })
})
