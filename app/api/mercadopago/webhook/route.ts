import { NextRequest, NextResponse, after } from "next/server"
import { assinaturaMercadoPagoValida, referenciaDoPagamento, SLUG_MP } from "@/app/lib/mercadoPago"
import { confirmarPagamentoInfinitePay } from "@/app/lib/cartaoAprovacao"

// Notificação do Mercado Pago (pública). Só diz QUAL pagamento mudou: a referência e a situação são buscadas na API
// com o nosso token, e a baixa passa pela mesma conferência do cartão (pedido Offset ou Digital). Responde 200
// rápido; erro de assinatura volta 401.
export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => ({})) as { type?: string; data?: { id?: string | number } }
  const url = req.nextUrl.searchParams
  const tipo = corpo.type ?? url.get("type") ?? url.get("topic")
  const id = String(corpo.data?.id ?? url.get("data.id") ?? url.get("id") ?? "")
  if (tipo !== "payment" || !/^\d{1,24}$/.test(id)) return NextResponse.json({ ok: true })
  if (!assinaturaMercadoPagoValida(req.headers.get("x-signature"), req.headers.get("x-request-id"), url.get("data.id") ?? id))
    return NextResponse.json({ erro: "assinatura" }, { status: 401 })
  after(async () => {
    const nsu = await referenciaDoPagamento(id)
    if (nsu) await confirmarPagamentoInfinitePay({ nsu, transacao: id, slug: SLUG_MP }).catch(e => console.error("[mercadopago webhook]", e))
  })
  return NextResponse.json({ ok: true })
}
