import { NextRequest, NextResponse, after } from "next/server"
import { asaas, tokenWebhookValido, lerReferencia, PAGO, CobrancaAsaas } from "@/app/lib/asaas"
import { pagoPeloAsaas } from "@/app/lib/digitalServidor"
import { supabase } from "@/app/lib/supabase"
import { gravarCampos } from "@/app/lib/configAtomica"
import { registrarPagoNoCartao, PagamentoCartao } from "@/app/lib/cartaoAprovacao"
import { notificar } from "@/app/lib/notificar"

async function confirmarCartaoDoOrcamento(numero: string, c: CobrancaAsaas) {
  const { data: cfg } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const todos = ((cfg?.data as Record<string, unknown> | null)?.pagamentosCartao ?? {}) as Record<string, PagamentoCartao>
  const pg = todos[numero]
  if (!pg || pg.baixado) return
  // Parcelado: cada parcela tem uma cobrança; o pedido é baixado uma vez, pelo total registrado
  const novo = { ...pg, status: c.status, baixado: true }
  await gravarCampos({ pagamentosCartao: { ...todos, [numero]: novo } })
  const { data: card } = await supabase.from("KanbanCard").select("nomeCliente, loteId, loteNumero").eq("numero", numero).maybeSingle()
  if (card) await registrarPagoNoCartao(numero, card, novo)
  await notificar("Cartão aprovado", `${numero} · ${card?.nomeCliente ?? ""} · ${pg.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`, { prioridade: "alta", tags: ["credit_card"] }).catch(() => null)
}

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
    // Pedido offset pago no cartão pela página de aprovação ("ORC:ORC-2026-123"), confirmado depois da análise
    const orc = /^ORC:(.+)$/.exec(c.externalReference ?? "")?.[1]
    if (orc) { await confirmarCartaoDoOrcamento(orc, c).catch(e => console.error("[asaas orc]", e)); return }
    const ref = lerReferencia(c.externalReference)
    if (ref) await pagoPeloAsaas(ref.id, ref.parte, { txId: `asaas:${c.id}`, valor: c.value, data: (c.clientPaymentDate ?? c.paymentDate ?? new Date().toISOString()).slice(0, 10) }).catch(e => console.error("[asaas]", e))
  })
  return NextResponse.json({ ok: true })
}
