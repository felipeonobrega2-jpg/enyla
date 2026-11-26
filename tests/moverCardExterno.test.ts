// Porta externa, ação mover_card: só avança de 1 em diante, destino 2 a 8, motivo obrigatório, só muda a coluna.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({ diretor: "coo", conversa: [] as unknown[], cards: [] as { id: string; numero: string; coluna: number }[], updates: [] as { tabela: string; dados: Record<string, unknown> }[], tracking: null as null | { etapas: unknown[] } }))
vi.mock("@/app/lib/acessoExterno", () => ({ LIMITE_POR_HORA: 120, conferirChave: vi.fn(async () => ({ ok: true, diretor: estado.diretor })) }))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown[]) => { estado.conversa = m }), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn(), renovarFoto: vi.fn(async () => {}) }))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => ({})), mudarConfig: vi.fn() }))
vi.mock("next/server", async orig => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (tabela: string) => ({
      select: () => ({
        eq: (_c: string, v: string) => {
          const r = tabela === "KanbanCard" ? { data: estado.cards.filter(c => c.numero === v) } : { data: estado.tracking }
          return Object.assign(Promise.resolve(r), { maybeSingle: async () => r })
        },
      }),
      update: (dados: Record<string, unknown>) => ({ eq: async () => { estado.updates.push({ tabela, dados }); return { error: null } } }),
    }),
  },
}))

import { POST } from "@/app/api/externo/route"
import { NextRequest } from "next/server"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))
const card = (coluna: number) => { estado.cards = [{ id: "1", numero: "ORC-1", coluna }] }

beforeEach(() => { estado.diretor = "coo"; estado.conversa = []; estado.updates = []; estado.tracking = { etapas: [{ coluna: 1, nome: "Fechado", tipo: "coluna", dataHora: "x" }] } })

describe("POST acao=mover_card", () => {
  it("avança 1→2 e só grava a coluna, com quem moveu e o motivo no Tracking", async () => {
    card(1)
    const r = await pedir({ acao: "mover_card", numero: "ORC-1", coluna: 2, motivo: "Arte aprovada" })
    expect(r.status).toBe(200)
    const kanban = estado.updates.filter(u => u.tabela === "KanbanCard")
    expect(kanban).toEqual([{ tabela: "KanbanCard", dados: { coluna: 2 } }])
    const trk = estado.updates.find(u => u.tabela === "Tracking")!.dados as { colunaAtual: number; etapas: { coluna: number; por?: string; detalhe?: string }[] }
    expect(trk.colunaAtual).toBe(2)
    expect(trk.etapas.at(-1)).toMatchObject({ coluna: 2, detalhe: expect.stringContaining("Arte aprovada") })
    expect(trk.etapas.at(-1)!.por).toBeTruthy()
  })
  it("recusa voltar e ficar na mesma", async () => {
    card(4)
    expect((await pedir({ acao: "mover_card", numero: "ORC-1", coluna: 3, motivo: "x" })).status).toBe(400)
    expect((await pedir({ acao: "mover_card", numero: "ORC-1", coluna: 4, motivo: "x" })).status).toBe(400)
    expect(estado.updates).toEqual([])
  })
  it.each([0, 9, 1, 11, -1, 2.5])("recusa destino %s", async col => {
    card(1)
    expect((await pedir({ acao: "mover_card", numero: "ORC-1", coluna: col, motivo: "x" })).status).toBe(400)
    expect(estado.updates).toEqual([])
  })
  it("recusa sem motivo, vazio ou com mais de 300 caracteres", async () => {
    card(1)
    for (const motivo of [undefined, "", "   ", "a".repeat(301)])
      expect((await pedir({ acao: "mover_card", numero: "ORC-1", coluna: 2, motivo })).status).toBe(400)
    expect(estado.updates).toEqual([])
  })
  it("recusa card em coluna 0", async () => {
    card(0)
    expect((await pedir({ acao: "mover_card", numero: "ORC-1", coluna: 2, motivo: "x" })).status).toBe(400)
    expect(estado.updates).toEqual([])
  })
  it("404 se o pedido não existe", async () => {
    card(1)
    expect((await pedir({ acao: "mover_card", numero: "ORC-9", coluna: 2, motivo: "x" })).status).toBe(404)
  })
})
