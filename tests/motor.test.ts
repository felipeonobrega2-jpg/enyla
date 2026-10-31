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
