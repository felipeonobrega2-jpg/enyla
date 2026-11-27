import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Só dados fictícios.
const est = vi.hoisted(() => ({ cfg: {} as Record<string, unknown>, pluggyChamada: 0, openiChamada: 0, upserts: [] as { id: string }[][] }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerConfigLinha: vi.fn(async () => ({ data: { data: est.cfg } })),
  gravarCampos: vi.fn(async () => ({})),
  mudarConfig: vi.fn(async (f: (d: Record<string, unknown>) => Record<string, unknown> | null) => {
    const m = f(structuredClone(est.cfg)); if (m) est.cfg = { ...est.cfg, ...m }; return est.cfg
  }),
}))
vi.mock("@/app/lib/pluggy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/pluggy")>()),
  pluggyConfigurada: () => true,
  atualizarItem: vi.fn(async () => ({ ok: true })),
  item: vi.fn(async () => ({ ok: true, dados: { connector: { name: "Santander" }, lastUpdatedAt: new Date().toISOString(), status: "UPDATED" } })),
  contas: vi.fn(async () => { est.pluggyChamada++; return { ok: true, dados: { results: [{ id: "pc1", type: "BANK", number: "1111", balance: 1 }] } } }),
  transacoes: vi.fn(async () => ({ ok: true, lista: [] })),
}))
vi.mock("@/app/lib/openi", async orig => {
  const m = await orig<typeof import("@/app/lib/openi")>()
  return { ...m, transacoesOpeni: vi.fn(async () => { est.openiChamada++; return { ok: true, lista: [{ id: "t1", transactionAt: "2099-01-01T12:00:00.000Z", amount: "10.00", type: "CREDIT", description: "Pix fictício", category: { id: "c1", name: "Transfer - PIX" }, payer: { name: "Pagador Exemplo", document: "000.000.000-00", documentType: "CPF" }, receiver: null }] } }) }
})
vi.mock("@/app/lib/supabase", () => {
  const q = (t: string) => {
    const o: Record<string, unknown> = {}
    for (const k of ["select", "eq", "is", "not", "order", "limit", "in", "range", "update"]) o[k] = () => o
    o.upsert = (l: { id: string }[]) => { if (t === "banco_transacoes") est.upserts.push(l); return { select: async () => ({ data: l }) } }
    o.then = (ok: (r: unknown) => unknown) => ok({ data: [], error: null })
    return o
  }
  return { supabase: { from: (t: string) => q(t) } }
})
vi.mock("@/app/lib/claude", () => ({ clienteClaude: () => null, FALLBACK: "", MODELO: "" }))

import { sincronizar } from "@/app/lib/bancoServidor"

const contasOpeni = JSON.stringify([{ item: "i1", conta: "conta-fake-9999", banco: "Itaú" }])
beforeEach(() => {
  est.pluggyChamada = 0; est.openiChamada = 0; est.upserts = []
  est.cfg = { pluggy: { itens: [{ id: "it1" }], dataCorte: "2026-11-01" }, contas: [{ id: "santander", nome: "Santander", banco: "Santander", tipo: "corrente", cor: "#f00", ativa: true, padrao: true }] }
})
afterEach(() => { delete process.env.OPENI_API_KEY; delete process.env.OPENI_CONTAS })

describe("Pluggy e Openi juntas", () => {
  it("Pluggy segue rodando com a Openi configurada (chave em pluggy)", async () => {
    process.env.OPENI_API_KEY = "chave-ficticia"; process.env.OPENI_CONTAS = contasOpeni
    const r = await sincronizar()
    expect(est.pluggyChamada).toBe(1)
    expect(est.openiChamada).toBe(1)
    expect(r.novas).toBe(1)
    expect(est.upserts.flat().map(x => x.id)).toEqual(["openi:t1"])
  })

  it("sem as envs da Openi nada muda", async () => {
    await sincronizar()
    expect(est.pluggyChamada).toBe(1)
    expect(est.openiChamada).toBe(0)
    expect(est.cfg.contasDoBanco).toBeUndefined()
    expect((est.cfg.contas as unknown[]).length).toBe(1)
  })

  it("só a chave, sem OPENI_CONTAS: Openi não roda", async () => {
    process.env.OPENI_API_KEY = "chave-ficticia"
    await sincronizar()
    expect(est.openiChamada).toBe(0)
  })

  it("conta nova é criada uma vez só e mapeada; o Santander existente não duplica", async () => {
    process.env.OPENI_API_KEY = "chave-ficticia"; process.env.OPENI_CONTAS = contasOpeni
    await sincronizar(); await sincronizar()
    const contas = est.cfg.contas as { id: string; banco: string }[]
    expect(contas.filter(c => c.banco === "Itaú")).toHaveLength(1)
    expect(contas).toHaveLength(2)
    const mapa = est.cfg.contasDoBanco as Record<string, Record<string, number>>
    expect(Object.keys(mapa)).toEqual(["conta-fake-9999"])
    expect(Object.keys(mapa["conta-fake-9999"])).toEqual([contas.find(c => c.banco === "Itaú")!.id])
    expect(mapa["pc1"]).toBeUndefined()
  })
})
