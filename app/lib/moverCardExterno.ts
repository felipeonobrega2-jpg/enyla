// Porta externa, ação mover_card: só avança um card já fechado (de 1 em diante) para uma etapa de 2 (Arte/Dieline) a 8 (Expedição).
// Só muda a coluna. Nunca volta, nunca vai a 0, 9 (Entregue) ou 10 (Perdido). Motivo obrigatório. Não manda mensagem a cliente.
import { supabase } from "./supabase"
import { DIRETORES } from "./diretoria"
import { moverCard } from "./moverCard"
import { COLUNAS_KANBAN } from "@/app/types"

export type ResultadoMover = { ok: true; resultado: string; movidos: { numero: string; de: number; para: number }[] } | { ok: false; status: 400 | 404 | 500; erro: string }

export function validarAvanco(atual: number, destino: unknown, motivo: unknown): string | null {
  const m = typeof motivo === "string" ? motivo.trim() : ""
  if (!m) return "motivo: obrigatório."
  if (m.length > 300) return "motivo: no máximo 300 caracteres."
  if (typeof destino !== "number" || !Number.isInteger(destino)) return "coluna: número inteiro de 2 a 8."
  if (destino < 2 || destino > 8) return "coluna: só de 2 (Arte/Dieline) a 8 (Expedição). 0, 9 (Entregue) e 10 (Perdido) não são por aqui."
  if (atual < 1) return `O card está em "${COLUNAS_KANBAN[atual] ?? atual}": só se move a partir de 1 (Fechado).`
  if (destino <= atual) return `Só avança: o card está em ${atual} ("${COLUNAS_KANBAN[atual]}") e o destino ${destino} não é maior.`
  return null
}

export async function moverCardExterno(diretor: string, b: Record<string, unknown>): Promise<ResultadoMover> {
  const numero = typeof b.numero === "string" ? b.numero.trim() : ""
  const lote = typeof b.loteNumero === "string" ? b.loteNumero.trim() : ""
  if (!numero && !lote) return { ok: false, status: 400, erro: "numero (ORC-...) ou loteNumero: obrigatório." }
  const motivo = typeof b.motivo === "string" ? b.motivo.trim() : ""
  const { data } = await supabase.from("KanbanCard").select("id, numero, coluna").eq(numero ? "numero" : "loteNumero", numero || lote)
  const cards = (data ?? []) as { id: string; numero: string; coluna: number }[]
  if (!cards.length) return { ok: false, status: 404, erro: `Pedido ${numero || lote} não encontrado.` }
  for (const c of cards) {
    const erro = validarAvanco(c.coluna, b.coluna, motivo)
    if (erro) return { ok: false, status: 400, erro: cards.length > 1 ? `${c.numero}: ${erro}` : erro }
  }
  const por = DIRETORES.find(d => d.id === diretor)?.nome ?? diretor
  const destino = b.coluna as number
  const movidos: { numero: string; de: number; para: number }[] = []
  for (const c of cards) {
    const r = await moverCard(c, destino, { por, motivo })
    if (!r.ok) return { ok: false, status: 500, erro: `Erro ao mover ${c.numero}.${movidos.length ? ` Já movidos: ${movidos.map(m => m.numero).join(", ")}.` : ""}` }
    movidos.push({ numero: c.numero, de: c.coluna, para: destino })
  }
  return { ok: true, resultado: `${movidos.map(m => m.numero).join(", ")} movido para "${COLUNAS_KANBAN[destino]}" (${motivo}).`, movidos }
}
