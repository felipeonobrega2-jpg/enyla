import { describe, it, expect } from "vitest"
import { limparOpcoesX, limparCustoTerceiroCard } from "@/app/lib/copiaPedido"

const x = { custoTerceiro: 800, fornecedor: "Gráfica X", projecaoCustos: { total: 1 }, prazos: { a: 1 }, prazoRecebimentoInterno: "2026-11-30" }

describe("copiar pedido não leva o custo de terceiro", () => {
  it("repetir: opcoes._x só com campos do pedido antigo vira null (ou _items)", () => {
    expect(limparOpcoesX({ _x: x })).toBeNull()
    expect(limparOpcoesX({ _items: [{ a: 1 }], _x: x })).toEqual([{ a: 1 }])
  })
  it("mantém outros campos de _x e não mexe em opcoes sem _x", () => {
    expect(limparOpcoesX({ _x: { ...x, outro: 1 } })).toEqual({ _x: { outro: 1 } })
    expect(limparOpcoesX([1, 2])).toEqual([1, 2])
    expect(limparOpcoesX(null)).toBeNull()
  })
  it("duplicar: o card nasce sem custoTerceiro, fornecedor e projecaoCustos", () => {
    const c = limparCustoTerceiroCard({ numero: "ORC-1", custoTerceiro: 800, fornecedor: "Gráfica X", projecaoCustos: { total: 1 }, opcoes: { _x: x } })
    expect(c.custoTerceiro).toBeUndefined()
    expect(c.fornecedor).toBeUndefined()
    expect(c.projecaoCustos).toBeUndefined()
    expect(c.opcoes).toBeUndefined()
  })
})
