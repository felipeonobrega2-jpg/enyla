// Digital no a receber: pago só com asaas: ou vínculo bancário; restante pendente; vencimento só com prontoEm. Dados fictícios.
import { describe, it, expect } from "vitest"
import { receberDigital, idsVinculados, type PedidoReceber } from "../app/lib/digitalReceber"
import { lancamentosDoPedido } from "../app/lib/digitalFinanceiro"
import { montarPedidos, recebiveis } from "../app/lib/negocio"

const hoje = "2026-03-18"
const base: PedidoReceber = { id: "DIG-0001", nome: "Ana", status: "producao", total: 1000.37, sinal: 500.13, sinalPagoEm: "2026-03-10T15:00:00.000Z",
  pagamento: { txId: "tx-pluggy-1", valor: 500.13, data: "2026-03-10" } }
const lancs = (p: PedidoReceber) => lancamentosDoPedido(p as never, "x")

describe("pago: só Asaas ou vínculo bancário", () => {
  it("sinal com status=pago mas sem asaas: nem vínculo fica em conferência; o saldo é o complemento exato", () => {
    const [r] = receberDigital([base], lancs(base), new Set(), hoje)
    expect(lancs(base)[0].status).toBe("pago")
    expect(r.sinal).toMatchObject({ valor: 500.13, estado: "em_conferencia" })
    expect(r.pago).toBe(0); expect(r.emConferencia).toBe(500.13)
    expect(r.saldo).toBe(500.24)   // 1000.37 − 500.13, sem arredondar para a metade
    expect(r.valorTotal).toBe(1000.37)
  })
  it("sinal com txId asaas: conta como pago", () => {
    const p = { ...base, pagamento: { txId: "asaas:pay_1", valor: 500.13, data: "2026-03-11" } }
    const [r] = receberDigital([p], lancs(p), new Set(), hoje)
    expect(r.sinal).toMatchObject({ estado: "pago", data: "2026-03-11" }); expect(r.pago).toBe(500.13); expect(r.emConferencia).toBe(0)
  })
  it("o mesmo lançamento com lancamento_ids na transação entra como pago, com a data da transação", () => {
    const v = idsVinculados([{ lancamento_ids: ["dig-DIG-0001-sinal"] }, { lancamento_ids: null }])
    const [r] = receberDigital([base], lancs(base), v, hoje)
    expect(r.sinal).toMatchObject({ estado: "pago", data: "2026-03-10" }); expect(r.pago).toBe(500.13)
  })
  it("sem data de pagamento usa a do lançamento", () => {
    const p = { ...base, pagamento: undefined }
    const l = lancs(p).map(x => ({ ...x, dataPagamento: "2026-03-12" }))
    const [r] = receberDigital([p], l, new Set(["dig-DIG-0001-sinal"]), hoje)
    expect(r.sinal.data).toBe("2026-03-12")
  })
})

describe("restante", () => {
  it("cria o lançamento pendente do restante (valor exato, frete no restante) sem vencimento antes de prontoEm", () => {
    const r = lancs(base).find(l => l.id === "dig-DIG-0001-restante")!
    expect(r).toMatchObject({ status: "pendente", valor: 500.24, dataVencimento: "", unidade: "digital", tipo: "receita" })
    const comFrete = lancs({ ...base, restante: 530.24 }).find(l => l.id === "dig-DIG-0001-restante")!
    expect(comFrete.valor).toBe(530.24)
  })
  it("vencimento só com prontoEm; antes disso não está atrasado", () => {
    const [a] = receberDigital([base], lancs(base), new Set(), hoje)
    expect(a.vencimentoSaldo).toBeNull(); expect(a.atrasado).toBe(false)
    const p = { ...base, prontoEm: "2026-03-15T10:00:00.000Z" }
    const [b] = receberDigital([p], lancs(p), new Set(), hoje)
    expect(b.vencimentoSaldo).toBe("2026-03-15"); expect(b.atrasado).toBe(true)
    expect(lancs(p).find(l => l.id === "dig-DIG-0001-restante")!.dataVencimento).toBe("2026-03-15")
  })
  it("restante pago deixa de ser pendente; sem sinal pago não há restante", () => {
    const p = { ...base, restantePagoEm: "2026-03-17", pagamentoFinal: { txId: "asaas:pay_2", valor: 500.24, data: "2026-03-17" } }
    expect(lancs(p).find(l => l.id === "dig-DIG-0001-restante")).toMatchObject({ status: "pago" })
    const [r] = receberDigital([p], lancs(p), new Set(), hoje)
    expect(r.saldo).toBe(0); expect(r.restante.estado).toBe("pago")
    expect(lancs({ ...base, sinalPagoEm: undefined }).find(l => l.id.endsWith("-restante"))).toBeUndefined()
  })
})

describe("quem entra", () => {
  it("ignora teste, cancelado e sem sinal; mantém sinal_pago, arte e producao", () => {
    const ps = [{ ...base, id: "A", status: "sinal_pago" }, { ...base, id: "B", status: "arte" }, { ...base, id: "C", status: "producao" },
      { ...base, id: "T", teste: true }, { ...base, id: "X", status: "cancelado" }, { ...base, id: "N", status: "aguardando_sinal", sinalPagoEm: undefined }]
    expect(receberDigital(ps, [], new Set(), hoje).map(r => r.id)).toEqual(["A", "B", "C"])
  })
  it("o Offset na mesma lista não muda", () => {
    const antes = recebiveis(montarPedidos([], []), [])
    const depois = recebiveis(montarPedidos([], lancs(base) as never), lancs(base).filter(l => (l.unidade as string) === "offset") as never)
    expect(depois.aReceber).toBe(antes.aReceber)
  })
})
