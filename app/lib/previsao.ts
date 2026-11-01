// Fase 4 — previsão e capacidade (próximos 30 dias).
//   Vendas esperadas = orçamentos abertos × chance real do tipo de cliente (novo / já comprou)
//                    + recompras previstas pelo ritmo × chance de recompra
//   Carga = unidades em produção + unidades esperadas, comparadas com o mês típico e o mês mais cheio
//   Entregas por semana, pelas datas previstas dos pedidos em produção

import { KanbanCard } from "../types"
import { Pedido, pedidoEmProducao, isAberto, isTerceirizado, nomeChave } from "./negocio"
import { LinhaOrcamento, taxa } from "./precoQueFecha"
import { RitmoCliente } from "./ritmo"

export type ItemPrevisto = { tipo: "orcamento" | "recompra"; titulo: string; sub: string; valor: number; chance: number; unidades: number; card?: KanbanCard; cliente?: string }

export type Previsao = {
  dias: number
  itens: ItemPrevisto[]
  esperado: number                // Σ valor × chance
  seTudoFechar: number            // Σ valor
  chanceNovo: number
  chanceRecorrente: number
  unidadesEmProducao: number
  unidadesEsperadas: number
  mesTipico: number | null        // mediana de unidades fechadas por mês (últimos 6 meses com venda)
  mesMaisCheio: number | null
  semanas: { inicio: string; pedidos: Pedido[]; unidades: number }[]
  atrasadas: Pedido[]
}

const CHANCE_PADRAO = { novo: 0.15, recorrente: 0.6 }   // enquanto não há amostra

const segunda = (d: Date) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const iso = (d: Date) => d.toLocaleDateString("sv-SE")

export function previsao(args: {
  kanban: KanbanCard[]
  pedidos: Pedido[]
  linhas: LinhaOrcamento[]
  ritmos: RitmoCliente[]
  hoje?: Date
  dias?: number
}): Previsao {
  const hoje = args.hoje ?? new Date()
  const dias = args.dias ?? 30
  const fim = iso(new Date(hoje.getTime() + dias * 86_400_000))
  const tNovo = taxa(args.linhas.filter(l => !l.recorrente)), tRec = taxa(args.linhas.filter(l => l.recorrente))
  const chanceNovo = tNovo.total >= 8 ? tNovo.taxa! : CHANCE_PADRAO.novo
  const chanceRecorrente = tRec.total >= 8 ? tRec.taxa! : CHANCE_PADRAO.recorrente
  const jaComprou = new Set(args.pedidos.filter(p => p.dataFechamento).map(p => nomeChave(p.nomeCliente)))

  // Quem já tem orçamento aberto entra pelo orçamento, não pela recompra (pedido em produção não impede a próxima compra)
  const comOrcamentoAberto = new Set(args.kanban.filter(c => !isTerceirizado(c) && isAberto(c)).map(c => nomeChave(c.nomeCliente)))
  const orcamentos: ItemPrevisto[] = args.kanban.filter(c => !isTerceirizado(c) && isAberto(c) && c.preco > 0).map(c => {
    const rec = jaComprou.has(nomeChave(c.nomeCliente))
    return {
      tipo: "orcamento", titulo: `${c.numero} · ${c.nomeCliente}`, sub: rec ? "orçamento aberto · já comprou" : "orçamento aberto · cliente novo",
      valor: c.preco, chance: rec ? chanceRecorrente : chanceNovo, unidades: c.quantidade, card: c,
    }
  })
  // Recompra: quem tem ritmo e a próxima compra cai até o fim da janela (inclusive as que já passaram, menos os sumidos)
  const recompras: ItemPrevisto[] = args.ritmos
    .filter(r => r.intervalo && r.proxima && r.proxima <= fim && !comOrcamentoAberto.has(r.chave) && r.status !== "sumido")
    .map(r => ({
      tipo: "recompra", titulo: r.nome,
      sub: r.status === "atrasado" ? `recompra atrasada · pede a cada ~${r.intervalo} dias` : `recompra prevista para ${new Date(r.proxima! + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")}`,
      valor: r.ticket, chance: r.status === "atrasado" ? chanceRecorrente / 2 : chanceRecorrente,
      unidades: Math.round(args.pedidos.filter(p => nomeChave(p.nomeCliente) === r.chave).reduce((s, p, _, a) => s + p.quantidade / a.length, 0)),
      cliente: r.nome,
    }))
  const itens = [...orcamentos, ...recompras].sort((a, b) => b.valor * b.chance - a.valor * a.chance)

  // Carga: unidades por mês nos últimos 6 meses com venda
  const porMes = new Map<string, number>()
  for (const p of args.pedidos) if (p.dataFechamento) porMes.set(p.dataFechamento.slice(0, 7), (porMes.get(p.dataFechamento.slice(0, 7)) ?? 0) + p.quantidade)
  const ultimos = [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).filter(([m]) => m < iso(hoje).slice(0, 7)).slice(-6).map(([, u]) => u).sort((a, b) => a - b)
  const mesTipico = ultimos.length ? (ultimos.length % 2 ? ultimos[(ultimos.length - 1) / 2] : (ultimos[ultimos.length / 2 - 1] + ultimos[ultimos.length / 2]) / 2) : null

  const emProducao = args.pedidos.filter(pedidoEmProducao)
  const hojeIso = iso(hoje)
  const base = segunda(hoje)
  const semanas = Array.from({ length: 5 }, (_, i) => {
    const ini = new Date(base.getTime() + i * 7 * 86_400_000), proxima = new Date(ini.getTime() + 7 * 86_400_000)
    const ps = emProducao.filter(p => p.dataEntregaPrevista && p.dataEntregaPrevista >= iso(ini) && p.dataEntregaPrevista < iso(proxima) && p.dataEntregaPrevista >= hojeIso)
    return { inicio: iso(ini), pedidos: ps, unidades: ps.reduce((s, p) => s + p.quantidade, 0) }
  })

  return {
    dias, itens,
    esperado: itens.reduce((s, i) => s + i.valor * i.chance, 0),
    seTudoFechar: itens.reduce((s, i) => s + i.valor, 0),
    chanceNovo, chanceRecorrente,
    unidadesEmProducao: emProducao.reduce((s, p) => s + p.quantidade, 0),
    unidadesEsperadas: Math.round(itens.reduce((s, i) => s + i.unidades * i.chance, 0)),
    mesTipico, mesMaisCheio: ultimos.length ? ultimos[ultimos.length - 1] : null,
    semanas,
    atrasadas: emProducao.filter(p => p.dataEntregaPrevista && p.dataEntregaPrevista < hojeIso),
  }
}
