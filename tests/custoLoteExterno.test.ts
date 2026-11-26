// Porta externa, ?o=custo_lote: só a chave do CFO, só leitura. Dados fictícios.
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({ diretor: "cfo" as string, escritas: 0, tabelas: {} as Record<string, unknown[]> }))
vi.mock("@/app/lib/acessoExterno", () => ({
  LIMITE_POR_HORA: 120,
  conferirChave: vi.fn(async () => ({ ok: true, diretor: estado.diretor })),
}))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async () => ({})), lerConfigLinha: vi.fn(async () => ({ data: { data: {} }, error: null })),
  mudarConfig: vi.fn(async () => { estado.escritas++ }),
}))
vi.mock("@/app/lib/diretoriaServidor", () => ({ lerConversa: vi.fn(async () => []), gravarConversa: vi.fn(), lerPlanos: vi.fn() }))
vi.mock("@/app/lib/conversaDiretor", () => ({ aquecerFoto: vi.fn(), executarFerramenta: vi.fn(), fotoRapida: vi.fn() }))
vi.mock("@/app/lib/gastosServidor", () => ({ gastosAtuais: vi.fn(async () => ({})) }))
vi.mock("@/app/lib/supabase", () => {
  const consulta = (t: string) => {
    const q: Record<string, unknown> = {}
    for (const m of ["select", "eq", "order", "limit", "neq", "in"]) q[m] = () => q
    for (const m of ["insert", "update", "delete", "upsert"]) q[m] = () => { estado.escritas++; return q }
    q.then = (ok: (v: unknown) => unknown) => ok({ data: estado.tabelas[t] ?? [], error: null })
    return q
  }
  return { supabase: { from: (t: string) => consulta(t) } }
})

import { GET } from "@/app/api/externo/route"
import { NextRequest } from "next/server"

const ler = (q = "o=custo_lote") => GET(new NextRequest(`http://x/api/externo?${q}`, { headers: { authorization: "Bearer k" } }))
const card = (id: string, lote: string, preco: number, extra: Record<string, unknown> = {}) =>
  ({ id, numero: `ORC-${id}`, nomeCliente: "Cliente A", coluna: 3, preco, quantidade: 100, loteId: lote, loteNumero: lote.toUpperCase(), data: "01/11/2026, 10:00:00", ...extra })
const desp = (id: string, valor: number, extra: Record<string, unknown> = {}) =>
  ({ id, tipo: "despesa", descricao: "Despesa", valor, dataVencimento: "2026-11-10", status: "pago", dataPagamento: "2026-11-10", criadoEm: "x", ...extra })

beforeEach(() => {
  estado.diretor = "cfo"; estado.escritas = 0
  estado.tabelas = {
    KanbanCard: [
      card("k1", "l1", 1000, { opcoes: { _x: { projecaoCustos: { papel: 300, impressao: 200 } } } }),
      card("k2", "l2", 800),
    ],
    LancamentoFinanceiro: [
      desp("d1", 250, { loteId: "l1", categoria: "materiais", descricao: "Papel couchê", fornecedorId: "f1" }),
      desp("d2", 100, { loteId: "l1", categoria: "servicos", descricao: "Frete" }),
      desp("d3", 999, { loteId: "l1", status: "pendente" }),
      // uma despesa de 400 rateada em 2 lotes: 250 + 150, mesmo grupo
      desp("r1", 250, { loteId: "l1", fornecedorId: "f2", rateioGrupoId: "g-1" }),
      desp("r2", 150, { loteId: "l2", fornecedorId: "f2", rateioGrupoId: "g-1" }),
    ],
  }
})

describe("?o=custo_lote", () => {
  it("403 para as outras chaves", async () => {
    for (const d of ["coo", "cco", "cmo", "cto"]) { estado.diretor = d; expect((await ler()).status, d).toBe(403) }
  })

  it("lote com despesas próprias soma certo (papel incluso; pendente fora)", async () => {
    const r = await (await ler("o=custo_lote&lote=L1")).json()
    const l = r.lotes[0]
    expect(l.custoReal).toBe(600) // 250 papel + 100 frete + 250 fatia
    expect(l.papel).toBe(250)
    expect(l.porFornecedor.f1).toBe(250)
    expect(l.porCategoria.materiais).toBe(250)
  })

  it("fatias do mesmo rateioGrupoId entram só com o valor da fatia (total não se repete)", async () => {
    const r = await (await ler()).json()
    const por = Object.fromEntries(r.lotes.map((x: { lote: string }) => [x.lote, x]))
    expect(por.L1.rateios).toEqual([{ rateioGrupoId: "g-1", fatia: 250 }])
    expect(por.L2.rateios).toEqual([{ rateioGrupoId: "g-1", fatia: 150 }])
    expect(por.L2.custoReal).toBe(150)
    expect(por.L1.custoReal + por.L2.custoReal - 600).toBe(150) // soma das fatias = 400, não 800
  })

  it("margem real vs orçada", async () => {
    const r = await (await ler("o=custo_lote&lote=L1")).json()
    const m = r.lotes[0].margem
    expect(m.real).toBe(400) // 1000 - 600
    expect(m.orcada).toBe(500) // 1000 - (300 + 200)
    expect(m.diferenca).toBe(-100)
    const sem = (await (await ler("o=custo_lote&lote=L2")).json()).lotes[0].margem
    expect(sem.orcada).toBeNull()
  })

  it("separa por categoria com nome (frete/materiais/sem categoria), sem somar numa faixa só", async () => {
    const l = (await (await ler("o=custo_lote&lote=L1")).json()).lotes[0]
    expect(l.categorias).toHaveLength(3)
    expect(l.categorias).toEqual(expect.arrayContaining([
      { id: "sem_categoria", nome: "(sem categoria)", valor: 250 }, { id: "materiais", nome: "Materiais", valor: 250 }, { id: "servicos", nome: "Serviços", valor: 100 },
    ]))
  })

  it("só leitura", async () => { await ler(); expect(estado.escritas).toBe(0) })
})
