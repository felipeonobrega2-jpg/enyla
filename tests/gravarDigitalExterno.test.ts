// Porta externa, ação gravar_digital: só situacaoArte e/ou prazoEntrega, motivo obrigatório, registra autor/data/motivo.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({ diretor: "coo", conversa: [] as unknown[], pedidos: [] as Record<string, unknown>[], gravacoes: 0 }))
vi.mock("@/app/lib/acessoExterno", () => ({ LIMITE_POR_HORA: 120, conferirChave: vi.fn(async () => ({ ok: true, diretor: estado.diretor })) }))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn(), renovarFoto: vi.fn(async () => {}) }))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => ({})), mudarConfig: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: () => { throw new Error("sem banco real") } } }))
vi.mock("@/app/lib/digitalServidor", () => ({
  lerPedido: vi.fn(async (id: string) => ({ pedido: estado.pedidos.find(p => p.id === id) ?? null, cfg: {} })),
  gravarPedido: vi.fn(async (id: string, mudar: (p: Record<string, unknown>) => Record<string, unknown> | null) => {
    const i = estado.pedidos.findIndex(p => p.id === id); const n = mudar(estado.pedidos[i]); if (n) { estado.pedidos[i] = n; estado.gravacoes++ }; return n
  }),
}))
vi.mock("next/server", async orig => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))

import { POST, GET } from "@/app/api/externo/route"
import { NextRequest } from "next/server"
const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))

beforeEach(() => {
  estado.diretor = "coo"; estado.gravacoes = 0
  estado.pedidos = [{ id: "DIG-0001", status: "producao", total: 1000, sinal: 500.13, custo: 300, pagamento: { txId: "asaas:p", valor: 500.13, data: "2026-11-02" } }]
})

describe("POST acao=gravar_digital", () => {
  it("grava só os campos pedidos e registra autor, data (Brasília) e motivo", async () => {
    const r = await pedir({ acao: "gravar_digital", id: "DIG-0001", prazoEntrega: "2026-11-26", motivo: "Felipe, 25/11" })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, id: "DIG-0001", situacaoArte: null, prazoEntrega: "2026-11-26" })
    const p = estado.pedidos[0] as Record<string, unknown> & { gravadoArtePrazo: { por: string; em: string; motivo: string }[] }
    expect(p).toMatchObject({ status: "producao", total: 1000, sinal: 500.13, custo: 300, prazoEntrega: "2026-11-26" })
    expect(p.situacaoArte).toBeUndefined()
    expect(p.gravadoArtePrazo).toHaveLength(1)
    expect(p.gravadoArtePrazo[0]).toMatchObject({ motivo: "Felipe, 25/11", por: expect.any(String) })
    expect(p.gravadoArtePrazo[0].em).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })
  it("grava a situação da arte e acumula o histórico; qualquer diretor", async () => {
    estado.diretor = "cmo"
    const r = await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "aprovada", motivo: "cliente aprovou" })
    expect((await r.json()).situacaoArte).toBe("aprovada")
    await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "prova autorizada", motivo: "de novo" })
    expect((estado.pedidos[0].gravadoArtePrazo as unknown[]).length).toBe(2)
  })
  it("recusa sem motivo, motivo longo, id inexistente/inválido, campo inválido e corpo sem campos", async () => {
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "aprovada" })).status).toBe(400)
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "aprovada", motivo: "x".repeat(301) })).status).toBe(400)
    expect((await pedir({ acao: "gravar_digital", id: "DIG-9999", situacaoArte: "aprovada", motivo: "x" })).status).toBe(404)
    expect((await pedir({ acao: "gravar_digital", id: "ORC-1", situacaoArte: "aprovada", motivo: "x" })).status).toBe(400)
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "qualquer", motivo: "x" })).status).toBe(400)
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", prazoEntrega: "26/11/2026", motivo: "x" })).status).toBe(400)
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", motivo: "x" })).status).toBe(400)
    expect(estado.gravacoes).toBe(0)
  })
  it("a ajuda da porta documenta a ação", async () => {
    const j = await (await GET(new NextRequest("http://x/api/externo", { headers: { authorization: "Bearer k" } }))).json()
    expect(JSON.stringify(j)).toContain("gravar_digital")
  })
})
