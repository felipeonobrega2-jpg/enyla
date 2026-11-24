// Dispensar pendência com motivo (sem apagar): chave estável, ate vencido, reabrir, 400 sem motivo, nenhum DELETE.
import { describe, it, expect, vi, beforeEach } from "vitest"

const banco = vi.hoisted(() => ({ linhas: new Map<string, { dados: unknown; v: number }>(), deletes: 0 }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: { from: () => {
    let id: string | null = null
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (c: string, v: string) => { if (c === "id") id = v; return q }
    q.limit = () => Promise.resolve({ data: [...banco.linhas.values()].map(l => ({ dados: l.dados })), error: null })
    q.maybeSingle = () => Promise.resolve({ data: id && banco.linhas.has(id) ? { v: banco.linhas.get(id)!.v } : null, error: null })
    q.insert = (r: { id: string; dados: unknown }) => { banco.linhas.set(r.id, { dados: r.dados, v: 1 }); return Promise.resolve({ error: null }) }
    q.update = (r: { dados: unknown; v: number }) => ({ eq: () => ({ eq: (_c: string, v: string) => { banco.linhas.set(v, { dados: r.dados, v: r.v }); return Promise.resolve({ error: null }) } }) })
    q.delete = () => { banco.deletes++; return q }
    return q
  } },
}))

import { dispensar, reabrir, dispensadasVigentes, vigente, separar, chaveSistema, chaveDecisao, chaveRecomendacao, type Dispensada } from "@/app/lib/pendenciaDispensada"
import { montarDiretoria } from "@/app/lib/diretoria"
import { pendenciasDaArea, acaoPendencia } from "@/app/lib/pendenciaExterna"
import type { KanbanCard } from "@/app/types"

beforeEach(() => { banco.linhas.clear(); banco.deletes = 0 })

const atrasado = { id: "c1", numero: "ORC-2026-226", nomeCliente: "Arthur", coluna: 3, dataEntregaPrevista: "2026-11-20" } as unknown as KanbanCard
const diretoria = (dispensadas?: Set<string>, hojeIso = "2026-11-23") =>
  montarDiretoria({ kanban: [atrasado], agentesTravados: [], whatsapp: "conectado", semCredito: false, dispensadas }, hojeIso)

describe("dispensar pendência", () => {
  it("a chave é a mesma de um dia para o outro", () => {
    const a = diretoria().find(d => d.id === "coo")!, b = diretoria(undefined, "2026-11-24").find(d => d.id === "coo")!
    expect(a.decisoesChaves).toEqual(["dec:atraso:ORC-2026-226"])
    expect(b.decisoesChaves).toEqual(a.decisoesChaves)
    expect(chaveRecomendacao("coo", "Avisar o Arthur do atraso!")).toBe(chaveRecomendacao("coo", "avisar o arthur do  atraso"))
  })
  it("dispensada some da lista e da pauta no dia seguinte (mesma chave); reabrir volta na hora", async () => {
    const r = await dispensar({ chave: chaveDecisao("atraso:ORC-2026-226"), titulo: "Avisar Arthur", motivo: "já avisei por telefone" }, "Felipe")
    expect(r.ok).toBe(true)
    let ds = await dispensadasVigentes()
    const set = new Set(ds.map(d => d.chave))
    expect(diretoria(set, "2026-11-24").find(d => d.id === "coo")!.decisoes).toEqual([])
    const foto = { decisoes: { coo: [{ texto: "Avisar Arthur do atraso", chave: "dec:atraso:ORC-2026-226" }] } }
    expect(pendenciasDaArea(foto, "coo", ds)).toMatchObject({ pendencias: [], dispensadas: [{ chave: "dec:atraso:ORC-2026-226", motivo: "já avisei por telefone", por: "Felipe" }] })
    expect((await reabrir("dec:atraso:ORC-2026-226", "Felipe")).ok).toBe(true)
    ds = await dispensadasVigentes()
    expect(ds).toEqual([])
    expect(diretoria(new Set(ds.map(d => d.chave))).find(d => d.id === "coo")!.decisoes).toHaveLength(1)
    expect(pendenciasDaArea(foto, "coo", [...banco.linhas.values()].map(l => l.dados as Dispensada)).pendencias).toHaveLength(1)
    expect(banco.linhas.size).toBe(1)   // a linha fica (histórico)
  })
  it("com ate vencido a pendência volta", () => {
    const d: Dispensada = { chave: "sis:atr-1", titulo: "x", motivo: "m", por: "Felipe", em: "2026-11-20T10:00:00Z", ate: "2026-11-22" }
    expect(vigente(d, new Date("2026-11-22T20:00:00-03:00").getTime())).toBe(true)
    expect(vigente(d, new Date("2026-11-23T08:00:00-03:00").getTime())).toBe(false)
    const itens = [{ id: "atr-1" }, { id: "atr-2" }]
    expect(separar(itens, x => chaveSistema(x.id), [d], new Date("2026-11-21T12:00:00Z").getTime()).visiveis).toEqual([{ id: "atr-2" }])
    expect(separar(itens, x => chaveSistema(x.id), [d], new Date("2026-11-24T12:00:00Z").getTime()).visiveis).toHaveLength(2)
  })
  it("400 sem motivo (ou sem chave, ou ate inválido) e nada é gravado", async () => {
    for (const b of [{ chave: "sis:a" }, { chave: "sis:a", motivo: "   " }, { motivo: "x" }, { chave: "sis:a", motivo: "x", ate: "amanhã" }]) {
      const r = await dispensar(b, "Felipe")
      expect(r).toMatchObject({ ok: false, status: 400 })
    }
    expect(banco.linhas.size).toBe(0)
  })
  it("reabrir o que não está dispensado dá 404; nenhum DELETE em nenhum caminho", async () => {
    expect(await reabrir("sis:nada", "Felipe")).toMatchObject({ ok: false, status: 404 })
    await dispensar({ chave: "sis:a", motivo: "m" }, "Felipe"); await reabrir("sis:a", "Felipe")
    expect(banco.deletes).toBe(0)
  })
  it("porta externa: qualquer diretor dispensa e reabre; sem motivo é 400", async () => {
    expect((await acaoPendencia("cmo", { acao: "dispensar_pendencia", chave: "dec:meta-saldo" })).status).toBe(400)
    expect((await acaoPendencia("cmo", { acao: "dispensar_pendencia", chave: "dec:meta-saldo", motivo: "desatualizada" })).status).toBe(200)
    expect((await dispensadasVigentes())[0]).toMatchObject({ chave: "dec:meta-saldo", por: "CMO" })
    expect((await acaoPendencia("coo", { acao: "reabrir_pendencia", chave: "dec:meta-saldo" })).status).toBe(200)
    expect(await dispensadasVigentes()).toEqual([])
    expect(banco.deletes).toBe(0)
  })
})
