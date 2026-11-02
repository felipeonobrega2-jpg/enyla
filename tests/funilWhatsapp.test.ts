import { describe, it, expect } from "vitest"
import { posicaoNoFunil, estaFechada } from "@/app/lib/funilWhatsapp"
import { card } from "./fixtures"

const HOJE = new Date("2026-11-02T12:00:00Z")
const h = (diasAtras: number) => new Date(HOJE.getTime() - diasAtras * 86_400_000).toISOString()

describe("funil de conversas", () => {
  it("novo até você responder; depois em conversa", () => {
    expect(posicaoNoFunil({ ultima_recebida_at: h(0.1) }, [], HOJE)).toMatchObject({ etapa: "novo", responder: true })
    expect(posicaoNoFunil({ ultima_recebida_at: h(1), ultima_enviada_at: h(0.5) }, [], HOJE)).toMatchObject({ etapa: "conversa", responder: false })
  })
  it("cards do cliente mandam: orçamento aberto, quente, fechado", () => {
    const c = { ultima_recebida_at: h(1), ultima_enviada_at: h(1) }
    expect(posicaoNoFunil(c, [card({ numero: "O1", preco: 900, coluna: 0, data: "01/11/2026, 10:00:00" })], HOJE)).toMatchObject({ etapa: "orcamento", valor: 900 })
    expect(posicaoNoFunil(c, [card({ numero: "O2", preco: 900, coluna: 9, data: "01/11/2026, 10:00:00" })], HOJE).etapa).toBe("pedido")
  })
  it("esfriando: você falou por último há 3+ dias; perdido com 14 dias sem o cliente", () => {
    expect(posicaoNoFunil({ ultima_recebida_at: h(5), ultima_enviada_at: h(4) }, [], HOJE)).toMatchObject({ etapa: "conversa", esfriando: true })
    expect(posicaoNoFunil({ ultima_recebida_at: h(20), ultima_enviada_at: h(19) }, [], HOJE).etapa).toBe("perdido")
  })
  it("etapa à mão vale; 'perdido' à mão cai se o cliente voltar a falar", () => {
    expect(posicaoNoFunil({ ultima_recebida_at: h(1), ultima_enviada_at: h(1), status_lead: "negociando", ultima_classificacao_at: h(2) }, [], HOJE)).toMatchObject({ etapa: "negociando", manual: true })
    expect(posicaoNoFunil({ ultima_recebida_at: h(1), ultima_enviada_at: h(2), status_lead: "perdido", ultima_classificacao_at: h(3) }, [], HOJE)).toMatchObject({ etapa: "conversa", responder: true, manual: false })
  })
})

describe("fechar conversa", () => {
  it("fechada até o cliente escrever depois", () => {
    expect(estaFechada({ fechada_em: "2026-11-01T10:00:00Z", ultima_recebida_at: "2026-10-30T10:00:00Z" })).toBe(true)
    expect(estaFechada({ fechada_em: "2026-11-01T10:00:00Z", ultima_recebida_at: "2026-11-02T08:00:00Z" })).toBe(false)
    expect(estaFechada({ fechada_em: null })).toBe(false)
  })
})
