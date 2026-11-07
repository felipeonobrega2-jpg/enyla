import { NextRequest, NextResponse, after } from "next/server"
import { asaas, tokenWebhookValido, lerReferencia, PAGO, CobrancaAsaas } from "@/app/lib/asaas"
import { pagoPeloAsaas } from "@/app/lib/digitalServidor"

// Webhook do Asaas (público, protegido pelo token do cabeçalho asaas-access-token). Do corpo só lê o id da
// cobrança: o status e o valor vêm da API. Responde 200 rápido (o Asaas reenvia em caso de erro).
export async function POST(req: NextRequest) {
  if (!tokenWebhookValido(req.headers.get("asaas-access-token"))) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
  const b = await req.json().catch(() => null) as { event?: string; payment?: { id?: string } } | null
  const id = b?.payment?.id
  if (!id || !/^pay_[A-Za-z0-9]+$/.test(id) || !/^PAYMENT_(RECEIVED|CONFIRMED)$/.test(b?.event ?? "")) return NextResponse.json({ ok: true })
  after(async () => {
    const r = await asaas<CobrancaAsaas>(`/payments/${id}`)
    const c = r.corpo
    if (!r.ok || !c || !PAGO.has(c.status)) return
    const ref = lerReferencia(c.externalReference)
    if (ref) await pagoPeloAsaas(ref.id, ref.parte, { txId: `asaas:${c.id}`, valor: c.value, data: (c.clientPaymentDate ?? c.paymentDate ?? new Date().toISOString()).slice(0, 10) }).catch(e => console.error("[asaas]", e))
  })
  return NextResponse.json({ ok: true })
}
