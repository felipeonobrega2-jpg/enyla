// redigirComoFuncionario: texto vazio por decisão do modelo ("nada a enviar") não é erro; exceção é erro.
import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ erro: false, resp: null as unknown, create: async (..._a: unknown[]) => { if (m.erro) throw new Error("falhou"); return m.resp } }))
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: () => { const q: Record<string, unknown> = {}; for (const k of ["select", "eq", "order", "limit", "ilike"]) q[k] = () => q; q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok); return q } } }))
vi.mock("@/app/lib/claude", () => ({ clienteClaude: () => ({ beta: { messages: { create: m.create } } }), MODELO: "m" }))
vi.mock("@/app/lib/enviarCliente", () => ({ destinoDoCliente: vi.fn(async () => ({ destino: "5511900000001@s.whatsapp.net", jid: null })) }))
vi.mock("@/app/lib/vinculoWhatsapp", () => ({ chaveTelefone: (v: string) => v }))

import { redigirComoFuncionario, ERRO_NADA_A_ENVIAR } from "@/app/lib/funcionariosServidor"
import { EXECUTORES_COMERCIAIS } from "@/app/lib/ordemComercial"

const base = { funcionario: EXECUTORES_COMERCIAIS[0], cliente: "Gráfica Alfa", ordem: "x", apiKey: "k", jid: "5511900000001@s.whatsapp.net" }
const resposta = (texto: string) => ({ content: [{ type: "text", text: JSON.stringify({ texto }) }] })

beforeEach(() => { m.erro = false })

describe("redigirComoFuncionario", () => {
  it("texto vazio por decisão do modelo: { ok: false, erro: 'nada a enviar' } sinalizado, sem mensagem de falha", async () => {
    m.resp = resposta("   ")
    const r = await redigirComoFuncionario(base)
    expect(r).toEqual({ ok: false, erro: "nada a enviar", nadaAEnviar: true })
    expect(ERRO_NADA_A_ENVIAR).toBe("nada a enviar")
  })
  it("erro real (exceção na IA) segue como erro, sem o sinal de nada a enviar", async () => {
    m.erro = true
    const r = await redigirComoFuncionario(base)
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.erro).toContain("não conseguiu escrever a mensagem"); expect(r.nadaAEnviar).toBeUndefined() }
  })
  it("texto escrito volta normalmente", async () => {
    m.resp = resposta("Oi!")
    expect(await redigirComoFuncionario(base)).toEqual({ ok: true, texto: "Oi!" })
  })
})
