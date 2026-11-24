import { describe, it, expect } from "vitest"
import { orcadoPeloFelipe, type MsgOrcado } from "@/app/lib/orcadoPeloFelipe"
import { aplicarOperacao, perdidoAtivo, orcadoManualAtivo, foraDasFilas } from "@/app/lib/leadEstado"

const m = (ts: string, from_me: boolean, corpo: string | null, tipo = "conversation", id = ts): MsgOrcado => ({ id, ts, from_me, corpo, tipo })
const pergunta = m("2026-11-20T10:00:00Z", false, "Quanto custa 500 caixas 5x5x10 cm?")

describe("orcadoPeloFelipe", () => {
  it("PDF mandado pelo Felipe conta", () => {
    const r = orcadoPeloFelipe([pergunta, m("2026-11-20T11:00:00Z", true, null, "documentMessage")])
    expect(r).toMatchObject({ orcado: true, em: "2026-11-20T11:00:00Z" })
    expect(r.evidencia).toMatch(/PDF/)
  })
  it("só preço no texto conta", () => {
    const r = orcadoPeloFelipe([pergunta, m("2026-11-20T11:00:00Z", true, "Fica R$ 1.200 as 500, ou R$ 0,85 a unidade")])
    expect(r.orcado).toBe(true)
    expect(r.evidencia).toContain("R$")
  })
  it("mensagem do agente com preço de referência não conta como Felipe", () => {
    const r = orcadoPeloFelipe([pergunta, m("2026-11-20T11:00:00Z", true, "Por referência, R$ 0,90 a unidade", "conversation", "AG1")], ["AG1"])
    expect(r.orcado).toBe(false)
  })
  it("preço antes da última pergunta do lead não conta", () => {
    const r = orcadoPeloFelipe([m("2026-11-19T11:00:00Z", true, "R$ 1,00 a unidade"), pergunta])
    expect(r.orcado).toBe(false)
  })
  it("botões automáticos do WhatsApp Business não contam", () => {
    expect(orcadoPeloFelipe([pergunta, m("2026-11-20T11:00:00Z", true, "", "interactiveMessage")]).orcado).toBe(false)
  })
})

describe("estado do lead", () => {
  it("perdido exige motivo e não apaga nada", () => {
    expect(aplicarOperacao(null, "1@s.whatsapp.net", "perdido", "felipe", " ").ok).toBe(false)
    const r = aplicarOperacao(null, "1@s", "perdido", "felipe", "fechou com outra a R$ 0,98", "2026-11-21T10:00:00Z")
    if (!r.ok) throw new Error("x")
    expect(perdidoAtivo(r.estado, "2026-11-20T10:00:00Z")?.motivo).toMatch(/0,98/)
    expect(foraDasFilas(r.estado, "2026-11-20T10:00:00Z")).toBe(true)
    // lead escreveu de novo: volta ao normal, motivo continua no histórico
    expect(perdidoAtivo(r.estado, "2026-11-22T10:00:00Z")).toBeNull()
    expect(foraDasFilas(r.estado, "2026-11-22T10:00:00Z")).toBe(false)
    expect(r.estado.historico).toHaveLength(1)
    const re = aplicarOperacao(r.estado, "1@s", "reabrir", "felipe", undefined)
    if (!re.ok) throw new Error("x")
    expect(re.estado.atual).toBeNull()
    expect(re.estado.historico).toHaveLength(2)
  })
  it("orçado à mão sai das filas até o lead escrever", () => {
    const r = aplicarOperacao(null, "1@s", "orcado", "cco", undefined, "2026-11-21T10:00:00Z")
    if (!r.ok) throw new Error("x")
    expect(orcadoManualAtivo(r.estado, "2026-11-20T00:00:00Z")).toBeTruthy()
    expect(orcadoManualAtivo(r.estado, "2026-11-22T00:00:00Z")).toBeNull()
  })
})
