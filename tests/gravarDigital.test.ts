// Porta externa, ação gravar_digital: só situacaoArte e prazoEntrega, com autor/data/motivo. Dados fictícios, nada real é gravado.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({ pedidos: [] as Record<string, unknown>[], gravacoes: 0, conversa: [] as unknown[] }))
vi.mock("@/app/lib/acessoExterno", () => ({ LIMITE_POR_HORA: 120, conferirChave: vi.fn(async () => ({ ok: true, diretor: "coo" })) }))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown[]) => { estado.conversa = m }), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn(), renovarFoto: vi.fn(async () => {}) }))
vi.mock("@/app/lib/supabase", () => ({ supabase: {} }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async () => ({})),
  mudarConfig: vi.fn(async (f: (d: unknown) => { pedidosDigitais?: Record<string, unknown>[] } | null) => {
    const m = f({ pedidosDigitais: estado.pedidos })
    if (m?.pedidosDigitais) { estado.pedidos = m.pedidosDigitais; estado.gravacoes++ }
    return {}
  }),
}))
vi.mock("next/server", async orig => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))

import { POST } from "@/app/api/externo/route"
import { NextRequest } from "next/server"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))
beforeEach(() => { estado.pedidos = [{ id: "DIG-0001", status: "arte", sinal: 100.5, total: 300, custo: 50 }]; estado.gravacoes = 0; estado.conversa = [] })

describe("POST acao=gravar_digital", () => {
  it("grava só os dois campos, com autor, data (Brasília) e motivo", async () => {
    const antes = { ...estado.pedidos[0] }
    const r = await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "aprovada", prazoEntrega: "2026-04-10", motivo: "Cliente aprovou" })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, id: "DIG-0001", situacaoArte: "aprovada", prazoEntrega: "2026-04-10" })
    const p = estado.pedidos[0] as Record<string, unknown> & { arteEPrazoGravado: { por: string; em: string; motivo: string } }
    expect(p).toMatchObject({ ...antes, situacaoArte: "aprovada", prazoEntrega: "2026-04-10" })
    expect(p.arteEPrazoGravado.motivo).toBe("Cliente aprovou")
    expect(p.arteEPrazoGravado.por).toBeTruthy()
    expect(p.arteEPrazoGravado.em).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(Object.keys(p).sort()).toEqual([...Object.keys(antes), "arteEPrazoGravado", "prazoEntrega", "situacaoArte"].sort())
  })
  it("aceita só um dos campos e prazo vazio limpa", async () => {
    await pedir({ acao: "gravar_digital", id: "DIG-0001", prazoEntrega: "2026-04-10", motivo: "x" })
    const r = await pedir({ acao: "gravar_digital", id: "DIG-0001", prazoEntrega: "", motivo: "voltar" })
    expect(await r.json()).toMatchObject({ ok: true, situacaoArte: null, prazoEntrega: null })
    expect(estado.pedidos[0]).not.toHaveProperty("prazoEntrega")
  })
  it("recusa sem motivo, motivo longo, campo inválido e corpo sem campos", async () => {
    for (const c of [{ motivo: undefined }, { motivo: "  " }, { motivo: "a".repeat(301) }, { motivo: "x", situacaoArte: "ok" }, { motivo: "x", prazoEntrega: "31/12/2026" }, { motivo: "x", prazoEntrega: "2026-02-31" }, { motivo: "x", situacaoArte: undefined, prazoEntrega: undefined }])
      expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "aprovada", ...c })).status).toBe(400)
    expect(estado.gravacoes).toBe(0)
  })
  it("recusa id inexistente ou mal formado sem gravar", async () => {
    expect((await pedir({ acao: "gravar_digital", id: "DIG-9999", situacaoArte: "aprovada", motivo: "x" })).status).toBe(404)
    expect((await pedir({ acao: "gravar_digital", id: "ORC-1", situacaoArte: "aprovada", motivo: "x" })).status).toBe(400)
    expect(estado.gravacoes).toBe(0)
  })
})
