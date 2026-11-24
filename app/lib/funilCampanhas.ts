// Funil por campanha para a CMO (porta externa, ?o=meta_ads): leads → MQL → orçamentos → pedidos → vendido, com o
// gasto da Meta e o custo por lead e por MQL, em 7 e 30 dias. Só leitura; nada é escrito na Meta nem no sistema.
// Mesma atribuição do relatório de marketing: lead sem campanha no clique vai para a única campanha com gasto
// no período (campanhaPeloGasto); com mais de uma gastando, fica em "sem-campanha".

import { SEM_CAMPANHA, campanhaPeloGasto, custoPor, dentro, diaSP, somarDias, type Periodo } from "./marketing"

export type LeadFunil = {
  campanhaId: string; campanhaNome: string; entrada: string
  qualidade: "mql" | "descartado" | "sumiu" | "aberto"
  orcamentos: number; pedidos: number; faturamento: number
  informouVolume?: boolean
}
export type GastoCampanha = { id: string; nome: string | null; gasto: number }

export type FunilCampanha = {
  id: string; nome: string | null
  leads: number; mql: number; orcamentos: number; pedidos: number; vendido: number; gasto: number
  custoPorLead: number | null; custoPorMql: number | null
  taxaVolumeInformado: number | null      // leads que disseram a quantidade ÷ leads (null sem leads)
}
export type FunilPeriodo = { periodo: Periodo; campanhas: FunilCampanha[] }

const r2 = (n: number) => Math.round(n * 100) / 100

export function funilDoPeriodo(gastos: GastoCampanha[], leads: LeadFunil[], p: Periodo): FunilCampanha[] {
  const unica = campanhaPeloGasto(gastos)
  const linhas = new Map<string, FunilCampanha & { _vol: number }>()
  const nova = (id: string, nome: string | null, gasto = 0) => ({ id, nome, leads: 0, mql: 0, orcamentos: 0, pedidos: 0, vendido: 0, gasto, custoPorLead: null, custoPorMql: null, taxaVolumeInformado: null, _vol: 0 })
  for (const g of gastos) linhas.set(g.id, nova(g.id, g.nome, g.gasto))
  for (const l of leads.filter(x => dentro(x.entrada, p))) {
    const id = l.campanhaId === SEM_CAMPANHA && unica ? unica : l.campanhaId
    const f = linhas.get(id) ?? nova(id, l.campanhaNome)
    f.leads++
    if (l.qualidade === "mql") f.mql++
    if (l.orcamentos) f.orcamentos++
    if (l.pedidos) f.pedidos++
    if (l.informouVolume) f._vol++
    f.vendido += l.faturamento
    linhas.set(id, f)
  }
  return [...linhas.values()].filter(f => f.gasto > 0 || f.leads > 0).map(({ _vol, ...f }) => {
    const cl = custoPor(f.gasto, f.leads), cm = custoPor(f.gasto, f.mql)
    return { ...f, gasto: r2(f.gasto), vendido: r2(f.vendido), custoPorLead: cl == null ? null : r2(cl), custoPorMql: cm == null ? null : r2(cm), taxaVolumeInformado: f.leads > 0 ? Math.round(_vol / f.leads * 1000) / 1000 : null }
  }).sort((a, b) => b.gasto - a.gasto || b.leads - a.leads)
}

export function montarFunil(e: { hoje?: string; gasto7: GastoCampanha[]; gasto30: GastoCampanha[]; leads: LeadFunil[]; previsaoSaldoDias: number | null }) {
  const dia = e.hoje ?? diaSP(new Date())
  const p7: Periodo = { de: somarDias(dia, -6), ate: dia }, p30: Periodo = { de: somarDias(dia, -29), ate: dia }
  return {
    previsaoSaldoDias: e.previsaoSaldoDias,
    d7: { periodo: p7, campanhas: funilDoPeriodo(e.gasto7, e.leads, p7) } as FunilPeriodo,
    d30: { periodo: p30, campanhas: funilDoPeriodo(e.gasto30, e.leads, p30) } as FunilPeriodo,
  }
}
