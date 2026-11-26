// Digital no a receber (#164): pago só com asaas: ou vínculo bancário; restante pendente; vencimento só com material pronto.
import { describe, it, expect } from "vitest"
import { recebiveisDigitais, consultaAsaas, vinculosDoBanco } from "../app/lib/digitalReceber"
import { lancamentosDoPedido, mudou } from "../app/lib/digitalFinanceiro"

const hoje = "2026-11-25"
const base = { nome: "Cliente Fictício", status: "producao", custo: 100, total: 1000.37, sinal: 500.13, restante: 500.24, sinalPagoEm: "2026-11-10T12:00:00.000Z" }
const semVinculo = new Map<string, string | null>()

describe("recebiveisDigitais", () => {
  it("sinal sem asaas e sem vínculo (só status pago): aparece, mas fica em conferência; saldo é o complemento exato", () => {
    const [l] = recebiveisDigitais([{ ...base, id: "DIG-0001", pagamento: { txId: "tx-pluggy-1", valor: 500.13, data: "2026-11-10" } }], semVinculo, hoje)
    expect(l).toMatchObject({ id: "DIG-0001", total: 1000.37, sinal: 500.13, pago: 0, emConferencia: 500.13, saldo: 500.24 })
    expect(l.sinalParte).toMatchObject({ situacao: "em conferência", via: null, recebidoEm: null })
  })
  it("sinal com txId asaas: conta como pago", () => {
    const [l] = recebiveisDigitais([{ ...base, id: "DIG-0002", pagamento: { txId: "asaas:pay_123", valor: 500.13, data: "2026-11-10" } }], semVinculo, hoje)
    expect(l).toMatchObject({ pago: 500.13, emConferencia: 0, saldo: 500.24 })
    expect(l.sinalParte).toMatchObject({ situacao: "confirmado", via: "asaas", recebidoEm: "2026-11-10" })
  })
  it("sinal com lancamento_ids no banco: pago, com a data da transação", () => {
    const v = vinculosDoBanco([{ lancamento_ids: ["dig-DIG-0003-sinal"], data: "2026-11-11" }, { lancamento_ids: null }])
    const [l] = recebiveisDigitais([{ ...base, id: "DIG-0003", pagamento: { txId: "tx-pluggy-3", valor: 500.13, data: "2026-11-10" } }], v, hoje)
    expect(l.pago).toBe(500.13)
    expect(l.sinalParte).toMatchObject({ situacao: "confirmado", via: "banco", recebidoEm: "2026-11-11" })
  })
  it("vencimento do saldo vazio antes de prontoEm (não atrasa); com prontoEm vence e atrasa", () => {
    const [a] = recebiveisDigitais([{ ...base, id: "DIG-0004" }], semVinculo, hoje)
    expect(a).toMatchObject({ vencimentoSaldo: null, atrasado: false })
    const [b] = recebiveisDigitais([{ ...base, id: "DIG-0004", prontoEm: "2026-11-20T10:00:00.000Z" }], semVinculo, hoje)
    expect(b).toMatchObject({ vencimentoSaldo: "2026-11-20", atrasado: true })
  })
  it("ignora teste, cancelado e aguardando sinal; restante pago e confirmado zera o saldo", () => {
    const l = recebiveisDigitais([
      { ...base, id: "DIG-0005", teste: true }, { ...base, id: "DIG-0006", status: "cancelado" }, { ...base, id: "DIG-0007", status: "aguardando_sinal", sinalPagoEm: undefined },
      { ...base, id: "DIG-0008", status: "enviado", pagamento: { txId: "asaas:a", valor: 500.13, data: "2026-11-10" }, restantePagoEm: "2026-11-24T10:00:00Z", pagamentoFinal: { txId: "asaas:b", valor: 500.24, data: "2026-11-24" } },
    ], semVinculo, hoje)
    expect(l.map(x => x.id)).toEqual([])   // enviado e quitado com confirmação sai da lista
    const [c] = recebiveisDigitais([{ ...base, id: "DIG-0009", status: "enviado", pagamento: { txId: "asaas:a", valor: 500.13, data: "2026-11-10" }, restantePagoEm: "2026-11-24T10:00:00Z", pagamentoFinal: { txId: "tx-x", valor: 500.24, data: "2026-11-24" } }], semVinculo, hoje)
    expect(c).toMatchObject({ pago: 500.13, saldo: 0, emConferencia: 500.24 })   // restante só com status pago: em conferência
  })
})

describe("consultaAsaas (CFO)", () => {
  it("lista ids de cobrança, valor, status e data, sem dado pessoal e sem teste", () => {
    const r = consultaAsaas([
      { ...base, id: "DIG-0010", pagamento: { txId: "asaas:pay_S", valor: 500.13, data: "2026-11-10" }, asaas: { restante: { id: "pay_R" } }, jid: "5511999@s.whatsapp.net", email: "a@b.com", documento: "123" } as never,
      { ...base, id: "DIG-0011", teste: true },
    ], semVinculo)
    expect(r).toHaveLength(1)
    expect(r[0].sinal).toEqual({ cobrancaAsaas: "pay_S", valor: 500.13, status: "confirmado pelo Asaas", recebidoEm: "2026-11-10" })
    expect(r[0].restante).toEqual({ cobrancaAsaas: "pay_R", valor: 500.24, status: "aguardando pagamento", recebidoEm: null })
    expect(JSON.stringify(r)).not.toMatch(/Fictício|5511999|a@b\.com|documento|jid|email/)
  })
})

describe("lancamentosDoPedido: restante pendente", () => {
  it("cria dig-{id}-restante pendente com o restante exato; sem vencimento (sentinela da main) antes de prontoEm", () => {
    const ls = lancamentosDoPedido({ ...base, id: "DIG-0020", pagamento: { txId: "asaas:x", valor: 500.13, data: "2026-11-10" } } as never)
    const r = ls.find(l => l.id === "dig-DIG-0020-restante")!
    expect(r).toMatchObject({ status: "pendente", valor: 500.24, dataVencimento: "9999-12-31", unidade: "digital", tipo: "receita" })
    expect(ls.find(l => l.id === "dig-DIG-0020-sinal")).toBeTruthy()
  })
  it("com prontoEm o vencimento nasce; restante pago vira receita paga; sem sinal não cria; teste/cancelado nada", () => {
    expect(lancamentosDoPedido({ ...base, id: "DIG-0021", prontoEm: "2026-11-20T10:00:00Z" } as never).find(l => l.id.endsWith("restante"))!.dataVencimento).toBe("2026-11-20")
    expect(lancamentosDoPedido({ ...base, id: "DIG-0022", restantePagoEm: "2026-11-24T10:00:00Z" } as never).find(l => l.id.endsWith("restante"))!.status).toBe("pago")
    expect(lancamentosDoPedido({ ...base, id: "DIG-0023", sinalPagoEm: undefined } as never)).toEqual([])
    expect(lancamentosDoPedido({ ...base, id: "DIG-0024", status: "cancelado" } as never).some(l => l.id.endsWith("restante"))).toBe(false)
    expect(lancamentosDoPedido({ ...base, id: "DIG-0025", teste: true } as never)).toEqual([])
  })
  it("o vencimento do restante pendente conta como mudança (sincronização atualiza)", () => {
    expect(mudou({ valor: 1, status: "pendente", dataVencimento: "" }, { valor: 1, status: "pendente", categoria: "saldo-final", dataVencimento: "2026-11-20" })).toBe(true)
  })
})
