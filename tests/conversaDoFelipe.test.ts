// Trava "conversa do Felipe" (#150): nenhum agente nem ordem direta manda mensagem em conversa dele.
// Supabase, IA e Evolution são simulados: nada é enviado de verdade.
import { describe, it, expect, vi, beforeEach } from "vitest"
import { conversaDoFelipe } from "@/app/lib/conversaDoFelipe"

type Linha = Record<string, unknown>
const mundo = vi.hoisted(() => ({
  mensagens: [] as Linha[], tratadas: [] as Linha[], conversas: [] as Linha[],
  atender: vi.fn(async (..._a: unknown[]) => ({ ok: false as const, erro: "x", status: 500 })),
  evo: vi.fn(async (..._a: unknown[]) => ({ ok: true, status: 200, corpo: { key: { id: "3EB0NOVA" } } })),
  registros: [] as Linha[],
}))

vi.mock("@/app/lib/evolution", () => ({ evo: mundo.evo }))
vi.mock("@/app/lib/atendenteServidor", () => ({
  atender: mundo.atender,
  lerConfigAtendente: vi.fn(async () => ({ agenteAuto: { ligado: true }, agenteIds: [] })),
}))
vi.mock("@/app/lib/configAtomica", () => ({
  mudarConfig: vi.fn(async (f: (d: Linha) => unknown) => { f({}) }), lerConfigLinha: vi.fn(async () => ({})),
}))
vi.mock("@/app/lib/registroAgente", () => ({
  lerRegistros: vi.fn(async () => null), gravarRegistro: vi.fn(async (r: Linha) => { mundo.registros.push(r); return true }), lerIdsAgente: vi.fn(async () => ["AG1"]),
  guardarIdAgente: vi.fn(async () => true), reservarTratada: vi.fn(async () => true), liberarTratada: vi.fn(), temTabelas: vi.fn(async () => true),
}))
vi.mock("@/app/lib/prospectorTrava", () => ({ ehProspecto: vi.fn(async () => false) }))
vi.mock("@/app/lib/whatsappDados", () => ({ gravarLote: vi.fn(), deveIgnorar: () => false }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (tabela: string) => {
      const fonte = tabela === "whatsapp_mensagens" ? mundo.mensagens : tabela === "agente_tratadas" ? mundo.tratadas : mundo.conversas
      const filtros: ((r: Linha) => boolean)[] = []
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (c: string, v: unknown) => { filtros.push(r => r[c] === v); return q }
      q.gte = () => q
      q.in = () => q
      q.order = () => q
      q.limit = () => q
      q.or = (expr: string) => {
        // "id.eq.assumida|JID,id.like.perto|JID|*"
        const [eq, like] = expr.split(",")
        const exato = eq.replace("id.eq.", ""), prefixo = like.replace("id.like.", "").replace("*", "")
        filtros.push(r => r.id === exato || String(r.id).startsWith(prefixo)); return q
      }
      const achar = () => fonte.filter(r => filtros.every(f => f(r)))
      q.maybeSingle = async () => ({ data: achar()[0] ?? null, error: null })
      q.upsert = () => q
      q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: structuredClone(achar()), error: null }).then(ok, ko)
      return q
    },
  },
}))

const JID = "5511999990000@s.whatsapp.net"
const AGORA = new Date("2026-11-25T12:00:00Z").getTime()
const h = (horas: number) => new Date(AGORA - horas * 3_600_000).toISOString()
const m = (id: string, horas: number, corpo = "oi") => ({ id, jid: JID, from_me: true, ts: h(horas), corpo, tipo: "conversation" })
const base = { idsDoAgente: ["AG1"], estrela: false, assumida: false, agora: AGORA }

describe("conversaDoFelipe (pura)", () => {
  it("Felipe escreveu há 2 h", () => {
    expect(conversaDoFelipe({ ...base, mensagensFromMe: [m("2A111", 2)] })).toEqual({ doFelipe: true, motivo: "escreveu nas últimas 24 h" })
  })
  it("Felipe escreveu há 30 h e foi o último from_me", () => {
    expect(conversaDoFelipe({ ...base, mensagensFromMe: [m("2A111", 30)] })).toEqual({ doFelipe: true, motivo: "foi o último a falar" })
  })
  it("Felipe há 30 h e o agente escreveu depois: não é dele", () => {
    expect(conversaDoFelipe({ ...base, mensagensFromMe: [m("2A111", 30), m("AG1", 5)] }).doFelipe).toBe(false)
  })
  it("só agente e automáticas do WhatsApp Business", () => {
    const auto = { ...m("3EB0X", 1, "Estou fora do horário de atendimento"), tipo: "conversation" }
    const botoes = { ...m("3EB0Y", 2, ""), tipo: "interactiveMessage" }
    expect(conversaDoFelipe({ ...base, mensagensFromMe: [m("AG1", 3), auto, botoes] })).toEqual({ doFelipe: false, motivo: null })
  })
  it("estrela", () => {
    expect(conversaDoFelipe({ ...base, estrela: true, mensagensFromMe: [m("AG1", 3)] })).toEqual({ doFelipe: true, motivo: "estrela" })
  })
  it("assumida vence tudo, mesmo com o Felipe tendo escrito há 1 h", () => {
    expect(conversaDoFelipe({ ...base, assumida: true, estrela: true, mensagensFromMe: [m("2A111", 1)] }).doFelipe).toBe(false)
  })
})

describe("trava nos envios", () => {
  beforeEach(() => {
    mundo.mensagens.length = 0; mundo.tratadas.length = 0; mundo.conversas.length = 0; mundo.registros.length = 0
    mundo.evo.mockClear(); mundo.atender.mockClear()
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(AGORA)
  })
  const conv = { jid: JID, nome: "Cliente", telefone: "5511999990000", etiquetas: null, status_lead: null }

  it("enviar numa conversa do Felipe não chama a Evolution; com peloFelipe envia", async () => {
    mundo.mensagens.push(m("2A111", 2))
    const { enviar } = await import("@/app/lib/agenteAuto")
    const r = await enviar(conv, "oi")
    expect(r.ids).toEqual([])
    expect(r.erro).toMatch(/conversa do Felipe/)
    expect(mundo.evo).not.toHaveBeenCalled()
    const ok = await enviar(conv, "oi", undefined, { peloFelipe: true })
    expect(ok.ids).toEqual(["3EB0NOVA"])
    expect(mundo.evo).toHaveBeenCalled()
  })
  it("enviar em conversa sem Felipe e o chat Você seguem", async () => {
    mundo.mensagens.push(m("AG1", 2))
    const { enviar } = await import("@/app/lib/agenteAuto")
    expect((await enviar(conv, "oi")).ids).toEqual(["3EB0NOVA"])
    mundo.mensagens.push(m("2A111", 1))
    expect((await enviar({ ...conv, nome: "Você" }, "teste")).ids).toEqual(["3EB0NOVA"])
  })
  it("enviarAoLead numa conversa do Felipe devolve fila", async () => {
    mundo.mensagens.push(m("2A111", 40))
    mundo.conversas.push({ jid: JID })
    const { enviarAoLead } = await import("@/app/lib/ordemDireta")
    const r = await enviarAoLead({ diretor: "cco", func: { id: "x", nome: "X" }, lead: { jid: JID, nome: "Cliente" }, texto: "Oi, tudo bem?", novoId: () => "a1" })
    expect(r).toMatchObject({ fila: true, motivo: "conversa do Felipe: espera o Aprovo" })
    expect(mundo.evo).not.toHaveBeenCalled()
  })
  it("responderSozinho atrasado numa conversa do Felipe não envia e registra o motivo", async () => {
    mundo.mensagens.push({ id: "CLI1", jid: JID, from_me: false, ts: h(1), corpo: "oi", tipo: "conversation", criado_em: h(1) }, m("2A111", 3))
    mundo.conversas.push({ jid: JID, nome: "Cliente", telefone: "5511999990000", etiquetas: ["Digital"], status_lead: null })
    const { responderSozinho } = await import("@/app/lib/agenteAuto")
    await responderSozinho("CLI1", { atrasada: true })
    expect(mundo.atender).not.toHaveBeenCalled()
    expect(mundo.evo).not.toHaveBeenCalled()
    expect(mundo.registros.some(r => r.enviou === false && /conversa do Felipe \(escreveu nas últimas 24 h\)/.test(String(r.motivo)))).toBe(true)
  })
})
