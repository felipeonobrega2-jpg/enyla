import { describe, it, expect, vi, beforeEach } from "vitest"

const gravados: Record<string, unknown>[] = []
vi.mock("@/app/lib/registroAgente", () => ({
  lerRegistros: vi.fn(), lerIdsAgente: vi.fn(), guardarIdAgente: vi.fn(), reservarTratada: vi.fn(), liberarTratada: vi.fn(), temTabelas: vi.fn(),
  gravarRegistro: vi.fn(async (r: Record<string, unknown>) => { gravados.push(r); return true }),
}))
vi.mock("@/app/lib/supabase", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { jid: "5519974235484@s.whatsapp.net", ts: "2026-11-25T12:56:00Z" } }) }) }) }) },
}))

import { agenteAtendeuRecente, registrarSaidaSilenciosa } from "@/app/lib/agenteAuto"

const jid = "5519974235484@s.whatsapp.net"
const agora = Date.parse("2026-11-25T13:00:00Z")
const primeira = Date.parse("2026-11-15T13:00:00Z") // 10 dias
const conversaNova = (atendendo: boolean) => agora - primeira < 4 * 86_400_000 || atendendo

describe("agente atendendo pela mensagem dele (ordem direta)", () => {
  const logAntigo = [{ em: "2026-11-18T10:00:00Z", jid, nome: "Rodrigo", perfil: "indefinido" as const, enviou: true, texto: "x", motivo: "" }]
  it("mensagem do agente há 2 h (id em agenteIds): conversa nova", () => {
    expect(conversaNova(agenteAtendeuRecente(jid, logAntigo, ["abc"], [{ id: "abc" }], agora))).toBe(true)
  })
  it("sem mensagem do agente nas 48 h: continua antiga", () => {
    expect(conversaNova(agenteAtendeuRecente(jid, logAntigo, ["abc"], [{ id: "outra-minha" }], agora))).toBe(false)
    expect(conversaNova(agenteAtendeuRecente(jid, logAntigo, [], [], agora))).toBe(false)
  })
  it("registro com enviou nas últimas 48 h continua valendo", () => {
    const log = [{ ...logAntigo[0], em: "2026-11-24T10:00:00Z" }]
    expect(agenteAtendeuRecente(jid, log, [], [], agora)).toBe(true)
  })
})

describe("saída silenciosa deixa rastro", () => {
  beforeEach(() => { gravados.length = 0 })
  it("grava enviou:false com o motivo e o horário da mensagem (mesma chave nas repetições)", async () => {
    await registrarSaidaSilenciosa("m1", jid, "Rodrigo", "conversa antiga sem atendimento do agente")
    await registrarSaidaSilenciosa("m1", jid, "Rodrigo", "conversa antiga sem atendimento do agente")
    expect(gravados).toHaveLength(2)
    expect(gravados[0]).toMatchObject({ jid, enviou: false, motivo: "conversa antiga sem atendimento do agente", em: "2026-11-25T12:56:00.000Z" })
    expect(gravados[1]).toEqual(gravados[0]) // jid+em+motivo iguais: o upsert ignora a repetição
  })
})
