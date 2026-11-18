// Mercado Pago (cartão na página de aprovação, recebimento na hora conforme a sua conta).
// Credenciais só na Vercel: MERCADOPAGO_ACCESS_TOKEN (servidor) e MERCADOPAGO_PUBLIC_KEY (vai para a página).
// O cartão é digitado no formulário do próprio Mercado Pago (Card Payment Brick): aqui só chega o token.
// O webhook nunca confia no corpo: relê o pagamento na API.

export const mpConfigurado = () => !!process.env.MERCADOPAGO_ACCESS_TOKEN && !!process.env.MERCADOPAGO_PUBLIC_KEY
export const mpPublicKey = () => process.env.MERCADOPAGO_PUBLIC_KEY ?? ""

export async function mp<T>(caminho: string, init: RequestInit & { idempotencia?: string } = {}): Promise<{ ok: boolean; status: number; corpo: T | null }> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!token) return { ok: false, status: 0, corpo: null }
  const { idempotencia, ...resto } = init
  const r = await fetch(`https://api.mercadopago.com${caminho}`, {
    ...resto,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(idempotencia ? { "X-Idempotency-Key": idempotencia } : {}), ...(resto.headers ?? {}) },
  }).catch(() => null)
  if (!r) return { ok: false, status: 0, corpo: null }
  return { ok: r.ok, status: r.status, corpo: await r.json().catch(() => null) as T | null }
}

export type PagamentoMP = {
  id: number; status: string; status_detail?: string; transaction_amount: number; installments?: number
  external_reference?: string | null; date_approved?: string | null; message?: string; cause?: { description?: string }[]
}

// Motivo de recusa em português (status_detail do Mercado Pago)
export function motivoRecusa(detalhe?: string): string {
  const m: Record<string, string> = {
    cc_rejected_bad_filled_card_number: "Confira o número do cartão.",
    cc_rejected_bad_filled_date: "Confira a validade do cartão.",
    cc_rejected_bad_filled_security_code: "Confira o código de segurança (CVV).",
    cc_rejected_bad_filled_other: "Confira os dados do cartão.",
    cc_rejected_insufficient_amount: "O cartão não tem limite suficiente. Tente outro cartão ou menos parcelas.",
    cc_rejected_call_for_authorize: "O banco pediu autorização: ligue para o banco do cartão liberando a compra e tente de novo.",
    cc_rejected_card_disabled: "O cartão está bloqueado. Ligue para o banco para ativar ou use outro cartão.",
    cc_rejected_duplicated_payment: "Esse pagamento já foi feito. Se não foi você, fale com a Enyla.",
    cc_rejected_high_risk: "O pagamento foi recusado pela análise de segurança. Tente outro cartão ou pague pelo Pix.",
    cc_rejected_max_attempts: "Limite de tentativas no cartão. Use outro cartão.",
    cc_rejected_blacklist: "Não foi possível usar este cartão. Use outro cartão ou o Pix.",
    cc_rejected_card_error: "O cartão não conseguiu processar. Tente de novo ou use outro cartão.",
    cc_rejected_other_reason: "O banco recusou o pagamento. Tente outro cartão.",
  }
  return (detalhe && m[detalhe]) || "Cartão não aprovado. Tente outro cartão ou pague pelo Pix."
}
