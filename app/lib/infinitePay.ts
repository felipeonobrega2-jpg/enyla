// InfinitePay (Checkout Integrado): cartão em até 12x e Pix, com o recebimento da sua conta InfinitePay.
// Na Vercel: INFINITEPAY_HANDLE (sem o "$") e, opcional, INFINITEPAY_API_KEY (inchk_…, só no servidor), que liga
// o link de pagamento único (não deixa pagar duas vezes) com validade de 24 h.
// O checkout é a página da InfinitePay (não pode ser embutida): o cliente vai, paga e volta para a aprovação.
// Nem o webhook nem a volta são assinados: o pagamento só vale depois de confirmado no payment_check.
import { LINK_SISTEMA } from "./notificar"

const API = "https://api.checkout.infinitepay.io"
export const infinitePayConfigurado = () => !!process.env.INFINITEPAY_HANDLE
const handle = () => (process.env.INFINITEPAY_HANDLE ?? "").replace(/^\$/, "").trim()

// order_nsu = "<número do orçamento>_<tentativa>": o webhook sabe de que pedido é
export const orderNsu = (numero: string) => `${numero}_${Date.now().toString(36)}`
export const numeroDoOrderNsu = (nsu: string | null | undefined) => /^(.+)_[a-z0-9]+$/.exec(nsu ?? "")?.[1] ?? null

export async function criarLinkInfinitePay(a: { numero: string; nsu: string; valor: number; descricao: string; voltarPara: string; cliente?: { name?: string; email?: string; phone_number?: string } }):
  Promise<{ url: string } | { erro: string }> {
  const chave = process.env.INFINITEPAY_API_KEY
  const r = await fetch(`${API}/links`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(chave ? { "X-Api-Key": chave } : {}) },
    body: JSON.stringify({
      handle: handle(), order_nsu: a.nsu,
      items: [{ description: a.descricao.slice(0, 120), price: Math.round(a.valor * 100), quantity: 1 }],
      redirect_url: a.voltarPara, webhook_url: `${LINK_SISTEMA}/api/infinitepay/webhook`,
      ...(a.cliente && Object.values(a.cliente).some(Boolean) ? { customer: a.cliente } : {}),
      ...(chave ? { options: { single_payment: true, valid_until: new Date(Date.now() + 24 * 3600_000).toISOString() } } : {}),
    }),
  }).catch(() => null)
  const corpo = r ? await r.json().catch(() => null) as Record<string, unknown> | null : null
  const url = corpo && (corpo.url ?? corpo.link ?? corpo.checkout_url ?? (corpo.data as Record<string, unknown> | undefined)?.url)
  if (!r?.ok || typeof url !== "string" || !/^https:\/\//.test(url)) {
    console.error("[infinitepay links]", r?.status, JSON.stringify(corpo)?.slice(0, 300))
    return { erro: "Não foi possível abrir o pagamento no cartão agora. Tente de novo em instantes ou pague pelo Pix." }
  }
  return { url }
}

export type ConferenciaInfinitePay = { pago: boolean; valorCentavos?: number; pagoCentavos?: number; parcelas?: number; metodo?: string }
export async function conferirInfinitePay(a: { nsu: string; transacao: string; slug: string }): Promise<ConferenciaInfinitePay> {
  const r = await fetch(`${API}/payment_check`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle: handle(), order_nsu: a.nsu, transaction_nsu: a.transacao, slug: a.slug }),
  }).catch(() => null)
  const c = r ? await r.json().catch(() => null) as { success?: boolean; paid?: boolean; amount?: number; paid_amount?: number; installments?: number; capture_method?: string } | null : null
  return { pago: !!(r?.ok && c?.success !== false && c?.paid === true), valorCentavos: c?.amount, pagoCentavos: c?.paid_amount, parcelas: c?.installments, metodo: c?.capture_method }
}
