import { describe, it, expect } from "vitest"
import { funilDoPeriodo, montarFunil, type LeadFunil } from "../app/lib/funilCampanhas"

const p = { de: "2026-11-18", ate: "2026-11-24" }
const lead = (o: Partial<LeadFunil>): LeadFunil => ({ campanhaId: "A", campanhaNome: "A", entrada: "2026-11-20T15:00:00Z", qualidade: "aberto", orcamentos: 0, pedidos: 0, faturamento: 0, ...o })

describe("funil por campanha", () => {
  it("0 MQL: custoPorMql é null, custoPorLead existe", () => {
    const [f] = funilDoPeriodo([{ id: "A", nome: "A", gasto: 100 }], [lead({}), lead({ qualidade: "descartado" })], p)
    expect(f.mql).toBe(0); expect(f.custoPorMql).toBeNull(); expect(f.custoPorLead).toBe(50)
  })
  it("atribui por campanha e calcula funil, vendido e taxa de volume", () => {
    const r = funilDoPeriodo([{ id: "A", nome: "A", gasto: 200 }, { id: "B", nome: "B", gasto: 90 }], [
      lead({ qualidade: "mql", orcamentos: 1, pedidos: 1, faturamento: 1500, informouVolume: true }),
      lead({ qualidade: "mql", informouVolume: true }), lead({}), lead({ campanhaId: "B", campanhaNome: "B", qualidade: "mql" }),
      lead({ entrada: "2026-10-01T12:00:00Z", qualidade: "mql" }),
    ], p)
    const a = r.find(x => x.id === "A")!, b = r.find(x => x.id === "B")!
    expect(a).toMatchObject({ leads: 3, mql: 2, orcamentos: 1, pedidos: 1, vendido: 1500, custoPorMql: 100 })
    expect(a.taxaVolumeInformado).toBeCloseTo(0.667, 3)
    expect(b).toMatchObject({ leads: 1, mql: 1, custoPorMql: 90, taxaVolumeInformado: 0 })
  })
  it("lead sem campanha vai para a única com gasto; com duas, fica sem-campanha", () => {
    const s = lead({ campanhaId: "sem-campanha", campanhaNome: "Anúncio", qualidade: "mql" })
    expect(funilDoPeriodo([{ id: "A", nome: "A", gasto: 50 }], [s], p)[0]).toMatchObject({ id: "A", mql: 1 })
    expect(funilDoPeriodo([{ id: "A", nome: "A", gasto: 50 }, { id: "B", nome: "B", gasto: 5 }], [s], p).some(x => x.id === "sem-campanha")).toBe(true)
  })
  it("montarFunil traz 7 e 30 dias e a previsão de saldo", () => {
    const f = montarFunil({ hoje: "2026-11-24", gasto7: [{ id: "A", nome: "A", gasto: 10 }], gasto30: [{ id: "A", nome: "A", gasto: 40 }], leads: [lead({ entrada: "2026-11-01T12:00:00Z", qualidade: "mql" })], previsaoSaldoDias: 4.5 })
    expect(f.previsaoSaldoDias).toBe(4.5); expect(f.d7.campanhas[0].leads).toBe(0); expect(f.d30.campanhas[0]).toMatchObject({ leads: 1, custoPorMql: 40 })
  })
})
