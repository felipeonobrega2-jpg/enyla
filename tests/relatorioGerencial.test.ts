import { describe, it, expect } from "vitest"
import { periodoAnterior, montarRelatorio, htmlRelatorio } from "@/app/lib/relatorioGerencial"
import type { KanbanCard, LancamentoFinanceiro } from "@/app/types"

const d = (s: string) => new Date(s + "T12:00:00")
const ymd = (x: Date) => x.toLocaleDateString("sv-SE")

describe("relatório gerencial", () => {
  it("período anterior: mês cheio, mês corrente e intervalo livre", () => {
    const m = periodoAnterior({ de: d("2026-10-01"), ate: d("2026-10-31") })
    expect([ymd(m.de), ymd(m.ate)]).toEqual(["2026-09-01", "2026-09-30"])
    const c = periodoAnterior({ de: d("2026-11-01"), ate: d("2026-11-18") })
    expect([ymd(c.de), ymd(c.ate)]).toEqual(["2026-10-01", "2026-10-18"])
    const l = periodoAnterior({ de: d("2026-11-05"), ate: d("2026-11-14") })
    expect([ymd(l.de), ymd(l.ate)]).toEqual(["2026-10-26", "2026-11-04"])
  })
  it("monta números e leitura, e o HTML tem as 5 páginas", () => {
    const card = (id: string, preco: number, fech: string): KanbanCard => ({ id, numero: `ORC-${id}`, nomeCliente: `Cliente ${id}`, dimensoes: "", materialNome: "Cartão", preco, quantidade: 1000, data: fech, dataFechamento: fech, coluna: 4 })
    const l = (id: string, x: Partial<LancamentoFinanceiro>): LancamentoFinanceiro => ({ id, tipo: "receita", descricao: "x", valor: 0, dataVencimento: "2026-10-10", dataPagamento: "2026-10-10", status: "pago", criadoEm: "2026-10-10", ...x })
    const kanban = [card("a", 10000, "2026-10-05"), card("b", 4000, "2026-09-10")]
    const lancamentos = [l("1", { cardId: "a", valor: 10000 }), l("2", { tipo: "despesa", cardId: "a", valor: 8000, categoria: "fornecedor" }), l("3", { cardId: "b", valor: 4000, dataPagamento: "2026-09-12", dataVencimento: "2026-09-12" })]
    const r = montarRelatorio({ kanban, lancamentos, periodo: { de: d("2026-10-01"), ate: d("2026-10-31") }, periodoNome: "Outubro de 2026", nomeCategoria: x => x, extras: null, hoje: d("2026-11-18") })
    expect(r.a.vendido).toBe(10000)
    expect(r.b.vendido).toBe(4000)
    expect(r.pedidosTabela[0].margem).toBeCloseTo(20)
    expect(r.leitura.some(t => t.includes("subiram 150%"))).toBe(true)
    expect(r.leitura.some(t => t.includes("margem abaixo de 30%"))).toBe(true)
    const html = htmlRelatorio(r, "data:,")
    expect(html.match(/class="pg"/g)).toHaveLength(5)
  })
})
