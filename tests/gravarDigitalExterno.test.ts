// Porta externa, ação gravar_digital: só situacaoArte e/ou prazoEntrega, motivo obrigatório, com autor/data/motivo. Dados fictícios.
import { describe, it, expect, vi, beforeEach } from "vitest"

type P = Record<string, unknown> & { id: string }
const estado = vi.hoisted(() => ({ diretor: "coo", conversa: [] as unknown[], pedidos: [] as unknown[], gravacoes: 0 }))
vi.mock("@/app/lib/acessoExterno", () => ({ LIMITE_POR_HORA: 120, conferirChave: vi.fn(async () => ({ ok: true, diretor: estado.diretor })) }))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown[]) => { estado.conversa = m }), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn(), renovarFoto: vi.fn(async () => {}) }))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => ({})), mudarConfig: vi.fn() }))
vi.mock("@/app/lib/digitalServidor", () => ({
  lerPedido: vi.fn(async (id: string) => ({ pedido: (estado.pedidos as P[]).find(p => p.id === id) ?? null, cfg: {} })),
  gravarPedido: vi.fn(async (id: string, mudar: (p: P) => P | null) => {
    let novo: P | null = null
    estado.pedidos = (estado.pedidos as P[]).map(p => { if (p.id !== id) return p; const n = mudar(p); if (n) { novo = n; estado.gravacoes++ } return n ?? p })
    return novo
  }),
}))
vi.mock("next/server", async orig => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))

import { POST } from "@/app/api/externo/route"
import { NextRequest } from "next/server"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))
const original = { id: "DIG-0001", nome: "Cliente Fictício", status: "producao", total: 1000, sinal: 500, restante: 500, pagamento: { txId: "asaas:x", valor: 500, data: "2026-11-10" }, custo: 100 }

beforeEach(() => { estado.diretor = "coo"; estado.conversa = []; estado.gravacoes = 0; estado.pedidos = [{ ...original }] })

describe("POST acao=gravar_digital", () => {
  it("grava os campos, registra autor/data/motivo e não mexe no resto do pedido", async () => {
    const r = await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "aprovada", prazoEntrega: "2026-11-26", motivo: "Felipe, 25/11" })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, id: "DIG-0001", situacaoArte: "aprovada", prazoEntrega: "2026-11-26" })
    const p = (estado.pedidos as P[])[0] as P & { edicaoAcomp: { por: string; em: string; motivo: string } }
    expect(p.edicaoAcomp).toMatchObject({ motivo: "Felipe, 25/11", por: expect.any(String) })
    expect(p.edicaoAcomp.em).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
    const { situacaoArte, prazoEntrega, edicaoAcomp, ...resto } = p
    void situacaoArte; void prazoEntrega; void edicaoAcomp
    expect(resto).toEqual(original)
  })
  it("grava só um dos campos e deixa o outro como estava", async () => {
    const r = await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "enviada", motivo: "x" })
    expect(await r.json()).toMatchObject({ situacaoArte: "enviada", prazoEntrega: null })
  })
  it("recusa sem motivo, vazio ou com mais de 300 caracteres", async () => {
    for (const motivo of [undefined, "", "  ", "a".repeat(301)])
      expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "aprovada", motivo })).status).toBe(400)
    expect(estado.gravacoes).toBe(0)
  })
  it("recusa id inexistente (404), sem campos, situação ou data inválida", async () => {
    expect((await pedir({ acao: "gravar_digital", id: "DIG-9999", situacaoArte: "aprovada", motivo: "x" })).status).toBe(404)
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", motivo: "x" })).status).toBe(400)
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "quase", motivo: "x" })).status).toBe(400)
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", prazoEntrega: "26/11/2026", motivo: "x" })).status).toBe(400)
    expect((await pedir({ acao: "gravar_digital", id: "ORC-1", situacaoArte: "aprovada", motivo: "x" })).status).toBe(400)
    expect(estado.gravacoes).toBe(0)
  })
  it("prazoEntrega vazio limpa o prazo", async () => {
    estado.pedidos = [{ ...original, prazoEntrega: "2026-11-26" }]
    const r = await pedir({ acao: "gravar_digital", id: "DIG-0001", prazoEntrega: "", motivo: "voltou a confirmar" })
    expect((await r.json()).prazoEntrega).toBeNull()
  })
  it("qualquer diretor pode", async () => {
    estado.diretor = "cmo"
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "aprovada", motivo: "x" })).status).toBe(200)
  })
})
