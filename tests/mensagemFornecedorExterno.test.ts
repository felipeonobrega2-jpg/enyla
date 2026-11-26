// Canal COO → fornecedor em operação. Dados fictícios.
import { describe, it, expect, vi, beforeEach } from "vitest"

const e = vi.hoisted(() => ({
  cfg: {} as Record<string, unknown>, clientes: [] as { telefone: string }[], erroCliente: false,
  nivel: { nivel: "lead", jaCliente: false, motivo: "" } as { nivel: string; jaCliente: boolean; motivo: string },
  evo: vi.fn(),
}))
vi.mock("@/app/lib/configAtomica", () => ({
  mudarConfig: vi.fn(async (f: (d: Record<string, unknown>) => Record<string, unknown> | null) => { const r = f(e.cfg); if (r) Object.assign(e.cfg, r); return e.cfg }),
}))
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: () => ({ select: async () => e.erroCliente ? { data: null, error: { message: "x" } } : { data: e.clientes, error: null } }) } }))
vi.mock("@/app/lib/nivelCliente", () => ({ nivelDoDestinatario: vi.fn(async () => e.nivel) }))
vi.mock("@/app/lib/evolution", () => ({ evo: e.evo }))

import { mensagemFornecedorExterno } from "@/app/lib/mensagemFornecedorExterno"

const util = new Date("2026-11-26T15:00:00Z")      // 12h em Brasília
const noite = new Date("2026-11-26T23:30:00Z")     // 20h30
const madrugada = new Date("2026-11-26T10:30:00Z") // 7h30
const ordem = (x: Record<string, unknown> = {}) => ({ fornecedor: "f1", texto: "Bom dia, qual o status do lote 123?", ...x })
const hist = () => (e.cfg.mensagensFornecedor ?? []) as { status: string; por: string; texto: string }[]

beforeEach(() => {
  e.cfg = { fornecedores: [{ id: "f1", nome: "Gráfica Teste", categoria: "grafica", telefone: "(11) 98888-0001", ativo: true }], pedidosDigitais: [] }
  e.clientes = []; e.erroCliente = false; e.nivel = { nivel: "lead", jaCliente: false, motivo: "" }
  e.evo.mockReset(); e.evo.mockResolvedValue({ ok: true, status: 201, corpo: { key: { id: "W1" } } })
})

describe("mensagem_fornecedor", () => {
  it("envia o texto exato ao telefone do cadastro e registra quem, texto e hora", async () => {
    const r = await mensagemFornecedorExterno("coo", ordem(), util)
    expect(r.ok).toBe(true)
    const corpo = JSON.parse(e.evo.mock.calls[0][1].body)
    expect(corpo).toEqual({ number: "5511988880001", text: "Bom dia, qual o status do lote 123?" })
    expect(hist()).toHaveLength(1)
    expect(hist()[0]).toMatchObject({ por: "coo", texto: "Bom dia, qual o status do lote 123?", status: "enviado" })
  })
  it("só o COO", async () => {
    const r = await mensagemFornecedorExterno("cto", ordem(), util)
    expect(r).toMatchObject({ ok: false, status: 403 }); expect(e.evo).not.toHaveBeenCalled()
  })
  it("recusa telefone de cliente (cadastro de clientes)", async () => {
    e.clientes = [{ telefone: "11 98888-0001" }]
    const r = await mensagemFornecedorExterno("coo", ordem(), util)
    expect(r).toMatchObject({ ok: false, status: 403 }); expect(e.evo).not.toHaveBeenCalled(); expect(hist()).toHaveLength(0)
  })
  it("recusa telefone de pedido Digital e de conversa já cliente", async () => {
    e.cfg.pedidosDigitais = [{ jid: "5511988880001@s.whatsapp.net" }]
    expect(await mensagemFornecedorExterno("coo", ordem(), util)).toMatchObject({ ok: false, status: 403 })
    e.cfg.pedidosDigitais = []; e.nivel = { nivel: "B", jaCliente: true, motivo: "" }
    expect(await mensagemFornecedorExterno("coo", ordem(), util)).toMatchObject({ ok: false, status: 403 })
    expect(e.evo).not.toHaveBeenCalled()
  })
  it("recusa quando a leitura falha (na dúvida, é cliente)", async () => {
    e.erroCliente = true
    expect(await mensagemFornecedorExterno("coo", ordem(), util)).toMatchObject({ ok: false, status: 403 })
    expect(e.evo).not.toHaveBeenCalled()
  })
  it("não aceita telefone, jid nem número na ordem", async () => {
    for (const k of ["telefone", "jid", "numero", "number"]) expect(await mensagemFornecedorExterno("coo", ordem({ [k]: "5511900000000" }), util)).toMatchObject({ ok: false, status: 400 })
    expect(e.evo).not.toHaveBeenCalled()
  })
  it("fornecedor inexistente, inativo ou sem celular: nada sai", async () => {
    expect(await mensagemFornecedorExterno("coo", ordem({ fornecedor: "zz" }), util)).toMatchObject({ ok: false, status: 404 })
    ;(e.cfg.fornecedores as { ativo: boolean }[])[0].ativo = false
    expect(await mensagemFornecedorExterno("coo", ordem(), util)).toMatchObject({ ok: false, status: 409 })
    ;(e.cfg.fornecedores as { ativo: boolean; telefone: string }[])[0].ativo = true
    ;(e.cfg.fornecedores as { telefone: string }[])[0].telefone = "1133334444"
    expect(await mensagemFornecedorExterno("coo", ordem(), util)).toMatchObject({ ok: false, status: 400 })
    expect(e.evo).not.toHaveBeenCalled()
  })
  it("respeita a janela das 8h às 20h", async () => {
    for (const quando of [noite, madrugada]) expect(await mensagemFornecedorExterno("coo", ordem(), quando)).toMatchObject({ ok: false, status: 409 })
    expect(e.evo).not.toHaveBeenCalled(); expect(hist()).toHaveLength(0)
  })
  it("trava duplicado: mesmo texto em 10 min não sai de novo; depois sai", async () => {
    expect((await mensagemFornecedorExterno("coo", ordem(), util)).ok).toBe(true)
    expect(await mensagemFornecedorExterno("coo", ordem({ texto: "  bom dia, qual o status do lote 123?  " }), new Date(util.getTime() + 60_000))).toMatchObject({ ok: false, status: 409 })
    expect(e.evo).toHaveBeenCalledTimes(1)
    expect((await mensagemFornecedorExterno("coo", ordem(), new Date(util.getTime() + 11 * 60_000))).ok).toBe(true)
    expect(e.evo).toHaveBeenCalledTimes(2)
  })
  it("falha do WhatsApp fica registrada e não trava a nova tentativa", async () => {
    e.evo.mockResolvedValueOnce({ ok: false, status: 500, corpo: null })
    expect(await mensagemFornecedorExterno("coo", ordem(), util)).toMatchObject({ ok: false, status: 502 })
    expect(hist()[0].status).toBe("falhou")
    expect((await mensagemFornecedorExterno("coo", ordem(), new Date(util.getTime() + 1000))).ok).toBe(true)
    expect(hist().map(h => h.status)).toEqual(["falhou", "enviado"])
  })
})
