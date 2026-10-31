// Aprovação online do orçamento pelo cliente.
// O link leva um código derivado do número do orçamento com o segredo do servidor:
// sem ele, ninguém abre o orçamento de outro cliente trocando o número na URL.
// Só roda no servidor (usa o segredo).

import { createHmac, timingSafeEqual } from "crypto"
export type { AprovacaoOnline } from "../types"

export const SINAL_PCT_PADRAO = 50

function segredo(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("Segredo do servidor não configurado")
  return s
}

export function tokenAprovacao(numero: string): string {
  return createHmac("sha256", segredo()).update(`aprovar:${numero}`).digest("base64url").slice(0, 16)
}

export function tokenValido(numero: string, token: string | null | undefined): boolean {
  if (!token) return false
  const esperado = Buffer.from(tokenAprovacao(numero))
  const recebido = Buffer.from(token)
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido)
}

// Data limite da proposta: data do orçamento + validade (dias corridos, como na proposta enviada)
export function validaAte(dataOrcamento: string | undefined, validadeDias: number | undefined): string | null {
  if (!dataOrcamento || !validadeDias) return null
  const iso = /^\d{4}-\d{2}-\d{2}/.test(dataOrcamento)
    ? dataOrcamento.slice(0, 10)
    : dataOrcamento.split(",")[0].trim().split("/").reverse().join("-")
  const d = new Date(iso + "T12:00:00")
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + validadeDias)
  return d.toLocaleDateString("sv-SE")
}
