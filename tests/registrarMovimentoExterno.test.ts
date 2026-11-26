// Porta externa: registrar_movimento (CTO/COO) e mover_card para Perdido (CTO/COO). Só dados fictícios, tudo em memória.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({
  diretor: "cto", conversa: [] as unknown[], emails: 0, fetchs: 0,
  cfg: {} as Record<string, unknown>, gravacoes: 0,
  cards: [] as { id: string; numero: string; coluna: number }[], updates: [] as { tabela: string; dados: Record<string, unknown> }[],
  tracking: null as null | { etapas: unknown[] },
}))
vi.mock("@/app/lib/acessoExterno", () => ({ LIMITE_POR_HORA: 120, conferirChave: vi.fn(async () => ({ ok: true, diretor: estado.diretor })) }))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown[]) => { estado.conversa = m }), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn(), renovarFoto: vi.fn(async () => {}) }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async () => ({})),
  mudarConfig: vi.fn(async (fn: (d: Record<string, unknown>) => Record<string, unknown> | null) => {
    const m = fn(structuredClone(estado.cfg))
    if (m) { estado.cfg = { ...estado.cfg, ...m }; estado.gravacoes++ }
    return estado.cfg
  }),
}))
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

import { POST, GET } from "@/app/api/externo/route"
import { NextRequest } from "next/server"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))
const FORN = { id: "f-grafica", nome: "Gráfica Fictícia", ativo: true, servicos: {}, frete: 0, prazoDias: 5 }
const MOV = { id: "m1", pedidoKey: "lote-L9", pedidoLabel: "L9 Cliente Fictício", fornecedorId: "f-grafica", etapa: "impressao", servicos: ["impressao"], enviadoEm: "2026-11-02" }
const movs = () => (estado.cfg.producao as { movimentos: Record<string, unknown>[] }).movimentos

beforeEach(() => {
  estado.diretor = "cto"; estado.conversa = []; estado.updates = []; estado.gravacoes = 0
  estado.cfg = { producao: { fornecedores: [FORN, { ...FORN, id: "f-off", ativo: false }], movimentos: [{ ...MOV }] } }
  estado.cards = [{ id: "1", numero: "ORC-1", coluna: 5 }]
  estado.tracking = { etapas: [] }
  estado.emails = 0; estado.fetchs = 0
  vi.stubGlobal("fetch", vi.fn(async () => { estado.fetchs++; return new Response("{}") }))
})

describe("registrar_movimento receber", () => {
  it("fecha o movimento aberto com a data real e não duplica na repetição", async () => {
    const r = await pedir({ acao: "registrar_movimento", operacao: "receber", id: "m1", recebidoEm: "2026-11-10" })
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.ok).toBe(true)
    expect(j.movimento).toMatchObject({ id: "m1", recebidoEm: "2026-11-10" })
    expect(j.registro).toMatchObject({ autor: "cto", operacao: "receber", movimentoId: "m1", etapa: "impressao", recebidoEm: "2026-11-10" })
    expect(j.registro.em).toBeTruthy()
    const antes = estado.gravacoes
    const r2 = await pedir({ acao: "registrar_movimento", operacao: "receber", id: "m1", recebidoEm: "2026-11-10" })
    expect(r2.status).toBe(200)
    expect(estado.gravacoes).toBe(antes)
    expect(movs()).toHaveLength(1)
  })
  it("identifica por loteNumero + etapa", async () => {
    const r = await pedir({ acao: "registrar_movimento", operacao: "receber", loteNumero: "L9", etapa: "impressao", recebidoEm: "2026-11-10" })
    expect(r.status).toBe(200)
    expect(movs()[0].recebidoEm).toBe("2026-11-10")
  })
  it("409 com data diferente num movimento já fechado, sem alterar", async () => {
    estado.cfg = { producao: { fornecedores: [FORN], movimentos: [{ ...MOV, recebidoEm: "2026-11-10" }] } }
    const r = await pedir({ acao: "registrar_movimento", operacao: "receber", id: "m1", recebidoEm: "2026-11-11" })
    expect(r.status).toBe(409)
    expect(estado.gravacoes).toBe(0)
    expect(movs()[0].recebidoEm).toBe("2026-11-10")
  })
  it("404 se não existe; 400 com data inválida ou futura", async () => {
    expect((await pedir({ acao: "registrar_movimento", operacao: "receber", id: "zzz", recebidoEm: "2026-11-10" })).status).toBe(404)
    expect((await pedir({ acao: "registrar_movimento", operacao: "receber", id: "m1", recebidoEm: "10/11/2026" })).status).toBe(400)
    expect((await pedir({ acao: "registrar_movimento", operacao: "receber", id: "m1", recebidoEm: "2999-01-01" })).status).toBe(400)
    expect(estado.gravacoes).toBe(0)
  })
})

describe("registrar_movimento enviar", () => {
  const env = { acao: "registrar_movimento", operacao: "enviar", loteNumero: "L7", fornecedorId: "f-grafica", etapa: "acabamento", servicos: ["corteVinco"], enviadoEm: "2026-11-03" }
  it("cria com enviadoEm real e prazoPrevisto cadastral, dizendo que é previsão; o segundo aberto da etapa dá 409", async () => {
    const r = await pedir(env)
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.movimento).toMatchObject({ pedidoKey: "lote-L7", etapa: "acabamento", enviadoEm: "2026-11-03", prazoPrevisto: "2026-11-10" })
    expect(j.movimento.recebidoEm).toBeUndefined()
    expect(j.prazoPrevistoCadastral).toBe(true)
    expect(j.resultado).toMatch(/PREVISÃO cadastral/)
    expect(j.registro).toMatchObject({ autor: "cto", operacao: "enviar", loteNumero: "L7", etapa: "acabamento" })
    expect(movs()).toHaveLength(2)
    expect((await pedir(env)).status).toBe(409)
    expect(movs()).toHaveLength(2)
  })
  it("respeita o prazoPrevisto informado", async () => {
    const j = await (await pedir({ ...env, prazoPrevisto: "2026-11-20" })).json()
    expect(j.movimento.prazoPrevisto).toBe("2026-11-20")
    expect(j.prazoPrevistoCadastral).toBeUndefined()
  })
  it("recusa fornecedor inexistente ou inativo (404) e dados ruins (400)", async () => {
    expect((await pedir({ ...env, fornecedorId: "f-off" })).status).toBe(404)
    expect((await pedir({ ...env, fornecedorId: "nada" })).status).toBe(404)
    expect((await pedir({ ...env, servicos: [] })).status).toBe(400)
    expect((await pedir({ ...env, enviadoEm: "ontem" })).status).toBe(400)
    expect((await pedir({ ...env, loteNumero: undefined })).status).toBe(400)
    expect(movs()).toHaveLength(1)
  })
  it("não muda a coluna do card, não toca no Tracking e não manda e-mail nem WhatsApp", async () => {
    await pedir(env)
    await pedir({ acao: "registrar_movimento", operacao: "receber", id: "m1", recebidoEm: "2026-11-10" })
    expect(estado.updates).toEqual([])
    expect(estado.cards[0].coluna).toBe(5)
    expect(estado.fetchs).toBe(0)
  })
})

describe("registrar_movimento permissão", () => {
  it.each(["cto", "coo"])("%s passa", async d => {
    estado.diretor = d
    expect((await pedir({ acao: "registrar_movimento", operacao: "receber", id: "m1", recebidoEm: "2026-11-10" })).status).toBe(200)
  })
  it.each(["cfo", "cmo", "cco"])("%s leva 403 sem escrita", async d => {
    estado.diretor = d
    expect((await pedir({ acao: "registrar_movimento", operacao: "receber", id: "m1", recebidoEm: "2026-11-10" })).status).toBe(403)
    expect(estado.gravacoes).toBe(0)
    expect(movs()[0].recebidoEm).toBeUndefined()
  })
  it("sem chave: 401", async () => {
    const { conferirChave } = await import("@/app/lib/acessoExterno")
    vi.mocked(conferirChave).mockResolvedValueOnce({ ok: false, status: 401, erro: "sem chave" } as never)
    expect((await pedir({ acao: "registrar_movimento", operacao: "receber", id: "m1", recebidoEm: "2026-11-10" })).status).toBe(401)
    expect(estado.gravacoes).toBe(0)
  })
  it("a ajuda da porta lista a ação para CTO e COO", async () => {
    for (const d of ["cto", "coo"]) {
      estado.diretor = d
      const j = await (await GET(new NextRequest("http://x/api/externo", { headers: { authorization: "Bearer k" } }))).json()
      expect(Object.keys(j.escrita).some(k => k.includes("registrar_movimento") && k.includes("operacao"))).toBe(true)
    }
  })
})

describe("mover_card para Perdido (coluna 10)", () => {
  const perdido = { acao: "mover_card", numero: "ORC-1", coluna: 10, motivo: "Cliente desistiu" }
  it.each(["cto", "coo"])("%s move para 10 com motivo: coluna, motivoPerdido e Tracking, sem mensagem", async d => {
    estado.diretor = d
    const r = await pedir(perdido)
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.movidos).toEqual([{ numero: "ORC-1", de: 5, para: 10 }])
    expect(j.registro).toMatchObject({ autor: d, motivo: "Cliente desistiu", cards: [{ numero: "ORC-1", de: 5, para: 10 }] })
    expect(estado.updates.find(u => u.tabela === "KanbanCard")!.dados).toEqual({ coluna: 10, motivoPerdido: "Cliente desistiu" })
    const trk = estado.updates.find(u => u.tabela === "Tracking")!.dados as { colunaAtual: number }
    expect(trk.colunaAtual).toBe(10)
    expect(estado.fetchs).toBe(0)
  })
  it("sem motivo: 400, nada gravado", async () => {
    for (const motivo of [undefined, "", "  ", "a".repeat(301)]) expect((await pedir({ ...perdido, motivo })).status).toBe(400)
    expect(estado.updates).toEqual([])
  })
  it.each(["cfo", "cmo", "cco"])("%s leva 403 em 10, sem escrita, mas segue podendo 2 a 8", async d => {
    estado.diretor = d
    expect((await pedir(perdido)).status).toBe(403)
    expect(estado.updates).toEqual([])
    expect((await pedir({ ...perdido, coluna: 6 })).status).toBe(200)
    expect(estado.updates.find(u => u.tabela === "KanbanCard")!.dados).toEqual({ coluna: 6 })
  })
  it("0 e 9 continuam recusados; card já entregue ou perdido não vai a 10", async () => {
    expect((await pedir({ ...perdido, coluna: 9 })).status).toBe(400)
    expect((await pedir({ ...perdido, coluna: 0 })).status).toBe(400)
    estado.cards = [{ id: "1", numero: "ORC-1", coluna: 9 }]
    expect((await pedir(perdido)).status).toBe(400)
    expect(estado.updates).toEqual([])
  })
})
