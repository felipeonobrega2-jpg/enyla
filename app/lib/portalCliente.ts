// Página do cliente: um link permanente por cliente (sem senha), com código derivado do nome.
// Só roda no servidor.

import { supabase } from "./supabase"
import { assinar } from "./aprovacao"
import { montarPedidos, nomeChave, Pedido } from "./negocio"
import { KanbanCard, LancamentoFinanceiro, PedidoArquivo } from "../types"

export const tokenCliente = (nome: string) => assinar("cliente", nomeChave(nome), 20)

export type EtapaRastreio = { coluna: number; nome: string; dataHora: string; tipo?: string; detalhe?: string }

export type PortalCliente = {
  nome: string
  pedidos: (Pedido & { etapas: EtapaRastreio[]; arquivos: PedidoArquivo[] })[]
}

// Acha o cliente pelo código do link (compara com os nomes que têm pedido ou orçamento)
export async function carregarPortal(token: string): Promise<PortalCliente | null> {
  const { data: nomes } = await supabase.from("KanbanCard").select("nomeCliente")
  const nome = [...new Set((nomes ?? []).map(n => n.nomeCliente as string).filter(Boolean))].find(n => tokenCliente(n) === token)
  if (!nome) return null

  const { data: todos } = await supabase.from("KanbanCard").select("*")
  const cards = ((todos ?? []) as KanbanCard[]).filter(c => nomeChave(c.nomeCliente) === nomeChave(nome))
  const ids = cards.map(c => c.id)
  const lotes = [...new Set(cards.map(c => c.loteId).filter(Boolean))] as string[]
  const numeros = cards.map(c => c.numero)

  const [porCard, porLote, rastreios, arquivos] = await Promise.all([
    ids.length ? supabase.from("LancamentoFinanceiro").select("*").in("cardId", ids) : Promise.resolve({ data: [] }),
    lotes.length ? supabase.from("LancamentoFinanceiro").select("*").in("loteId", lotes) : Promise.resolve({ data: [] }),
    numeros.length ? supabase.from("Tracking").select("numero, etapas").in("numero", numeros) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("pedido_arquivos").select("*").in("card_id", ids).order("created_at", { ascending: true }) : Promise.resolve({ data: [] }),
  ])
  const lancamentos = [...new Map([...(porCard.data ?? []), ...(porLote.data ?? [])].map(l => [l.id, l])).values()] as LancamentoFinanceiro[]

  const pedidos = montarPedidos(cards, lancamentos)
    .sort((a, b) => (b.dataFechamento ?? "").localeCompare(a.dataFechamento ?? ""))
    .map(p => ({
      ...p,
      // Rastreio do card principal (todos os cards do lote andam juntos)
      etapas: ((rastreios.data ?? []).find(r => p.cards.some(c => c.numero === r.numero))?.etapas ?? []) as EtapaRastreio[],
      arquivos: ((arquivos.data ?? []) as PedidoArquivo[]).filter(a => p.cards.some(c => c.id === a.card_id)),
    }))
  return { nome, pedidos }
}
