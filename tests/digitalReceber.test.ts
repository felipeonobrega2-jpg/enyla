import { describe, it, expect } from "vitest"
import { lancamentosDoPedido } from "../app/lib/digitalFinanceiro"
import { receberDigital } from "../app/lib/digitalReceber"
import { montarPedidos, recebiveis } from "../app/lib/negocio"
import type { KanbanCard, LancamentoFinanceiro } from "../app/types"

const hoje = "2026-03-20"
const ped = { id: "DIG-0001", nome: "Ana", status: "producao", custo: 500, sinal: 610.37, total: 1220, sinalPagoEm: "2026-03-10T15:00:00.000Z" }
const lancs = (p = ped) => lancamentosDoPedido(p as never, "x").map(({ txBanco: _t, ...l }) => l as LancamentoFinanceiro)

describe("lancamentosDoPedido: restante pendente", () => {
  it("cria dig-…-restante pendente com o complemento exato e sem vencimento antes de prontoEm", () => {
    const r = lancs().find(l => l.id === "dig-DIG-0001-restante")!
    expect(r).toMatchObject({ tipo: "receita", status: "pendente", valor: 609.63, dataVencimento: "", unidade: "digital" })
  })
  it("vencimento = dia do prontoEm; restante do pedido (com frete) vale mais que total − sinal", () => {
    const r = lancs({ ...ped, prontoEm: "2026-03-18T12:00:00.000Z", restante: 639.63 } as never).find(l => l.id.endsWith("restante"))!
    expect(r).toMatchObject({ valor: 639.63, dataVencimento: "2026-03-18", status: "pendente" })
  })
  it("sem sinal, cancelado ou teste: não cria; restante pago continua pago", () => {
    expect(lancs({ ...ped, sinalPagoEm: undefined } as never).some(l => l.id.endsWith("restante"))).toBe(false)
    expect(lancs({ ...ped, status: "cancelado" } as never).some(l => l.id.endsWith("restante"))).toBe(false)
    expect(lancamentosDoPedido({ ...ped, teste: true } as never)).toEqual([])
    expect(lancs({ ...ped, restantePagoEm: "2026-03-19" } as never).find(l => l.id.endsWith("restante"))!.status).toBe("pago")
  })
})

describe("receberDigital", () => {
  it("sinal sem vínculo bancário: aparece, mas fica em conferência; saldo é o complemento exato e não está atrasado", () => {
    const [i] = receberDigital([ped], lancs().map(l => l.id.endsWith("sinal") ? { ...l, status: "pago" } : l), [], hoje)
    expect(i).toMatchObject({ id: "DIG-0001", valorTotal: 1220, sinal: 610.37, pago: 0, emConferencia: 610.37, saldo: 609.63, vencimentoSaldo: null, atrasado: false })
    expect(i.pagamentos[0]).toMatchObject({ parte: "sinal", estado: "em conferencia" })
  })
  it("com lancamento_ids: entra como pago, com a data da transação", () => {
    const [i] = receberDigital([ped], lancs(), [{ id: "tx1", data: "2026-03-11T00:00:00Z", lancamento_ids: ["dig-DIG-0001-sinal"] }], hoje)
    expect(i).toMatchObject({ pago: 610.37, emConferencia: 0, saldo: 609.63 })
    expect(i.pagamentos[0]).toMatchObject({ estado: "pago", data: "2026-03-11" })
  })
  it("vencimento só depois de prontoEm; vencido depois dele conta atraso", () => {
    const p = { ...ped, prontoEm: "2026-03-18T12:00:00.000Z" }
    expect(receberDigital([p], lancs(p), [], hoje)[0]).toMatchObject({ vencimentoSaldo: "2026-03-18", atrasado: true })
  })
  it("ignora teste e cancelado, e pedido sem sinal", () => {
    expect(receberDigital([{ ...ped, teste: true }, { ...ped, id: "DIG-2", status: "cancelado" }, { ...ped, id: "DIG-3", sinalPagoEm: undefined }], lancs(), [], hoje)).toEqual([])
  })
})

describe("Offset na mesma lista não muda", () => {
  it("lançamentos Digital não entram em montarPedidos/recebiveis do Offset", () => {
    const card = { id: "c1", numero: "ORC-1", nomeCliente: "Bia", coluna: 3, preco: 1000, quantidade: 100, data: "01/03/2026, 10:00:00" } as unknown as KanbanCard
    const off = { id: "l1", tipo: "receita", descricao: "Sinal", valor: 400, dataVencimento: "2026-03-01", dataPagamento: "2026-03-01", status: "pago", cardId: "c1", unidade: "offset", criadoEm: "x" } as unknown as LancamentoFinanceiro
    const antes = recebiveis(montarPedidos([card], [off]), [off])
    const todos = [off, ...lancs()]
    const depois = recebiveis(montarPedidos([card], todos), todos.filter(l => (l.unidade ?? "offset") === "offset"))
    expect(depois.aReceber).toBe(antes.aReceber)
    expect(depois.comSaldo.map(p => p.numero)).toEqual(["ORC-1"])
  })
})
