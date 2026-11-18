import { describe, it, expect } from "vitest"
import { auditar } from "@/app/lib/auditoria"
import type { KanbanCard, LancamentoFinanceiro } from "@/app/types"

const hoje = "2026-11-18"
const card = (x: Partial<KanbanCard>): KanbanCard => ({ id: "c1", numero: "ORC-1", nomeCliente: "Cliente Teste", dimensoes: "", materialNome: "", preco: 1000, quantidade: 1000, data: "2026-11-01", coluna: 1, ...x })
const lanc = (x: Partial<LancamentoFinanceiro>): LancamentoFinanceiro => ({ id: "l1", tipo: "receita", descricao: "Sinal", valor: 500, dataVencimento: "2026-11-02", status: "pago", dataPagamento: "2026-11-02", criadoEm: "2026-11-02", categoria: "venda", ...x })
const base = { transacoes: [], pedidosDigitais: [], conversas: [], hoje }
const da = (r: ReturnType<typeof auditar>, id: string) => r.regras.find(x => x.id === id)!.problemas

describe("auditor de dados", () => {
  it("pedido fechado sem receita é grave", () => {
    const r = auditar({ ...base, cards: [card({})], lancamentos: [] })
    expect(da(r, "receita_faltando")).toHaveLength(1)
    expect(r.graves).toBe(1)
  })
  it("receita que não soma o pedido aparece com a diferença; dentro da tolerância, não", () => {
    const r = auditar({ ...base, cards: [card({})], lancamentos: [lanc({ cardId: "c1" })] })
    expect(da(r, "receita_diverge")[0].valor).toBe(500)
    const ok = auditar({ ...base, cards: [card({})], lancamentos: [lanc({ cardId: "c1", valor: 500 }), lanc({ id: "l2", cardId: "c1", valor: 498 })] })
    expect(da(ok, "receita_diverge")).toHaveLength(0)
  })
  it("lançamento em dobro, mas não quando cada um tem o seu movimento no banco", () => {
    const d = [lanc({ id: "a", tipo: "despesa", descricao: "Pedágio", valor: 3.65, categoria: "transporte" }), lanc({ id: "b", tipo: "despesa", descricao: "Pedágio", valor: 3.65, categoria: "transporte" })]
    expect(da(auditar({ ...base, cards: [], lancamentos: d }), "lancamento_duplicado")).toHaveLength(1)
    const tx = [{ id: "t1", data: "2026-11-02", valor: 3.65, tipo: "saida", estado: "vinculada", descricao: "", lancamento_ids: ["a"] }, { id: "t2", data: "2026-11-02", valor: 3.65, tipo: "saida", estado: "vinculada", descricao: "", lancamento_ids: ["b"] }]
    expect(da(auditar({ ...base, cards: [], lancamentos: d, transacoes: tx }), "lancamento_duplicado")).toHaveLength(0)
  })
  it("banco: vários débitos num lançamento batem como grupo; abatimento de conta não conta como dinheiro", () => {
    const l = [lanc({ id: "r", tipo: "despesa", valor: 30, descricao: "Retiradas" })]
    const tx = [{ id: "t1", data: "2026-11-02", valor: 10, tipo: "saida", estado: "vinculada", descricao: "", lancamento_ids: ["r"] }, { id: "t2", data: "2026-11-03", valor: 20, tipo: "saida", estado: "vinculada", descricao: "", lancamento_ids: ["r"] }]
    expect(da(auditar({ ...base, cards: [], lancamentos: l, transacoes: tx }), "banco_vinculo_quebrado")).toHaveLength(0)
    const conta = [lanc({ id: "d", tipo: "despesa", valor: 2350, formaPagamento: "pix" }), lanc({ id: "ab", tipo: "receita", valor: 2350, formaPagamento: "conta" })]
    const pix = [{ id: "t3", data: "2026-11-02", valor: 2350, tipo: "saida", estado: "vinculada", descricao: "", lancamento_ids: ["d", "ab"] }]
    expect(da(auditar({ ...base, cards: [], lancamentos: conta, transacoes: pix }), "banco_vinculo_quebrado")).toHaveLength(0)
    const errado = [{ id: "t4", data: "2026-11-02", valor: 100, tipo: "saida", estado: "vinculada", descricao: "", lancamento_ids: ["r"] }]
    expect(da(auditar({ ...base, cards: [], lancamentos: l, transacoes: errado }), "banco_vinculo_quebrado")[0].valor).toBe(70)
  })
  it("\"está certo\" tira da conta e a confiança sobe", () => {
    const sem = auditar({ ...base, cards: [card({})], lancamentos: [] })
    const com = auditar({ ...base, cards: [card({})], lancamentos: [], ignorados: [da(sem, "receita_faltando")[0].id] })
    expect(com.total).toBe(0)
    expect(com.confianca).toBe(100)
    expect(com.ignorados).toBe(1)
  })
})
