// Asaas (cobrança Pix/cartão). Chave e token do webhook só na Vercel: ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN
// (ASAAS_AMBIENTE=sandbox para testar). O webhook nunca confia no corpo: relê a cobrança na API.
import { timingSafeEqual } from "crypto"

const BASE = () => process.env.ASAAS_AMBIENTE === "sandbox" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3"
export const asaasConfigurado = () => !!process.env.ASAAS_API_KEY

export async function asaas<T>(caminho: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; corpo: T | null }> {
  const key = process.env.ASAAS_API_KEY
  if (!key) return { ok: false, status: 0, corpo: null }
  const r = await fetch(`${BASE()}${caminho}`, { ...init, headers: { "Content-Type": "application/json", "User-Agent": "enyla-sistema", access_token: key, ...(init.headers ?? {}) } }).catch(() => null)
  if (!r) return { ok: false, status: 0, corpo: null }
  return { ok: r.ok, status: r.status, corpo: await r.json().catch(() => null) as T | null }
}

// Compara o token do cabeçalho em tempo constante
export function tokenWebhookValido(recebido: string | null) {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN
  if (!esperado || !recebido) return false
  const a = Buffer.from(recebido), b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type CobrancaAsaas = { id: string; status: string; value: number; netValue?: number; billingType: string; externalReference?: string | null; paymentDate?: string | null; clientPaymentDate?: string | null }
export const PAGO = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"])

// Referência que o sistema põe na cobrança: "DIG-0003:sinal" ou "DIG-0003:restante"
export function lerReferencia(ref: string | null | undefined): { id: string; parte: "sinal" | "restante" } | null {
  const m = /^(DIG-\d{4,}):(sinal|restante)$/.exec(ref ?? "")
  return m ? { id: m[1], parte: m[2] as "sinal" | "restante" } : null
}
