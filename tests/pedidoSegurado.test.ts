// Aguardando pagamento do cliente: tira o pedido do atraso nosso (placar, pendências, diretoria, porta). Nada de cobrança, lançamento ou envio.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({ diretor: "coo" as string, cards: [{ id: "c1" }] as { id: string }[], linhas: {} as Record<string, unknown>, conversa: [] as unknown[] }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: { from: (t: string) => ({
    select: () => ({
      eq: (c: string, v: string) => t === "KanbanCard" ? { limit: async () => ({ data: v === "ORC-1" ? estado.cards : [] }) }
        : { eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: id in estado.linhas ? { dados: estado.linhas[id] } : null }) }), then: (f: (x: unknown) => unknown) => f({ data: Object.entries(estado.linhas).map(([id, dados]) => ({ id, dados })) }) },
    }),
    upsert: async (r: { id: string; dados: unknown }) => { estado.linhas[r.id] = r.dados; return { error: null } },
  }) },
}))
vi.mock("@/app/lib/acessoExterno", () => ({ LIMITE_POR_HORA: 120, conferirChave: vi.fn(async () => ({ ok: true, diretor: estado.diretor })) }))
vi.mock("@/app/lib/diretoriaServidor", () => ({
  lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown[]) => { estado.conversa = m }), lerPlanos: vi.fn(),
}))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn(), renovarFoto: vi.fn(async () => null) }))
vi.mock("next/server", async orig => ({ ...(await orig<typeof import("next/server")>()), after: (f: () => unknown) => { void f() } }))

import { POST } from "@/app/api/externo/route"
import { NextRequest } from "next/server"
import { pendencias } from "@/app/lib/pendencias"
import { montarPedidos, producao } from "@/app/lib/negocio"
import { montarDiretoria } from "@/app/lib/diretoria"
import { prazoDoPedido } from "@/app/lib/pendencias"
import { lerSegurados } from "@/app/lib/pedidoSeguradoServidor"
import { textoSegurado } from "@/app/lib/pedidoSegurado"
import { card, config } from "./fixtures"

const HOJE = new Date("2026-11-24T12:00:00")
const atrasado = card({ numero: "ORC-1", coluna: 3, preco: 1000, dataEntregaPrevista: "2026-11-20" })
const roda = (segurados?: Record<string, { desde: string; motivo: string; por: string }>) =>
  pendencias({ pedidos: montarPedidos([atrasado], []), kanban: [atrasado], lancamentos: [], historico: [], propostasCustom: [], clientes: [], config: config(), hoje: HOJE, segurados })
const marca = { "ORC-1": { desde: "2026-11-23T10:00:00Z", motivo: "saldo do cliente não pago", por: "coo" } }
const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))

beforeEach(() => { estado.diretor = "coo"; estado.linhas = {}; estado.conversa = [] })

describe("relógio de atraso", () => {
  it("marcado sai do placar e não gera pendência de atraso; liberado, volta", () => {
    const pedidos = montarPedidos([atrasado], [])
    expect(producao(pedidos, HOJE).atrasados).toHaveLength(1)
    expect(producao(pedidos, HOJE, marca).atrasados).toHaveLength(0)
    expect(roda().some(p => p.tipo === "atrasado")).toBe(true)
    expect(roda(marca).some(p => p.tipo === "atrasado")).toBe(false)
    expect(roda({}).some(p => p.tipo === "atrasado")).toBe(true)
  })
  it("diretoria: placar e 'Avisar do atraso' ignoram o segurado", () => {
    const e = { kanban: [atrasado], agentesTravados: [], whatsapp: null, semCredito: false }
    const coo = (s?: typeof marca) => montarDiretoria({ ...e, segurados: s }, "2026-11-24").find(d => d.id === "coo")!
    expect(coo().placar[1].valor).toBe("1")
    expect(coo().decisoes.some(d => d.includes("Avisar"))).toBe(true)
    expect(coo(marca).placar[1].valor).toBe("0")
    expect(coo(marca).decisoes.some(d => d.includes("Avisar"))).toBe(false)
  })
  it("expedição com a receber, sem marca, mostra o texto atual", () => {
    expect(prazoDoPedido({ coluna: 8, dataEntregaPrevista: "2026-11-20", aReceber: 500 }, HOJE)).toBe("pronto · aguardando pagamento")
  })
  it("texto do card", () => expect(textoSegurado(marca["ORC-1"])).toBe("Segurado: aguardando pagamento do cliente desde 23/11"))
})

describe("porta: pedido", () => {
  it("COO marca e libera; a linha fica (sem delete) com liberadoEm", async () => {
    const r = await pedir({ acao: "pedido", operacao: "aguardando_pagamento", numero: "ORC-1" })
    expect(r.status).toBe(200)
    expect((await r.json()).aguardandoPagamento).toMatchObject({ motivo: "saldo do cliente não pago", por: "coo" })
    expect(Object.keys(await lerSegurados())).toEqual(["ORC-1"])
    expect((await pedir({ acao: "pedido", operacao: "liberar", numero: "ORC-1" })).status).toBe(200)
    expect(await lerSegurados()).toEqual({})
    expect(estado.linhas["ORC-1"]).toMatchObject({ liberadoEm: expect.any(String) })
  })
  it("CFO pode; CCO, CMO e CTO recebem 403", async () => {
    estado.diretor = "cfo"
    expect((await pedir({ acao: "pedido", operacao: "aguardando_pagamento", numero: "ORC-1", motivo: "Pix não caiu" })).status).toBe(200)
    for (const d of ["cco", "cmo", "cto"]) { estado.diretor = d; expect((await pedir({ acao: "pedido", operacao: "liberar", numero: "ORC-1" })).status).toBe(403) }
  })
  it("404 para número inexistente e 400 para operação inválida", async () => {
    expect((await pedir({ acao: "pedido", operacao: "aguardando_pagamento", numero: "NAO-EXISTE" })).status).toBe(404)
    expect((await pedir({ acao: "pedido", operacao: "cobrar", numero: "ORC-1" })).status).toBe(400)
  })
})
