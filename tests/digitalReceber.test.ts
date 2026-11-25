// A receber do Digital (#164): pago só com asaas: ou vínculo bancário; restante pendente sem vencimento antes do "Material pronto".
import { describe, it, expect } from "vitest"
import { receberDigital, type PedidoReceber } from "../app/lib/digitalReceber"
import { lancamentosDoPedido } from "../app/lib/digitalFinanceiro"

const base: PedidoReceber & { nome: string; custo: number } = { id: "DIG-0100", nome: "Cliente Ficticio", status: "arte", custo: 0, total: 1000.01, sinal: 500.01, sinalPagoEm: "2026-11-10T13:00:00Z", pagamento: { txId: "pix123", valor: 500.01, data: "2026-11-10" } }
const sem = { lancamentoIds: new Set<string>() }

describe("pago do sinal", () => {
  it("lançamento pago sem asaas: nem vínculo bancário fica em conferência; saldo é o complemento exato", () => {
    const [l] = receberDigital([base], sem)
    expect(l.parteSinal).toMatchObject({ estado: "em_conferencia", recebidoEm: null })
    expect(l.pago).toBe(0)
    expect(l.saldo).toBe(500)   // 1000,01 − 500,01, sem arredondar para a metade
    expect(l.total).toBe(1000.01); expect(l.sinal).toBe(500.01)
  })
  it("com lancamento_ids entra como pago, na data da transação", () => {
    const [l] = receberDigital([base], { lancamentoIds: new Set(["dig-DIG-0100-sinal"]), dataDaTransacao: new Map([["dig-DIG-0100-sinal", "2026-11-09"]]) })
    expect(l.parteSinal).toMatchObject({ estado: "pago", via: "banco", recebidoEm: "2026-11-09" }); expect(l.pago).toBe(500.01)
  })
  it("com txId asaas: conta como pago", () => {
    const [l] = receberDigital([{ ...base, pagamento: { txId: "asaas:pay_1", valor: 500.01, data: "2026-11-10" } }], sem)
    expect(l.parteSinal).toMatchObject({ estado: "pago", via: "asaas", recebidoEm: "2026-11-10" })
  })
})

describe("lista", () => {
  it("ignora teste, cancelado e aguardando sinal; Offset não entra", () => {
    const r = receberDigital([base, { ...base, id: "DIG-2", teste: true }, { ...base, id: "DIG-3", status: "cancelado" }, { ...base, id: "DIG-4", status: "aguardando_sinal" }], sem)
    expect(r.map(x => x.id)).toEqual(["DIG-0100"])
  })
  it("tudo pago e confirmado sai da lista", () => {
    const v = { lancamentoIds: new Set(["dig-DIG-0100-sinal"]) }
    expect(receberDigital([{ ...base, status: "enviado", restantePagoEm: "2026-11-20", pagamentoFinal: { txId: "asaas:r", valor: 500, data: "2026-11-20" }, pagamento: { txId: "asaas:s", valor: 500.01, data: "2026-11-10" } }], v)).toEqual([])
  })
})

describe("saldo do restante", () => {
  it("sem prontoEm: sem vencimento nem link", () => {
    const [l] = receberDigital([{ ...base, asaas: { restante: { id: "pay_r", valor: 500, fatura: "https://x/y", em: "2026-11-20T15:00:00Z" } } }], sem)
    expect(l.prontoEm).toBeNull(); expect(l.vencimentoSaldo).toBeNull(); expect(l.cobrancaRestante).toBeNull()
  })
  it("com asaas.restante: valor, vencimento e link", () => {
    const [l] = receberDigital([{ ...base, prontoEm: "2026-11-20T14:00:00Z", asaas: { restante: { id: "pay_r", valor: 530, fatura: "https://x/y", em: "2026-11-20T15:00:00Z" } } }], sem)
    expect(l.cobrancaRestante).toEqual({ id: "pay_r", valor: 530, vencimento: "2026-11-27", link: "https://x/y" })
    expect(l.vencimentoSaldo).toBe("2026-11-27")
  })
  it("com confirmação do Asaas: data de recebimento", () => {
    const [l] = receberDigital([{ ...base, prontoEm: "2026-11-20T14:00:00Z", restantePagoEm: "2026-11-23T12:00:00Z", pagamentoFinal: { txId: "asaas:pay_r", valor: 500, data: "2026-11-23" } }], sem)
    expect(l.parteRestante).toMatchObject({ estado: "pago", via: "asaas", recebidoEm: "2026-11-23" }); expect(l.vencimentoSaldo).toBeNull()
  })
  it("restante pago só com status e sem vínculo fica em conferência", () => {
    const [l] = receberDigital([{ ...base, restantePagoEm: "2026-11-23T12:00:00Z", pagamentoFinal: { txId: "pixbanco", valor: 500, data: "2026-11-23" } }], sem)
    expect(l.parteRestante.estado).toBe("em_conferencia")
  })
})

describe("lançamento pendente do restante", () => {
  const ls = (p: object) => lancamentosDoPedido({ ...base, ...p } as never, "x")
  it("criado com o complemento exato e vencimento vazio antes do pronto", () => {
    const r = ls({}).find(l => l.id === "dig-DIG-0100-restante")!
    expect(r).toMatchObject({ tipo: "receita", status: "pendente", valor: 500, dataVencimento: "", unidade: "digital" })
  })
  it("usa o restante do pedido (com frete) e preenche o vencimento depois do pronto", () => {
    const r = ls({ restante: 530.5, prontoEm: "2026-11-20T14:00:00Z" }).find(l => l.id === "dig-DIG-0100-restante")!
    expect(r).toMatchObject({ valor: 530.5, status: "pendente", dataVencimento: "2026-11-20" })
  })
  it("não cria com restante já pago, sem sinal, cancelado ou teste", () => {
    expect(ls({ restantePagoEm: "2026-11-23", pagamentoFinal: { txId: "asaas:r", valor: 500, data: "2026-11-23" } }).find(l => l.id.endsWith("restante"))!.status).toBe("pago")
    for (const p of [{ sinalPagoEm: undefined }, { status: "cancelado" }, { teste: true }]) expect(ls(p).find(l => l.id.endsWith("restante"))).toBeUndefined()
  })
})
