// Sobras do offset (a tiragem pode variar até 10%): o que o cliente compra a mais vira lucro extra. Medido nos
// pedidos entregues, vira a margem de negociação máxima: dá para dar esse desconto sem perder, na média.
import type { LancamentoFinanceiro } from "../types"
import { Pedido, pedidoEntregue, unidadesDaSobra, isTerceirizado } from "./negocio"

export type EstatisticaSobras = {
  pedidos: number              // entregues considerados (offset, últimos 12 meses)
  comSobra: number             // em quantos houve sobra vendida
  pctEsperado: number          // sobras ÷ valor, somando todos (inclusive os sem sobra): o desconto "seguro"
  pctQuandoTem: number         // mediana do % de valor nos pedidos com sobra
  unidadesQuandoTem: number    // mediana do % de unidades a mais nos pedidos com sobra
}
export const AMOSTRA_SOBRAS = 5

const mediana = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

export function estatisticaSobras(pedidos: Pedido[], hoje = new Date()): EstatisticaSobras | null {
  const corte = new Date(hoje.getTime() - 365 * 86_400_000).toISOString().slice(0, 10)
  const base = pedidos.filter(p => pedidoEntregue(p) && p.valor > 0 && p.cards.some(c => !isTerceirizado(c)) && p.quantidade >= 1000
    && (p.dataEntregaReal ?? p.dataFechamento ?? "") >= corte)
  if (base.length < AMOSTRA_SOBRAS) return null
  const com = base.filter(p => p.sobras > 0)
  const un = (p: Pedido) => p.receitas.filter((l: LancamentoFinanceiro) => l.categoria === "sobra").reduce((s, l) => s + unidadesDaSobra(l), 0)
  return {
    pedidos: base.length, comSobra: com.length,
    pctEsperado: base.reduce((s, p) => s + p.sobras, 0) / base.reduce((s, p) => s + p.valor, 0),
    pctQuandoTem: mediana(com.map(p => p.sobras / p.valor)),
    unidadesQuandoTem: mediana(com.map(p => un(p) / p.quantidade).filter(x => x > 0)),
  }
}
