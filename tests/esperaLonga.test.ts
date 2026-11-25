import { describe, it, expect } from "vitest"
import { esperaLonga, deveAvisarEsperaLonga } from "@/app/lib/esperando"

// 24/11/2026 às 10h (Brasília)
const agora = new Date("2026-11-24T13:00:00Z").getTime()
const will = { jid: "will@s.whatsapp.net", nome: "Will Santos", etiquetas: ["Digital"], status_lead: null, ultima_msg: "Pode prosseguir",
  ultima_recebida_at: "2026-11-13T22:16:00Z", ultima_enviada_at: "2026-11-13T20:00:00Z" }   // 19h16 em Brasília
const pedidos = { [will.jid]: "DIG-0052" }

describe("espera longa (24 h+)", () => {
  it("o caso do Will (13/11, 11 dias sem resposta) gera alerta, com pedido e horas", () => {
    const r = esperaLonga([will], pedidos, agora)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ pedido: "DIG-0052", nome: "Will Santos", desde: "2026-11-13T22:16:00.000Z" })
    expect(r[0].horas).toBeGreaterThan(24 * 10)
  })
  it("não expõe telefone nem texto da conversa", () => {
    expect(Object.keys(esperaLonga([will], pedidos, agora)[0]).sort()).toEqual(["desde", "horas", "jid", "nome", "pedido"])
  })
  it("a resposta da Enyla encerra o alerta", () => {
    expect(esperaLonga([{ ...will, ultima_enviada_at: "2026-11-24T12:00:00Z" }], pedidos, agora)).toHaveLength(0)
  })
  it("menos de 24 h ainda não alerta", () => {
    expect(esperaLonga([{ ...will, ultima_recebida_at: "2026-11-23T20:00:00Z" }], pedidos, agora)).toHaveLength(0)
  })
  it("cliente com pedido vem antes do lead, mesmo esperando menos", () => {
    const lead = { ...will, jid: "lead@s.whatsapp.net", nome: "Lead", ultima_recebida_at: "2026-11-01T12:00:00Z", ultima_enviada_at: null }
    expect(esperaLonga([lead, will], pedidos, agora).map(e => e.nome)).toEqual(["Will Santos", "Lead"])
  })
  it("fornecedora, grupo, descartado e conversa fechada continuam fora", () => {
    const r = esperaLonga([
      { ...will, jid: "f@s.whatsapp.net", etiquetas: ["Fornecedora"] },
      { ...will, jid: "g@g.us" },
      { ...will, jid: "d@s.whatsapp.net", etiquetas: ["Descartado"] },
      { ...will, jid: "x@s.whatsapp.net", fechada_em: "2026-11-20T12:00:00Z" },
    ], {}, agora)
    expect(r).toHaveLength(0)
  })
  it("não repete o alerta antes de 24 h e repete depois", () => {
    const h = (n: number) => new Date(agora - n * 3600_000).toISOString()
    expect(deveAvisarEsperaLonga("a", {}, agora)).toBe(true)
    expect(deveAvisarEsperaLonga("a", { a: h(23) }, agora)).toBe(false)
    expect(deveAvisarEsperaLonga("a", { a: h(24) }, agora)).toBe(true)
  })
})

describe("espera longa: nada vai ao cliente", () => {
  it("o módulo do servidor não envia mensagem (sem Evolution nem despacho)", async () => {
    const { readFileSync } = await import("node:fs")
    const src = readFileSync("app/lib/esperaLongaServidor.ts", "utf8")
    expect(src).not.toMatch(/evolution|sendText|despachar|responder|notificar/i)
  })
})
