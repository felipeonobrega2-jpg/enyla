import { describe, it, expect } from "vitest"
import { detalheProducao, estadias, prazoMedioPorEtapa } from "../app/lib/etapasProducao"

const nomes = ["Orç", "Fechado", "Arte", "Aprovação", "Fila", "Impressão", "Verniz", "Acabamento", "Expedição", "Entregue"]
const e = (coluna: number, dataHora: string) => ({ coluna, dataHora })
// 03/08/2026 seg ... entregue pedidos com Arte de 2 dias úteis
const entregue = (n: string, d0: string, d1: string, d2: string) => ({ numero: n, etapas: [e(1, `${d0}, 09:00:00`), e(2, `${d0}, 10:00:00`), e(3, `${d1}, 10:00:00`), e(9, `${d2}, 10:00:00`)] })
const hist = [entregue("A", "03/11/2026", "05/11/2026", "10/11/2026"), entregue("B", "03/11/2026", "05/11/2026", "10/11/2026"), entregue("C", "03/11/2026", "06/11/2026", "10/11/2026")]

describe("etapasProducao", () => {
  it("entrada, saída e dias úteis", () => {
    const es = estadias([e(1, "03/11/2026, 09:00:00"), e(2, "03/11/2026, 10:00:00"), e(3, "05/11/2026, 14:30:00")])
    expect(es[1]).toEqual({ coluna: 2, entrou: "03/11/2026, 10:00:00", saiu: "05/11/2026, 14:30:00" })
  })
  it("mediana de dias úteis por etapa", () => {
    expect(prazoMedioPorEtapa(hist, nomes, "24/11/2026".split("/").reverse().join("-"))["Arte"]).toBe(2)
  })
  it("acimaDoNormal e etapa atual", () => {
    const vivo = { numero: "X", etapas: [e(1, "03/11/2026, 09:00:00"), e(2, "04/11/2026, 10:00:00")] }
    const p = JSON.parse(detalheProducao([{ numero: "X", nomeCliente: "Cli", coluna: 2, aguardandoPagamento: { valor: 10 } }], [...hist, vivo], nomes, "2026-11-24"))
    const x = p.pedidos[0]
    expect(x.naEtapaDesde).toBe("04/11/2026, 10:00:00")
    expect(x.diasUteisNaEtapa).toBe(13)
    expect(x.acimaDoNormal).toBe(true)
    expect(x.etapas).toHaveLength(2)
    expect(x.aguardandoPagamento).toEqual({ valor: 10 })
  })
  it("respeita 7000 caracteres", () => {
    const cards = Array.from({ length: 200 }, (_, i) => ({ numero: `P${i}`, nomeCliente: "Cliente", coluna: 2 }))
    expect(detalheProducao(cards, [], nomes, "2026-11-24").length).toBeLessThanOrEqual(7000)
  })
})
