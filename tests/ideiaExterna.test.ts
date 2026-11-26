import { describe, it, expect, vi, beforeEach } from "vitest"

const est = vi.hoisted(() => ({ cfg: {} as Record<string, unknown> }))
vi.mock("@/app/lib/configAtomica", () => ({
  mudarConfig: vi.fn(async (fn: (d: Record<string, unknown>) => Record<string, unknown> | null) => {
    const m = fn(est.cfg)
    if (m) est.cfg = { ...est.cfg, ...m }
    return est.cfg
  }),
}))

import { registrarIdeia, atualizarIdeia } from "@/app/lib/ideiaExterna"

const ideias = () => est.cfg.ideias as { id: string; texto: string; status: string; autor?: string }[]
beforeEach(() => { est.cfg = { ideias: [{ id: "sis-1-0", texto: "Antiga", status: "ideia", criadaEm: "2026-11-01T00:00:00.000Z" }] } })

describe("registrar_ideia", () => {
  it("grava no topo, status ideia, com o autor da chave", async () => {
    const r = await registrarIdeia("cmo", { texto: "  Nova ideia  " })
    expect(r.status).toBe(200)
    expect(ideias()).toHaveLength(2)
    expect(ideias()[0]).toMatchObject({ texto: "Nova ideia", status: "ideia", autor: "cmo" })
    expect(ideias()[0].id).toMatch(/^ex-[a-z0-9]+$/)
  })
  it("recusa texto vazio e acima de 2.000 caracteres", async () => {
    expect((await registrarIdeia("cfo", { texto: "  " })).status).toBe(400)
    expect((await registrarIdeia("cfo", {})).status).toBe(400)
    expect((await registrarIdeia("cfo", { texto: "a".repeat(2001) })).status).toBe(400)
    expect((await registrarIdeia("cfo", { texto: "a".repeat(2000) })).status).toBe(200)
  })
})

describe("atualizar_ideia", () => {
  it("muda o status e reescreve o texto (juntar duplicadas)", async () => {
    const r = await atualizarIdeia("coo", { id: "sis-1-0", status: "feita", texto: "juntada em ex-abc" })
    expect(r.status).toBe(200)
    expect(ideias()[0]).toMatchObject({ id: "sis-1-0", status: "feita", texto: "juntada em ex-abc" })
  })
  it("sem texto, mantém o texto", async () => {
    await atualizarIdeia("coo", { id: "sis-1-0", status: "andamento" })
    expect(ideias()[0]).toMatchObject({ status: "andamento", texto: "Antiga" })
  })
  it("status inválido: 400 e nada muda", async () => {
    const r = await atualizarIdeia("coo", { id: "sis-1-0", status: "apagada" })
    expect(r.status).toBe(400)
    expect(ideias()[0].status).toBe("ideia")
  })
  it("id inexistente: 404; texto grande: 400", async () => {
    expect((await atualizarIdeia("coo", { id: "nao-existe", status: "feita" })).status).toBe(404)
    expect((await atualizarIdeia("coo", { id: "sis-1-0", status: "feita", texto: "a".repeat(2001) })).status).toBe(400)
  })
})
