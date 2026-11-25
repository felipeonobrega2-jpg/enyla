// Porta externa, ação gravar_digital: só situacaoArte/prazoEntrega, motivo obrigatório, registra autor/data/motivo. Nada em pedido real.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({ conversa: [] as unknown[], pedidos: [] as Record<string, unknown>[], gravacoes: 0 }))
vi.mock("@/app/lib/acessoExterno", () => ({ LIMITE_POR_HORA: 120, conferirChave: vi.fn(async () => ({ ok: true, diretor: "coo" })) }))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown[]) => { estado.conversa = m }), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn(), renovarFoto: vi.fn(async () => {}) }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async () => ({})),
  mudarConfig: vi.fn(async (mudar: (d: unknown) => { pedidosDigitais?: Record<string, unknown>[] } | null) => {
    const m = mudar({ pedidosDigitais: estado.pedidos })
    if (m?.pedidosDigitais) { estado.pedidos = m.pedidosDigitais; estado.gravacoes++ }
    return {}
  }),
}))
vi.mock("next/server", async orig => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: () => { throw new Error("sem banco real") } } }))

import { POST } from "@/app/api/externo/route"
import { NextRequest } from "next/server"
const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))

beforeEach(() => { estado.conversa = []; estado.gravacoes = 0; estado.pedidos = [{ id: "DIG-0001", status: "producao", total: 100, sinal: 50, custo: 30, pagamento: { txId: "asaas:1", valor: 50, data: "2026-03-10" } }] })

describe("POST acao=gravar_digital", () => {
  it("recusa sem motivo", async () => {
    const r = await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "aprovada" })
    expect(r.status).toBe(400); expect(estado.gravacoes).toBe(0)
  })
  it("recusa id inexistente", async () => {
    const r = await pedir({ acao: "gravar_digital", id: "DIG-9999", situacaoArte: "aprovada", motivo: "teste" })
    expect(r.status).toBe(404); expect(estado.gravacoes).toBe(0)
  })
  it("recusa valores inválidos e corpo sem campo", async () => {
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "xyz", motivo: "m" })).status).toBe(400)
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", prazoEntrega: "amanhã", motivo: "m" })).status).toBe(400)
    expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", motivo: "m" })).status).toBe(400)
    expect(estado.gravacoes).toBe(0)
  })
  it("grava só os campos, com autor, data e motivo; pagamento, status e custo ficam como estão", async () => {
    const r = await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "aprovada", prazoEntrega: "2026-04-01", motivo: "Cliente aprovou no WhatsApp" })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, id: "DIG-0001", situacaoArte: "aprovada", prazoEntrega: "2026-04-01" })
    const p = estado.pedidos[0] as Record<string, unknown> & { gravacoesDigital: Record<string, string>[] }
    expect(p).toMatchObject({ status: "producao", total: 100, sinal: 50, custo: 30, pagamento: { txId: "asaas:1", valor: 50, data: "2026-03-10" } })
    expect(p.gravacoesDigital).toHaveLength(1)
    expect(p.gravacoesDigital[0]).toMatchObject({ motivo: "Cliente aprovou no WhatsApp", situacaoArte: "aprovada", prazoEntrega: "2026-04-01" })
    expect(p.gravacoesDigital[0].por).toBeTruthy(); expect(p.gravacoesDigital[0].em).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/)
  })
})
