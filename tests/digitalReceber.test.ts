// A receber do Digital: pago só com asaas: ou vínculo bancário; restante pendente; vencimento só com prontoEm.
import { describe, it, expect } from "vitest"
import { digitaisAReceber, partesDoPedido } from "../app/lib/digitalReceber"
import { lancamentosDoPedido } from "../app/lib/digitalFinanceiro"

const base = { id: "DIG-0100", nome: "Cliente Fictício", status: "producao", total: 1000.37, sinal: 500.13, sinalPagoEm: "2026-03-02T15:00:00.000Z" }
const hoje = "2026-03-20"

describe("digitaisAReceber", () => {
  it("sinal só com status pago (sem asaas: nem vínculo): em conferência; saldo é o complemento exato", () => {
    const [r] = digitaisAReceber([{ ...base, pagamento: { txId: "pix-1", valor: 500.13, data: "2026-03-02" } }], new Set(), hoje)
    expect(r.sinal.situacao).toBe("em conferencia")
    expect(r.pago).toBe(0); expect(r.emConferencia).toBe(500.13)
    expect(r.saldo).toBe(500.24)    // 1000.37 - 500.13, centavos exatos
    expect(r.vencimentoSaldo).toBeNull(); expect(r.atrasado).toBe(false)
  })
  it("sinal com txId asaas: conta como pago", () => {
    const [r] = digitaisAReceber([{ ...base, pagamento: { txId: "asaas:pay_1", valor: 500.13, data: "2026-03-03" } }], new Set(), hoje)
    expect(r.sinal).toMatchObject({ situacao: "pago", dataRecebimento: "2026-03-03", asaasId: "pay_1" })
    expect(r.pago).toBe(500.13); expect(r.emConferencia).toBe(0)
  })
  it("o mesmo lançamento com lancamento_ids: pago, com a data da transação/lançamento", () => {
    const [r] = digitaisAReceber([{ ...base, pagamento: { txId: "tx-banco", valor: 500.13, data: "2026-03-04" } }], new Set(["dig-DIG-0100-sinal"]), hoje)
    expect(r.sinal).toMatchObject({ situacao: "pago", dataRecebimento: "2026-03-04" })
    expect(r.pago).toBe(500.13)
  })
  it("vencimento do saldo só com prontoEm; vencido depois dele", () => {
    const a = digitaisAReceber([{ ...base, pagamento: { txId: "asaas:x", valor: 500.13, data: "2026-03-02" } }], new Set(), hoje)[0]
    expect(a.vencimentoSaldo).toBeNull(); expect(a.atrasado).toBe(false)
    const b = digitaisAReceber([{ ...base, prontoEm: "2026-03-10T12:00:00.000Z", pagamento: { txId: "asaas:x", valor: 500.13, data: "2026-03-02" } }], new Set(), hoje)[0]
    expect(b.vencimentoSaldo).toBe("2026-03-10"); expect(b.atrasado).toBe(true)
  })
  it("restante com frete usa o `restante` do pedido", () => {
    expect(digitaisAReceber([{ ...base, restante: 530.24 }], new Set(), hoje)[0].saldo).toBe(530.24)
  })
  it("ignora teste e cancelado; restante pago por asaas sai da lista", () => {
    const quitado = { ...base, restantePagoEm: "2026-03-12", pagamento: { txId: "asaas:a", valor: 500.13, data: "2026-03-02" }, pagamentoFinal: { txId: "asaas:b", valor: 500.24, data: "2026-03-12" } }
    expect(digitaisAReceber([{ ...base, teste: true }, { ...base, id: "DIG-9", status: "cancelado" }, quitado], new Set(), hoje)).toEqual([])
  })
  it("partesDoPedido traz o id da cobrança Asaas do cadastro quando não há txId", () => {
    expect(partesDoPedido({ ...base, asaas: { sinal: { id: "pay_s" }, restante: { id: "pay_r" } } }).restante.asaasId).toBe("pay_r")
  })
})

describe("lancamentosDoPedido: restante pendente", () => {
  it("cria dig-ID-restante pendente, sem vencimento antes de prontoEm, com o valor exato", () => {
    const l = lancamentosDoPedido({ ...base, custo: 0 }).find(x => x.id === "dig-DIG-0100-restante")!
    expect(l).toMatchObject({ tipo: "receita", status: "pendente", valor: 500.24, dataVencimento: "", unidade: "digital" })
  })
  it("vencimento = prontoEm; restante pago vira pago e sem duplicar", () => {
    const pendente = lancamentosDoPedido({ ...base, custo: 0, prontoEm: "2026-03-10T10:00:00Z" }).find(x => x.id === "dig-DIG-0100-restante")!
    expect(pendente.dataVencimento).toBe("2026-03-10")
    const pagos = lancamentosDoPedido({ ...base, custo: 0, restantePagoEm: "2026-03-12" }).filter(x => x.id === "dig-DIG-0100-restante")
    expect(pagos).toHaveLength(1); expect(pagos[0].status).toBe("pago")
  })
  it("sem sinal não cria restante; teste e cancelado também não", () => {
    expect(lancamentosDoPedido({ ...base, sinalPagoEm: undefined, custo: 0 })).toEqual([])
    expect(lancamentosDoPedido({ ...base, custo: 0, teste: true })).toEqual([])
    expect(lancamentosDoPedido({ ...base, custo: 0, status: "cancelado" }).some(x => x.id.endsWith("restante"))).toBe(false)
  })
})
