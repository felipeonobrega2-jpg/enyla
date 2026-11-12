// Fase 4 — retorno real das campanhas.
// Para cada campanha: clientes que vieram dela, o que compraram (pedidos fechados, com sobras) e a margem
// (venda − custo direto lançado). Pedido sem custo lançado usa a margem média dos que têm custo, marcado
// como estimado. ROI real = (margem − gasto) ÷ gasto: o anúncio só se paga com o que sobra depois da produção.

import { Cliente } from "../types"
import { Pedido, margemContribuicao, nomeChave } from "./negocio"

export type RetornoCampanha = {
  clientes: number
  compradores: number
  pedidos: number
  venda: number
  margem: number
  margemEstimada: boolean        // algum pedido sem custo lançado entrou pela margem média
}

export function retornoPorCampanha(pedidos: Pedido[], clientes: Pick<Cliente, "nome" | "origemCampanhaId">[]): Record<string, RetornoCampanha> {
  const media = (margemContribuicao(pedidos).pct ?? 40) / 100
  const fechados = pedidos.filter(p => p.dataFechamento)
  const out: Record<string, RetornoCampanha> = {}
  for (const c of clientes) {
    if (!c.origemCampanhaId) continue
    const r = out[c.origemCampanhaId] ??= { clientes: 0, compradores: 0, pedidos: 0, venda: 0, margem: 0, margemEstimada: false }
    r.clientes++
    const ps = fechados.filter(p => nomeChave(p.nomeCliente) === nomeChave(c.nome))
    if (ps.length) r.compradores++
    for (const p of ps) {
      r.pedidos++
      r.venda += p.venda
      if (p.custoDireto > 0) r.margem += p.venda - p.custoDireto
      else { r.margem += p.venda * media; r.margemEstimada = true }
    }
  }
  return out
}

export const roiReal = (r: RetornoCampanha | undefined, gasto: number) =>
  r && gasto > 0 ? (r.margem - gasto) / gasto : null

// Retorno dos anúncios no período: pedidos fechados no período por clientes que vieram de anúncio, quanto
// já entrou de dinheiro deles e a margem (custo lançado; sem custo, a margem média, marcada como estimada).
// "Cada R$ 1 de anúncio virou R$ X de margem": margem ÷ gasto. Acima de 1, o anúncio se pagou.
export type RetornoPeriodo = { pedidos: number; clientes: number; venda: number; recebido: number; margem: number; margemEstimada: boolean }

export function retornoDoPeriodo(pedidos: Pedido[], clientes: Pick<Cliente, "nome" | "origemCampanhaId">[], dentro: (iso: string | undefined) => boolean): RetornoPeriodo {
  const media = (margemContribuicao(pedidos).pct ?? 40) / 100
  const doAnuncio = new Set(clientes.filter(c => c.origemCampanhaId).map(c => nomeChave(c.nome)))
  const ps = pedidos.filter(p => p.dataFechamento && dentro(p.dataFechamento) && doAnuncio.has(nomeChave(p.nomeCliente)))
  const r: RetornoPeriodo = { pedidos: ps.length, clientes: new Set(ps.map(p => nomeChave(p.nomeCliente))).size, venda: 0, recebido: 0, margem: 0, margemEstimada: false }
  for (const p of ps) {
    r.venda += p.venda
    r.recebido += p.recebido
    if (p.custoDireto > 0) r.margem += p.venda - p.custoDireto
    else { r.margem += p.venda * media; r.margemEstimada = true }
  }
  return r
}

export const margemPorReal = (r: RetornoPeriodo, gasto: number) => gasto > 0 ? r.margem / gasto : null
