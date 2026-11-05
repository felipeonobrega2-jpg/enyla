import { describe, it, expect } from "vitest"
import { motivoReativacao, tentouHaPouco, horarioDeReativacao, travaDaReativacao, textoAvisoReativacao } from "../app/lib/reativacao"
import { valoresEmReais } from "../app/lib/agenteLeads"

const AGORA = new Date("2026-11-05T15:00:00Z").getTime()
const dias = (n: number) => new Date(AGORA - n * 86_400_000).toISOString()
const conv = (o: Partial<Parameters<typeof motivoReativacao>[0]>) => ({ jid: "1@s.whatsapp.net", status_lead: null, etiquetas: [], ultima_recebida_at: dias(20), ultima_enviada_at: dias(15), ...o })

describe("motivoReativacao", () => {
  it("ICP parado há 15 dias entra, com prioridade máxima", () => {
    expect(motivoReativacao(conv({ etiquetas: ["ICP"] }), AGORA)).toEqual({ motivo: "ICP", prioridade: 0, paradoDias: 15 })
  })
  it("MQL sem etiqueta de perfil entra por último", () => {
    expect(motivoReativacao(conv({ status_lead: "mql" }), AGORA)?.motivo).toBe("MQL")
  })
  it("conversa recente (menos de 10 dias) não entra", () => {
    expect(motivoReativacao(conv({ etiquetas: ["ICP"], ultima_recebida_at: dias(3) }), AGORA)).toBeNull()
  })
  it("conversa velha demais (mais de 150 dias) não entra", () => {
    expect(motivoReativacao(conv({ etiquetas: ["ICP"], ultima_recebida_at: dias(200), ultima_enviada_at: dias(190) }), AGORA)).toBeNull()
  })
  it("descartado, pequeno, fornecedor, pedido e grupo ficam de fora", () => {
    expect(motivoReativacao(conv({ etiquetas: ["ICP", "Fornecedora"] }), AGORA)).toBeNull()
    expect(motivoReativacao(conv({ etiquetas: ["Lead pequeno"], status_lead: "mql" }), AGORA)).toBeNull()
    expect(motivoReativacao(conv({ etiquetas: ["ICP"], status_lead: "pedido" }), AGORA)).toBeNull()
    expect(motivoReativacao(conv({ jid: "x@g.us", etiquetas: ["ICP"] }), AGORA)).toBeNull()
  })
  it("lead comum (sem sinal de bom negócio) não entra", () => {
    expect(motivoReativacao(conv({ status_lead: "conversa" }), AGORA)).toBeNull()
  })
})

describe("motivoReativacao com o Kanban", () => {
  const cli = (o: Partial<{ comprou: boolean; emAndamento: boolean; maiorOrcamento: number }>) => ({ comprou: false, emAndamento: false, maiorOrcamento: 0, ...o })
  it("cliente que já comprou entra depois de 30 dias, antes disso não", () => {
    expect(motivoReativacao(conv({ ultima_recebida_at: dias(40), ultima_enviada_at: dias(35) }), AGORA, cli({ comprou: true, maiorOrcamento: 3000 }))?.motivo).toBe("Cliente que já comprou")
    expect(motivoReativacao(conv({}), AGORA, cli({ comprou: true }))).toBeNull()
  })
  it("pedido em produção não recebe retomada", () => {
    expect(motivoReativacao(conv({ etiquetas: ["ICP"] }), AGORA, cli({ comprou: true, emAndamento: true }))).toBeNull()
  })
  it("orçamento perdido de 5 mil vem antes de oportunidade; de 500 não entra", () => {
    const grande = motivoReativacao(conv({}), AGORA, cli({ maiorOrcamento: 5000 }))!
    const op = motivoReativacao(conv({ etiquetas: ["Oportunidade"] }), AGORA)!
    expect(grande.motivo).toBe("Orçamento perdido 5 mil+")
    expect(grande.prioridade).toBeLessThan(op.prioridade)
    expect(motivoReativacao(conv({}), AGORA, cli({ maiorOrcamento: 500 }))).toBeNull()
    expect(motivoReativacao(conv({}), AGORA, cli({ maiorOrcamento: 2000 }))?.motivo).toBe("Orçamento perdido")
  })
})

describe("tentouHaPouco", () => {
  it("45 dias entre tentativas", () => {
    expect(tentouHaPouco(dias(30), AGORA)).toBe(true)
    expect(tentouHaPouco(dias(50), AGORA)).toBe(false)
    expect(tentouHaPouco(undefined, AGORA)).toBe(false)
  })
})

describe("horarioDeReativacao", () => {
  it("dia útil no expediente (São Paulo)", () => {
    expect(horarioDeReativacao(new Date("2026-11-05T13:30:00Z"))).toBe(true)   // qui 10h30
    expect(horarioDeReativacao(new Date("2026-11-05T16:00:00Z"))).toBe(false)  // qui 13h (almoço)
    expect(horarioDeReativacao(new Date("2026-11-05T22:00:00Z"))).toBe(false)  // qui 19h
    expect(horarioDeReativacao(new Date("2026-11-07T13:30:00Z"))).toBe(false)  // sábado
  })
})

describe("travaDaReativacao", () => {
  const precos = ["0,85"]
  it("mensagem normal sai", () => {
    expect(travaDaReativacao({ resposta: "Oi! Ainda está de pé aquelas 5 mil caixinhas?", alerta: "nenhum" }, precos, valoresEmReais)).toBeNull()
  })
  it("IA achou que não vale: segura com o motivo", () => {
    expect(travaDaReativacao({ resposta: "", alerta: "decisao_sua", motivo_alerta: "já fechou" }, precos, valoresEmReais)).toContain("já fechou")
  })
  it("valor fora do filtro segura", () => {
    expect(travaDaReativacao({ resposta: "Consigo fazer por R$ 0,70", alerta: "nenhum" }, precos, valoresEmReais)).toContain("0,70")
  })
  it("desconto segura", () => {
    expect(travaDaReativacao({ resposta: "Oi!", alerta: "desconto" }, precos, valoresEmReais)).toContain("desconto")
  })
})

it("aviso de resposta à retomada traz quem, o que disse e o link", () => {
  const t = textoAvisoReativacao({ nome: "Fulano", telefone: "5511999999999", motivo: "ICP", mensagem: "Oi, ainda quero sim" })
  expect(t).toContain("Respondeu à retomada")
  expect(t).toContain("Fulano")
  expect(t).toContain("wa.me/5511999999999")
})
