// InfinitePay (Checkout Integrado): cartão em até 12x e Pix, com o recebimento da sua conta InfinitePay.
// Na Vercel: INFINITEPAY_HANDLE (sem o "$") e INFINITEPAY_API_KEY (inchk_…, só no servidor), que liga as opções:
// link de pagamento único (não deixa pagar duas vezes), validade de 24 h, só cartão e sem pedir endereço.
// O checkout é a página da InfinitePay (não pode ser embutida): o cliente vai, paga e volta para a aprovação.
// Nem o webhook nem a volta são assinados: o pagamento só vale depois de confirmado no payment_check.
// Desde 27/11/2026, com MP_ACCESS_TOKEN na Vercel, o cartão vai para o Mercado Pago (lib/mercadoPago.ts) pelas mesmas
// funções abaixo: quem chama não muda. Sem a chave do Mercado Pago, continua na InfinitePay.
import { LINK_SISTEMA } from "./notificar"
import { mercadoPagoConfigurado, criarLinkMercadoPago, conferirMercadoPago, SLUG_MP } from "./mercadoPago"

const API = "https://api.checkout.infinitepay.io"
// Versão das opções do link: mudou (ex.: tirou o endereço), link antigo não é reaproveitado
// (3 = Mercado Pago: link antigo da InfinitePay não é reaproveitado depois da troca)
export const VERSAO_LINK = process.env.MP_ACCESS_TOKEN ? 3 : 2
/** Cartão disponível (Mercado Pago ou InfinitePay). */
export const infinitePayConfigurado = () => mercadoPagoConfigurado() || !!process.env.INFINITEPAY_HANDLE
/** Nome de quem recebe o cartão agora, para os textos ao cliente e ao Felipe. */
export const provedorCartao = () => mercadoPagoConfigurado() ? "Mercado Pago" : "InfinitePay"
const handle = () => (process.env.INFINITEPAY_HANDLE ?? "").replace(/^\$/, "").trim()

// order_nsu = "<número do orçamento>_<tentativa>": o webhook sabe de que pedido é
export const orderNsu = (numero: string) => `${numero}_${Date.now().toString(36)}`
export const numeroDoOrderNsu = (nsu: string | null | undefined) => /^(.+)_[a-z0-9]+$/.exec(nsu ?? "")?.[1] ?? null

export async function criarLinkInfinitePay(a: { numero: string; nsu: string; valor: number; descricao: string; voltarPara: string; cliente?: { name?: string; email?: string; phone_number?: string } }):
  Promise<{ url: string } | { erro: string }> {
  if (mercadoPagoConfigurado()) return criarLinkMercadoPago({ nsu: a.nsu, valor: a.valor, descricao: a.descricao, voltarPara: a.voltarPara, notificar: `${LINK_SISTEMA}/api/mercadopago/webhook`, cliente: a.cliente })
  const chave = process.env.INFINITEPAY_API_KEY
  const r = await fetch(`${API}/links`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(chave ? { "X-Api-Key": chave } : {}) },
    body: JSON.stringify({
      handle: handle(), order_nsu: a.nsu,
      items: [{ description: a.descricao.slice(0, 120), price: Math.round(a.valor * 100), quantity: 1 }],
      redirect_url: a.voltarPara, webhook_url: `${LINK_SISTEMA}/api/infinitepay/webhook`,
      ...(a.cliente && Object.values(a.cliente).some(Boolean) ? { customer: a.cliente } : {}),
      // Só cartão (o Pix é o nosso, na página de aprovação) e sem pedir endereço de entrega (a entrega é combinada com a Enyla)
      ...(chave ? { options: { single_payment: true, valid_until: new Date(Date.now() + 24 * 3600_000).toISOString(), payment_methods_enabled: ["credit_card"], require_delivery_address: false } } : {}),
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
  if (a.slug === SLUG_MP) return conferirMercadoPago({ nsu: a.nsu, pagamentoId: a.transacao })
  const r = await fetch(`${API}/payment_check`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle: handle(), order_nsu: a.nsu, transaction_nsu: a.transacao, slug: a.slug }),
  }).catch(() => null)
  const c = r ? await r.json().catch(() => null) as { success?: boolean; paid?: boolean; amount?: number; paid_amount?: number; installments?: number; capture_method?: string } | null : null
  return { pago: !!(r?.ok && c?.success !== false && c?.paid === true), valorCentavos: c?.amount, pagoCentavos: c?.paid_amount, parcelas: c?.installments, metodo: c?.capture_method }
}
