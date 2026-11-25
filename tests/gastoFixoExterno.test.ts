// Porta externa, ação gasto_fixo: só o CFO; criar, editar, desativar (soft delete), validação e 404.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({ cfg: {} as Record<string, unknown>, diretor: "cfo" as string | null, conversa: [] as unknown[] }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async () => ({})),
  mudarConfig: vi.fn(async (f: (d: Record<string, unknown>) => Record<string, unknown> | null) => {
    const m = f(structuredClone(estado.cfg)); if (m) estado.cfg = { ...estado.cfg, ...m }; return estado.cfg
  }),
}))
vi.mock("@/app/lib/acessoExterno", () => ({
  LIMITE_POR_HORA: 120,
  conferirChave: vi.fn(async () => estado.diretor ? { ok: true, diretor: estado.diretor } : { ok: false, status: 401, erro: "Sem chave." }),
}))
vi.mock("@/app/lib/diretoriaServidor", () => ({
  lerConversa: vi.fn(async () => estado.conversa), gravarConversa: vi.fn(async (_d: string, m: unknown[]) => { estado.conversa = m }), lerPlanos: vi.fn(),
}))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({ supabase: {} }))

import { POST, GET } from "@/app/api/externo/route"
import { NextRequest } from "next/server"

const pedir = (corpo: unknown) => POST(new NextRequest("http://x/api/externo", { method: "POST", headers: { authorization: "Bearer k" }, body: JSON.stringify(corpo) }))
const lista = () => estado.cfg.gastosFixos as { id: string; ativa: boolean; nome: string; valor: number; alteradoPor?: string; alteradoEm?: string; obs?: string }[]

beforeEach(() => {
  estado.diretor = "cfo"; estado.conversa = []
  estado.cfg = { outro: 1, gastosFixos: [{ id: "sis-railway", nome: "Railway", categoriaId: "c1", valor: 100, diaVencimento: 5, ativa: true }] }
})

describe("gasto_fixo", () => {
  it("cria com id novo, ativa, marca quem mexeu e grava a conversa", async () => {
    const r = await pedir({ acao: "gasto_fixo", operacao: "criar", nome: " Internet ", valor: 199.9, diaVencimento: 10, categoriaId: "", obs: "cartão 7150" })
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.ok).toBe(true); expect(j.gasto).toMatchObject({ nome: "Internet", ativa: true, alteradoPor: "cfo", obs: "cartão 7150" })
    expect(lista()).toHaveLength(2); expect(estado.cfg.outro).toBe(1)
    expect(estado.conversa).toHaveLength(1)
  })
  it("edita só o enviado e preserva o resto (inclusive item sis-)", async () => {
    const r = await pedir({ acao: "gasto_fixo", operacao: "editar", id: "sis-railway", valor: 120 })
    expect(r.status).toBe(200)
    expect(lista()[0]).toMatchObject({ nome: "Railway", valor: 120, diaVencimento: 5, categoriaId: "c1", alteradoPor: "cfo" })
    expect(lista()[0].alteradoEm).toBeTruthy()
  })
  it("desativa sem remover o item; repetir também dá ok", async () => {
    const r = await pedir({ acao: "gasto_fixo", operacao: "desativar", id: "sis-railway" })
    expect(r.status).toBe(200)
    expect(lista()).toHaveLength(1); expect(lista()[0].ativa).toBe(false)
    const r2 = await pedir({ acao: "gasto_fixo", operacao: "desativar", id: "sis-railway" })
    expect(r2.status).toBe(200); expect((await r2.json()).ok).toBe(true); expect(lista()).toHaveLength(1)
  })
  it("403 para as outras chaves e 401 sem chave", async () => {
    for (const d of ["coo", "cco", "cmo", "cto"]) {
      estado.diretor = d
      expect((await pedir({ acao: "gasto_fixo", operacao: "criar", nome: "x", valor: 1 })).status).toBe(403)
    }
    expect(lista()).toHaveLength(1)
    estado.diretor = null
    expect((await pedir({ acao: "gasto_fixo", operacao: "criar", nome: "x", valor: 1 })).status).toBe(401)
  })
  it("400 de validação", async () => {
    const casos: Record<string, unknown>[] = [
      { operacao: "criar", valor: 10 }, { operacao: "criar", nome: "  ", valor: 10 }, { operacao: "criar", nome: "a" },
      { operacao: "criar", nome: "a", valor: 0 }, { operacao: "criar", nome: "a", valor: "10" }, { operacao: "criar", nome: "a", valor: 1, diaVencimento: 32 },
      { operacao: "criar", nome: "a", valor: 1, diaVencimento: 1.5 }, { operacao: "criar", nome: "a", valor: 1, obs: 3 },
      { operacao: "editar", valor: 5 }, { operacao: "desativar" }, { operacao: "apagar", id: "x" },
    ]
    for (const c of casos) {
      const r = await pedir({ acao: "gasto_fixo", ...c })
      expect(r.status, JSON.stringify(c)).toBe(400); expect((await r.json()).erro).toBeTruthy()
    }
    expect(lista()).toHaveLength(1)
  })
  it("404 de id inexistente", async () => {
    expect((await pedir({ acao: "gasto_fixo", operacao: "editar", id: "nada", valor: 5 })).status).toBe(404)
    expect((await pedir({ acao: "gasto_fixo", operacao: "desativar", id: "nada" })).status).toBe(404)
  })
  it("o GET de ajuda documenta a ação", async () => {
    const r = await GET(new NextRequest("http://x/api/externo", { headers: { authorization: "Bearer k" } }))
    expect(JSON.stringify((await r.json()).escrita)).toContain("gasto_fixo")
  })
})
