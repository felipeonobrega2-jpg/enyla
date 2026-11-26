import { describe, it, expect } from "vitest"
import { calcular } from "@/app/calculos"
import { config, FORM } from "./fixtures"

const cfg = config()
const rota = (form = FORM) => calcular({ ...form, quantidades: [1000] }, cfg)!.rotas![0].melhor

describe("motor de orçamento com decisões manuais", () => {
  it("valor digitado substitui o do motor só onde foi digitado, e guarda o original", () => {
    const auto = rota()
    const manual = rota({ ...FORM, rota: { valores: { "1000": { impressao: 900 } } } })
    const imp = manual.itens.find(i => i.etapa === "impressao")!
    expect(imp.valor).toBe(900)
    expect(imp.valorMotor).toBeCloseTo(auto.itens.find(i => i.etapa === "impressao")!.valor)
    expect(manual.custoTotal - auto.custoTotal).toBeCloseTo(900 - imp.valorMotor!)
  })
  it("custo extra por unidade e multiplicador do orçamento", () => {
    const auto = rota()
    const r = rota({ ...FORM, rota: { extras: [{ id: "x", descricao: "Berço", valor: 1.2, porUnidade: true }], multiplicador: 2.4 } })
    expect(r.custoTotal - auto.custoTotal).toBeCloseTo(1200)
    expect(r.preco).toBeCloseTo(r.custoTotal * 2.4)
  })
  it("sem decisões, nada muda", () => {
    expect(rota({ ...FORM, rota: {} }).custoTotal).toBeCloseTo(rota().custoTotal)
  })
})

describe("impressão frente e verso", () => {
  it("dobra só a impressão", () => {
    const auto = rota()
    const fv = rota({ ...FORM, frenteVerso: true })
    const imp = (r: typeof auto) => r.itens.find(i => i.etapa === "impressao")!.valor
    expect(imp(fv)).toBeCloseTo(imp(auto) * 2)
    expect(fv.custoTotal - auto.custoTotal).toBeCloseTo(imp(auto))
  })
})

describe("impressão frente e verso com tabela própria do fornecedor", () => {
  const comRegras = (fv?: { tipo: "acerto_milheiro"; acerto: number; milheiro: number }) => {
    const c = config()
    c.producao.fornecedores[0].servicos = {
      impressao: { tipo: "acerto_milheiro", acerto: 600, milheiro: 120 },
      ...(fv ? { impressaoFrenteVerso: fv } : {}),
    }
    return c
  }
  const imp = (c: ReturnType<typeof config>, frenteVerso: boolean) => {
    const r = calcular({ ...FORM, frenteVerso, quantidades: [1000] }, c)!.rotas![0].melhor
    return r.itens.find(i => i.etapa === "impressao")!
  }
  it("usa a regra própria, sem multiplicar por 2, e mostra na descrição", () => {
    const c = comRegras({ tipo: "acerto_milheiro", acerto: 950, milheiro: 240 })
    const frente = imp(c, false), fv = imp(c, true)
    const folhas = (frente.valor - 600) / 120 * 1000
    expect(fv.valor).toBeCloseTo(950 + 240 * folhas / 1000)
    expect(fv.valor).not.toBeCloseTo(frente.valor * 2)
    expect(fv.descricao).toContain("frente e verso")
    expect(fv.descricao).toContain("acerto")
    expect(frente.descricao).not.toContain("frente e verso")
  })
  it("sem a chave, mantém o dobro", () => {
    const c = comRegras()
    expect(imp(c, true).valor).toBeCloseTo(imp(c, false).valor * 2)
    expect(imp(c, true).descricao).toContain("dobro")
  })
})
