// Cliente da API v3 da Lalamove (Brasil). Só roda no servidor.
// Chaves nas variáveis de ambiente: LALAMOVE_API_KEY, LALAMOVE_API_SECRET e LALAMOVE_AMBIENTE ("producao" ou, por padrão, sandbox).
// Cada chamada é assinada: HMAC-SHA256(segredo, `${ms}\r\n${MÉTODO}\r\n${caminho}\r\n\r\n${corpo}`), em hexa minúsculo.

import { createHmac, randomUUID } from "crypto"

export const ambienteLalamove = () => process.env.LALAMOVE_AMBIENTE === "producao" ? "producao" : "sandbox"
const base = () => ambienteLalamove() === "producao" ? "https://rest.lalamove.com" : "https://rest.sandbox.lalamove.com"
export const lalamoveConfigurada = () => !!(process.env.LALAMOVE_API_KEY && process.env.LALAMOVE_API_SECRET)

export function assinar(segredo: string, ms: string, metodo: string, caminho: string, corpo: string) {
  return createHmac("sha256", segredo).update(`${ms}\r\n${metodo}\r\n${caminho}\r\n\r\n${corpo}`).digest("hex")
}

export type RespostaLalamove<T> = { ok: boolean; status: number; dados: T | null; erro?: string }

export async function lalamove<T>(metodo: "GET" | "POST" | "DELETE" | "PATCH", caminho: string, corpo?: unknown): Promise<RespostaLalamove<T>> {
  const chave = process.env.LALAMOVE_API_KEY, segredo = process.env.LALAMOVE_API_SECRET
  if (!chave || !segredo) return { ok: false, status: 0, dados: null, erro: "Lalamove não configurada (chaves na Vercel)." }
  const texto = corpo === undefined ? "" : JSON.stringify({ data: corpo })
  const ms = String(Date.now())
  const r = await fetch(base() + caminho, {
    method: metodo,
    headers: {
      Authorization: `hmac ${chave}:${ms}:${assinar(segredo, ms, metodo, caminho, texto)}`,
      Market: "BR",
      "Request-ID": randomUUID(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: texto || undefined,
  }).catch(() => null)
  if (!r) return { ok: false, status: 0, dados: null, erro: "Sem conexão com a Lalamove." }
  if (r.status === 204) return { ok: true, status: 204, dados: null }
  const j = await r.json().catch(() => null) as { data?: T; errors?: { id?: string; message?: string; detail?: string }[] } | null
  if (!r.ok) {
    const e = j?.errors?.[0]
    return { ok: false, status: r.status, dados: null, erro: traduzirErro(e?.id, e?.message ?? e?.detail) }
  }
  return { ok: true, status: r.status, dados: (j?.data ?? null) as T | null }
}

// Mensagens de erro mais comuns em português
function traduzirErro(id?: string, msg?: string) {
  const mapa: Record<string, string> = {
    ERR_INSUFFICIENT_CREDIT: "Saldo insuficiente na carteira da Lalamove.",
    ERR_QUOTATION_EXPIRED: "A cotação expirou (vale 5 minutos). Cote de novo.",
    ERR_OUT_OF_SERVICE_AREA: "Endereço fora da área atendida pela Lalamove.",
    ERR_INVALID_PHONE_NUMBER: "Telefone inválido (use DDD + número).",
    ERR_CANCELLATION_FORBIDDEN: "Não dá mais para cancelar: o motorista já está com a corrida há mais de 5 minutos.",
    ERR_UNAUTHORIZED: "Chaves da Lalamove recusadas. Confira na Vercel.",
  }
  return (id && mapa[id]) || msg || id || "Erro na Lalamove."
}

// ── Tipos das respostas usadas ─────────────────────────────────────────────────
export type Parada = { coordinates: { lat: string; lng: string }; address: string }
export type Cotacao = {
  quotationId: string; expiresAt: string; serviceType: string
  stops: (Parada & { stopId: string })[]
  priceBreakdown: { total: string; currency: string; base?: string }
  distance?: { value: string; unit: string }
}
export type PedidoLalamove = {
  orderId: string; quotationId: string; status: string; shareLink?: string; driverId?: string
  priceBreakdown?: { total: string; currency: string }
  distance?: { value: string; unit: string }
}
export type Motorista = { driverId: string; name?: string; phone?: string; plateNumber?: string; photo?: string; coordinates?: { lat: string; lng: string; updatedAt?: string } }
export type Cidade = { locode: string; name: string; services: { key: string; description?: string; dimensions?: unknown; load?: { value: string; unit: string } }[] }

export const cidades = () => lalamove<Cidade[]>("GET", "/v3/cities")
export const cotar = (servico: string, paradas: Parada[]) =>
  lalamove<Cotacao>("POST", "/v3/quotations", { serviceType: servico, language: "pt_BR", stops: paradas, isRouteOptimized: false })
export const criarPedido = (dados: { quotationId: string; sender: { stopId: string; name: string; phone: string }; recipients: { stopId: string; name: string; phone: string; remarks?: string }[]; metadata?: Record<string, string> }) =>
  lalamove<PedidoLalamove>("POST", "/v3/orders", { ...dados, isPODEnabled: true })
export const consultarPedido = (orderId: string) => lalamove<PedidoLalamove>("GET", `/v3/orders/${encodeURIComponent(orderId)}`)
export const consultarMotorista = (orderId: string, driverId: string) =>
  lalamove<Motorista>("GET", `/v3/orders/${encodeURIComponent(orderId)}/drivers/${encodeURIComponent(driverId)}`)
export const cancelarPedido = (orderId: string) => lalamove<null>("DELETE", `/v3/orders/${encodeURIComponent(orderId)}`)
