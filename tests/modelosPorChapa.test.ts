import { describe, it, expect } from "vitest"
import { modelosPorChapa, modelosPorChapaDetalhe, type Desenho } from "@/app/lib/biblioteca"
import type { Ferramental, Maquina } from "@/app/lib/producao"

const jerograf: Maquina = { nome: "Jerograf 48×45", largura: 480, altura: 450, pinca: 10, margem: 5 }
const des = (blank: { largura: number; altura: number }, extra: Partial<Desenho> = {}): Desenho =>
  ({ id: "91b661606f62a900", nome: "x.dxf", caixa: null, blank, criadoEm: "", ...extra })
const faca = (extra: Partial<Ferramental> = {}): Ferramental =>
  ({ id: "f-1", tipo: "faca", cliente: "", produto: "", blankLargura: 222.5, blankAltura: 202.75, cavidades: 4, custo: 0, data: "", desenhoId: "91b661606f62a900", ...extra })
const perfume = { largura: 222.5, altura: 202.75 }

describe("modelos por chapa da faca", () => {
  it("estima a peça 222,5 × 202,75 mm na máquina 48 × 45 cm: 4", () => {
    expect(modelosPorChapaDetalhe(des(perfume), [], jerograf)).toEqual({ valor: 4, origem: "estimado" })
  })
  it("cavidades salvas valem, mesmo que outro formato desse mais", () => {
    expect(modelosPorChapa(des({ largura: 222.5, altura: 202.75 }), [faca({ cavidades: 4 })], { ...jerograf, largura: 660, altura: 480 })).toBe(4)
  })
  it("o campo novo confirmado vem antes das cavidades", () => {
    expect(modelosPorChapa(des(perfume), [faca({ cavidades: 4, modelosPorChapa: 2 })], jerograf)).toBe(2)
    expect(modelosPorChapa(des(perfume, { modelosPorChapa: 3 }), [faca()], jerograf)).toBe(3)
  })
  it("sem medida e sem faca salva: null", () => {
    expect(modelosPorChapa(des({ largura: 0, altura: 0 }), [], jerograf)).toBeNull()
    expect(modelosPorChapa(des(perfume), [], null)).toBeNull()
  })
  it("valor salvo inválido (0, fração) é ignorado", () => {
    expect(modelosPorChapa(des(perfume, { modelosPorChapa: 0 }), [], jerograf)).toBe(4)
  })
})
