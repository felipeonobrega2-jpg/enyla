// Leitura ?o=historico_offset na porta externa, liberada a todos os diretores. SÓ LÊ: não grava, não envia, não apaga.
// Pedidos Offset fechados ou entregues (coluna COL_FECHADO..COL_ENTREGUE) por cliente, com os dois códigos (orçamento e lote),
// data de fechamento, quantidade, valor e dias desde a última compra. Reusa montarPedidos e ritmoDosClientes (não reimplementa a regra).
// Sem telefone, e-mail ou documento: o cliente sai só com nome e nível. Pedidos Digital não entram.
import { supabase } from "./supabase"
import { montarPedidos, nomeChave, pedidoEntregue } from "./negocio"
import { ritmoDosClientes } from "./ritmo"
import { unpackTerceirizado } from "./kanbanUnpack"
import type { KanbanCard, LancamentoFinanceiro } from "../types"

export const AJUDA_HISTORICO_OFFSET = "Histórico de compras Offset por cliente (todos os diretores): pedidos fechados ou entregues (etapa Fechado até Entregue), de cada cliente { cliente, nivel ('A'|'B'|'C' pela curva de vendas de 12 meses, ou vazio sem curva), diasDesdeUltimaCompra (a partir de dataFechamento), ultimaCompra, pedidos: [{ orcamentos (códigos dos orçamentos, ex. ORC-...), lote (código do lote, ex. RAN-006, ou vazio se não houver), dataFechamento, dataEntregaReal (à parte), entregue, etapa, quantidade (itens não terceirizados), valor (contratado + sobras) }] }. Clientes ordenados por diasDesdeUltimaCompra (maior primeiro). Só Offset (Digital não entra). Só leitura; sem telefone, e-mail ou documento"

export type PedidoHistorico = {
  orcamentos: string[]; lote: string | null; dataFechamento: string | null; dataEntregaReal: string | null
  entregue: boolean; etapa: string; quantidade: number; valor: number
}
export type ClienteHistorico = {
  cliente: string; nivel: "A" | "B" | "C" | ""; diasDesdeUltimaCompra: number | null; ultimaCompra: string | null; pedidos: PedidoHistorico[]
}

export function montarHistoricoOffset(kanban: KanbanCard[], lancamentos: LancamentoFinanceiro[], hoje = new Date()): ClienteHistorico[] {
  const cards = kanban.map(unpackTerceirizado)
  const pedidos = montarPedidos(cards, lancamentos.filter(l => (l.unidade ?? "offset") === "offset"))
  const ritmo = new Map(ritmoDosClientes(pedidos, cards, hoje).map(r => [r.chave, r]))
  const porCliente = new Map<string, { nome: string; ps: PedidoHistorico[] }>()
  for (const p of pedidos) {
    const k = nomeChave(p.nomeCliente)
    const g = porCliente.get(k) ?? { nome: p.nomeCliente, ps: [] }
    g.ps.push({
      orcamentos: [...new Set(p.cards.map(c => c.numero).filter(Boolean))].sort(),
      lote: (p.tipo === "lote" ? p.cards[0].loteNumero : null) || null,
      dataFechamento: p.dataFechamento ?? null, dataEntregaReal: p.dataEntregaReal ?? null,
      entregue: pedidoEntregue(p), etapa: p.etapa, quantidade: p.quantidade, valor: p.venda,
    })
    porCliente.set(k, g)
  }
  const lista: ClienteHistorico[] = [...porCliente.entries()].map(([k, g]) => {
    const r = ritmo.get(k)
    return {
      cliente: g.nome, nivel: r?.curva ?? "", diasDesdeUltimaCompra: r?.diasSemPedir ?? null, ultimaCompra: r?.ultimo ?? null,
      pedidos: g.ps.sort((a, b) => (b.dataFechamento ?? "").localeCompare(a.dataFechamento ?? "")),
    }
  })
  return lista.sort((a, b) => (b.diasDesdeUltimaCompra ?? -1) - (a.diasDesdeUltimaCompra ?? -1) || a.cliente.localeCompare(b.cliente))
}

async function todos<T>(tabela: string): Promise<T[]> {
  const out: T[] = []
  for (let de = 0; de < 50000; de += 1000) {
    const { data } = await supabase.from(tabela).select("*").range(de, de + 999)
    if (!data?.length) break
    out.push(...(data as T[]))
    if (data.length < 1000) break
  }
  return out
}

export async function lerHistoricoOffset(): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const [kanban, lancs] = await Promise.all([todos<KanbanCard>("KanbanCard"), todos<LancamentoFinanceiro>("LancamentoFinanceiro")])
  const clientes = montarHistoricoOffset(kanban, lancs)
  return { status: 200, corpo: { total: clientes.length, clientes } }
}
