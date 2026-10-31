import { describe, it, expect } from "vitest"
import { previsaoDeCaixa } from "@/app/lib/caixa"
import { montarPedidos } from "@/app/lib/negocio"
import { calcular } from "@/app/calculos"
import { card, despesa, receita, config, FORM } from "./fixtures"

const HOJE = new Date("2026-11-02T12:00:00")
const cfg = config()

function cenario(lancs: ReturnType<typeof despesa>[], extraCfg = {}) {
  const c = card({ numero: "ORC-T1", preco: 5000, quantidade: 3000, coluna: 7, dataEntregaPrevista: "2026-11-04" })
  const historico = [{ numero: c.numero, form: FORM }]
  const conf = { ...cfg, ...extraCfg }
  const itens = calcular({ ...FORM, quantidades: [3000] }, conf)!.rotas![0].melhor.itens
  const v = (e: string) => itens.filter(i => i.etapa === e).reduce((s, i) => s + i.valor, 0)
  const ls = lancs.map(l => ({ ...l, cardId: c.id }))
  const prev = previsaoDeCaixa({ pedidos: montarPedidos([c], ls), lancamentos: ls, historico, config: conf, hoje: HOJE })
  const prod = prev.semanas.flatMap(w => w.saidas).find(m => m.origem === "producao")
  return { v, prev, prod }
}

describe("custos de produção a vir", () => {
  it("etapa que custou mais não esconde as que faltam (caso DEN-001)", () => {
    const { v, prod } = cenario([despesa({ valor: 5000, descricao: "Impressão", subcategoria: "Impressão" })])
    // impressão estourou; papel, verniz, corte e colagem continuam a pagar
    expect(prod?.valor).toBeCloseTo(v("papel") + v("verniz") + v("corteVinco") + v("colagem"), 1)
  })
  it("impressor com conta corrente: papel e impressão vão para a conta, não saem do caixa", () => {
    const { v, prev, prod } = cenario([])
    expect(prod?.valor).toBeCloseTo(v("verniz") + v("corteVinco") + v("colagem"), 1)
    expect(prev.contas[0].aVir).toBeCloseTo(v("papel") + v("impressao"), 1)
  })
})

describe("entradas", () => {
  it("saldo sem cobrança entra na entrega; cliente de relacionamento entra N dias depois", () => {
    const c = card({ numero: "ORC-T2", nomeCliente: "Maurício", preco: 8200, coluna: 5, dataEntregaPrevista: "2026-11-10" })
    const base = { pedidos: montarPedidos([c], []), lancamentos: [], historico: [], hoje: HOJE }
    const quando = (conf: typeof cfg) => previsaoDeCaixa({ ...base, config: conf }).semanas.findIndex(w => w.entradas.some(m => m.valor === 8200))
    expect(quando(cfg)).toBe(1)
    expect(quando({ ...cfg, clientesRelacionamento: [{ nome: "Mauricio", diasAposEntrega: 30 }] })).toBe(5)
  })
  it("entregue sem pagamento entra como atrasado na semana atual", () => {
    const c = card({ numero: "ORC-T3", preco: 4105, coluna: 9, dataEntregaPrevista: "2026-10-30" })
    const prev = previsaoDeCaixa({ pedidos: montarPedidos([c], []), lancamentos: [], historico: [], config: cfg, hoje: HOJE })
    expect(prev.semanas[0].entradas[0]).toMatchObject({ valor: 4105, atrasado: true })
  })
  it("conta corrente: saldo = serviços − abatimentos", () => {
    const ls = [despesa({ valor: 32760, formaPagamento: "conta", fornecedorId: "fin-jero", status: "pendente" }), receita({ valor: 25514, formaPagamento: "conta", fornecedorId: "fin-jero" })]
    const prev = previsaoDeCaixa({ pedidos: [], lancamentos: ls, historico: [], config: cfg, hoje: HOJE })
    expect(prev.contas[0].saldo).toBeCloseTo(7246)
    expect(prev.semanas[0].totalSaidas).toBe(0) // dívida sem data não sai do caixa
  })
})
