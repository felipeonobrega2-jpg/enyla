// Mercado Pago (Checkout Pro) para o cartão da página de aprovação (Offset) e do pedido Digital. Trocou a InfinitePay
// em 27/11/2026, a pedido do Felipe. Na Vercel: MP_ACCESS_TOKEN (APP_USR-…, só no servidor) e, opcional,
// MP_WEBHOOK_SECRET (assinatura das notificações). Sem MP_ACCESS_TOKEN, o cartão continua na InfinitePay.
// Mesmo contrato da InfinitePay: o link leva o order_nsu como external_reference; a volta e o webhook só dizem
// QUAL pagamento olhar, e ele só vale depois de buscado aqui com o nosso token (status aprovado, referência e valor).
import { createHmac, timingSafeEqual } from "crypto"

const API = "https://api.mercadopago.com"
export const mercadoPagoConfigurado = () => !!process.env.MP_ACCESS_TOKEN
// Marca que vai no lugar do "slug" da InfinitePay: a conferência sabe que é do Mercado Pago
export const SLUG_MP = "mp"

async function mp<T>(caminho: string, init?: RequestInit & { idempotencia?: string }): Promise<{ ok: boolean; dados: T | null; status: number }> {
  const r = await fetch(API + caminho, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, "Content-Type": "application/json", ...(init?.idempotencia ? { "X-Idempotency-Key": init.idempotencia } : {}) },
    cache: "no-store",
  }).catch(() => null)
  if (!r) return { ok: false, dados: null, status: 0 }
  return { ok: r.ok, dados: await r.json().catch(() => null) as T | null, status: r.status }
}

export async function criarLinkMercadoPago(a: { nsu: string; valor: number; descricao: string; voltarPara: string; notificar: string; cliente?: { name?: string } }): Promise<{ url: string } | { erro: string }> {
  const [nome, ...resto] = (a.cliente?.name ?? "").trim().split(/\s+/)
  const r = await mp<{ id?: string; init_point?: string }>("/checkout/preferences", {
    method: "POST", idempotencia: `pref-${a.nsu}`,
    body: JSON.stringify({
      items: [{ id: a.nsu, title: a.descricao.slice(0, 120), quantity: 1, unit_price: Math.round(a.valor * 100) / 100, currency_id: "BRL", category_id: "others" }],
      ...(nome ? { payer: { name: nome, surname: resto.join(" ") } } : {}),
      external_reference: a.nsu,
      statement_descriptor: "ENYLA",
      back_urls: { success: a.voltarPara, pending: a.voltarPara, failure: a.voltarPara },
      auto_return: "approved",
      notification_url: a.notificar,
      // Só cartão de crédito, até 12x (o Pix é o nosso, na própria página). Juros: configuração da conta do Mercado Pago.
      payment_methods: { excluded_payment_types: [{ id: "bank_transfer" }, { id: "ticket" }, { id: "atm" }, { id: "debit_card" }, { id: "prepaid_card" }], installments: 12 },
      expires: true, expiration_date_to: new Date(Date.now() + 24 * 3600_000).toISOString(),
    }),
  })
  const url = r.dados?.init_point
  if (!r.ok || typeof url !== "string" || !/^https:\/\//.test(url)) {
    console.error("[mercadopago preferencia]", r.status, JSON.stringify(r.dados)?.slice(0, 300))
    return { erro: "Não foi possível abrir o pagamento no cartão agora. Tente de novo em instantes ou pague pelo Pix." }
  }
  return { url }
}

type PagamentoMP = { id: number; status: string; transaction_amount: number; installments?: number; payment_type_id?: string; payment_method_id?: string; external_reference: string | null }

/** Busca o pagamento e confere: aprovado e da referência esperada. Mesmo formato da conferência da InfinitePay. */
export async function conferirMercadoPago(a: { nsu: string; pagamentoId: string }): Promise<{ pago: boolean; valorCentavos?: number; pagoCentavos?: number; parcelas?: number; metodo?: string }> {
  if (!/^\d{1,24}$/.test(a.pagamentoId)) return { pago: false }
  const r = await mp<PagamentoMP>(`/v1/payments/${a.pagamentoId}`)
  const p = r.dados
  if (!r.ok || !p || p.external_reference !== a.nsu) return { pago: false }
  const centavos = Math.round(p.transaction_amount * 100)
  return { pago: p.status === "approved", valorCentavos: centavos, pagoCentavos: centavos, parcelas: p.installments, metodo: p.payment_method_id === "pix" ? "pix" : "credit_card" }
}

/** Só a referência (order_nsu) de um pagamento, para o webhook saber de que pedido é. */
export async function referenciaDoPagamento(pagamentoId: string): Promise<string | null> {
  if (!/^\d{1,24}$/.test(pagamentoId)) return null
  const r = await mp<PagamentoMP>(`/v1/payments/${pagamentoId}`)
  return r.ok ? r.dados?.external_reference ?? null : null
}

// Cabeçalho x-signature (ts=…,v1=…) das notificações. Sem segredo configurado, deixa passar: o pagamento é sempre
// buscado de novo na API com o nosso token, então um aviso falso não baixa nada.
export function assinaturaMercadoPagoValida(xSignature: string | null, xRequestId: string | null, dataId: string) {
  const segredo = process.env.MP_WEBHOOK_SECRET
  if (!segredo) return true
  if (!xSignature) return false
  const partes = Object.fromEntries(xSignature.split(",").map(s => s.trim().split("=") as [string, string]))
  if (!partes.ts || !partes.v1) return false
  const manifesto = `id:${dataId.toLowerCase()};${xRequestId ? `request-id:${xRequestId};` : ""}ts:${partes.ts};`
  const esperado = Buffer.from(createHmac("sha256", segredo).update(manifesto).digest("hex")), veio = Buffer.from(partes.v1)
  return esperado.length === veio.length && timingSafeEqual(esperado, veio)
}

/** Parâmetros da volta do Mercado Pago (payment_id, external_reference) no formato da volta da InfinitePay. */
export function voltaMercadoPago(q: { payment_id?: string | null; collection_id?: string | null; external_reference?: string | null }): { order_nsu: string; transaction_nsu: string; slug: string } | null {
  const id = q.payment_id ?? q.collection_id, ref = q.external_reference
  return id && ref && id !== "null" ? { order_nsu: ref, transaction_nsu: id, slug: SLUG_MP } : null
}
