// Porta externa: diretor põe tarefa no "Depende de você" do Felipe. Cria, aparece com o diretor, limite de 10,
// cancelar só a própria, feito pelo Felipe sai das abertas, nenhum DELETE.
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

import { acaoTarefaFelipe, tarefasParaLista, tarefasDoDiretor, marcarTarefa, validarTarefa } from "@/app/lib/tarefaFelipe"

beforeEach(() => { banco.linhas.clear(); banco.deletes = 0 })
const criar = (d: "cfo" | "coo", b: Record<string, unknown>) => acaoTarefaFelipe(d, { acao: "tarefa_felipe", ...b })
const idDe = (r: { corpo: Record<string, unknown> }) => (r.corpo.tarefa as { id: string }).id

describe("tarefa_felipe", () => {
  it("cria e aparece na lista com o diretor, a data e o prazo", async () => {
    const r = await criar("cfo", { titulo: "Cancelar a Railway e tirar dos gastos fixos", detalhe: "Painel da Railway", prazo: "2026-12-01" })
    expect(r.status).toBe(200)
    const l = await tarefasParaLista()
    expect(l).toHaveLength(1)
    expect(l[0].porque).toContain("Pedido por CFO")
    expect(l[0].porque).toContain("prazo 01/12/2026")
    expect(l[0].manual).toBe(true)
    expect((await tarefasDoDiretor("cfo")).tarefasParaFelipe.abertas).toHaveLength(1)
    expect((await tarefasDoDiretor("coo")).tarefasParaFelipe.abertas).toHaveLength(0)
  })
  it("valida título e prazo", async () => {
    expect((await criar("cfo", {})).status).toBe(400)
    expect((await criar("cfo", { titulo: "x".repeat(141) })).status).toBe(400)
    expect((await criar("cfo", { titulo: "ok", prazo: "01/12/2026" })).status).toBe(400)
    expect(validarTarefa({ titulo: "x".repeat(140) }).ok).toBe(true)
  })
  it("a 11ª aberta volta 429; o limite é por diretor", async () => {
    for (let i = 0; i < 10; i++) expect((await criar("cfo", { titulo: `t${i}` })).status).toBe(200)
    expect((await criar("cfo", { titulo: "t10" })).status).toBe(429)
    expect((await criar("coo", { titulo: "outro" })).status).toBe(200)
  })
  it("cancela só a própria, sem apagar; libera vaga", async () => {
    const id = idDe(await criar("cfo", { titulo: "minha" }))
    expect((await acaoTarefaFelipe("coo", { operacao: "cancelar", id })).status).toBe(404)
    expect((await acaoTarefaFelipe("cfo", { operacao: "cancelar", id })).status).toBe(200)
    expect(await tarefasParaLista()).toHaveLength(0)
    expect(banco.linhas.size).toBe(1)
    expect(banco.deletes).toBe(0)
  })
  it("feito pelo Felipe sai das abertas e vai para as feitas", async () => {
    const id = idDe(await criar("cfo", { titulo: "feita" }))
    expect(await marcarTarefa(`tarefa:${id}`, true)).toBe(true)
    const v = (await tarefasDoDiretor("cfo")).tarefasParaFelipe
    expect(v.abertas).toHaveLength(0)
    expect(v.feitas).toHaveLength(1)
    expect((await tarefasParaLista())[0].feito).toBe(true)
    expect((await acaoTarefaFelipe("cfo", { operacao: "cancelar", id })).status).toBe(400)
    expect(await marcarTarefa("meta-saldo", true)).toBe(false)
  })
})
