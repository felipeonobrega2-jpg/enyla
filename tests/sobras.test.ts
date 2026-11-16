import { describe, it, expect } from "vitest"
import { estatisticaSobras } from "@/app/lib/sobras"
import { COL_ENTREGUE } from "@/app/types"

const ped = (valor: number, sobras: number, un = 0, qtd = 5000) => ({
  key: String(Math.random()), tipo: "card", numero: "X", nomeCliente: "C", cards: [{ id: "c", coluna: COL_ENTREGUE, quantidade: qtd, materialNome: "Cartão" }], coluna: COL_ENTREGUE, etapa: "",
  dataFechamento: "2026-10-01", dataEntregaReal: "2026-10-20", valor, quantidade: qtd, despesas: [], recebido: 0, sobras, venda: valor + sobras, sobrasQuitadas: [],
  aReceber: 0, cobrado: 0, vencido: 0, semCobranca: 0, custoDireto: 0,
  receitas: sobras ? [{ id: "s", tipo: "receita", categoria: "sobra", descricao: `Sobra ${un} un`, valor: sobras, dataVencimento: "2026-10-20", status: "pago", criadoEm: "" }] : [],
}) as never

describe("sobras como margem de negociação", () => {
  const hoje = new Date("2026-11-16T12:00:00Z")
  it("esperado = sobras ÷ valor somando todos; quando tem = mediana", () => {
    const e = estatisticaSobras([ped(10000, 1000, 800), ped(10000, 0), ped(10000, 0), ped(10000, 2000, 1200), ped(10000, 0)], hoje)!
    expect(e.pedidos).toBe(5)
    expect(e.comSobra).toBe(2)
    expect(e.pctEsperado).toBeCloseTo(0.06, 3)
    expect(e.pctQuandoTem).toBeCloseTo(0.15, 3)
    expect(e.unidadesQuandoTem).toBeCloseTo(0.2, 3)
  })
  it("pouca amostra ou só digital (abaixo de 1.000): não calcula", () => {
    expect(estatisticaSobras([ped(10000, 1000), ped(10000, 0)], hoje)).toBeNull()
    expect(estatisticaSobras(Array.from({ length: 6 }, () => ped(600, 60, 10, 200)), hoje)).toBeNull()
  })
})
