// Trava da Atendente: gráfica de prospectos_parceiros que responde não recebe resposta automática.
// Supabase, IA e Evolution são simulados: nada é enviado de verdade.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

type Linha = Record<string, unknown>
const mundo = vi.hoisted(() => ({
  prospectos: [] as Linha[], conversas: [] as Linha[], mensagens: [] as Linha[], apelidos: {} as Record<string, string>,
  atender: vi.fn(async (..._a: unknown[]) => ({ ok: false as const, erro: "x", status: 500 })),
  parceiro: vi.fn(async (..._a: unknown[]) => ({ enviou: true, motivo: "respondeu", texto: "oi" })),
  evo: vi.fn(async (..._a: unknown[]) => ({ ok: true, status: 200, corpo: {} })),
}))

vi.mock("@/app/lib/atendenteParceiro", () => ({ responderParceiro: mundo.parceiro }))
vi.mock("@/app/lib/evolution", () => ({ evo: mundo.evo }))
vi.mock("@/app/lib/atendenteServidor", () => ({
  atender: mundo.atender,
  lerConfigAtendente: vi.fn(async () => ({ agenteAuto: { ligado: true } })),
}))
vi.mock("@/app/lib/registroAgente", () => ({
  lerRegistros: vi.fn(async () => null), gravarRegistro: vi.fn(), lerIdsAgente: vi.fn(async () => null), guardarIdAgente: vi.fn(),
  reservarTratada: vi.fn(async () => true), liberarTratada: vi.fn(), temTabelas: vi.fn(async () => true),
}))
vi.mock("@/app/lib/juntarConversas", () => ({ lerApelidos: vi.fn(async () => mundo.apelidos), juntarConversas: vi.fn(), juntarGemeas: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (tabela: string) => {
      const fonte = tabela === "prospectos_parceiros" ? mundo.prospectos : tabela === "whatsapp_conversas" ? mundo.conversas : mundo.mensagens
      const filtros: ((r: Linha) => boolean)[] = []
      let ini = 0, fim = Infinity
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (c: string, v: unknown) => { filtros.push(r => r[c] === v); return q }
      q.gte = () => q
      q.insert = async () => ({ error: null })
      q.upsert = async () => ({ error: null })
      q.order = () => q
      q.limit = () => q
      q.range = (a: number, b: number) => { ini = a; fim = b + 1; return q }
      const achar = () => fonte.filter(r => filtros.every(f => f(r))).slice(ini, fim)
      q.maybeSingle = async () => ({ data: achar()[0] ?? null, error: null })
      q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: structuredClone(achar()), error: null }).then(ok, ko)
      return q
    },
  },
}))

import { ehProspecto } from "@/app/lib/prospectorTrava"
import { agendarResposta, responderSozinho } from "@/app/lib/agenteAuto"

const fetchSpy = vi.fn(async (..._a: unknown[]) => ({ ok: true }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("fetch", fetchSpy)
  fetchSpy.mockClear(); mundo.atender.mockClear(); mundo.evo.mockClear(); mundo.parceiro.mockClear()
  mundo.prospectos = [{ id: 1, telefone: "(11) 98765-4321", etapa: "abordado", opt_out: false }]
  mundo.conversas = []; mundo.apelidos = {}
  mundo.mensagens = []
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const conv = (jid: string) => ({ jid, nome: "Gráfica Teste", telefone: jid.split("@")[0], etiquetas: [], status_lead: null })
const msg = (id: string, jid: string) => ({ id, jid, from_me: false, ts: "2026-11-24T12:00:00Z", corpo: "oi", tipo: "text" })
const agendar = async (id: string) => { const p = agendarResposta(id, "http://x"); await vi.runAllTimersAsync(); await p }

describe("ehProspecto", () => {
  it("casa o número com e sem o 9 extra, com e sem 55", async () => {
    expect(await ehProspecto("5511987654321@s.whatsapp.net")).toBe(true)
    expect(await ehProspecto("551187654321@s.whatsapp.net")).toBe(true)
    expect(await ehProspecto("11987654321@s.whatsapp.net")).toBe(true)
  })
  it("telefone de prospecto cadastrado sem o 9 também casa com o jid com 9", async () => {
    mundo.prospectos = [{ telefone: "1187654321" }]
    expect(await ehProspecto("5511987654321@s.whatsapp.net")).toBe(true)
  })
  it("contato comum não é prospecto", async () => {
    expect(await ehProspecto("5521999998888@s.whatsapp.net")).toBe(false)
  })
  it("@lid ligado ao número do prospecto (apelido ou telefone da conversa)", async () => {
    expect(await ehProspecto("123@lid")).toBe(false)
    mundo.apelidos = { "123@lid": "5511987654321@s.whatsapp.net" }
    expect(await ehProspecto("123@lid")).toBe(true)
    mundo.apelidos = {}; mundo.conversas = [{ jid: "123@lid", telefone: "551187654321" }]
    expect(await ehProspecto("123@lid")).toBe(true)
  })
  it("sem prospectos ou sem número, nunca trava", async () => {
    mundo.prospectos = []
    expect(await ehProspecto("5511987654321@s.whatsapp.net")).toBe(false)
    expect(await ehProspecto("abc@lid")).toBe(false)
  })
})

describe("Modo parceiro DESLIGADO (#242): mensagem de telefone de parceiro não gera envio", () => {
  it.each(["5511987654321@s.whatsapp.net", "551187654321@s.whatsapp.net"])("%s: nada agenda, nada responde, nada sai", async jid => {
    mundo.mensagens = [msg("M1", jid)]; mundo.conversas = [conv(jid)]
    await agendar("M1")
    const p = responderSozinho("M1"); await vi.runAllTimersAsync(); await p
    await responderSozinho("M1", { atrasada: true })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mundo.parceiro).not.toHaveBeenCalled()
    expect(mundo.atender).not.toHaveBeenCalled()
    expect(mundo.evo).not.toHaveBeenCalled()
  })
  it("@lid ligado ao prospecto: também não responde", async () => {
    mundo.apelidos = { "123@lid": "5511987654321@s.whatsapp.net" }
    mundo.mensagens = [msg("M3", "123@lid")]; mundo.conversas = [conv("123@lid")]
    await agendar("M3")
    await responderSozinho("M3", { atrasada: true })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mundo.parceiro).not.toHaveBeenCalled()
  })
  it("contato comum: o fluxo atual segue, sem o modo parceiro", async () => {
    mundo.mensagens = [msg("M4", "5521999998888@s.whatsapp.net")]
    await agendar("M4")
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    await responderSozinho("M4", { atrasada: true })
    expect(mundo.parceiro).not.toHaveBeenCalled()
  })
})
