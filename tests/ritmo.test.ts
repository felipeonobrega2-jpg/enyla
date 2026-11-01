import { describe, it, expect } from "vitest"
import { ritmoDosClientes, hojeDeLembrar } from "@/app/lib/ritmo"
import { montarPedidos } from "@/app/lib/negocio"
import { card } from "./fixtures"

const HOJE = new Date("2026-11-01T12:00:00")
const pedido = (nome: string, fechamento: string, preco = 1000, extra = {}) =>
  card({ numero: `${nome}-${fechamento}`, nomeCliente: nome, preco, coluna: 9, dataFechamento: fechamento, ...extra })
const roda = (cards: ReturnType<typeof card>[]) => ritmoDosClientes(montarPedidos(cards, []), cards, HOJE)

describe("ritmo e curva dos clientes", () => {
  it("intervalo pela mediana; pedidos da mesma leva contam uma vez", () => {
    const r = roda([pedido("Oh", "2026-06-01"), pedido("Oh", "2026-06-03"), pedido("Oh", "2026-07-10"), pedido("Oh", "2026-08-20")])[0]
    expect(r.pedidos).toBe(3)
    expect(r.intervalo).toBe(40)
    expect(r.status).toBe("atrasado")      // 73 dias sem pedir, 1,8× o ritmo
    expect(hojeDeLembrar(r)).toBe(true)
  })
  it("quem está com orçamento aberto não recebe lembrete", () => {
    const cards = [pedido("Ra", "2026-07-01"), pedido("Ra", "2026-08-01"), card({ numero: "ORC-X", nomeCliente: "Ra", preco: 500, coluna: 0 })]
    const r = roda(cards)[0]
    expect(r.emAndamento).toBe(true)
    expect(hojeDeLembrar(r)).toBe(false)
  })
  it("curva A/B/C pelo vendido em 12 meses", () => {
    const rs = roda([pedido("Grande", "2026-10-01", 8000), pedido("Medio", "2026-10-01", 1500), pedido("Pequeno", "2026-10-01", 500)])
    expect(rs.map(r => r.curva)).toEqual(["A", "B", "C"])
  })
})
