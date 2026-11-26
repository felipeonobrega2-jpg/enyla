// X do card no Kanban = "levar para Perdidos". Nada é apagado: o card vai para a coluna Perdido com o motivo.
// Apagar de verdade só existe no detalhe do card, para o admin, digitando o nome do cliente.
import { COL_PERDIDO } from "../types"

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<unknown>

export const motivoValido = (motivo: string) => motivo.trim().length > 0

// Corpo do PATCH em /api/kanban/{id}: coluna Perdido e motivo, numa chamada só.
export const corpoPerda = (motivo: string) => ({ coluna: COL_PERDIDO, motivoPerdido: motivo.trim() })

// Grava a perda no servidor. Só PATCH; nunca DELETE. Sem motivo, não grava nada.
export async function gravarPerda(fetchFn: FetchLike, cardId: string, motivo: string): Promise<boolean> {
  if (!motivoValido(motivo)) return false
  await fetchFn(`/api/kanban/${cardId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpoPerda(motivo)),
  })
  return true
}

// Confirmação da exclusão definitiva: o nome digitado precisa ser o do cliente (sem diferenciar caixa nem espaços nas pontas).
export const nomeConfere = (digitado: string, nomeCliente: string) =>
  nomeCliente.trim() !== "" && digitado.trim().toLowerCase() === nomeCliente.trim().toLowerCase()

export const podeExcluirDefinitivo = (papel: string | null | undefined) => papel === "admin"
