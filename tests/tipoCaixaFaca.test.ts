import { it, expect } from "vitest"
import { calcular } from "@/app/calculos"
import { tipoCaixaEfetivo, type Ferramental } from "@/app/lib/producao"
import { config, FORM } from "./fixtures"

const faca = (p: Partial<Ferramental>): Ferramental => ({
  id: "f-x", tipo: "faca", cliente: "", produto: "", blankLargura: 222.5, blankAltura: 202.75, cavidades: 4, custo: 0, data: "2026-01-01", ...p,
})
const form = { ...FORM, frente: 7, lateral: 3, alturaBox: 12.5, quantidades: [1000], incluirVerniz: false, blankOverride: { largura: 222.5, altura: 202.75 } }

it("com blankOverride, simples e fundo automático dão o mesmo preço e os mesmos itens", () => {
  const a = calcular({ ...form, tipoCaixa: "simples" }, config())!.rotas![0].melhor
  const b = calcular({ ...form, tipoCaixa: "fundo-automatico" }, config())!.rotas![0].melhor
  expect(b.custoTotal).toBe(a.custoTotal)
  expect(b.preco).toBe(a.preco)
  expect(b.itens).toEqual(a.itens)
})

it("faca/desenho conhecido com o form em 'simples' usa fundo automático", () => {
  expect(tipoCaixaEfetivo({ ...form, tipoCaixa: "simples", desenhoId: "91b661606f62a900" }, [])).toBe("fundo-automatico")
  expect(tipoCaixaEfetivo({ ...form, tipoCaixa: "simples" }, [faca({ id: "f-mweu5lzf" })])).toBe("fundo-automatico")
})

it("o que está gravado vale mais que o mapa; escolha explícita no form vale mais que tudo; sem faca fica simples", () => {
  expect(tipoCaixaEfetivo({ ...form, tipoCaixa: "simples" }, [faca({ id: "f-mweu5lzf", tipoCaixa: "americano" })])).toBe("americano")
  expect(tipoCaixaEfetivo({ ...form, tipoCaixa: "aviao", desenhoId: "91b661606f62a900" }, [])).toBe("aviao")
  expect(tipoCaixaEfetivo({ ...form, tipoCaixa: "simples" }, [faca({ id: "outra" })])).toBe("simples")
})
