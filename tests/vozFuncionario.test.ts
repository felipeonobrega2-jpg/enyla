// redigirComoFuncionario em modo prospecto: voz da equipe ENYLA e "nada a enviar". IA e Supabase simulados.
import { describe, it, expect, vi, beforeEach } from "vitest"
const m = vi.hoisted(() => ({ ia: vi.fn() }))
vi.mock("@/app/lib/claude", () => ({ MODELO: "m", clienteClaude: () => ({ beta: { messages: { create: async (a: unknown) => ({ content: [{ type: "text", text: JSON.stringify(await m.ia(a)) }] }) } } }) }))
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: () => { const q: Record<string, unknown> = { then: (r: (v: unknown) => void) => r({ data: [], error: null }), maybeSingle: async () => ({ data: null }) }; for (const k of ["select", "eq", "order", "limit", "in", "ilike", "or"]) q[k] = () => q; return q } } }))
import { redigirComoFuncionario } from "@/app/lib/funcionariosServidor"

const f = { id: "f1", nome: "Atendente", qualificacao: "atendimento", status: "contratado", capacidade: "mensagem_cliente", onboarding: { conceitos: [], pode: [], naoPode: [] }, aprendizados: [] } as never
const base = { funcionario: f, cliente: "Gráfica Alfa", ordem: "convidar", apiKey: "k", jid: "5511999990001@s.whatsapp.net", prospecto: true }
beforeEach(() => m.ia.mockReset())

describe("redigirComoFuncionario para gráfica do Prospector", () => {
  it.each(["Aqui é o Felipe, da ENYLA.", "O Felipe entra em contato.", "O Felipe analisa o cadastro.", "Depois alinham depois.", "Vocês buscam e entregam?", "Não precisa se preocupar com tabela."])("recusa: %s", async (texto) => {
    m.ia.mockResolvedValue({ texto })
    const r = await redigirComoFuncionario(base)
    expect(r.ok).toBe(false)
  })
  it("texto limpo passa; o prompt usa o conhecimento do banco e a voz da equipe, sem o guia do Felipe", async () => {
    m.ia.mockResolvedValue({ texto: "Somos a ENYLA e queremos você como parceira." })
    const r = await redigirComoFuncionario({ ...base, guia: "GUIA-DO-FELIPE", conhecimento: [{ id: "c1", tema: "processo", texto: "Cadastro de parceira leva 5 minutos.", em: "x" }] })
    expect(r).toEqual({ ok: true, texto: "Somos a ENYLA e queremos você como parceira." })
    const sistema = String((m.ia.mock.calls[0][0] as { system: string }).system)
    expect(sistema).toContain("Cadastro de parceira leva 5 minutos."); expect(sistema).toContain("Nunca se apresente nem assine como o Felipe")
    expect(sistema).not.toContain("GUIA-DO-FELIPE"); expect(sistema).not.toContain("O Felipe (CEO) lê antes")
  })
})
