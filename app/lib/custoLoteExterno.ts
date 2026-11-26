// Porta externa, ?o=custo_lote (só a chave do CFO, só leitura): custo real por lote Offset pelo LIVRO.
// Soma as linhas de despesa de LancamentoFinanceiro do lote com a mesma regra do custoDireto (negocio.ts: pago ou conta
// do fornecedor). Cada fatia de um rateio (lancar_despesa) é uma linha com o valor da fatia, então o total não se repete.
// A margem da rodada (#155/#158) é outro modelo e não entra aqui. Sem dado pessoal de cliente além do nome já usado nas telas.
import type { KanbanCard, LancamentoFinanceiro, ProjecaoCustos } from "@/app/types"
import { montarPedidos } from "./negocio"
import { unpackTerceirizado } from "./kanbanUnpack"
import { CATS_DESPESA_PADRAO, type CategoriaFinanceira } from "@/app/config"

export const AJUDA_CUSTO_LOTE: Record<string, string> = {
  "?o=custo_lote": "SÓ A CHAVE DO CFO (as outras recebem 403). Só leitura. Custo real por lote Offset pelo livro: soma das despesas lançadas do lote (pagas ou na conta do fornecedor, como o custoDireto), já com o rateio de lancar_despesa (cada lote entra só com o valor da FATIA; o total da despesa não se repete). Por lote: venda, custoReal, papel, porCategoria e categorias (id, nome, valor: impressão, frete etc. separados, nunca numa faixa só; sem categoria vira sem_categoria até o CTO corrigir com corrigir_categoria_lancamento), porFornecedor (fornecedorId), rateios (rateioGrupoId + fatia), margem real x orçada (projecaoCustos). Opcional: &lote=NUMERO filtra um lote; &incluirEstornados=1 inclui lançamentos estornados. Estornados ficam fora por padrão. Não duplica a margem da rodada (#155)",
}

const r2 = (n: number) => Math.round(n * 100) / 100
const CAMPOS_PROJECAO: (keyof ProjecaoCustos)[] = ["papel", "impressao", "corte", "verniz", "colagem", "arte", "faca", "hotstamping", "corteVinco", "outros"]
const ehPapel = (l: LancamentoFinanceiro) => /papel/i.test(`${l.categoria ?? ""} ${l.subcategoria ?? ""} ${l.descricao}`)

// Grupo do rateio: coluna aditiva rateioGrupoId; se a migração ainda não existe, o grupo está na obs gravada por lancar_despesa
export function grupoDoRateio(l: LancamentoFinanceiro): string | null {
  const g = (l as LancamentoFinanceiro & { rateioGrupoId?: string | null }).rateioGrupoId
  if (g) return g
  return /\[rateio ([0-9a-f-]{36});/i.exec(l.obs ?? "")?.[1] ?? null
}

export function custoPorLote(kanban: KanbanCard[], lancamentos: LancamentoFinanceiro[], opts: { lote?: string; incluirEstornados?: boolean; categorias?: CategoriaFinanceira[] } = {}) {
  const nomes = new Map((opts.categorias?.length ? opts.categorias : CATS_DESPESA_PADRAO).map(c => [c.id, c.nome]))
  const lancs = lancamentos.filter(l => (l.unidade ?? "offset") === "offset" && (opts.incluirEstornados || !l.estornadoEm))
  const pedidos = montarPedidos(kanban.map(unpackTerceirizado), lancs).filter(p => p.tipo === "lote" && (!opts.lote || p.numero === opts.lote))
  return pedidos.map(p => {
    const custeadas = p.despesas.filter(l => l.status === "pago" || l.formaPagamento === "conta")
    const porCategoria: Record<string, number> = {}
    const porFornecedor: Record<string, number> = {}
    const grupos = new Map<string, number>()
    for (const l of custeadas) {
      const cat = l.categoria ?? "sem_categoria", forn = l.fornecedorId ?? "sem_fornecedor"
      porCategoria[cat] = r2((porCategoria[cat] ?? 0) + l.valor)
      porFornecedor[forn] = r2((porFornecedor[forn] ?? 0) + l.valor)
      const g = grupoDoRateio(l)
      if (g) grupos.set(g, r2((grupos.get(g) ?? 0) + l.valor))
    }
    const custoReal = r2(custeadas.reduce((s, l) => s + l.valor, 0))
    const orcado = r2(p.cards.reduce((s, c) => s + CAMPOS_PROJECAO.reduce((a, k) => a + (Number(c.projecaoCustos?.[k]) || 0), 0), 0))
    const temOrcado = p.cards.some(c => c.projecaoCustos)
    const venda = r2(p.venda)
    const pct = (m: number) => venda > 0 ? r2(m / venda * 100) : null
    const margemReal = r2(venda - custoReal)
    const margemOrcada = temOrcado ? r2(venda - orcado) : null
    return {
      lote: p.numero, cliente: p.nomeCliente, venda, custoReal,
      papel: r2(custeadas.filter(ehPapel).reduce((s, l) => s + l.valor, 0)),
      porCategoria, porFornecedor,
      categorias: Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).map(([id, valor]) => ({ id, nome: id === "sem_categoria" ? "(sem categoria)" : nomes.get(id) ?? id, valor })),
      rateios: [...grupos].map(([rateioGrupoId, fatia]) => ({ rateioGrupoId, fatia })),
      lancamentos: custeadas.length,
      margem: { real: margemReal, realPct: pct(margemReal), orcada: margemOrcada, orcadaPct: margemOrcada === null ? null : pct(margemOrcada), custoOrcado: temOrcado ? orcado : null,
        diferenca: margemOrcada === null ? null : r2(margemReal - margemOrcada) },
    }
  })
}
