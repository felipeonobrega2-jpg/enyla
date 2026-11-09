import { describe, it, expect } from "vitest"
import { alocar, contas, prazo, vagos, type ItemPago } from "@/app/cartuxo/lib/chapas"

const ch = (prazoId = "economico", acabId = "laminacao-fosca") => ({ prazoId, acabId, porChapa: 4, formato: "66x48", rodada: 1340, colagemPorMil: 75, arte: 70, frete: 0 })
const item = (n: number, qtd: number, extra: Partial<ItemPago> = {}): ItemPago => ({
  pedidoId: "p" + n, pedido: "CX-" + n, itemIdx: 0, pagoEm: `2026-11-0${n}T10:00:00Z`, cliente: "C" + n, telefone: "11",
  slug: "caixa-perfume-100ml", nome: "Caixa 100 ml", qtd, total: 1.29 * qtd, forma: "pix", chapa: ch(), ...extra,
})

describe("montagem das chapas", () => {
  it("junta pedidos do mesmo modelo e acabamento e não parte um pedido entre chapas", () => {
    const { chapas } = alocar([], [item(1, 1000), item(2, 2000), item(3, 3000)])
    expect(chapas).toHaveLength(2)
    expect(chapas[0].ocupacao.map(o => [o.pedido, o.lugares])).toEqual([["CX-1", 1], ["CX-2", 2]])
    expect(chapas[1].ocupacao.map(o => [o.pedido, o.lugares])).toEqual([["CX-3", 3]])
    expect(vagos(chapas[0])).toBe(1)
  })

  it("separa por acabamento e dá chapa exclusiva para a expressa", () => {
    const { chapas } = alocar([], [item(1, 1000), item(2, 1000, { chapa: ch("economico", "laminacao-brilho") }), item(3, 1000, { chapa: ch("padrao") })])
    expect(chapas.map(c => [c.acabamento, c.expressa])).toEqual([["laminacao-fosca", false], ["laminacao-brilho", false], ["laminacao-fosca", true]])
    // um pedido normal depois não entra na chapa da expressa
    const r = alocar(chapas, [item(4, 1000)])
    expect(r.chapas[0].ocupacao).toHaveLength(2)
    expect(r.chapas[2].ocupacao).toHaveLength(1)
  })

  it("não aloca duas vezes o mesmo item", () => {
    const a = alocar([], [item(1, 1000)])
    expect(alocar(a.chapas, [item(1, 1000)]).novos).toBe(0)
  })

  it("divide em mais de uma chapa só quando o pedido é maior que uma chapa", () => {
    const { chapas } = alocar([], [item(1, 6000)])
    expect(chapas.map(c => c.ocupacao[0].lugares)).toEqual([4, 2])
    expect(chapas[0].ocupacao[0].arte).toBe(70)
    expect(chapas[1].ocupacao[0].arte).toBe(0)
  })

  it("conta a sobra com o custo cheio da chapa", () => {
    const { chapas } = alocar([], [item(1, 4000, { total: 4000 })])
    const k = contas(chapas[0])
    expect(k.custo).toBe(1340 + 300 + 70)
    expect(k.sobra).toBe(4000 - 1710)
  })

  it("prazo: fecha até 15 d.u. depois da primeira arte; expressa fecha já", () => {
    const { chapas } = alocar([], [item(1, 1000), item(2, 1000, { chapa: ch("padrao") })])
    chapas[0].ocupacao[0].arteAprovadaEm = "2026-11-09T12:00:00Z"
    chapas[1].ocupacao[0].arteAprovadaEm = "2026-11-09T12:00:00Z"
    expect(prazo(chapas[0], "2026-11-10").fecharAte).toBe("2026-12-01")
    expect(prazo(chapas[0], "2026-11-10").acao).toBe("esperar")
    expect(prazo(chapas[1], "2026-11-10").acao).toBe("fechar")
  })
})
