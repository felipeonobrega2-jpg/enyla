// Porta externa, ação registrar_movimento_fornecedor: só COO e CTO, duplicata, data futura, Tracking.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({
  diretor: "coo", conversa: [] as unknown[], producao: {} as Record<string, unknown>, gravacoes: 0,
  cards: [] as Record<string, unknown>[], trackingUpdates: [] as Record<string, unknown>[],
}))
vi.mock("@/app/lib/acessoExterno", () => ({ LIMITE_POR_HORA: 120, conferirChave: vi.fn(async () => ({ ok: true, diretor: estado.diretor })) }))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown[]) => { estado.conversa = m }), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn(), renovarFoto: vi.fn(async () => {}) }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async () => ({ producao: estado.producao })),
  mudarConfig: vi.fn(async (fn: (d: Record<string, unknown>) => Record<string, unknown> | null) => {
    const m = fn({ producao: estado.producao })
    if (m) { estado.producao = m.producao as Record<string, unknown>; estado.gravacoes++ }
    return {}
  }),
}))
vi.mock("next/server", async orig => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (tabela: string) => ({
      select: () => ({
        eq: () => {
          const r = tabela === "KanbanCard" ? { data: estado.cards } : { data: { etapas: [] } }
          return Object.assign(Promise.resolve(r), { maybeSingle: async () => r })
        },
      }),
      update: (dados: Record<string, unknown>) => ({ eq: async () => { if (tabela === "Tracking") estado.trackingUpdates.push(dados); return { error: null } } }),
    }),
  },
}))

import { POST, GET } from "@/app/api/externo/route"
import { NextRequest } from "next/server"
import { normalizarProducao } from "@/app/lib/producao"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))
const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const base = { acao: "registrar_movimento_fornecedor", loteNumero: "LOTE-1", fornecedorId: "tio", etapa: "impressao", tipo: "enviado", data: "2026-11-10" }
const movs = () => (estado.producao.movimentos ?? []) as { enviadoEm: string; recebidoEm?: string; registradoPor?: string }[]

beforeEach(() => {
  estado.diretor = "coo"; estado.conversa = []; estado.gravacoes = 0; estado.trackingUpdates = []
  estado.producao = normalizarProducao({})
  estado.cards = [{ id: "c1", numero: "ORC-1", loteId: "L1", loteNumero: "LOTE-1", nomeCliente: "Cliente", coluna: 5 }]
})

describe("POST acao=registrar_movimento_fornecedor", () => {
  it.each(["cfo", "cmo", "cco"])("recusa a chave do %s com 403 e não grava", async d => {
    estado.diretor = d
    expect((await pedir(base)).status).toBe(403)
    expect(estado.gravacoes).toBe(0)
  })
  it.each(["coo", "cto"])("aceita a chave do %s, grava o movimento e quem gravou no Tracking", async d => {
    estado.diretor = d
    const r = await pedir({ ...base, obs: "retirado na gráfica" })
    expect(r.status).toBe(200)
    expect(movs()).toHaveLength(1)
    expect(movs()[0]).toMatchObject({ pedidoKey: "lote-L1", fornecedorId: "tio", etapa: "impressao", enviadoEm: "2026-11-10" })
    const etapas = estado.trackingUpdates[0].etapas as { por?: string; detalhe?: string }[]
    expect(etapas.at(-1)!.por).toBeTruthy()
    expect(etapas.at(-1)!.detalhe).toContain("retirado na gráfica")
  })
  it("recusa data futura e não grava", async () => {
    const amanha = new Date(Date.now() + 2 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
    expect((await pedir({ ...base, data: amanha })).status).toBe(400)
    expect(estado.gravacoes).toBe(0)
  })
  it("aceita hoje e data passada; recusa data inválida", async () => {
    expect((await pedir({ ...base, data: hoje })).status).toBe(200)
    expect((await pedir({ ...base, data: "2026-02-30" })).status).toBe(400)
    expect((await pedir({ ...base, data: "ontem" })).status).toBe(400)
  })
  it("recusa duplicata de lote+fornecedor+etapa+tipo+data", async () => {
    expect((await pedir(base)).status).toBe(200)
    expect((await pedir(base)).status).toBe(409)
    expect(movs()).toHaveLength(1)
    expect((await pedir({ ...base, tipo: "recebido", data: "2026-11-12" })).status).toBe(200)
    expect((await pedir({ ...base, tipo: "recebido", data: "2026-11-12" })).status).toBe(409)
    expect(movs()).toHaveLength(1)
    expect(movs()[0].recebidoEm).toBe("2026-11-12")
  })
  it("recebido sem envio aberto dá 409; antes do envio dá 400", async () => {
    expect((await pedir({ ...base, tipo: "recebido" })).status).toBe(409)
    await pedir(base)
    expect((await pedir({ ...base, tipo: "recebido", data: "2026-11-01" })).status).toBe(400)
  })
  it("valida campos, pedido e fornecedor", async () => {
    expect((await pedir({ ...base, tipo: "x" })).status).toBe(400)
    expect((await pedir({ ...base, etapa: "x" })).status).toBe(400)
    expect((await pedir({ ...base, loteNumero: undefined })).status).toBe(400)
    expect((await pedir({ ...base, fornecedorId: "nao-existe" })).status).toBe(404)
    estado.cards = []
    expect((await pedir(base)).status).toBe(404)
    expect(estado.gravacoes).toBe(0)
  })
  it("a ajuda do GET sem parâmetro traz a ação", async () => {
    const r = await GET(new NextRequest("http://x/api/externo", { headers: { authorization: "Bearer k" } }))
    expect(JSON.stringify(await r.json())).toContain("registrar_movimento_fornecedor")
  })
})
