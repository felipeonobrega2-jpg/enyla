// Mover um card de etapa de produção: única lógica, usada pelo assistente (mover_pedido) e pela porta externa (mover_card).
// Só grava a coluna (e a data de fechamento ao entrar em Fechado) e a etapa no Tracking. Não manda mensagem a ninguém:
// o WhatsApp/e-mail ao arrastar no painel e as automações de etapa saem do cliente (app/page.tsx), não daqui.
import { supabase } from "./supabase"
import { COLUNAS_KANBAN, COL_FECHADO } from "@/app/types"

const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

export async function moverCard(card: { id: string; numero: string }, novaColuna: number, quem?: { por: string; motivo: string; perdido?: boolean }): Promise<{ ok: true } | { ok: false }> {
  const dataFechamento = novaColuna === COL_FECHADO ? hoje() : undefined
  const { error } = await supabase.from("KanbanCard")
    .update({ coluna: novaColuna, ...(dataFechamento ? { dataFechamento } : {}), ...(quem?.perdido ? { motivoPerdido: quem.motivo } : {}) })
    .eq("id", card.id)
  if (error) return { ok: false }

  const { data: tracking } = await supabase.from("Tracking").select("*").eq("numero", card.numero).maybeSingle()
  if (tracking) {
    const nome = COLUNAS_KANBAN[novaColuna] ?? `Coluna ${novaColuna}`
    const antigas = (tracking.etapas ?? []) as { coluna: number; tipo?: string }[]
    const jaTem = antigas.some(e => e.coluna === novaColuna && (!e.tipo || e.tipo === "coluna"))
    const etapas = jaTem ? antigas : [...antigas, {
      coluna: novaColuna, nome, tipo: "coluna", dataHora: new Date().toLocaleString("pt-BR"),
      ...(quem ? { por: quem.por, detalhe: `Movido por ${quem.por}: ${quem.motivo}` } : {}),
    }]
    await supabase.from("Tracking").update({ colunaAtual: novaColuna, etapas }).eq("numero", card.numero)
  }
  return { ok: true }
}
