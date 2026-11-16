import { describe, it, expect } from "vitest"
import { saudeDoPeriodo, concentracao, janelas } from "@/app/lib/saudeEmpresa"
import type { Pedido } from "@/app/lib/negocio"
import type { KanbanCard, LancamentoFinanceiro } from "@/app/types"

const hoje = new Date("2026-11-15T12:00:00")
const { atual } = janelas(90, hoje)
const lanc = (tipo: "receita" | "despesa", valor: number, dataPagamento: string): LancamentoFinanceiro =>
  ({ id: `${tipo}${valor}${dataPagamento}`, tipo, descricao: "", valor, dataVencimento: dataPagamento, dataPagamento, status: "pago", criadoEm: dataPagamento }) as LancamentoFinanceiro
const pedido = (nome: string, venda: number, x: Partial<Pedido>): Pedido => ({ key: nome + venda, tipo: "card", numero: "", nomeCliente: nome, cards: [], coluna: 0, etapa: "",
  valor: venda, quantidade: 1000, receitas: [], despesas: [], recebido: 0, sobras: 0, venda, sobrasQuitadas: [], aReceber: 0, cobrado: 0, vencido: 0, semCobranca: 0, custoDireto: 0, ...x })
const card = (data: string) => ({ id: data + Math.random(), coluna: 0, data, materialNome: "Cartão" }) as unknown as KanbanCard

describe("saúde da empresa", () => {
  const pedidos = [
    pedido("Perfumaria Modelo", 6000, { dataFechamento: "2026-10-01", dataEntregaPrevista: "2026-10-15", dataEntregaReal: "2026-10-13",
      receitas: [lanc("receita", 3000, "2026-10-01"), lanc("receita", 3000, "2026-10-13")], despesas: [lanc("despesa", 2000, "2026-10-03")] }),
    pedido("Óleos Exemplo", 2000, { dataFechamento: "2026-10-20", dataEntregaPrevista: "2026-10-30", dataEntregaReal: "2026-11-05" }),
    pedido("Aromas Teste", 2000, { dataFechamento: "2025-01-10" }),
  ]
  const kanban = ["01/10/2026, 10:00:00", "05/10/2026, 10:00:00", "10/10/2026, 10:00:00", "20/10/2026, 10:00:00", "01/11/2026, 10:00:00", "02/11/2026, 10:00:00"].map(card)

  it("orçamentos por venda, pedidos por semana e entrega", () => {
    const s = saudeDoPeriodo(kanban, pedidos, atual)
    expect(s.pedidos).toBe(2)
    expect(s.orcamentosPorVenda).toBe(3)
    expect(s.pedidosPorSemana).toBeCloseTo(2 / (90 / 7), 1)
    expect(s.entregaDias).toBe(14)          // 12 e 16 dias
    expect(s.entregaNoPrazoPct).toBe(50)
  })
  it("ciclo de caixa: recebe em média 6 dias, paga em 2 → banca 4 dias", () => {
    const s = saudeDoPeriodo(kanban, pedidos, atual)
    expect(s.recebimentoDias).toBeCloseTo(6, 0)
    expect(s.pagamentoDias).toBeCloseTo(2, 0)
    expect(s.cicloDias).toBeCloseTo(4, 0)
  })
  it("concentração: maior cliente e 3 maiores no período", () => {
    const c = concentracao(pedidos, atual)
    expect(c.clientes).toBe(2)
    expect(c.maior?.nome).toBe("Perfumaria Modelo")
    expect(c.maior?.pct).toBe(75)
    expect(c.top3Pct).toBe(100)
  })
})
