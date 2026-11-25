import { describe, it, expect } from "vitest"
import { acompanhamentoDigital, A_CONFIRMAR, EM_CONFERENCIA, type PedidoAcomp } from "../app/lib/acompanhamentoDigital"
import { tokenDigitalValido } from "../app/lib/digitalLink"

const base: PedidoAcomp = {
  id: "DIG-0007", nome: "Ana Paula Souza", medidas: { a: 10, l: 5.5, p: 5 }, quantidade: 200, total: 1234.57, sinal: 617.29, status: "producao",
  briefing: { laminacao: "fosca" }, sinalPagoEm: "2026-03-02T15:00:00.000Z", designerAvisadoEm: "2026-03-02", arteEnviadaEm: "2026-03-04", arteAprovadaEm: "2026-03-05", villaEnviadoEm: "2026-03-06",
  pagamento: { txId: "asaas:pay_1", valor: 617.29, data: "2026-03-02" }, situacaoArte: "aprovada",
}
const lan = (extra = {}) => ({ id: "DIG-0007".replace(/^/, "dig-") + "-sinal", valor: 617.29, status: "pago", dataPagamento: "2026-03-02", ...extra })
const ent = (o = {}) => ({ lancamentos: [lan()], vinculados: [] as string[], prazoPadraoDias: null as number | null, ...o })

describe("acompanhamentoDigital", () => {
  it("txId asaas: mostra pago, saldo com centavos exatos e campos da lista", () => {
    const a = acompanhamentoDigital(base, ent())!
    expect(a.numero).toBe("DIG-0007"); expect(a.primeiroNome).toBe("Ana"); expect(a.medida).toBe("10 × 5,5 × 5 cm"); expect(a.quantidade).toBe(200)
    expect(a.tipo).toContain("triplex 300g"); expect(a.tipo).toContain("fosca")
    expect(a.total).toBe(1234.57); expect(a.sinal).toBe(617.29)
    expect(a.pago).toEqual({ valor: 617.29, em: "2026-03-02" })
    expect(a.saldo!.valor).toBe(617.28); expect(a.conferencia).toBe(false)
    expect(a.etapaAtual).toEqual({ nome: "Em produção", em: "2026-03-06" }); expect(a.historico.map(h => h.nome)).toEqual(["Sinal pago", "Arte em preparação", "Arte para aprovação", "Arte aprovada", "Em produção"])
  })
  it("lançamento status pago sem asaas e sem vínculo bancário: em conferência", () => {
    const a = acompanhamentoDigital({ ...base, pagamento: { txId: "E123PIX", valor: 617.29, data: "2026-03-02" } }, ent())!
    expect(a.pago).toBeNull(); expect(a.saldo).toBeNull(); expect(a.conferencia).toBe(true); expect(EM_CONFERENCIA).toBe("em conferência")
  })
  it("vínculo bancário confirma o pago", () => {
    const a = acompanhamentoDigital({ ...base, pagamento: null }, ent({ vinculados: ["dig-DIG-0007-sinal"] }))!
    expect(a.pago?.valor).toBe(617.29)
  })
  it("vencimento do saldo só depois de pronto", () => {
    expect(acompanhamentoDigital(base, ent())!.saldo!.vencimento).toBeNull()
    expect(acompanhamentoDigital({ ...base, prontoEm: "2026-03-20" }, ent())!.saldo!.vencimento).toBe("2026-03-20")
  })
  it("prazo a confirmar com config vazia; com config, só depois da arte aprovada; gravado na mão vale", () => {
    expect(acompanhamentoDigital(base, ent())!.prazoEntrega).toBe(A_CONFIRMAR)
    expect(acompanhamentoDigital(base, ent({ prazoPadraoDias: 7 }))!.prazoEntrega).toBe("2026-03-16")
    expect(acompanhamentoDigital({ ...base, situacaoArte: "enviada" }, ent({ prazoPadraoDias: 7 }))!.prazoEntrega).toBe(A_CONFIRMAR)
    expect(acompanhamentoDigital({ ...base, prazoEntrega: "2026-04-01" }, ent())!.prazoEntrega).toBe("2026-04-01")
  })
  it("situação da arte: valor gravado ou a confirmar", () => {
    expect(acompanhamentoDigital({ ...base, situacaoArte: "ajustes pedidos" }, ent())!.arte).toBe("ajustes pedidos")
    expect(acompanhamentoDigital({ ...base, situacaoArte: undefined }, ent())!.arte).toBe(A_CONFIRMAR)
  })
  it("não devolve nada de aguardando sinal, cancelado ou teste", () => {
    for (const s of ["aguardando_sinal", "cancelado"]) expect(acompanhamentoDigital({ ...base, status: s }, ent())).toBeNull()
    expect(acompanhamentoDigital({ ...base, teste: true }, ent())).toBeNull()
  })
  it("payload sem dado sensível", () => {
    const sujo = { ...base, jid: "5511@s.whatsapp.net", telefone: "5511", email: "a@b.com", documento: "123", custo: 500, margem: 200 } as PedidoAcomp
    const json = JSON.stringify(acompanhamentoDigital(sujo, ent()))
    for (const x of ["5511", "a@b.com", "123.", "custo", "margem", "jid", "documento", "asaas:"]) expect(json).not.toContain(x)
  })
  it("token inválido não abre", () => { process.env.AUTH_SECRET = "segredo-de-teste"; expect(tokenDigitalValido("DIG-0007", "errado")).toBe(false); expect(tokenDigitalValido("DIG-0007", null)).toBe(false) })
})
