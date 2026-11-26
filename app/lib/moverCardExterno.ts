// Porta externa, ação mover_card: só avança um card já fechado (de 1 em diante) para uma etapa de 2 (Arte/Dieline) a 8 (Expedição).
// Só muda a coluna. Nunca volta, nunca vai a 0 ou 9 (Entregue). Motivo obrigatório. Não manda mensagem a cliente.
// Exceção: coluna 10 (Perdido), só para as chaves do CTO e do COO (podeMoverParaPerdido): grava o motivo em motivoPerdido.
import { supabase } from "./supabase"
import { DIRETORES } from "./diretoria"
import { moverCard } from "./moverCard"
import { COLUNAS_KANBAN, COL_PERDIDO } from "@/app/types"

export type ResultadoMover = { ok: true; resultado: string; movidos: { numero: string; de: number; para: number }[]; registro?: RegistroPerdido } | { ok: false; status: 400 | 403 | 404 | 500; erro: string }
export type RegistroPerdido = { autor: string; em: string; emIso: string; cards: { numero: string; de: number; para: number }[]; lote?: string; motivo: string }

export const podeMoverParaPerdido = (diretor: string) => diretor === "cto" || diretor === "coo"
const brasilia = (d = new Date()) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })

// Perdido (10): só de um card já fechado e ainda em andamento (1 a 8), com motivo. Não é "avanço" de etapa.
export function validarPerdido(atual: number, motivo: unknown): string | null {
  const m = typeof motivo === "string" ? motivo.trim() : ""
  if (!m) return "motivo: obrigatório."
  if (m.length > 300) return "motivo: no máximo 300 caracteres."
  if (atual < 1 || atual > 8) return `O card está em "${COLUNAS_KANBAN[atual] ?? atual}": só vai a Perdido a partir de 1 (Fechado) até 8 (Expedição).`
  return null
}

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
  const perdido = b.coluna === COL_PERDIDO
  if (perdido && !podeMoverParaPerdido(diretor)) return { ok: false, status: 403, erro: "coluna 10 (Perdido) é só para as chaves do CTO e do COO." }
  const { data } = await supabase.from("KanbanCard").select("id, numero, coluna").eq(numero ? "numero" : "loteNumero", numero || lote)
  const cards = (data ?? []) as { id: string; numero: string; coluna: number }[]
  if (!cards.length) return { ok: false, status: 404, erro: `Pedido ${numero || lote} não encontrado.` }
  for (const c of cards) {
    const erro = perdido ? validarPerdido(c.coluna, motivo) : validarAvanco(c.coluna, b.coluna, motivo)
    if (erro) return { ok: false, status: 400, erro: cards.length > 1 ? `${c.numero}: ${erro}` : erro }
  }
  const por = DIRETORES.find(d => d.id === diretor)?.nome ?? diretor
  const destino = b.coluna as number
  const movidos: { numero: string; de: number; para: number }[] = []
  for (const c of cards) {
    const r = await moverCard(c, destino, { por, motivo, ...(perdido ? { perdido: true } : {}) })
    if (!r.ok) return { ok: false, status: 500, erro: `Erro ao mover ${c.numero}.${movidos.length ? ` Já movidos: ${movidos.map(m => m.numero).join(", ")}.` : ""}` }
    movidos.push({ numero: c.numero, de: c.coluna, para: destino })
  }
  const agora = new Date()
  const registro: RegistroPerdido | undefined = perdido ? { autor: diretor, em: brasilia(agora), emIso: agora.toISOString(), cards: movidos, ...(lote ? { lote } : {}), motivo } : undefined
  return { ok: true, ...(registro ? { registro } : {}), resultado: `${movidos.map(m => m.numero).join(", ")} movido para "${COLUNAS_KANBAN[destino]}" (${motivo}).`, movidos }
}
