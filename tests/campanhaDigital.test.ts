import { describe, it, expect } from "vitest"
import { candidato, ordenar, podeEnviar, textoComOrcamento, textoPergunta, emCampanha, enviadosHoje } from "@/app/lib/campanhaDigital"
import type { DadosPedido } from "@/app/lib/atendente"

const agora = new Date("2026-11-13T15:00:00Z").getTime()   // sexta, 12h em SP
const dias = (n: number) => new Date(agora - n * 86_400_000).toISOString()
const dados = (x: Partial<DadosPedido>): DadosPedido => ({ produto: "perfume", volume_ml: null, caixa_cm: null, frasco_cm: null, quantidade: null, tem_arte: null, resumo: "", ...x })
const conv = (x: Record<string, unknown>) => ({ jid: "1@s.whatsapp.net", nome: "Ana Souza", etiquetas: ["Lead pequeno"], status_lead: null, ultima_at: dias(10), dados: null, ...x }) as never

describe("campanha digital: quem entra", () => {
  it("lead pequeno parado entre 3 e 180 dias", () => {
    expect(candidato(conv({}), null, agora)).not.toBeNull()
    expect(candidato(conv({ ultima_at: dias(1) }), null, agora)).toBeNull()      // ativo
    expect(candidato(conv({ ultima_at: dias(200) }), null, agora)).toBeNull()    // frio demais
    expect(candidato(conv({ etiquetas: ["Lead pequeno", "Fornecedora"] }), null, agora)).toBeNull()
    expect(candidato(conv({ etiquetas: ["MQL"] }), null, agora)).toBeNull()
    expect(candidato(conv({ etiquetas: [] }), "pequeno", agora)).not.toBeNull()  // perfil do registro do agente
    expect(candidato(conv({ dados: dados({ quantidade: 3000 }) }), null, agora)).toBeNull()   // volume de offset
  })
  it("orçamento pronto primeiro, depois quantidade conhecida, depois os mais recentes", () => {
    const a = candidato(conv({ jid: "a", dados: dados({ quantidade: 100, volume_ml: 50 }), ultima_at: dias(90) }), null, agora)!
    const b = candidato(conv({ jid: "b", dados: dados({ quantidade: 100 }), ultima_at: dias(5) }), null, agora)!
    const c = candidato(conv({ jid: "c", ultima_at: dias(4) }), null, agora)!
    expect(a.cotavel).toBe(true)
    expect(ordenar([c, b, a]).map(x => x.jid)).toEqual(["a", "b", "c"])
  })
})

describe("campanha digital: mensagens e ritmo", () => {
  it("com orçamento: lembra o pedido e manda o link", () => {
    const t = textoComOrcamento("Ana Souza", dados({ quantidade: 100, volume_ml: 50 }), { quantidade: 100, total: 619.95, padrao: true }, "LINK")
    expect(t).toMatch(/^Oi, Ana! Você tinha me perguntado sobre 100 caixinhas para frasco de 50 ml[\s\S]*a partir de 20 unidades[\s\S]*R\$\s?619,95[\s\S]*LINK[\s\S]*medida padrão/)
  })
  it("sem dados: pergunta só o que falta", () => {
    expect(textoPergunta("Ana", null)).toMatch(/^Oi, Ana![\s\S]*Quantas você precisa e qual o tamanho/)
    expect(textoPergunta("Ana", dados({ quantidade: 200 }))).toMatch(/Qual o tamanho: o ml do frasco, ou a altura e a largura do produto/)
  })
  it("nome só quando parece nome de gente", () => {
    expect(textoPergunta("umds", null)).toMatch(/^Oi! /)
    expect(textoPergunta("Eu", null)).toMatch(/^Oi! /)
    expect(textoPergunta("Thais • 🌻", null)).toMatch(/^Oi, Thais! /)
  })
  it("só ligada, seg a sáb das 9h às 19h, respeitando intervalo e limite do dia", () => {
    const sexta12h = new Date("2026-11-13T15:00:00Z")
    expect(podeEnviar({ ligada: false }, sexta12h).ok).toBe(false)
    expect(podeEnviar({ ligada: true }, sexta12h).ok).toBe(true)
    expect(podeEnviar({ ligada: true }, new Date("2026-11-15T15:00:00Z")).ok).toBe(false)   // domingo
    expect(podeEnviar({ ligada: true }, new Date("2026-11-13T23:30:00Z")).ok).toBe(false)   // 20h30
    expect(podeEnviar({ ligada: true, proximaEm: "2026-11-13T15:10:00Z" }, sexta12h).ok).toBe(false)
    const hoje = Object.fromEntries([1, 2].map(i => [`${i}@x`, { em: "2026-11-13T13:00:00Z", tipo: "pergunta" as const }]))
    expect(enviadosHoje({ enviados: hoje }, sexta12h)).toBe(2)
    expect(podeEnviar({ ligada: true, porDia: 2, enviados: hoje }, sexta12h).ok).toBe(false)
  })
  it("quem respondeu em até 15 dias é atendido como conversa nova", () => {
    const e = { enviados: { "1@x": { em: dias(3), tipo: "pergunta" as const } } }
    expect(emCampanha(e, "1@x", agora)).toBe(true)
    expect(emCampanha(e, "2@x", agora)).toBe(false)
  })
})
