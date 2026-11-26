// Rateio do custo de tiragem entre pedidos impressos juntos (rodada).
// ATENÇÃO: tudo aqui é FICTÍCIO (só teste). Não são os pedidos reais nem o custo real da nota.
import { describe, it, expect } from "vitest"
import { fracoesDaRodada, resultadoDaRodada, custoRateavel, type Rodada } from "../app/lib/rateioRodada"
import { montarPedidos } from "../app/lib/negocio"
import type { KanbanCard, LancamentoFinanceiro } from "../app/types"

const RAN = "card-ran-005", WEL2 = "card-wel-002", WEL3 = "card-wel-003"
const VENDAS = { [RAN]: 900, [WEL2]: 780, [WEL3]: 1560 }

/** Custo da tiragem FICTÍCIO: 1.000 no total rateável (faca compartilhada incluída). */
const TIRAGEM_FICTICIA = { papel: 400, impressao: 300, acerto: 100, corteVinco: 100, acabamento: 50, faca: 50 }

const rodada = (extra: Partial<Rodada> = {}): Rodada => ({
  id: "ROD-001", folhas: 100, posicoesPorFolha: 4, ficticio: true, facaCompartilhada: true,
  custoTerceiro: TIRAGEM_FICTICIA,
  pedidos: [
    { pedidoKey: RAN, posicoes: 1, custoProprio: { cliche: 40, fotolito: 10, arte: 20, frete: 15, imposto: 54 } },
    { pedidoKey: WEL2, posicoes: 1, custoProprio: { cliche: 40, hotStamping: 30 } },
    { pedidoKey: WEL3, posicoes: 2, puxador: true, custoProprio: { cliche: 60, faca: 80 } },
  ],
  ...extra,
})

describe("rateio da rodada", () => {
  it("frações 1/4, 1/4 e 1/2 do custo rateável", () => {
    const f = fracoesDaRodada(rodada())
    expect(f.map(x => x.fracao)).toEqual([0.25, 0.25, 0.5])
    expect(custoRateavel(rodada())).toBe(1000)
    expect(f.map(x => x.custoRateado)).toEqual([250, 250, 500])
  })
  it("faca exclusiva fica fora do rateio", () => {
    expect(custoRateavel(rodada({ facaCompartilhada: false }))).toBe(950)
  })
  it("sobra ou posição vazia soma na fração do puxador", () => {
    const f = fracoesDaRodada(rodada({ posicoesPorFolha: 5 })) // 1 posição vazia
    expect(f.map(x => x.fracaoPropria)).toEqual([0.2, 0.2, 0.4])
    expect(f[2].puxador).toBe(true)
    expect(f[2].fracao).toBeCloseTo(0.6)
    expect(f.reduce((s, x) => s + x.fracao, 0)).toBeCloseTo(1)
  })
  it("sem marca, o puxador é o pedido maior", () => {
    const r = rodada(); r.pedidos[2].puxador = false
    expect(fracoesDaRodada(r)[2].puxador).toBe(true)
  })
  it("margem do pedido = venda − (custo próprio + fração); custos próprios não entram no rateio", () => {
    const res = resultadoDaRodada(rodada(), VENDAS)
    const [ran, wel2, wel3] = res.pedidos
    expect(ran.custoProprio).toBe(139); expect(ran.custoTotal).toBe(389); expect(ran.margem).toBe(511)
    expect(wel2.custoProprio).toBe(70); expect(wel2.margem).toBe(460)
    expect(wel3.custoProprio).toBe(140); expect(wel3.margem).toBe(920)
    // margem da rodada olha o conjunto
    expect(res.vendas).toBe(3240)
    expect(res.margem).toBe(3240 - 1000 - (139 + 70 + 140))
    expect(res.margem).toBe(ran.margem + wel2.margem + wel3.margem)
    expect(res.vermelho).toBe(false)
  })
  it("pedido com margem negativa não pinta a rodada; só fica vermelho se a venda não cobre próprio + fração", () => {
    const res = resultadoDaRodada(rodada(), { ...VENDAS, [WEL2]: 200 })
    expect(res.pedidos[1].vermelho).toBe(true)   // 200 < 70 + 250
    expect(res.pedidos[0].vermelho).toBe(false)
    expect(res.pedidos[2].vermelho).toBe(false)
    expect(res.vermelho).toBe(false)             // a rodada no total se paga
  })
  it("rodada que não se paga fica vermelha", () => {
    expect(resultadoDaRodada(rodada(), { [RAN]: 300, [WEL2]: 300, [WEL3]: 600 }).vermelho).toBe(true)
  })
  it("tamanhos diferentes na mesma folha: rateio por área", () => {
    const r = rodada({ posicoesPorFolha: 3, pedidos: [
      { pedidoKey: RAN, posicoes: 1, areaMm2: 1000 },
      { pedidoKey: WEL2, posicoes: 2, areaMm2: 500, puxador: true },
    ] })
    const f = fracoesDaRodada(r)
    expect(f[0].fracao).toBeCloseTo(0.5)
    expect(f[1].fracao).toBeCloseTo(0.5)
    const r2 = rodada({ pedidos: [{ pedidoKey: RAN, posicoes: 1, areaMm2: 3000 }, { pedidoKey: WEL2, posicoes: 1, areaMm2: 1000 }] })
    expect(fracoesDaRodada(r2).map(x => x.fracao)).toEqual([0.75, 0.25])
    expect(fracoesDaRodada(r2).map(x => x.custoRateado)).toEqual([750, 250])
  })
})

const card = (id: string, preco: number, extra: Partial<KanbanCard> = {}) => ({
  id, numero: `ORC-${id}`, nomeCliente: "Cliente teste", coluna: 3, preco, quantidade: 1000, ...extra,
}) as unknown as KanbanCard
const despesa = (cardId: string, valor: number) => ({
  id: `d-${cardId}`, tipo: "despesa", valor, status: "pago", cardId, descricao: "x", dataVencimento: "2026-11-01",
}) as unknown as LancamentoFinanceiro

describe("montarPedidos com rodada", () => {
  const kanban = [card("ran-005", 900), card("wel-002", 780), card("wel-003", 1560), card("solo", 500)]
  const lanc = [despesa("ran-005", 139), despesa("solo", 200)]

  it("pedido sem rodada conserva custoDireto e margem de hoje", () => {
    const antes = montarPedidos(kanban, lanc)
    const depois = montarPedidos(kanban, lanc, [rodada()])
    const solo = (l: typeof antes) => l.find(p => p.key === "card-solo")!
    expect(solo(depois)).toEqual(solo(antes))
    expect(solo(depois).rodada).toBeUndefined()
    expect(solo(depois).custoDireto).toBe(200)
    expect(montarPedidos(kanban, lanc, [])).toEqual(antes)
  })
  it("pedido com rodadaId ganha o rateio, sem mexer no custoDireto", () => {
    const p = montarPedidos(kanban, lanc, [rodada()]).find(x => x.key === RAN)!
    expect(p.custoDireto).toBe(139)
    expect(p.rodada).toMatchObject({ rodadaId: "ROD-001", custoRateado: 250, custoTotal: 389, margem: 511, rodadaVermelha: false })
  })
})
