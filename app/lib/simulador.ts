// Fase 4 — simulador "E se…": mês típico (últimos 6 meses) e o efeito de mexer nas alavancas.
// Tudo parte dos números reais; o que não dá para medir (quanto um aumento de preço derruba o fechamento)
// fica como uma alavanca que você escolhe, começando em zero.

import { Pedido, margemContribuicao, nomeChave, parseData } from "./negocio"
import { LinhaOrcamento } from "./precoQueFecha"

export type BaseSimulador = {
  meses: number
  orcamentosNovosMes: number
  taxaNovo: number
  ticketNovo: number
  vendaRecorrenteMes: number
  ticketRecorrente: number
  margemPct: number
  fixosMes: number
}

export type Alavancas = {
  taxaNovo: number            // 0..1
  maisOrcamentosPct: number   // +% de orçamentos novos por mês
  precoPct: number            // ±% no preço
  perdaPorAumento: number     // pontos de taxa perdidos a cada +10% de preço
  reativadosMes: number       // clientes recorrentes trazidos de volta por mês
  anuncioMes: number          // gasto com anúncio por mês
}

export type Resultado = { vendas: number; margem: number; lucro: number; taxaEfetiva: number }

const mesDe = (iso?: string | null) => iso?.slice(0, 7) ?? ""

export function baseDoSimulador(args: { pedidos: Pedido[]; linhas: LinhaOrcamento[]; fixosMes: number; hoje?: Date }): BaseSimulador {
  const hoje = args.hoje ?? new Date()
  const atual = hoje.toLocaleDateString("sv-SE").slice(0, 7)
  const meses = [...Array(6)].map((_, i) => new Date(hoje.getFullYear(), hoje.getMonth() - 6 + i, 15).toLocaleDateString("sv-SE").slice(0, 7))
  const naJanela = (m: string) => meses.includes(m) && m < atual

  const novos = args.linhas.filter(l => !l.recorrente && naJanela(mesDe(parseData(l.card.data)?.toLocaleDateString("sv-SE"))))
  const ganhosNovos = novos.filter(l => l.desfecho === "ganho")
  // Recompra: pedidos de quem já tinha comprado antes
  const primeira = new Map<string, string>()
  for (const p of [...args.pedidos].filter(p => p.dataFechamento).sort((a, b) => a.dataFechamento!.localeCompare(b.dataFechamento!)))
    if (!primeira.has(nomeChave(p.nomeCliente))) primeira.set(nomeChave(p.nomeCliente), p.dataFechamento!.slice(0, 10))
  const recompras = args.pedidos.filter(p => p.dataFechamento && naJanela(mesDe(p.dataFechamento)) && p.dataFechamento.slice(0, 10) > primeira.get(nomeChave(p.nomeCliente))!)

  const n = meses.filter(naJanela).length || 1
  return {
    meses: n,
    orcamentosNovosMes: novos.length / n,
    taxaNovo: novos.length ? ganhosNovos.length / novos.length : 0,
    ticketNovo: ganhosNovos.length ? ganhosNovos.reduce((s, l) => s + l.card.preco, 0) / ganhosNovos.length : 0,
    vendaRecorrenteMes: recompras.reduce((s, p) => s + p.venda, 0) / n,
    ticketRecorrente: recompras.length ? recompras.reduce((s, p) => s + p.venda, 0) / recompras.length : 0,
    margemPct: (margemContribuicao(args.pedidos).pct ?? 40) / 100,
    fixosMes: args.fixosMes,
  }
}

export const alavancasIniciais = (b: BaseSimulador): Alavancas => ({
  taxaNovo: b.taxaNovo, maisOrcamentosPct: 0, precoPct: 0, perdaPorAumento: 0, reativadosMes: 0, anuncioMes: 0,
})

export function simular(b: BaseSimulador, a: Alavancas): Resultado {
  const taxaEfetiva = Math.min(1, Math.max(0, a.taxaNovo - (a.perdaPorAumento / 100) * (a.precoPct / 10)))
  const fator = 1 + a.precoPct / 100
  const vendasNovos = b.orcamentosNovosMes * (1 + a.maisOrcamentosPct / 100) * taxaEfetiva * b.ticketNovo * fator
  const vendasRec = b.vendaRecorrenteMes * fator + a.reativadosMes * b.ticketRecorrente * fator
  const vendas = vendasNovos + vendasRec
  // Custo de produção não muda com o preço: o aumento vira margem inteira
  const custo = (vendas / fator) * (1 - b.margemPct)
  const margem = vendas - custo
  return { vendas, margem, lucro: margem - b.fixosMes - a.anuncioMes, taxaEfetiva }
}
