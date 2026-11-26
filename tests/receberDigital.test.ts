import { describe, it, expect } from "vitest"
import { receberDigital, juntarPedidos, SEM_VENCIMENTO } from "../app/lib/receberDigital"
import { lancamentosDoPedido, mudou } from "../app/lib/digitalFinanceiro"
import { montarPedidos, recebiveis } from "../app/lib/negocio"
import type { KanbanCard, LancamentoFinanceiro } from "../app/types"

const hoje = "2026-11-25"
const ped = { id: "DIG-0001", nome: "Ana Souza", status: "producao", custo: 400, sinal: 500.37, restante: 500.63, total: 1001, quantidade: 200, sinalPagoEm: "2026-11-10T15:00:00.000Z" }
const pagamento = { txId: "E123", valor: 500.37, data: "2026-11-10T15:00:00.000Z" }

describe("lançamento pendente do restante (Digital)", () => {
  it("sinal pago e restante em aberto: cria dig-{id}-restante pendente, sem vencimento antes do pronto", () => {
    const ls = lancamentosDoPedido({ ...ped, pagamento }, "x")
    const r = ls.find(l => l.id === "dig-DIG-0001-restante")!
    expect(r).toMatchObject({ status: "pendente", tipo: "receita", valor: 500.63, dataVencimento: SEM_VENCIMENTO, unidade: "digital" })
    expect(r.dataPagamento).toBeUndefined()
  })
  it("com prontoEm, o vencimento é o dia em que ficou pronto", () => {
    const r = lancamentosDoPedido({ ...ped, prontoEm: "2026-11-20T12:00:00.000Z" }, "x").find(l => l.id.endsWith("restante"))!
    expect(r.dataVencimento).toBe("2026-11-20")
  })
  it("sem `restante` gravado usa total - sinal; pago vira lançamento pago; cancelado e teste não geram saldo", () => {
    const { restante, ...sem } = ped
    expect(lancamentosDoPedido(sem, "x").find(l => l.id.endsWith("restante"))!.valor).toBeCloseTo(500.63, 2)
    expect(lancamentosDoPedido({ ...ped, restantePagoEm: "2026-11-22" }, "x").find(l => l.id.endsWith("restante"))).toMatchObject({ status: "pago", dataPagamento: "2026-11-22" })
    expect(lancamentosDoPedido({ ...ped, status: "cancelado" }, "x").some(l => l.id.endsWith("restante"))).toBe(false)
    expect(lancamentosDoPedido({ ...ped, teste: true }, "x")).toEqual([])
    expect(lancamentosDoPedido({ ...ped, sinalPagoEm: undefined }, "x")).toEqual([])
  })
  it("sincronizar: o vencimento mudou (ficou pronto) conta como mudança; o resto igual não", () => {
    const antes = lancamentosDoPedido(ped, "x").find(l => l.id.endsWith("restante"))!
    const depois = lancamentosDoPedido({ ...ped, prontoEm: "2026-11-20" }, "x").find(l => l.id.endsWith("restante"))!
    expect(mudou(antes, antes)).toBe(false)
    expect(mudou(antes, depois)).toBe(true)
  })
})

describe("receberDigital", () => {
  const lancs = (p = ped) => lancamentosDoPedido({ ...p, pagamento }, "x") as LancamentoFinanceiro[]
  it("aparece no a receber com total, sinal, pago, saldo e vencimento vazio antes do pronto", () => {
    const [d] = receberDigital([ped], lancs(), hoje)
    expect(d).toMatchObject({ numero: "DIG-0001", nomeCliente: "Ana Souza", venda: 1001, recebido: 500.37, aReceber: 500.63, vencido: 0 })
    expect(d.digital).toEqual({ id: "DIG-0001", sinal: 500.37, pagoEm: "2026-11-10", vencimento: null })
  })
  it("vencimento preenchido depois do pronto; vencido só se passou", () => {
    const [a] = receberDigital([{ ...ped }], lancs({ ...ped, prontoEm: "2026-11-24" } as never), hoje)
    expect(a.digital.vencimento).toBe("2026-11-24"); expect(a.vencido).toBe(500.63)
    const [b] = receberDigital([ped], lancs({ ...ped, prontoEm: "2026-11-30" } as never), hoje)
    expect(b.vencido).toBe(0)
  })
  it("quitado fica na lista mas sem saldo; teste e cancelado ficam de fora; estornado não conta", () => {
    const [q] = receberDigital([ped], lancs({ ...ped, restantePagoEm: "2026-11-22" } as never), hoje)
    expect(q.aReceber).toBe(0); expect(q.recebido).toBe(1001)
    expect(receberDigital([{ ...ped, teste: true }], lancs(), hoje)).toEqual([])
    expect(receberDigital([{ ...ped, status: "cancelado" }], lancs(), hoje)).toEqual([])
    expect(receberDigital([ped], lancs().map(l => ({ ...l, estornadoEm: "2026-11-23" })), hoje)).toEqual([])
  })
  it("não confunde com lançamentos do Offset e sem a lista de pedidos o total sai dos lançamentos", () => {
    const off: LancamentoFinanceiro = { id: "x", tipo: "receita", descricao: "o", valor: 10, dataVencimento: "2026-11-01", status: "pendente", criadoEm: "" }
    const r = receberDigital(undefined, [off, ...lancs()], hoje)
    expect(r).toHaveLength(1); expect(r[0].venda).toBeCloseTo(1001, 2)
  })
  it("Offset na mesma lista não muda", () => {
    const card = { id: "c1", numero: "ORC-1", nomeCliente: "Bia", coluna: 5, preco: 300, quantidade: 10, dimensoes: "" } as unknown as KanbanCard
    const offLanc: LancamentoFinanceiro = { id: "l1", tipo: "receita", descricao: "s", valor: 100, dataVencimento: "2026-11-01", dataPagamento: "2026-11-01", status: "pago", cardId: "c1", criadoEm: "" }
    const offset = montarPedidos([card], [offLanc])
    const antes = recebiveis(offset, [offLanc])
    const dig = receberDigital([ped], lancs(), hoje)
    const junto = recebiveis(juntarPedidos(offset, dig), [offLanc, ...lancs()])
    expect(junto.comSaldo.map(p => p.numero)).toEqual(["ORC-1", "DIG-0001"])
    expect(junto.comSaldo[0]).toEqual(antes.comSaldo[0])
    expect(junto.aReceber).toBeCloseTo(antes.aReceber + 500.63, 2)
    expect(junto.aConferir).toEqual(antes.aConferir)   // o restante pendente do Digital não vira "a conferir"
  })
})
