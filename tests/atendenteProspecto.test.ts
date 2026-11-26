// Atendente com gráfica de prospectos_parceiros: a que responde é atendida no modo parceria (não mais ignorada);
// excluída (opt-out ou descartada) não recebe nada; contato comum segue o fluxo de sempre.
// Supabase, IA e Evolution são simulados: nada é enviado de verdade.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

type Linha = Record<string, unknown>
const mundo = vi.hoisted(() => ({
  prospectos: [] as Linha[], conversas: [] as Linha[], mensagens: [] as Linha[], apelidos: {} as Record<string, string>,
  atender: vi.fn(async (..._a: unknown[]) => ({ ok: false as const, erro: "x", status: 500 })),
  ia: vi.fn(async (..._a: unknown[]) => ({ content: [{ type: "text", text: JSON.stringify({ texto: "Oi! Cadastro gratuito, sem exclusividade.", enviar_link: true, pergunta_pendente: null }) }] })),
  evo: vi.fn(async (..._a: unknown[]) => ({ ok: true, status: 200, corpo: {} })),
}))

vi.mock("@/app/lib/evolution", () => ({ evo: mundo.evo }))
vi.mock("@/app/lib/atendenteServidor", () => ({
  atender: mundo.atender, conversaComEstrela: vi.fn(async () => false),
  lerConfigAtendente: vi.fn(async () => ({ apiKey: "k", agenteAuto: { ligado: true }, conhecimentoAgente: [{ id: "c1", tema: "processo", texto: "Cadastro de parceiros é gratuito e leva 5 minutos.", em: "2026-11-26T00:00:00Z" }] })),
}))
vi.mock("@/app/lib/claude", () => ({ clienteClaude: () => ({ beta: { messages: { create: mundo.ia } } }), MODELO: "m", FALLBACK: {} }))
vi.mock("@/app/lib/configAtomica", () => ({ mudarConfig: vi.fn(async (f: (d: Record<string, unknown>) => unknown) => { f({}) }), lerConfigLinha: vi.fn(async () => null), lerCampos: vi.fn(async () => ({})) }))
vi.mock("@/app/lib/whatsappDados", () => ({ gravarLote: vi.fn(), deveIgnorar: vi.fn(() => false) }))
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
      let mudanca: Linha | null = null
      q.update = (c: Linha) => { mudanca = c; return q }
      q.eq = (c: string, v: unknown) => { filtros.push(r => r[c] === v); return q }
      q.order = () => q
      q.gte = () => q; q.gt = () => q; q.lt = () => q; q.ilike = () => q
      q.limit = () => q
      q.range = (a: number, b: number) => { ini = a; fim = b + 1; return q }
      const achar = () => fonte.filter(r => filtros.every(f => f(r))).slice(ini, fim)
      q.maybeSingle = async () => ({ data: achar()[0] ?? null, error: null })
      q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        const achadas = achar()
        if (mudanca) for (const r of achadas) Object.assign(r, mudanca)
        return Promise.resolve({ data: structuredClone(achadas), error: null }).then(ok, ko)
      }
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
  fetchSpy.mockClear(); mundo.atender.mockClear(); mundo.evo.mockClear()
  mundo.prospectos = [{ telefone: "(11) 98765-4321" }]
  mundo.conversas = []; mundo.apelidos = {}
  mundo.mensagens = []
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

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

const JID = "5511987654321@s.whatsapp.net"
const linhaProspecto = (extra: Linha = {}) => ({ id: 7, telefone: "(11) 98765-4321", razao_social: "Gráfica Alfa", nome_fantasia: null, etapa: "abordado", opt_out: false, historico_etapas: [], atualizado_em: "2026-11-26T10:00:00Z", ...extra })
const util = new Date("2026-11-26T15:00:00Z")   // quinta, 12h em São Paulo

describe("Atendente com gráfica do Prospector", () => {
  beforeEach(() => {
    vi.setSystemTime(util)
    mundo.prospectos = [linhaProspecto()]
    mundo.conversas = [{ jid: JID, nome: "Gráfica Alfa", telefone: "5511987654321", etiquetas: [], status_lead: null }]
    mundo.ia.mockClear()
    mundo.evo.mockImplementation(async () => ({ ok: true, status: 200, corpo: { key: { id: "ENV1" } } }))
  })
  it.each(["5511987654321@s.whatsapp.net", "551187654321@s.whatsapp.net"])("agendarResposta de %s segue o fluxo (antes era return), sem passar pelo atendimento de venda", async jid => {
    mundo.mensagens = [msg("M1", jid)]
    await agendar("M1")
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(mundo.atender).not.toHaveBeenCalled()
  })
  it("a primeira mensagem da gráfica leva a etapa para respondeu, mesmo antes da resposta", async () => {
    mundo.mensagens = [msg("M1", JID)]
    await agendar("M1")
    expect(mundo.prospectos[0].etapa).toBe("respondeu")
  })
  it("prospecto excluído (opt-out ou descartado): não agenda e não responde", async () => {
    for (const extra of [{ opt_out: true, etapa: "descartado" }, { etapa: "descartado" }]) {
      mundo.prospectos = [linhaProspecto(extra)]
      mundo.mensagens = [msg("M5", JID)]
      await agendar("M5")
      await responderSozinho("M5", { atrasada: true })
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(mundo.ia).not.toHaveBeenCalled()
      expect(mundo.evo).not.toHaveBeenCalled()
    }
  })
  it("responderSozinho: a IA responde no modo parceria (em vez de return), com o link oficial, e grava no histórico", async () => {
    mundo.mensagens = [msg("M2", JID)]
    await responderSozinho("M2", { atrasada: true })
    expect(mundo.atender).not.toHaveBeenCalled()
    expect(mundo.ia).toHaveBeenCalledTimes(1)
    const sistema = String((mundo.ia.mock.calls[0][0] as { system: string }).system)
    expect(sistema).toContain("NÃO é de venda")
    expect(sistema).toContain("Cadastro de parceiros é gratuito")
    const envio = mundo.evo.mock.calls.find(c => String(c[0]).includes("sendText"))
    expect(envio).toBeTruthy()
    const texto = JSON.parse(String((envio![1] as { body: string }).body)).text as string
    expect(texto).toContain("https://app.enyla.com.br/parceiros")
    expect(texto).not.toContain("www.")
    const hist = mundo.prospectos[0].historico_etapas as { mensagem?: { direcao: string; por?: string }; link_enviado?: boolean }[]
    expect(hist.some(h => h.mensagem?.direcao === "enviada" && h.mensagem.por === "atendente_auto" && h.link_enviado)).toBe(true)
  })
  it("@lid ligado ao prospecto: também responde", async () => {
    mundo.apelidos = { "123@lid": JID }
    mundo.conversas = [{ jid: "123@lid", nome: "Gráfica Alfa", telefone: null, etiquetas: [], status_lead: null }]
    mundo.mensagens = [msg("M3", "123@lid")]
    await responderSozinho("M3", { atrasada: true })
    expect(mundo.ia).toHaveBeenCalledTimes(1)
    expect(mundo.atender).not.toHaveBeenCalled()
  })
  it("fora da janela das 8h às 20h do Prospector: nada sai", async () => {
    vi.setSystemTime(new Date("2026-11-26T23:30:00Z"))   // 20h30 em São Paulo
    mundo.mensagens = [msg("M6", JID)]
    await responderSozinho("M6", { atrasada: true })
    expect(mundo.evo).not.toHaveBeenCalled()
  })
  it("contato comum (não prospecto): o fluxo atual segue, sem o modo parceria", async () => {
    mundo.mensagens = [msg("M4", "5521999998888@s.whatsapp.net")]
    await agendar("M4")
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    mundo.conversas = [{ jid: "5521999998888@s.whatsapp.net", nome: "Cliente", telefone: "5521999998888", etiquetas: [], status_lead: null }]
    await responderSozinho("M4", { atrasada: true })
    expect(mundo.ia).not.toHaveBeenCalled()
    expect(mundo.atender).toHaveBeenCalled()
  })
})
