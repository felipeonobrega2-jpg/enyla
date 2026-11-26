// Porta externa, ação registrar_movimento: abre/fecha movimento de fornecedor só em AppConfig.producao.movimentos (dados fictícios).
import { describe, it, expect, vi, beforeEach } from "vitest"

type Cfg = { producao?: Record<string, unknown>; movimentosPorta?: { operacao: string; payload: Record<string, unknown>; autor: string }[] }
const estado = vi.hoisted(() => ({
  diretor: "cto", conversa: [] as unknown[], cfg: {} as Record<string, unknown>, gravacoes: 0,
  updates: [] as { tabela: string; dados: Record<string, unknown> }[], emails: 0,
}))
vi.mock("@/app/lib/acessoExterno", () => ({
  LIMITE_POR_HORA: 120,
  conferirChave: vi.fn(async () => estado.diretor === "sem" ? { ok: false, status: 401, erro: "sem chave" } : { ok: true, diretor: estado.diretor }),
}))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown[]) => { estado.conversa = m }), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn(), renovarFoto: vi.fn(async () => {}) }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async () => estado.cfg),
  mudarConfig: vi.fn(async (f: (c: Record<string, unknown>) => Record<string, unknown> | null) => {
    const r = f(structuredClone(estado.cfg))
    if (r) { estado.cfg = { ...estado.cfg, ...r }; estado.gravacoes++ }
    return estado.cfg
  }),
}))
vi.mock("@/app/lib/emailsServidor", () => ({ emailDoPedido: vi.fn(async () => { estado.emails++ }) }))
vi.mock("next/server", async orig => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (tabela: string) => ({
      select: () => ({ eq: async () => ({ data: tabela === "KanbanCard" ? [{ id: "c1", loteId: "L1", loteNumero: "LOTE-1" }] : null }) }),
      update: (dados: Record<string, unknown>) => ({ eq: async () => { estado.updates.push({ tabela, dados }); return { error: null } } }),
    }),
  },
}))

import { POST } from "@/app/api/externo/route"
import { NextRequest } from "next/server"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))
const forn = (extra = {}) => ({ id: "f1", nome: "Gráfica Teste", ativo: true, servicos: {}, frete: 0, prazoDias: 5, ...extra })
const aberto = { id: "m1", pedidoKey: "lote-L1", pedidoLabel: "Lote LOTE-1", fornecedorId: "f1", etapa: "impressao", servicos: ["impressao"], enviadoEm: "2026-11-02", prazoPrevisto: "2026-11-09" }
const movs = () => ((estado.cfg as Cfg).producao?.movimentos ?? []) as Record<string, unknown>[]
const enviar = { acao: "registrar_movimento", operacao: "enviar", loteNumero: "LOTE-1", fornecedorId: "f1", etapa: "impressao", servicos: ["impressao"], enviadoEm: "2026-11-02" }

beforeEach(() => {
  estado.diretor = "cto"; estado.conversa = []; estado.updates = []; estado.gravacoes = 0; estado.emails = 0
  estado.cfg = { producao: { fornecedores: [forn(), forn({ id: "f2", ativo: false })], movimentos: [] } }
})

describe("POST acao=registrar_movimento", () => {
  it("receber fecha o movimento aberto; repetir com a mesma data não grava de novo", async () => {
    ;(estado.cfg as Cfg).producao!.movimentos = [{ ...aberto }]
    const corpo = { acao: "registrar_movimento", operacao: "receber", id: "m1", recebidoEm: "2026-11-09" }
    const r = await pedir(corpo)
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.ok).toBe(true)
    expect(j.movimento).toMatchObject({ id: "m1", enviadoEm: "2026-11-02", recebidoEm: "2026-11-09" })
    expect(movs()).toHaveLength(1)
    const antes = estado.gravacoes
    const r2 = await pedir(corpo)
    expect(r2.status).toBe(200)
    expect(estado.gravacoes).toBe(antes)
    expect(movs()).toHaveLength(1)
    expect((await r2.json()).registro.autor).toBe("cto")
  })
  it("receber por loteNumero + etapa", async () => {
    ;(estado.cfg as Cfg).producao!.movimentos = [{ ...aberto }]
    const r = await pedir({ acao: "registrar_movimento", operacao: "receber", loteNumero: "LOTE-1", etapa: "impressao", recebidoEm: "2026-11-05" })
    expect(r.status).toBe(200)
    expect(movs()[0].recebidoEm).toBe("2026-11-05")
  })
  it("receber com data diferente num movimento fechado: 409 e nada muda", async () => {
    ;(estado.cfg as Cfg).producao!.movimentos = [{ ...aberto, recebidoEm: "2026-11-09" }]
    const r = await pedir({ acao: "registrar_movimento", operacao: "receber", id: "m1", recebidoEm: "2026-11-10" })
    expect(r.status).toBe(409)
    expect(estado.gravacoes).toBe(0)
    expect(movs()[0].recebidoEm).toBe("2026-11-09")
  })
  it("receber inexistente: 404", async () => {
    expect((await pedir({ acao: "registrar_movimento", operacao: "receber", id: "zz", recebidoEm: "2026-11-09" })).status).toBe(404)
    expect(estado.gravacoes).toBe(0)
  })
  it("enviar cria o movimento com enviadoEm real e prazoPrevisto cadastral; segundo aberto da mesma etapa: 409", async () => {
    const r = await pedir(enviar)
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.movimento).toMatchObject({ pedidoKey: "lote-L1", etapa: "impressao", enviadoEm: "2026-11-02", prazoPrevisto: "2026-11-09", fornecedorId: "f1" })
    expect(j.movimento.recebidoEm).toBeUndefined()
    expect(j.resultado).toContain("previsão cadastral")
    expect(j.registro).toMatchObject({ autor: "cto", operacao: "enviar" })
    expect(movs()).toHaveLength(1)
    expect((await pedir(enviar)).status).toBe(409)
    expect(movs()).toHaveLength(1)
  })
  it("enviar com prazoPrevisto informado o mantém como previsão", async () => {
    const j = await (await pedir({ ...enviar, prazoPrevisto: "2026-11-20" })).json()
    expect(j.movimento.prazoPrevisto).toBe("2026-11-20")
    expect(j.resultado).toContain("não confirmada")
  })
  it("enviar recusa fornecedor inativo, inexistente e datas inválidas", async () => {
    expect((await pedir({ ...enviar, fornecedorId: "f2" })).status).toBe(400)
    expect((await pedir({ ...enviar, fornecedorId: "nope" })).status).toBe(404)
    expect((await pedir({ ...enviar, enviadoEm: "02/11/2026" })).status).toBe(400)
    expect(estado.gravacoes).toBe(0)
  })
  it("CTO e COO passam; CFO, CMO e CCO levam 403 sem escrita", async () => {
    for (const d of ["cto", "coo"]) { estado.diretor = d; estado.cfg = { producao: { fornecedores: [forn()], movimentos: [] } }; expect((await pedir(enviar)).status).toBe(200) }
    estado.gravacoes = 0
    for (const d of ["cfo", "cmo", "cco"]) { estado.diretor = d; expect((await pedir(enviar)).status).toBe(403) }
    expect(estado.gravacoes).toBe(0)
  })
  it("sem chave: 401", async () => {
    estado.diretor = "sem"
    expect((await pedir(enviar)).status).toBe(401)
    expect(estado.gravacoes).toBe(0)
  })
  it("não manda e-mail e não mexe em coluna nem Tracking", async () => {
    ;(estado.cfg as Cfg).producao!.movimentos = [{ ...aberto, id: "m9", etapa: "colagem" }]
    await pedir(enviar)
    await pedir({ acao: "registrar_movimento", operacao: "receber", id: "m9", recebidoEm: "2026-11-09" })
    expect(estado.emails).toBe(0)
    expect(estado.updates).toEqual([])
  })
})
