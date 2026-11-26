// ordenar_fornecedor: número do cadastro de fornecedores (sem a busca do Pós-venda), recusa cliente e lead,
// entra na fila do Aprovo e não sai sem ele.
import { describe, it, expect, vi, beforeEach } from "vitest"

const e = vi.hoisted(() => ({
  conversa: [] as { id?: string; acoes?: Record<string, unknown>[] }[],
  cfg: {} as Record<string, unknown>,
  conversas: [] as Record<string, unknown>[],
  clientes: [] as Record<string, unknown>[],
  mensagens: [] as Record<string, unknown>[],
  evo: vi.fn(), gravarLote: vi.fn(),
}))
const cadeia = (rows: unknown[]) => { const q: Record<string, unknown> = { then: (r: (v: unknown) => void) => r({ data: rows }) }; for (const m of ["select", "order", "limit", "eq", "in"]) q[m] = () => q; return q }
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: (t: string) => cadeia(t === "whatsapp_conversas" ? e.conversas : t === "Cliente" ? e.clientes : t === "whatsapp_mensagens" ? e.mensagens : []) } }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async (c: string[]) => Object.fromEntries(c.map(k => [k, e.cfg[k]]))),
  mudarConfig: vi.fn(async (f: (d: Record<string, unknown>) => Record<string, unknown> | null) => { const r = f(e.cfg); if (r) Object.assign(e.cfg, r); return e.cfg }),
}))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => e.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown) => { e.conversa = m as never }) }))
vi.mock("@/app/lib/evolution", () => ({ evo: e.evo }))
vi.mock("@/app/lib/whatsappDados", () => ({ gravarLote: e.gravarLote }))
vi.mock("@/app/lib/enviarCliente", () => ({ enviarAoCliente: vi.fn(async () => { throw new Error("busca de cliente não pode ser usada") }), destinoDoCliente: vi.fn() }))
vi.mock("@/app/lib/claude", () => ({ clienteClaude: vi.fn(), MODELO: "m" }))
vi.mock("@/app/lib/gastosServidor", () => ({ registrarUsoIA: vi.fn() }))
vi.mock("@/app/lib/reuniaoDiretoria", () => ({ coletarContexto: vi.fn() }))

import { ordenarFornecedor, enviarAoFornecedor, lerConversaFornecedor, type MensagemFornecedor } from "@/app/lib/fornecedorCanal"
import { responderAcao } from "@/app/lib/conversaDiretor"
import { cancelarOrdem } from "@/app/lib/cancelarOrdem"

let n = 0
const novoId = () => `id${++n}`
const forn = { id: "f1", nome: "Arte Villa", categoria: "arte", telefone: "(11) 98888-7777", ativo: true }

beforeEach(() => {
  n = 0
  e.conversa = []; e.conversas = []; e.clientes = []; e.mensagens = []
  e.cfg = { fornecedores: [forn] }
  e.evo.mockReset(); e.gravarLote.mockReset()
  e.evo.mockResolvedValue({ ok: true, status: 201, corpo: { key: { id: "W1", remoteJid: "x" } } })
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co"
})
const ordem = (extra: Record<string, unknown> = {}) => ordenarFornecedor("cco", { fornecedor: "f1", pedido: "DIG-0159", texto: "Ajustar a arte", ...extra }, novoId)

describe("ordenar_fornecedor", () => {
  it("entra na fila do Aprovo, marcada fornecedor, sem enviar nada", async () => {
    const r = await ordem()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.destino).toBe("fila_aprovo")
    expect(r.acao).toMatchObject({ tipo: "mensagem", status: "aguardando", fornecedorId: "f1", pedido: "DIG-0159", cliente: "Arte Villa" })
    expect(r.acao.texto).toContain("DIG-0159")
    expect(e.evo).not.toHaveBeenCalled()
    expect((e.cfg.canalFornecedor as unknown[]).length).toBe(1)
  })
  it("resolve o número pelo cadastro mesmo sem conversa (sem busca de cliente)", async () => {
    const r = await ordem()
    expect(r.ok && r.acao.jid).toBe("5511988887777@s.whatsapp.net")
  })
  it("sem telefone no cadastro, usa a conversa ligada ao fornecedor", async () => {
    e.cfg = { fornecedores: [{ ...forn, telefone: undefined }], vinculosWhatsapp: { "5511977776666@s.whatsapp.net": "Arte Villa" } }
    e.conversas = [{ jid: "5511977776666@s.whatsapp.net", nome: "Villa", telefone: "5511977776666", etiquetas: [], status_lead: null }]
    const r = await ordem()
    expect(r.ok && r.acao.jid).toBe("5511977776666@s.whatsapp.net")
  })
  it("sem telefone e sem conversa: 404 claro", async () => {
    e.cfg = { fornecedores: [{ ...forn, telefone: undefined }] }
    const r = await ordem()
    expect(r).toMatchObject({ ok: false, status: 404 })
  })
  it("recusa número de cliente", async () => {
    e.clientes = [{ nome: "Maria", telefone: "11 98888-7777" }]
    expect(await ordem()).toMatchObject({ ok: false, status: 409 })
    expect(e.conversa).toEqual([])
  })
  it("recusa número de lead", async () => {
    e.conversas = [{ jid: "5511988887777@s.whatsapp.net", nome: "Lead", telefone: "5511988887777", etiquetas: ["MQL"], status_lead: null }]
    expect(await ordem()).toMatchObject({ ok: false, status: 409 })
  })
  it("recusa conversa ligada a cliente", async () => {
    e.conversas = [{ jid: "5511988887777@s.whatsapp.net", nome: "Maria", telefone: "5511988887777", etiquetas: [], status_lead: null }]
    e.cfg = { fornecedores: [forn], vinculosWhatsapp: { "5511988887777@s.whatsapp.net": "Maria Perfumes" } }
    expect(await ordem()).toMatchObject({ ok: false, status: 409 })
  })
  it("fornecedor fora do cadastro: 404; campos faltando: 400", async () => {
    expect(await ordem({ fornecedor: "zzz" })).toMatchObject({ ok: false, status: 404 })
    expect(await ordem({ pedido: "" })).toMatchObject({ ok: false, status: 400 })
    expect(await ordem({ texto: " " })).toMatchObject({ ok: false, status: 400 })
  })
  it("anexo só de arquivo do sistema", async () => {
    expect(await ordem({ anexos: [{ nome: "a.pdf", url: "https://outro.com/a.pdf" }] })).toMatchObject({ ok: false, status: 400 })
    const r = await ordem({ anexos: [{ nome: "a.pdf", url: "https://proj.supabase.co/storage/a.pdf", mime: "application/pdf" }] })
    expect(r.ok && r.acao.anexos?.length).toBe(1)
  })
  it("limite de 20 esperando o Aprovo", async () => {
    e.conversa = [{ acoes: Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, tipo: "mensagem", status: "aguardando" })) }]
    expect(await ordem()).toMatchObject({ ok: false, status: 429 })
  })
  it("pode ser cancelada e nada é enviado", async () => {
    const r = await ordem()
    if (!r.ok) throw new Error("falhou")
    e.conversa = [{ acoes: [r.acao as unknown as Record<string, unknown>] }]
    const c = await cancelarOrdem("cco", { id: r.id })
    expect(c.status).toBe(200)
    expect(e.evo).not.toHaveBeenCalled()
  })
})

describe("envio só depois do Aprovo", () => {
  it("enviarAoFornecedor manda texto e anexo, grava no histórico e o horário", async () => {
    const r = await ordem({ anexos: [{ nome: "a.pdf", url: "https://proj.supabase.co/a.pdf", mime: "application/pdf" }] })
    if (!r.ok) throw new Error("falhou")
    const env = await enviarAoFornecedor(r.acao as MensagemFornecedor)
    expect(env.ok).toBe(true)
    expect(e.evo).toHaveBeenCalledTimes(2)
    expect(e.gravarLote).toHaveBeenCalledTimes(2)
    expect((e.cfg.canalFornecedor as { enviadoEm?: string }[])[0].enviadoEm).toBeTruthy()
  })
  it("enviar de novo confere cliente/lead: número de cliente não sai", async () => {
    const r = await ordem()
    if (!r.ok) throw new Error("falhou")
    e.clientes = [{ nome: "Maria", telefone: "11988887777" }]
    expect((await enviarAoFornecedor(r.acao as MensagemFornecedor)).ok).toBe(false)
    expect(e.evo).not.toHaveBeenCalled()
  })
})

describe("Aprovo do Felipe", () => {
  it("sem o Aprovo nada sai; ao aprovar sai pelo canal do fornecedor (não pela busca de cliente)", async () => {
    const r = await ordem()
    if (!r.ok) throw new Error("falhou")
    e.conversa = [{ acoes: [r.acao as unknown as Record<string, unknown>] }]
    expect(e.evo).not.toHaveBeenCalled()
    await responderAcao("cco", r.id, "aprovo")
    expect(e.evo).toHaveBeenCalledTimes(1)
    expect((e.conversa[0].acoes as { status: string }[])[0].status).toBe("enviado")
  })
  it("descartar não envia", async () => {
    const r = await ordem()
    if (!r.ok) throw new Error("falhou")
    e.conversa = [{ acoes: [r.acao as unknown as Record<string, unknown>] }]
    await responderAcao("cco", r.id, "descartar")
    expect(e.evo).not.toHaveBeenCalled()
  })
})

describe("fornecedor_conversa", () => {
  it("devolve as últimas mensagens e as ordens", async () => {
    await ordem()
    e.mensagens = [{ from_me: false, corpo: "ok, ajusto", tipo: "text", ts: 1764000000 }]
    const l = await lerConversaFornecedor("f1")
    expect(l.status).toBe(200)
    expect((l.corpo.mensagens as { texto: string }[])[0].texto).toBe("ok, ajusto")
    expect((l.corpo.ordens as unknown[]).length).toBe(1)
  })
  it("fornecedor desconhecido: 404", async () => { expect((await lerConversaFornecedor("zz")).status).toBe(404) })
})
