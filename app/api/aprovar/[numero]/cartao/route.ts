import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { tokenValido } from "@/app/lib/aprovacao"
import { carregarProposta } from "@/app/lib/propostaPublica"
import { mp, mpConfigurado, motivoRecusa, PagamentoMP } from "@/app/lib/mercadoPago"
import { gravarCampos } from "@/app/lib/configAtomica"
import { notificar, LINK_SISTEMA } from "@/app/lib/notificar"
import { isAberto } from "@/app/lib/negocio"
import { PARCELAS_MAX_CARTAO, PagamentoCartao, registrarPagoNoCartao } from "@/app/lib/cartaoAprovacao"

const PAGO_MP = "approved"

// Pagamento do pedido inteiro (100%) no cartão, dentro da página de aprovação (Mercado Pago, Card Payment Brick).
// Chega só o token do cartão (o número fica no Mercado Pago). O valor é sempre o do pedido, nunca o do navegador.
export async function POST(req: NextRequest, { params }: { params: Promise<{ numero: string }> }) {
  const numero = decodeURIComponent((await params).numero)
  const body = await req.json().catch(() => ({})) as {
    t?: string; sessao?: string; nome?: string
    cartao?: { token?: string; issuer_id?: string | number; payment_method_id?: string; installments?: number; payer?: { email?: string; identification?: { type?: string; number?: string } } }
  }
  if (!tokenValido(numero, body.t)) return NextResponse.json({ erro: "Link inválido." }, { status: 403 })
  if (!mpConfigurado()) return NextResponse.json({ erro: "Pagamento no cartão indisponível agora. Pague pelo Pix ou fale com a Enyla." }, { status: 503 })
  const c = body.cartao
  if (!c?.token || !c.payment_method_id || !c.payer?.email) return NextResponse.json({ erro: "Preencha os dados do cartão." }, { status: 400 })

  const p = await carregarProposta(numero)
  if (!p) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 })
  if (isAberto(p.card)) return NextResponse.json({ erro: "Aprove a proposta antes de pagar." }, { status: 409 })
  const total = Math.round(Number(p.card.preco) * 100) / 100
  if (!(total > 0)) return NextResponse.json({ erro: "Pedido sem valor. Fale com a Enyla." }, { status: 400 })

  const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const pagamentos = ((cfgRow?.data as Record<string, unknown> | null)?.pagamentosCartao ?? {}) as Record<string, PagamentoCartao>
  const atual = pagamentos[numero]
  if (atual?.status === PAGO_MP) return NextResponse.json({ ok: true, jaPago: true, valor: atual.valor, parcelas: atual.parcelas })
  // Contra teste de cartões roubados: no máximo 6 tentativas recusadas por pedido em 6 horas
  const recentes = (atual?.recusas ?? []).filter(em => Date.now() - new Date(em).getTime() < 6 * 3600_000)
  if (recentes.length >= 6) return NextResponse.json({ erro: "Muitas tentativas recusadas. Fale com a Enyla para pagar de outro jeito." }, { status: 429 })

  const parcelas = Math.min(PARCELAS_MAX_CARTAO, Math.max(1, Math.floor(Number(c.installments) || 1)))
  const partes = String(body.nome ?? p.card.nomeCliente ?? "").trim().split(/\s+/)
  const doc = String(c.payer.identification?.number ?? "").replace(/\D/g, "")
  const r = await mp<PagamentoMP>("/v1/payments", {
    method: "POST", idempotencia: `${numero}:${c.token}`,
    headers: body.sessao ? { "X-meli-session-id": String(body.sessao).slice(0, 200) } : {},
    body: JSON.stringify({
      transaction_amount: total, token: c.token, installments: parcelas, payment_method_id: c.payment_method_id,
      ...(c.issuer_id ? { issuer_id: Number(c.issuer_id) || c.issuer_id } : {}),
      description: `Pedido ${numero} · Enyla Embalagens`, external_reference: `ORC:${numero}`, statement_descriptor: "ENYLA",
      notification_url: `${LINK_SISTEMA}/api/mercadopago/webhook`,
      payer: { email: c.payer.email, ...(doc ? { identification: { type: c.payer.identification?.type || (doc.length > 11 ? "CNPJ" : "CPF"), number: doc } } : {}), first_name: partes[0], last_name: partes.slice(1).join(" ") || undefined },
      additional_info: {
        items: [{ id: numero, title: `Embalagens personalizadas · ${p.card.quantidade ?? ""} un`.trim(), quantity: 1, unit_price: total, category_id: "others" }],
        payer: { first_name: partes[0], last_name: partes.slice(1).join(" ") || undefined },
      },
    }),
  })
  const pg = r.corpo
  if (!r.ok || !pg?.id || pg.status === "rejected" || pg.status === "cancelled") {
    await gravarCampos({ pagamentosCartao: { ...pagamentos, [numero]: { ...(atual ?? { status: "rejected", valor: total, parcelas }), recusas: [...recentes, new Date().toISOString()] } } }).catch(() => null)
    console.error("[cartao mp]", r.status, pg?.status, pg?.status_detail, pg?.message)
    return NextResponse.json({ erro: pg?.status === "rejected" ? motivoRecusa(pg.status_detail) : "Não foi possível processar agora. Confira os dados e tente de novo." }, { status: 402 })
  }

  const registro: PagamentoCartao = { id: String(pg.id), status: pg.status, valor: total, parcelas, em: new Date().toISOString(), recusas: recentes }
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  if (pg.status === PAGO_MP) {
    await registrarPagoNoCartao(numero, p.card, registro).catch(e => console.error("[cartao]", e))
    await gravarCampos({ pagamentosCartao: { ...pagamentos, [numero]: { ...registro, baixado: true } } }).catch(() => null)
    await notificar("Pago no cartão", `${numero} · ${p.card.nomeCliente} · ${brl(total)}${parcelas > 1 ? ` em ${parcelas}x` : ""}`, { prioridade: "alta", tags: ["credit_card"], link: `${LINK_SISTEMA}/?aba=painel` }).catch(() => null)
    return NextResponse.json({ ok: true, valor: total, parcelas })
  }
  // in_process / pending: análise do Mercado Pago; a confirmação chega pelo webhook
  await gravarCampos({ pagamentosCartao: { ...pagamentos, [numero]: registro } }).catch(() => null)
  await notificar("Cartão em análise", `${numero} · ${p.card.nomeCliente} · ${brl(total)} · ${pg.status_detail ?? pg.status}`, { tags: ["hourglass"] }).catch(() => null)
  return NextResponse.json({ ok: true, emAnalise: true, valor: total, parcelas })
}
