// Dados da proposta mostrados ao cliente na página pública de aprovação (só leitura no servidor).

import { supabase } from "./supabase"
import { validaAte } from "./aprovacao"
import { KanbanCard, KanbanOpcao, FormData } from "../types"

export type CaixaProposta = { largura: number; altura: number; profundidade: number; material?: string; verniz?: boolean; laminacao?: string | null; arteUrl?: string | null }

export type PropostaPublica = {
  card: KanbanCard
  caixa: CaixaProposta | null
  opcoes: KanbanOpcao[]
  especificacoes: string[]
  observacao?: string
  validaAte: string | null
  vencida: boolean
}

const TIPO_CAIXA: Record<string, string> = {
  simples: "Caixa cartucho", aviao: "Caixa avião", "fundo-automatico": "Caixa com fundo automático", americano: "Caixa fundo americano",
}

function especificar(card: KanbanCard, form?: FormData): string[] {
  if (!form) return [
    card.dimensoes && card.dimensoes !== "0×0×0" ? `Dimensões: ${card.dimensoes}` : null,
    card.materialNome ? `Material: ${card.materialNome}` : null,
    card.cores ? `Cores: ${card.cores}` : null,
    card.acabamentos?.length ? `Acabamentos: ${card.acabamentos.join(", ")}` : null,
  ].filter(Boolean) as string[]
  return [
    TIPO_CAIXA[form.tipoCaixa] ?? null,
    form.frente ? `Dimensões: ${form.frente} × ${form.alturaBox} × ${form.lateral} cm (L × A × P)` : null,
    form.materialNome ? `Material: ${form.materialNome}` : null,
    form.laminacao && form.laminacaoTipo ? `Laminação ${form.laminacaoTipo.toLowerCase()}` : null,
    form.incluirVerniz && form.vernizTipo ? `Verniz ${form.vernizTipo}` : null,
    form.outrosAcabamentos?.length ? form.outrosAcabamentos.join(", ") : null,
    form.acompanhamentos?.length ? `Acompanha: ${form.acompanhamentos.join(", ").toLowerCase()}` : null,
    form.numArtes > 1 ? `${form.numArtes} artes` : null,
    form.comFaca ? "Faca de corte inclusa" : null,
  ].filter(Boolean) as string[]
}

export async function carregarProposta(numero: string): Promise<PropostaPublica | null> {
  const { data: card } = await supabase.from("KanbanCard").select("*").eq("numero", numero).maybeSingle()
  if (!card) return null
  const { data: hist } = await supabase.from("HistoricoItem").select("form, calculo").eq("numero", numero).maybeSingle()
  const form = (hist?.form ?? undefined) as FormData | undefined

  let opcoes: KanbanOpcao[] = (card.opcoes ?? []).filter((o: KanbanOpcao) => o.quantidade > 0 && o.preco > 0)
  if (!opcoes.length && card.preco > 0 && card.quantidade > 0) opcoes = [{ quantidade: card.quantidade, preco: card.preco, unitario: card.preco / card.quantidade }]
  opcoes.sort((a, b) => a.quantidade - b.quantidade)

  const limite = validaAte(card.data ?? card.createdAt, form?.validadeDias ?? 15)

  // Caixa 3D: medidas do orçamento (ou do card) e a primeira imagem de arte/mockup do pedido, se houver
  const dims: number[] = form?.frente ? [form.frente, form.alturaBox, form.lateral]
    : (card.dimensoes ?? "").split(/[×x]/).map((n: string) => parseFloat(n.replace(",", ".")))
  const { data: imgs } = await supabase.from("pedido_arquivos").select("url, nome, tipo").eq("card_id", card.id).in("tipo", ["arte", "mockup"])
  const arte = (imgs ?? []).find(a => /\.(png|jpe?g|webp)$/i.test(a.nome ?? a.url))
  const caixa = dims.length === 3 && dims.every(n => n > 0) ? {
    largura: dims[0], altura: dims[1], profundidade: dims[2], material: form?.materialNome ?? card.materialNome,
    verniz: !!form?.incluirVerniz, laminacao: form?.laminacao ? form.laminacaoTipo : null, arteUrl: arte?.url ?? null,
  } : null
  const hoje = new Date().toLocaleDateString("sv-SE")
  return {
    card: card as KanbanCard, caixa, opcoes, especificacoes: especificar(card as KanbanCard, form),
    observacao: form?.obsCliente || undefined,
    validaAte: limite, vencida: !!limite && hoje > limite,
  }
}
