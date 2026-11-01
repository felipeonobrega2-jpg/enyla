import { describe, it, expect } from "vitest"
import { previsao } from "@/app/lib/previsao"
import { montarPedidos } from "@/app/lib/negocio"
import { ritmoDosClientes } from "@/app/lib/ritmo"
import { card } from "./fixtures"

const HOJE = new Date("2026-11-04T12:00:00")

describe("previsão dos próximos 30 dias", () => {
  const kanban = [
    card({ numero: "N1", nomeCliente: "Nova", preco: 10000, quantidade: 5000, coluna: 0, data: "02/11/2026, 10:00:00" }),
    card({ numero: "R1", nomeCliente: "Rita", preco: 2000, quantidade: 2000, coluna: 9, dataFechamento: "2026-08-01" }),
    card({ numero: "R2", nomeCliente: "Rita", preco: 2000, quantidade: 2000, coluna: 9, dataFechamento: "2026-09-01" }),
    card({ numero: "P1", nomeCliente: "Paulo", preco: 4000, quantidade: 8000, coluna: 6, dataFechamento: "2026-10-20", dataEntregaPrevista: "2026-11-12" }),
  ]
  const pedidos = montarPedidos(kanban, [])
  const p = previsao({ kanban, pedidos, linhas: [], ritmos: ritmoDosClientes(pedidos, kanban, HOJE), hoje: HOJE })

  it("orçamento aberto e recompra entram pela chance; sem amostra usa o padrão", () => {
    expect(p.itens.map(i => i.tipo).sort()).toEqual(["orcamento", "recompra"])
    expect(p.chanceNovo).toBe(0.15)
    expect(p.esperado).toBeCloseTo(10000 * 0.15 + 2000 * 0.3)   // Rita passou do ritmo: metade da chance
    expect(p.seTudoFechar).toBe(12000)
  })
  it("entregas da semana pela data prevista", () => {
    expect(p.unidadesEmProducao).toBe(8000)
    expect(p.semanas.find(s => s.inicio === "2026-11-09")?.unidades).toBe(8000)
    expect(p.atrasadas).toHaveLength(0)
  })
})
