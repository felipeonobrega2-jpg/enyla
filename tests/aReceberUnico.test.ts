// "A receber": a porta (parte=receber) e a tela inicial (andar Financeiro) devolvem os mesmos três números:
// pedidos (sem comissão), comissão pendente e total. Só leitura.
import { describe, it, expect } from "vitest"
import { totaisAReceber } from "@/app/lib/aReceber"
import { financeiroDoAndar } from "@/app/lib/financeiroAndar"
import type { KanbanCard, LancamentoFinanceiro } from "@/app/types"

const kanban = [{ id: "k1", numero: "100", nomeCliente: "Cliente A", coluna: 1, preco: 1000, quantidade: 100, data: "01/11/2026, 10:00:00" }] as unknown as KanbanCard[]
const lancs = [
  { id: "l1", tipo: "receita", descricao: "Sinal", valor: 400, dataVencimento: "2026-10-01", status: "pago", dataPagamento: "2026-10-01", cardId: "k1", cardNumero: "100", nomeCliente: "Cliente A", criadoEm: "x" },
  { id: "l2", tipo: "receita", descricao: "Saldo", valor: 600, dataVencimento: "2026-10-20", status: "pendente", cardId: "k1", cardNumero: "100", nomeCliente: "Cliente A", criadoEm: "x" },
] as unknown as LancamentoFinanceiro[]
const negocios = [{ comissaoValor: 1000, status: "pendente" }, { comissaoValor: 800, status: "pendente" }, { comissaoValor: 500, status: "pago" }]

describe("a receber: uma função só", () => {
  it("separa pedidos, comissão pendente (só as pendentes) e total", () => {
    const t = totaisAReceber(kanban, lancs, negocios)
    expect(t.pedidos).toBe(600)
    expect(t.comissaoPendente).toBe(1800)
    expect(t.total).toBe(2400)
  })

  it("a tela inicial devolve os mesmos três números da função (a da porta)", () => {
    const t = totaisAReceber(kanban, lancs, negocios)
    const andar = financeiroDoAndar(kanban, lancs, null, new Date(), { negocios })
    expect([andar.aReceberPedidos, andar.comissaoPendente, andar.aReceber]).toEqual([t.pedidos, t.comissaoPendente, t.total])
  })

  it("sem comissão pendente, o total é o dos pedidos", () => {
    const t = totaisAReceber(kanban, lancs, [])
    expect(t.comissaoPendente).toBe(0)
    expect(t.total).toBe(t.pedidos)
  })
})
