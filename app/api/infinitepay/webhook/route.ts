import { NextRequest, NextResponse, after } from "next/server"
import { confirmarPagamentoInfinitePay } from "@/app/lib/cartaoAprovacao"

// Webhook da InfinitePay (público e sem assinatura). Só dispara a conferência no payment_check: um aviso falso
// não baixa nada. Responde 200 rápido (a InfinitePay reenvia se não for 2xx).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { order_nsu?: string; transaction_nsu?: string; invoice_slug?: string; slug?: string } | null
  const nsu = String(b?.order_nsu ?? ""), transacao = String(b?.transaction_nsu ?? ""), slug = String(b?.invoice_slug ?? b?.slug ?? "")
  if (!nsu || !transacao || !slug) return NextResponse.json({ ok: true })
  after(async () => { await confirmarPagamentoInfinitePay({ nsu, transacao, slug }).catch(e => console.error("[infinitepay webhook]", e)) })
  return NextResponse.json({ ok: true })
}
