// Cronograma Offset por etapa e lote: leitura, gravação e alerta de atraso. Dados fictícios; sem DELETE.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({ cfg: {} as Record<string, unknown>, cards: [] as Record<string, unknown>[], ops: [] as string[] }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async (campos: string[]) => Object.fromEntries(campos.filter(c => estado.cfg[c] !== undefined).map(c => [c, structuredClone(estado.cfg[c])]))),
  mudarConfig: vi.fn(async (f: (d: Record<string, unknown>) => Record<string, unknown> | null) => { const m = f(structuredClone(estado.cfg)); if (m) estado.cfg = { ...estado.cfg, ...m }; return estado.cfg }),
}))
vi.mock("@/app/lib/supabase", () => ({
  supabase: { from: () => {
    let filtro: [string, unknown] | null = null
    const q: Record<string, unknown> = {}
    for (const m of ["select", "not", "gte", "lte"]) q[m] = () => q
    q.eq = (c: string, v: unknown) => { filtro = [c, v]; return q }
    q.delete = () => { estado.ops.push("delete"); return q }
    q.then = (ok: (r: unknown) => unknown) => ok({ data: estado.cards.filter(c => !filtro || c[filtro[0]] === filtro[1]), error: null })
    return q
  } },
}))

import { atraso, montarCronograma, leituraCronograma, gravarCronograma } from "@/app/lib/cronogramaExterno"

const cards = [{ numero: "ORC-T1", loteNumero: "L-900", coluna: 5, nomeCliente: "Fulano Fictício" }, { numero: "ORC-T2", loteNumero: "L-900", coluna: 6 }]
beforeEach(() => { estado.cfg = {}; estado.cards = structuredClone(cards); estado.ops = [] })

describe("alerta de atraso", () => {
  it("sem retorno usa hoje; com retorno usa a data real", () => {
    expect(atraso("2026-11-10", null, "2026-11-13")).toEqual({ atrasada: true, diasAtraso: 3 })
    expect(atraso("2026-11-10", null, "2026-11-10")).toEqual({ atrasada: false, diasAtraso: 0 })
    expect(atraso("2026-11-10", "2026-11-09", "2026-11-30")).toEqual({ atrasada: false, diasAtraso: 0 })
    expect(atraso("2026-11-10", "2026-11-12", "2026-11-30")).toEqual({ atrasada: true, diasAtraso: 2 })
    expect(atraso(null, null, "2026-11-30").atrasada).toBe(false)
  })
})

describe("leitura", () => {
  it("monta por lote, lista atrasadas e não expõe dado de cliente", async () => {
    estado.cfg = { cronogramaOffset: { "L-900": { "5": { previsto: "2026-11-10", historico: [] }, "6": { previsto: "2026-11-20", real: "2026-11-19", historico: [] } } } }
    const l = await leituraCronograma("2026-11-13")
    const lote = l.corpo.lotes[0]
    expect(lote).toMatchObject({ loteNumero: "L-900", pedidos: 2, etapaAtual: "Impressão", atrasos: 1 })
    expect(lote.etapas.map(e => [e.coluna, e.atrasada])).toEqual([[5, true], [6, false]])
    expect(l.corpo.atrasadas).toEqual([{ loteNumero: "L-900", etapa: "Impressão", diasAtraso: 3, confirmado: false, rotuloPrevisto: "não confirmado" }])
    expect(JSON.stringify(l.corpo)).not.toMatch(/Fulano|nomeCliente/)
  })
  it("lote sem cronograma aparece sem etapas", () => {
    expect(montarCronograma(cards as never, {}, "2026-11-13").lotes[0].etapas).toEqual([])
  })
})

describe("não confirmado", () => {
  it("previsto sem confirmação do fornecedor sai rotulado e não firme; confirmado só com previstoConfirmado", async () => {
    estado.cfg = { cronogramaOffset: { "L-900": { "5": { previsto: "2026-11-10", historico: [] }, "6": { previsto: "2026-11-20", previstoConfirmado: true, historico: [] } } } }
    const l = await leituraCronograma("2026-11-13")
    expect(l.corpo.lotes[0].etapas.map(e => [e.coluna, e.confirmado, e.rotuloPrevisto])).toEqual([[5, false, "não confirmado"], [6, true, "confirmado"]])
    expect(l.corpo.atrasadas[0]).toMatchObject({ etapa: "Impressão", confirmado: false, rotuloPrevisto: "não confirmado" })
  })
  it("data gravada entra não confirmada; confirmar exige a data", async () => {
    const a = await gravarCronograma("cto", { loteNumero: "L-900", etapa: 5, previsto: "2026-11-20" })
    expect(a.ok && a.gravado.previstoConfirmado).toBe(false)
    expect(await gravarCronograma("cto", { loteNumero: "L-900", etapa: 5, previstoConfirmado: true })).toMatchObject({ ok: false, status: 400 })
    const b = await gravarCronograma("cto", { loteNumero: "L-900", etapa: 5, previsto: "2026-11-22", previstoConfirmado: true })
    expect(b.ok && b.gravado.previstoConfirmado).toBe(true)
    const c = await gravarCronograma("cto", { loteNumero: "L-900", etapa: 5, previsto: "2026-11-25" })
    expect(c.ok && c.gravado.previstoConfirmado).toBe(false)
  })
})

describe("gravação", () => {
  it("grava previsto/real e histórico, e aceita o gancho do ordenar_fornecedor", async () => {
    const r = await gravarCronograma("cto", { loteNumero: "L-900", etapa: 6, previsto: "2026-11-20", envioFornecedor: { fornecedorId: "forn-1", enviadoEm: "2026-11-15", ordemId: "ord-1" } })
    expect(r.ok).toBe(true)
    const r2 = await gravarCronograma("coo", { loteNumero: "L-900", etapa: 6, real: "2026-11-21" })
    expect(r2.ok && r2.gravado).toMatchObject({ previsto: "2026-11-20", real: "2026-11-21", envioFornecedor: { fornecedorId: "forn-1", ordemId: "ord-1" } })
    expect(r2.ok && r2.gravado.historico.map(h => h.autor)).toEqual(["cto", "coo"])
    expect(estado.ops).toEqual([])
  })
  it("recusa entrada inválida e lote inexistente", async () => {
    expect((await gravarCronograma("cto", { loteNumero: "L-900", etapa: 9, previsto: "2026-11-20" }))).toMatchObject({ ok: false, status: 400 })
    expect((await gravarCronograma("cto", { loteNumero: "L-900", etapa: 5, previsto: "20/11" }))).toMatchObject({ ok: false, status: 400 })
    expect((await gravarCronograma("cto", { loteNumero: "L-900", etapa: 5, real: null }))).toMatchObject({ ok: false, status: 400 })
    expect((await gravarCronograma("cto", { loteNumero: "L-900", etapa: 5 }))).toMatchObject({ ok: false, status: 400 })
    expect((await gravarCronograma("cto", { loteNumero: "L-404", etapa: 5, previsto: "2026-11-20" }))).toMatchObject({ ok: false, status: 404 })
    expect(estado.cfg.cronogramaOffset).toBeUndefined()
  })
})
