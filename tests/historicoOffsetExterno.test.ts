import { describe, it, expect, vi, beforeEach } from "vitest"

const est = vi.hoisted(() => ({ tabelas: {} as Record<string, unknown[]>, escritas: [] as string[] }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (t: string) => {
      const cadeia: Record<string, unknown> = {}
      for (const m of ["select", "range", "eq", "order", "limit"]) cadeia[m] = () => cadeia
      for (const m of ["insert", "update", "upsert", "delete"]) cadeia[m] = () => { est.escritas.push(`${t}.${m}`); return cadeia }
      cadeia.then = (ok: (v: unknown) => unknown) => ok({ data: est.tabelas[t] ?? [], error: null })
      return cadeia
    },
  },
}))

import { lerHistoricoOffset, montarHistoricoOffset, AJUDA_HISTORICO_OFFSET } from "@/app/lib/historicoOffsetExterno"

const dia = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
const card = (p: Record<string, unknown>) => ({ id: "c" + Math.random(), numero: "ORC-1", nomeCliente: "Cliente Teste", coluna: 3, preco: 1000, quantidade: 500, dataFechamento: dia(10), loteId: null, loteNumero: null, ...p })

beforeEach(() => {
  est.escritas = []
  est.tabelas = {
    KanbanCard: [
      card({ id: "a1", numero: "ORC-10", nomeCliente: "Gráfica Alfa", coluna: 9, preco: 2000, quantidade: 1000, dataFechamento: dia(90), dataEntregaReal: dia(70), loteId: "L1", loteNumero: "RAN-006" }),
      card({ id: "a2", numero: "ORC-11", nomeCliente: "Gráfica Alfa", coluna: 9, preco: 500, quantidade: 200, dataFechamento: dia(90), dataEntregaReal: dia(70), loteId: "L1", loteNumero: "RAN-006" }),
      card({ id: "b1", numero: "ORC-20", nomeCliente: "Loja Beta", coluna: 4, preco: 800, quantidade: 300, dataFechamento: dia(5) }),
      card({ id: "x1", numero: "ORC-30", nomeCliente: "Aberto", coluna: 0 }),
    ],
    LancamentoFinanceiro: [{ id: "s1", tipo: "receita", categoria: "sobra", valor: 100, status: "pago", cardId: "b1", dataVencimento: dia(4) }],
  }
})

describe("?o=historico_offset", () => {
  it("ajuda documentada", () => {
    expect(AJUDA_HISTORICO_OFFSET).toMatch(/lote/)
    expect(AJUDA_HISTORICO_OFFSET).toMatch(/Só leitura/)
  })

  it("dois códigos, lote com vários orçamentos, sem lote vazio, valor com sobra", async () => {
    const { status, corpo } = await lerHistoricoOffset()
    expect(status).toBe(200)
    const cs = corpo.clientes as ReturnType<typeof montarHistoricoOffset>
    const alfa = cs.find(c => c.cliente === "Gráfica Alfa")!
    expect(alfa.pedidos).toHaveLength(1)
    expect(alfa.pedidos[0]).toMatchObject({ orcamentos: ["ORC-10", "ORC-11"], lote: "RAN-006", entregue: true, quantidade: 1200, valor: 2500 })
    expect(alfa.pedidos[0].dataEntregaReal).toBe(dia(70))
    const beta = cs.find(c => c.cliente === "Loja Beta")!
    expect(beta.pedidos[0]).toMatchObject({ orcamentos: ["ORC-20"], lote: null, entregue: false, valor: 900 })
    expect(cs.find(c => c.cliente === "Aberto")).toBeUndefined()
  })

  it("ordena por dias desde a última compra (maior primeiro) e traz o nível", async () => {
    const cs = (await lerHistoricoOffset()).corpo.clientes as ReturnType<typeof montarHistoricoOffset>
    expect(cs.map(c => c.cliente)).toEqual(["Gráfica Alfa", "Loja Beta"])
    expect(cs[0].diasDesdeUltimaCompra!).toBeGreaterThan(cs[1].diasDesdeUltimaCompra!)
    expect(["A", "B", "C", ""]).toContain(cs[0].nivel)
  })

  it("só leitura e sem telefone, e-mail ou documento", async () => {
    est.tabelas.KanbanCard = (est.tabelas.KanbanCard as Record<string, unknown>[]).map(c => ({ ...c, telefone: "11999990000", email: "x@y.com", documento: "123.456.789-00" }))
    const txt = JSON.stringify((await lerHistoricoOffset()).corpo)
    expect(txt).not.toMatch(/telefone|email|documento|11999990000|x@y\.com|123\.456/)
    expect(est.escritas).toEqual([])
  })
})
