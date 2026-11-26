// Porta externa: mensagem_fornecedor (só COO). Dados fictícios.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({
  cfg: {} as Record<string, unknown>, diretor: "coo" as string, conversa: [] as unknown[],
  clientes: [] as { telefone: string }[], envios: [] as unknown[], evoOk: true, gravados: 0,
}))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async (campos: string[]) => Object.fromEntries(campos.filter(c => estado.cfg[c] !== undefined).map(c => [c, structuredClone(estado.cfg[c])]))),
  mudarConfig: vi.fn(async (f: (d: Record<string, unknown>) => Record<string, unknown> | null) => {
    const m = f(structuredClone(estado.cfg)); if (m) estado.cfg = { ...estado.cfg, ...m }; return estado.cfg
  }),
}))
vi.mock("@/app/lib/acessoExterno", () => ({
  LIMITE_POR_HORA: 120,
  conferirChave: vi.fn(async () => ({ ok: true, diretor: estado.diretor })),
}))
vi.mock("@/app/lib/diretoriaServidor", () => ({
  lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown[]) => { estado.conversa = m }), lerPlanos: vi.fn(),
}))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn(), renovarFoto: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: { from: () => ({ select: async () => ({ data: estado.clientes, error: null }) }) },
}))
vi.mock("@/app/lib/evolution", () => ({
  evo: vi.fn(async (_c: string, init: RequestInit) => {
    if (!estado.evoOk) return { ok: false, status: 500, corpo: null }
    estado.envios.push(JSON.parse(String(init.body)))
    return { ok: true, status: 200, corpo: { key: { id: "m1", remoteJid: "x", fromMe: true } } }
  }),
}))
vi.mock("@/app/lib/whatsappDados", () => ({ gravarLote: vi.fn(async () => { estado.gravados++ }) }))

import { POST } from "@/app/api/externo/route"
import { mensagemFornecedorExterno } from "@/app/lib/mensagemFornecedorExterno"
import { NextRequest } from "next/server"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))
const ordem = { acao: "mensagem_fornecedor", fornecedor: "F1", texto: "Qual o status do lote de teste?" }
const meioDia = new Date("2026-11-26T15:00:00Z")   // 12h em Brasília

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(meioDia)
  estado.diretor = "coo"; estado.conversa = []; estado.clientes = []; estado.envios = []; estado.evoOk = true; estado.gravados = 0
  estado.cfg = { fornecedores: [
    { id: "F1", nome: "Gráfica Fictícia", categoria: "x", telefone: "(11) 91111-2222", ativo: true },
    { id: "F2", nome: "Inativa Fictícia", categoria: "x", telefone: "11 93333-4444", ativo: false },
    { id: "F3", nome: "Sem Celular", categoria: "x", telefone: "1133334444", ativo: true },
  ] }
})

describe("mensagem_fornecedor", () => {
  it("envia o texto exato ao telefone do cadastro e registra quem, texto e hora", async () => {
    const r = await pedir(ordem); const j = await r.json()
    expect(r.status).toBe(200)
    expect(estado.envios).toEqual([{ number: "5511911112222", text: "Qual o status do lote de teste?" }])
    const h = estado.cfg.mensagensFornecedor as Record<string, unknown>[]
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ fornecedorId: "F1", por: "coo", texto: "Qual o status do lote de teste?", em: meioDia.toISOString(), status: "enviado" })
    expect(j.registro.status).toBe("enviado"); expect(estado.gravados).toBe(1); expect(estado.conversa).toHaveLength(1)
  })
  it("só o COO", async () => {
    estado.diretor = "cco"
    const r = await pedir(ordem)
    expect(r.status).toBe(403); expect(estado.envios).toEqual([]); expect(estado.cfg.mensagensFornecedor).toBeUndefined()
  })
  it("recusa telefone/jid na ordem: o número vem só do cadastro", async () => {
    for (const extra of [{ telefone: "11999990000" }, { jid: "5511999990000@s.whatsapp.net" }, { cliente: "DIG-0001" }]) {
      expect((await pedir({ ...ordem, ...extra })).status).toBe(400)
    }
    expect(estado.envios).toEqual([])
  })
  it("recusa telefone de cliente (cadastro Cliente, em outro formato) e não envia nada", async () => {
    estado.clientes = [{ telefone: "+55 11 91111-2222" }]
    const r = await pedir(ordem)
    expect(r.status).toBe(403); expect(estado.envios).toEqual([]); expect(estado.cfg.mensagensFornecedor).toBeUndefined()
  })
  it("recusa telefone que é de um pedido Digital", async () => {
    estado.cfg.pedidosDigitais = [{ id: "DIG-0001", jid: "5511911112222@s.whatsapp.net" }]
    expect((await pedir(ordem)).status).toBe(403); expect(estado.envios).toEqual([])
  })
  it("fornecedor inativo, inexistente ou sem celular: nada sai", async () => {
    expect((await pedir({ ...ordem, fornecedor: "F2" })).status).toBe(404)
    expect((await pedir({ ...ordem, fornecedor: "XX" })).status).toBe(404)
    expect((await pedir({ ...ordem, fornecedor: "F3" })).status).toBe(400)
    expect(estado.envios).toEqual([])
  })
  it("fora da janela 8h–20h: 409 e nada sai; 8h e 19h59 passam, 20h não", async () => {
    const em = (iso: string) => mensagemFornecedorExterno("coo", { ...ordem, texto: iso }, new Date(iso))
    expect((await em("2026-11-26T10:59:00Z")).ok).toBe(false)   // 7h59
    expect((await em("2026-11-26T23:00:00Z")).ok).toBe(false)   // 20h
    expect(estado.envios).toEqual([])
    expect((await em("2026-11-26T11:00:00Z")).ok).toBe(true)    // 8h
    expect((await em("2026-11-26T22:59:00Z")).ok).toBe(true)    // 19h59
  })
  it("trava de duplicado: mesmo texto em 10 min é 409; texto diferente passa; depois de 10 min passa", async () => {
    expect((await pedir(ordem)).status).toBe(200)
    const dup = await pedir(ordem)
    expect(dup.status).toBe(409); expect(estado.envios).toHaveLength(1)
    expect((await pedir({ ...ordem, texto: "Outro texto" })).status).toBe(200)
    vi.setSystemTime(new Date(meioDia.getTime() + 11 * 60_000))
    expect((await pedir(ordem)).status).toBe(200); expect(estado.envios).toHaveLength(3)
  })
  it("envio que falhou fica no histórico e não bloqueia a nova tentativa; histórico só cresce", async () => {
    estado.evoOk = false
    expect((await pedir(ordem)).status).toBe(502)
    expect((estado.cfg.mensagensFornecedor as { status: string }[]).map(x => x.status)).toEqual(["falhou"])
    estado.evoOk = true
    expect((await pedir(ordem)).status).toBe(200)
    expect((estado.cfg.mensagensFornecedor as { status: string }[]).map(x => x.status)).toEqual(["falhou", "enviado"])
  })
})
