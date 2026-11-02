import { describe, it, expect } from "vitest"
import { montarFila, dentroDaJanela } from "@/app/lib/filaMensagens"
import { card, receita } from "./fixtures"

const HOJE = new Date("2026-11-02T15:00:00Z")
const h = (diasAtras: number) => new Date(HOJE.getTime() - diasAtras * 86_400_000).toISOString()
const conv = (p: Record<string, unknown>) => ({ jid: "1@s.whatsapp.net", nome: "Lead", ...p })

describe("fila de mensagens sugeridas", () => {
  it("follow-up só para quem esfriou e ainda não está perdido", () => {
    const f = (c: Record<string, unknown>) => montarFila({ conversas: [conv(c)], kanban: [], lancamentos: [], hoje: HOJE })
    expect(f({ ultima_recebida_at: h(5), ultima_enviada_at: h(4) })[0]).toMatchObject({ tipo: "followup", sugereMidia: true })
    expect(f({ ultima_recebida_at: h(2), ultima_enviada_at: h(1) })).toHaveLength(0)        // falou ontem
    expect(f({ ultima_recebida_at: h(20), ultima_enviada_at: h(19) })).toHaveLength(0)      // perdido
    expect(f({ ultima_recebida_at: h(5), ultima_enviada_at: h(4), fechada_em: h(1) })).toHaveLength(0)
  })
  it("segunda tentativa (7+ dias) muda o texto; dispensado some até a próxima mensagem sua", () => {
    const c = conv({ nome: "joão silva", ultima_recebida_at: h(9), ultima_enviada_at: h(8) })
    const [item] = montarFila({ conversas: [c], kanban: [], lancamentos: [], hoje: HOJE })
    expect(item.texto).toMatch(/^Fala, João/)
    expect(montarFila({ conversas: [c], kanban: [], lancamentos: [], dispensados: { [item.id]: h(0) }, hoje: HOJE })).toHaveLength(0)
  })
  it("aviso de produção uma vez por etapa; pronto não volta para 'em produção'", () => {
    const k = [card({ numero: "P1", nomeCliente: "Maria", preco: 1000, coluna: 5, dataFechamento: "2026-10-25" })]
    const r = montarFila({ conversas: [], kanban: k, lancamentos: [], hoje: HOJE })
    expect(r[0]).toMatchObject({ tipo: "producao", cliente: "Maria" })
    expect(montarFila({ conversas: [], kanban: k, lancamentos: [], avisos: { [r[0].pedidoKey!]: "producao" }, hoje: HOJE })).toHaveLength(0)
    const pronto = [{ ...k[0], coluna: 8 }]
    const p = montarFila({ conversas: [], kanban: pronto, lancamentos: [], avisos: { [r[0].pedidoKey!]: "producao" }, hoje: HOJE })
    expect(p[0]).toMatchObject({ tipo: "pronto" })
    expect(p[0].texto).toMatch(/saldo de R\$\s?1\.000,00/)
  })
  it("pedido antigo não gera aviso", () => {
    const k = [card({ numero: "P2", preco: 1000, coluna: 5, dataFechamento: "2026-06-01" })]
    expect(montarFila({ conversas: [], kanban: k, lancamentos: [], hoje: HOJE })).toHaveLength(0)
  })
  it("cobrança vencida entra na fila", () => {
    const c = card({ numero: "P3", nomeCliente: "Ana", preco: 1000, coluna: 9, dataFechamento: "2026-09-01" })
    const l = [receita({ valor: 1000, status: "pendente", dataPagamento: undefined, dataVencimento: "2026-10-20", cardId: c.id })]
    expect(montarFila({ conversas: [], kanban: [c], lancamentos: l, hoje: HOJE }).some(i => i.tipo === "cobranca")).toBe(true)
  })
  it("janela de envio 9h–20h no horário de Brasília", () => {
    expect(dentroDaJanela(new Date("2026-11-02T15:00:00Z"))).toBe(true)    // 12h
    expect(dentroDaJanela(new Date("2026-11-02T23:30:00Z"))).toBe(false)   // 20h30
    expect(dentroDaJanela(new Date("2026-11-02T11:00:00Z"))).toBe(false)   // 8h
  })
})
