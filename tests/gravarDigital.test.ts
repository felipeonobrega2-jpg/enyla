// Porta externa, ação gravar_digital: só situacaoArte/prazoEntrega, motivo obrigatório, registra autor/data/motivo. Nada em pedido real.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({ diretor: "coo", conversa: [] as unknown[], pedidos: [] as Record<string, unknown>[], escritas: 0 }))
vi.mock("@/app/lib/acessoExterno", () => ({ LIMITE_POR_HORA: 120, conferirChave: vi.fn(async () => ({ ok: true, diretor: estado.diretor })) }))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown[]) => { estado.conversa = m }), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn(), renovarFoto: vi.fn(async () => {}) }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async () => ({})),
  lerConfigLinha: vi.fn(async () => ({ data: { data: { pedidosDigitais: estado.pedidos } }, error: null })),
  mudarConfig: vi.fn(async (f: (d: unknown) => Record<string, unknown>) => { estado.escritas++; const r = f({ pedidosDigitais: estado.pedidos }); estado.pedidos = r.pedidosDigitais as Record<string, unknown>[] }),
}))
vi.mock("next/server", async orig => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: () => { throw new Error("sem escrita no banco") } } }))

import { POST } from "@/app/api/externo/route"
import { NextRequest } from "next/server"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))
const original = { id: "DIG-0001", status: "arte", total: 1000, sinal: 500.01, custo: 300, pagamento: { txId: "asaas:p", valor: 500.01, data: "2026-11-10" } }
beforeEach(() => { estado.diretor = "coo"; estado.conversa = []; estado.escritas = 0; estado.pedidos = [{ ...original }] })

describe("POST acao=gravar_digital", () => {
  it("grava só os campos e registra quem, quando e o motivo; o resto do pedido fica igual", async () => {
    const r = await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "aprovada", prazoEntrega: "2026-11-26", motivo: "Felipe, 25/11" })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, id: "DIG-0001", situacaoArte: "aprovada", prazoEntrega: "2026-11-26" })
    expect(estado.pedidos[0]).toMatchObject({ ...original, situacaoArte: "aprovada", prazoEntrega: "2026-11-26" })
    const reg = (estado.pedidos[0].camposGravados as { por: string; em: string; motivo: string }[])[0]
    expect(reg.motivo).toBe("Felipe, 25/11"); expect(reg.por).toBeTruthy(); expect(reg.em).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/)
  })
  it("aceita só um dos campos, e prazoEntrega vazio limpa", async () => {
    estado.pedidos = [{ ...original, prazoEntrega: "2026-11-26" }]
    const r = await (await pedir({ acao: "gravar_digital", id: "DIG-0001", prazoEntrega: "", motivo: "x" })).json()
    expect(r).toEqual({ ok: true, id: "DIG-0001", situacaoArte: null, prazoEntrega: null })
  })
  it("recusa sem motivo, motivo longo, sem campos, valores inválidos e id inexistente ou malformado", async () => {
    for (const c of [{ situacaoArte: "aprovada" }, { situacaoArte: "aprovada", motivo: "  " }, { situacaoArte: "aprovada", motivo: "a".repeat(301) },
      { motivo: "x" }, { situacaoArte: "ok", motivo: "x" }, { prazoEntrega: "26/11", motivo: "x" }, { prazoEntrega: "2026-02-31", motivo: "x" }])
      expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", ...c })).status, JSON.stringify(c)).toBe(400)
    expect((await pedir({ acao: "gravar_digital", id: "DIG-9999", situacaoArte: "aprovada", motivo: "x" })).status).toBe(404)
    expect((await pedir({ acao: "gravar_digital", id: "ORC-1", situacaoArte: "aprovada", motivo: "x" })).status).toBe(400)
    expect(estado.escritas).toBe(0); expect(estado.pedidos[0]).toEqual(original)
  })
  it("qualquer diretor pode", async () => {
    for (const d of ["cfo", "cco", "cmo", "cto"]) { estado.diretor = d; expect((await pedir({ acao: "gravar_digital", id: "DIG-0001", situacaoArte: "enviada", motivo: "x" })).status).toBe(200) }
  })
})
