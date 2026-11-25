import { describe, it, expect, vi, beforeEach } from "vitest"

// Mensagens do banco falso, mais nova primeiro
type M = { id: string; jid: string; from_me: boolean; corpo: string | null; tipo: string; ts: string }
const h = vi.hoisted(() => ({ banco: [] as unknown[], avisos: [] as unknown[], reservadas: new Set<string>(), registros: [] as Record<string, unknown>[], atender: (() => {}) as unknown }))
const atender = vi.fn()
h.atender = atender
let banco: M[] = []
const avisos = h.avisos, reservadas = h.reservadas, registros = h.registros

vi.mock("@/app/lib/supabase", () => {
  const consulta = (t: string) => {
    const f: { id?: string; jid?: string; from_me?: boolean; gt?: string } = {}
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (k: string, v: unknown) => { (f as Record<string, unknown>)[k] = v; return q },
      gt: (_k: string, v: string) => { f.gt = v; return q },
      order: () => q,
      limit: () => Promise.resolve({ data: lista() }),
      maybeSingle: () => Promise.resolve({ data: t === "whatsapp_conversas" ? { jid: "5511@s.whatsapp.net", nome: "Toca Da Bruxa", telefone: "5511", etiquetas: ["F1"], status_lead: null } : lista()[0] ?? null }),
    }
    const lista = () => (h.banco as M[]).filter(m => (f.id === undefined || m.id === f.id) && (f.jid === undefined || m.jid === f.jid) && (f.from_me === undefined || m.from_me === f.from_me) && (!f.gt || m.ts > f.gt))
    return q
  }
  return { supabase: { from: (t: string) => consulta(t) } }
})
vi.mock("@/app/lib/evolution", () => ({ evo: async (_p: string, o: { body: string }) => { h.avisos.push(JSON.parse(o.body)) } }))
vi.mock("@/app/lib/atendenteServidor", () => ({ atender: (...a: unknown[]) => (h.atender as (...x: unknown[]) => unknown)(...a), lerConfigAtendente: async () => ({}) }))
vi.mock("@/app/lib/registroAgente", () => ({
  reservarTratada: async (id: string) => { if (h.reservadas.has(id)) return false; h.reservadas.add(id); return true },
  liberarTratada: async () => {}, gravarRegistro: async (r: Record<string, unknown>) => { h.registros.push(r); return true },
  lerRegistros: async () => null, lerIdsAgente: async () => null, guardarIdAgente: async () => {}, temTabelas: async () => true,
}))
vi.mock("@/app/lib/configAtomica", () => ({ mudarConfig: async () => {}, lerConfigLinha: async () => null }))

import { segurarSaudacaoDoLead } from "@/app/lib/agenteAuto"

const cfg = { agenteAuto: { ligado: true, avisoNumero: "5511999990000" } } as never
const base = { jid: "5511@s.whatsapp.net", tipo: "text" }

describe("guarda da saudação automática (responderSozinho / agendarResposta)", () => {
  beforeEach(() => { h.avisos.length = 0; h.reservadas.clear(); h.registros.length = 0; atender.mockClear() })

  it("saudação depois do nosso follow-up: avisa só o Felipe, não chama a IA e registra enviou:false", async () => {
    h.banco = banco = [
      { ...base, id: "f1", from_me: true, corpo: "Oi! Conseguiu ver?", ts: "2026-11-24T11:20:00Z" },
      { ...base, id: "s1", from_me: false, corpo: "Agradecemos seu contato. Em breve retornaremos.", ts: "2026-11-24T11:20:30Z" },
    ]
    // a armadilha: ultimaDa ignora a saudação, e mesmo assim o aviso sai (o guarda roda antes de aindaEhAUltima)
    expect(await segurarSaudacaoDoLead(cfg, "s1")).toBe(true)
    expect(avisos).toHaveLength(1)
    const a = avisos[0] as unknown as { number: string; text: string }
    expect(a.number).toBe("5511999990000")
    expect(a.text).toMatch(/Segurei a resposta/)
    expect(a.text).toMatch(/saudação automática do WhatsApp Business/)
    expect(a.text).not.toMatch(/Ia mandar/)
    expect(atender).not.toHaveBeenCalled()
    expect(registros).toHaveLength(1)
    expect(registros[0].enviou).toBe(false)
  })
  it("mesma mensagem processada de novo: não avisa duas vezes", async () => {
    h.banco = banco = [{ ...base, id: "s2", from_me: false, corpo: "Como podemos ajudar?", ts: "2026-11-24T11:20:30Z" }]
    await segurarSaudacaoDoLead(cfg, "s2")
    expect(await segurarSaudacaoDoLead(cfg, "s2")).toBe(true)
    expect(avisos).toHaveLength(1)
  })
  it("mensagem humana: não é saudação, segue o fluxo normal", async () => {
    h.banco = banco = [{ ...base, id: "h1", from_me: false, corpo: "Quero 5.000 caixas", ts: "2026-11-24T11:20:30Z" }]
    expect(await segurarSaudacaoDoLead(cfg, "h1")).toBe(false)
    expect(avisos).toHaveLength(0)
  })
  it("veio mensagem humana depois da saudação: não avisa (a nova dispara sozinha)", async () => {
    h.banco = banco = [
      { ...base, id: "s3", from_me: false, corpo: "Agradecemos seu contato.", ts: "2026-11-24T11:20:30Z" },
      { ...base, id: "h2", from_me: false, corpo: "Oi, sou o João", ts: "2026-11-24T11:21:00Z" },
    ]
    expect(await segurarSaudacaoDoLead(cfg, "s3")).toBe(true)
    expect(avisos).toHaveLength(0)
  })
})
