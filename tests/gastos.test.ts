import { describe, it, expect } from "vitest"
import { custoUsd, somarUso, saldoDoTexto, montarGastos, ultimosDias } from "../app/lib/gastos"

describe("custo da IA", () => {
  it("Opus 5.5: entrada 4, saída 20, cache lido 0,20 e cache de 1 h 8 (US$ por milhão)", () => {
    expect(custoUsd("claude-opus-5-5", { input_tokens: 1_000_000 })).toBeCloseTo(4)
    expect(custoUsd("claude-opus-5-5", { output_tokens: 1_000_000 })).toBeCloseTo(20)
    expect(custoUsd("claude-opus-5-5", { cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.2)
    expect(custoUsd("claude-opus-5-5", { cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(8)
    expect(custoUsd("claude-opus-5-5", { cache_creation_input_tokens: 1_000_000, cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 0 } })).toBeCloseTo(5)
  })
  it("uma resposta típica do agente (12 mil em cache, 800 de entrada, 400 de saída) custa menos de 2 centavos de dólar", () => {
    expect(custoUsd("claude-opus-5-5", { cache_read_input_tokens: 12_000, input_tokens: 800, output_tokens: 400 })).toBeLessThan(0.02)
  })
  it("soma por dia e guarda só os últimos dias", () => {
    let d = somarUso({}, "2026-11-01", 0.5)
    d = somarUso(d, "2026-11-01", 0.25)
    expect(d["2026-11-01"]).toEqual({ usd: 0.75, chamadas: 2 })
    d = somarUso(d, "2026-11-02", 1, 1)
    expect(Object.keys(d)).toEqual(["2026-11-02"])
  })
})

describe("saldo da Meta", () => {
  it("lê o texto da conta pré-paga", () => {
    expect(saldoDoTexto("Saldo disponível (R$0,49 BRL)")).toBe(0.49)
    expect(saldoDoTexto("Saldo disponível (R$1.234,50 BRL)")).toBe(1234.5)
    expect(saldoDoTexto("Visa •••• 1234")).toBeNull()
  })
})

describe("seção de gastos", () => {
  const agora = new Date("2026-11-07T15:00:00Z")   // 12h em São Paulo
  const dias = ultimosDias(7, agora)                  // 6 anteriores + hoje
  const meta = (valores: number[], saldo: number | null) => ({ saldo, dias: Object.fromEntries(dias.map((d, i) => [d, valores[i] ?? 0])) })

  it("anúncios: média dos dias com gasto (dia parado não puxa para baixo) e dias que o saldo aguenta", () => {
    const g = montarGastos({ agora, alertaDias: 3, pedidos: [], ia: { dias: {}, recarga: null, cotacao: 5 }, meta: meta([100, 0, 120, 140, 0, 140, 30], 250) })
    expect(g.meta!.media).toBe(125)
    expect(g.meta!.diasRestantes).toBe(2)
    expect(g.alertas).toEqual([expect.objectContaining({ tipo: "meta", nivel: "alerta" })])
  })
  it("saldo de R$ 0,49 com gasto de R$ 130/dia: perigo", () => {
    const g = montarGastos({ agora, alertaDias: 3, pedidos: [], ia: { dias: {}, recarga: null, cotacao: 5 }, meta: meta([150, 110, 0, 0, 0, 0, 0], 0.49) })
    expect(g.alertas[0]).toMatchObject({ tipo: "meta", nivel: "perigo" })
  })
  it("IA: saldo informado menos o gasto desde então, em reais", () => {
    const ia = Object.fromEntries(dias.map(d => [d, { usd: 2, chamadas: 100 }]))
    const g = montarGastos({ agora, alertaDias: 3, pedidos: [], meta: null, ia: { dias: ia, recarga: { valor: 30, em: `${dias[3]}T03:00:00Z` }, cotacao: 5 } })
    // recarga no dia 3, à meia-noite de SP: gasto desde = dias 3 (inteiro), 4, 5, 6 = US$ 8 → sobra US$ 22 = R$ 110; R$ 10/dia → 11 dias
    expect(g.ia.restante).toBe(110)
    expect(g.ia.media).toBe(10)
    expect(g.ia.diasRestantes).toBe(11)
    expect(g.alertas).toEqual([])
  })
  it("IA sem crédito (erro da Anthropic depois da última recarga): saldo zero e perigo", () => {
    const g = montarGastos({ agora, alertaDias: 3, pedidos: [], meta: null, ia: { dias: {}, recarga: { valor: 30, em: "2026-11-01T10:00:00Z" }, cotacao: 5, semCreditoEm: "2026-11-07T14:00:00Z" } })
    expect(g.ia.semCredito).toBe(true)
    expect(g.alertas[0]).toMatchObject({ tipo: "ia", nivel: "perigo" })
  })
  it("braço digital: margem dos pedidos pagos contra o gasto de 30 dias", () => {
    const pedidos = [
      { status: "sinal_pago", margem: 150, arte: 70, total: 619.95, sinalPagoEm: "2026-11-06T10:00:00Z", em: "2026-11-06T09:00:00Z" },
      { status: "aguardando_sinal", margem: 150, arte: 70, total: 339.94, em: "2026-11-06T09:00:00Z" },
      { status: "producao", margem: 150, arte: 70, total: 339.94, sinalPagoEm: "2026-11-05T10:00:00Z", em: "2026-11-05T09:00:00Z" },
    ]
    const g = montarGastos({ agora, alertaDias: 3, pedidos, ia: { dias: {}, recarga: null, cotacao: 5 }, meta: meta([100, 100, 100, 100, 100, 100, 0], 1000) })
    expect(g.digital).toMatchObject({ pedidosPagos: 2, margem: 300, faturado: 959.89, gasto30: 600, cobertura: 50 })
    expect(g.digital.porDiaFalta).toBe(0.7)   // R$ 100/dia ÷ R$ 150 por pedido
  })
})
