// Metas e conquistas.
//   Marcos     — faturamento acumulado (editáveis em Configurações)
//   Meta do mês — sugerida pela média dos últimos 3 meses fechados + crescimento escolhido
//   Conquistas  — sinais de saúde da empresa, não só de volume

import { KanbanCard, LancamentoFinanceiro } from "../types"
import { Pedido, Periodo, vendasDoPeriodo, margemContribuicao, conversao, orcamentosDoPeriodo, recebiveis, noPeriodo, nomeChave } from "./negocio"

export type Marco = { id: string; nome: string; valor: number }

export type ConfigMetas = {
  marcos: Marco[]
  crescimentoPct: number   // crescimento desejado sobre a média recente, para sugerir a meta
}

export const METAS_PADRAO: ConfigMetas = {
  marcos: [
    { id: "m1", nome: "Primeiro Salto", valor: 10_000 },
    { id: "m2", nome: "Tração Real", valor: 50_000 },
    { id: "m3", nome: "6 Dígitos", valor: 100_000 },
    { id: "m4", nome: "Meio Milhão", valor: 500_000 },
    { id: "m5", nome: "Primeiro Milhão", valor: 1_000_000 },
    { id: "m6", nome: "Empresa de Verdade", valor: 10_000_000 },
  ],
  crescimentoPct: 10,
}

export function normalizarMetas(m?: Partial<ConfigMetas> | null): ConfigMetas {
  return {
    marcos: m?.marcos?.length ? [...m.marcos].sort((a, b) => a.valor - b.valor) : METAS_PADRAO.marcos,
    crescimentoPct: m?.crescimentoPct ?? METAS_PADRAO.crescimentoPct,
  }
}

const mesPeriodo = (ano: number, mes: number): Periodo => ({ from: new Date(ano, mes, 1), to: new Date(ano, mes + 1, 0, 23, 59, 59) })

// Vendido de cada mês fechado, do mais antigo ao mais recente
export function vendidoPorMes(pedidos: Pedido[], lancamentos: LancamentoFinanceiro[], hoje: Date, meses: number) {
  return Array.from({ length: meses }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - meses + i, 1)
    return { mes: d, valor: vendasDoPeriodo(pedidos, lancamentos, mesPeriodo(d.getFullYear(), d.getMonth())).receita }
  })
}

// Média dos últimos 3 meses fechados × (1 + crescimento), arredondada para mil
export function sugerirMeta(pedidos: Pedido[], lancamentos: LancamentoFinanceiro[], hoje: Date, crescimentoPct: number) {
  const ult = vendidoPorMes(pedidos, lancamentos, hoje, 3)
  const media = ult.reduce((s, m) => s + m.valor, 0) / ult.length
  return { media, meta: Math.max(1000, Math.round(media * (1 + crescimentoPct / 100) / 1000) * 1000) }
}

export type Conquista = {
  id: string
  nome: string
  descricao: string
  atingida: boolean
  progresso: number   // 0..1
  detalhe: string
}

export function conquistasDeSaude(
  pedidos: Pedido[], lancamentos: LancamentoFinanceiro[], kanban: KanbanCard[], metaMensal: number, hoje: Date,
): Conquista[] {
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
  const historico = vendidoPorMes(pedidos, lancamentos, hoje, 12)
  const melhorMes = historico.reduce((b, m) => (m.valor > b ? m.valor : b), 0)

  // Meses seguidos (fechados, do mais recente para trás) batendo a meta atual
  let seguidos = 0
  for (let i = historico.length - 1; i >= 0 && metaMensal > 0; i--) {
    if (historico[i].valor >= metaMensal) seguidos++
    else break
  }

  const trimestre: Periodo = { from: new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 90), to: hoje }
  const margemTri = margemContribuicao(pedidos.filter(p => noPeriodo(p.dataFechamento, trimestre))).pct
  const convTri = conversao(orcamentosDoPeriodo(kanban, trimestre))

  const pedidosPorCliente = new Map<string, number>()
  for (const p of pedidos) pedidosPorCliente.set(nomeChave(p.nomeCliente), (pedidosPorCliente.get(nomeChave(p.nomeCliente)) ?? 0) + 1)
  const recorrentes = [...pedidosPorCliente.values()].filter(n => n >= 2).length

  const rec = recebiveis(pedidos, lancamentos)

  return [
    {
      id: "mes50", nome: "Mês acima de R$ 50 mil", descricao: "Vender R$ 50 mil ou mais em um único mês",
      atingida: melhorMes >= 50_000, progresso: Math.min(1, melhorMes / 50_000), detalhe: `melhor mês: ${brl(melhorMes)}`,
    },
    {
      id: "meta3", nome: "3 meses seguidos na meta", descricao: "Bater a meta mensal atual três meses seguidos",
      atingida: seguidos >= 3, progresso: Math.min(1, seguidos / 3), detalhe: metaMensal > 0 ? `${seguidos} ${seguidos === 1 ? "mês seguido" : "meses seguidos"} acima de ${brl(metaMensal)}` : "defina a meta mensal",
    },
    {
      id: "margem45", nome: "Margem de 45% no trimestre", descricao: "Margem de contribuição dos últimos 90 dias acima de 45%",
      atingida: (margemTri ?? 0) >= 45, progresso: Math.min(1, (margemTri ?? 0) / 45), detalhe: margemTri == null ? "sem custos lançados" : `${margemTri.toFixed(1).replace(".", ",")}% nos últimos 90 dias`,
    },
    {
      id: "conv40", nome: "Conversão de 40% no trimestre", descricao: "40% ou mais dos orçamentos decididos virando pedido nos últimos 90 dias",
      atingida: convTri.decididos > 0 && convTri.taxa >= 40, progresso: convTri.decididos ? Math.min(1, convTri.taxa / 40) : 0,
      detalhe: convTri.decididos ? `${convTri.taxa.toFixed(1).replace(".", ",")}% (${convTri.ganhos} de ${convTri.decididos})` : "nenhum orçamento decidido",
    },
    {
      id: "recorrentes10", nome: "10 clientes recorrentes", descricao: "Clientes que compraram duas vezes ou mais",
      atingida: recorrentes >= 10, progresso: Math.min(1, recorrentes / 10), detalhe: `${recorrentes} ${recorrentes === 1 ? "cliente recorrente" : "clientes recorrentes"}`,
    },
    {
      id: "semVencido", nome: "Nenhuma cobrança vencida", descricao: "Todas as cobranças lançadas em dia",
      atingida: rec.vencido < 0.5, progresso: rec.vencido < 0.5 ? 1 : 0, detalhe: rec.vencido < 0.5 ? "tudo em dia" : `${brl(rec.vencido)} vencido`,
    },
  ]
}
