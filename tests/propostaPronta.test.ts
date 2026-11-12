import { describe, it, expect } from "vitest"
import { caixaDosDados, faltaParaProposta, quantidadesDaProposta, markupAprendido, montarProposta, ajustarPreco, baseDoHistorico, mudouAProposta } from "@/app/lib/propostaPronta"
import { retornoDoPeriodo, margemPorReal } from "@/app/lib/retornoCampanhas"
import { config } from "./fixtures"
import type { DadosPedido } from "@/app/lib/atendente"
import type { Pedido } from "@/app/lib/negocio"

const dados = (x: Partial<DadosPedido>): DadosPedido => ({ produto: "perfume", volume_ml: null, caixa_cm: null, frasco_cm: null, quantidade: null, tem_arte: null, resumo: "", ...x })

describe("proposta pronta: o que dá para montar", () => {
  it("usa a caixa que o cliente deu", () => {
    expect(caixaDosDados(dados({ caixa_cm: { frente: 6, lateral: 6, altura: 13 } }))).toEqual({ frente: 6, lateral: 6, alturaBox: 13, padrao: false })
  })
  it("sem caixa, usa o padrão do ml (marcado para confirmar)", () => {
    const c = caixaDosDados(dados({ volume_ml: 100 }))!
    expect(c.padrao).toBe(true)
    expect(c.alturaBox).toBeCloseTo(13.2)
  })
  it("frasco com três medidas vira a caixa justa", () => {
    const c = caixaDosDados(dados({ frasco_cm: "4 x 4 x 12" }))!
    expect(c).toMatchObject({ alturaBox: 12.4, padrao: false })
  })
  it("diz o que falta", () => {
    expect(faltaParaProposta(dados({ volume_ml: 50 }))).toMatch(/quantidade/)
    expect(faltaParaProposta(dados({ quantidade: 3000 }))).toMatch(/medidas/)
    expect(faltaParaProposta(dados({ quantidade: 3000, volume_ml: 50 }))).toBeNull()
    expect(faltaParaProposta(dados({ quantidade: 3000, volume_ml: 200 }))).toMatch(/medidas/)   // acima de 120 ml não chuta
  })
  it("quantidades: a pedida e duas faixas acima", () => {
    expect(quantidadesDaProposta(3000)).toEqual([3000, 5000, 10000])
    expect(quantidadesDaProposta(1500)).toEqual([1500, 2000, 3000])
  })
})

describe("markup aprendido", () => {
  const a = (razao: number, quantidade = 3000, primeiroDoCliente = false) => ({ quantidade, razao, primeiroDoCliente })
  it("usa a mediana dos pedidos fechados na mesma faixa", () => {
    expect(markupAprendido(3000, [a(2.0), a(2.1), a(1.9), a(3.0, 10000)], [], 2)).toEqual({ multiplicador: 2, origem: "seus_orcamentos" })
  })
  it("ignora pedido abaixo de 1,2× (lançamento errado)", () => {
    expect(markupAprendido(3000, [a(0.5), a(0.6), a(2.2), a(2.4), a(2.3)], [], 2).multiplicador).toBe(2.3)
  })
  it("primeiro pedido do cliente pesa em dobro (é o caso do lead novo)", () => {
    expect(markupAprendido(3000, [a(1.6), a(1.6), a(2.4, 3000, true), a(2.4, 3000, true)], [], 2).multiplicador).toBe(2.4)
  })
  it("pouca amostra na faixa usa as outras faixas; nenhuma, o padrão", () => {
    expect(markupAprendido(1000, [a(2.0), a(2.2), a(2.4)], [], 2).multiplicador).toBe(2.2)
    expect(markupAprendido(3000, [], [], 2)).toEqual({ multiplicador: 2, origem: "configuracao" })
  })
  it("seu ajuste na aprovação pesa em dobro", () => {
    const aj = [{ em: "", quantidade: 3000, sugerido: 1000, aprovado: 900, multiplicadorAprovado: 1.8 }, { em: "", quantidade: 3500, sugerido: 1000, aprovado: 900, multiplicadorAprovado: 1.8 }]
    expect(markupAprendido(3000, [a(2.4), a(2.4)], aj, 2).multiplicador).toBe(1.8)
  })
})

describe("montar e ajustar", () => {
  it("monta com o motor e o markup escolhido", () => {
    const m = montarProposta(dados({ quantidade: 3000, caixa_cm: { frente: 6, lateral: 6, altura: 13 } }), "Ana", config(), {}, 2.5)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.quantidade).toBe(3000)
    expect(m.opcoes.map(o => o.quantidade)).toEqual([3000, 5000, 10000])
    expect(m.preco).toBeGreaterThan(m.custo)
    expect(m.preco / m.custo).toBeCloseTo(2.5, 0)
    expect(m.form.nomeCliente).toBe("Ana")
  })
  it("ajuste de preço mexe no markup e nas outras quantidades na mesma proporção", () => {
    const a = ajustarPreco({ preco: 1000, custo: 400, multiplicador: 2.5, opcoes: [{ quantidade: 3000, preco: 1000, unitario: 1000 / 3000 }, { quantidade: 5000, preco: 1500, unitario: 0.3 }] }, 900)
    expect(a.multiplicador).toBe(2.25)
    expect(a.opcoes[1].preco).toBe(1350)
    expect(a.margem).toBeCloseTo(500 / 900)
  })
  it("escolhas de sempre vêm do histórico", () => {
    const b = baseDoHistorico([{ form: { materialId: "duplex", materialNome: "Duplex", tipoCaixa: "fundo-automatico", incluirVerniz: true, vernizTipo: "UV Total" } }, { form: { materialId: "duplex", materialNome: "Duplex", tipoCaixa: "fundo-automatico", incluirVerniz: true, vernizTipo: "UV Total" } }, { form: { materialId: "cartao300", materialNome: "Cartão", tipoCaixa: "simples" } }])
    expect(b).toMatchObject({ materialId: "duplex", tipoCaixa: "fundo-automatico", incluirVerniz: true, vernizTipo: "UV Total" })
  })
  it("proposta nova só substitui se mudou medida ou quantidade", () => {
    const f = { frente: 6, lateral: 6, alturaBox: 13 } as never
    expect(mudouAProposta({ quantidade: 3000, form: f }, { quantidade: 3000, form: f })).toBe(false)
    expect(mudouAProposta({ quantidade: 3000, form: f }, { quantidade: 5000, form: f })).toBe(true)
  })
})

describe("retorno dos anúncios no período", () => {
  const ped = (nome: string, venda: number, recebido: number, custo: number, data = "2026-11-05") => ({ nomeCliente: nome, venda, recebido, custoDireto: custo, dataFechamento: data }) as unknown as Pedido
  it("só pedidos de clientes que vieram do anúncio, fechados no período", () => {
    const ps = [ped("Ana", 3000, 1500, 1800), ped("Bia", 2000, 2000, 0), ped("Caio", 5000, 5000, 2000), ped("Ana", 1000, 0, 400, "2026-10-01")]
    const r = retornoDoPeriodo(ps, [{ nome: "Ana", origemCampanhaId: "c1" }, { nome: "Bia", origemCampanhaId: "c2" }, { nome: "Caio", origemCampanhaId: null }], d => !!d && d >= "2026-11-01")
    expect(r.pedidos).toBe(2)
    expect(r.venda).toBe(5000)
    expect(r.recebido).toBe(3500)
    expect(r.margemEstimada).toBe(true)
    expect(margemPorReal(r, 1000)).toBeCloseTo(r.margem / 1000)
  })
})
