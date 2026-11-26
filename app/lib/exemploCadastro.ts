// Exemplo de cadastro bem preenchido, mostrado ao lado dos campos do /parceiros (telas largas).
// O texto vem do marketing: preencha por etapa (id da etapa → texto). Etapa sem texto mostra o espaço reservado.
import type { Etapa } from "./parceiros"

export const EXEMPLO_CADASTRO_TITULO = "Exemplo de cadastro bem preenchido"
export const EXEMPLO_CADASTRO_VAZIO = "O exemplo desta etapa chega em breve."
export const EXEMPLOS_CADASTRO: Partial<Record<Etapa, string>> = {}

export const exemploDaEtapa = (etapa: Etapa): string | null => EXEMPLOS_CADASTRO[etapa]?.trim() || null
