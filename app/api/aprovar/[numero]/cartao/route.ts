import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { tokenValido } from "@/app/lib/aprovacao"
import { carregarProposta } from "@/app/lib/propostaPublica"
import { asaas, asaasConfigurado, PAGO, CobrancaAsaas } from "@/app/lib/asaas"
import { gravarCampos } from "@/app/lib/configAtomica"
import { notificar, LINK_SISTEMA } from "@/app/lib/notificar"
import { isAberto } from "@/app/lib/negocio"
import { PARCELAS_MAX_CARTAO, validarCartao, DadosCartao, PagamentoCartao, registrarPagoNoCartao } from "@/app/lib/cartaoAprovacao"

// Pagamento do pedido inteiro (100%) no cartão, dentro da página de aprovação (Asaas, checkout transparente).
// Os dados do cartão só passam por aqui a caminho do Asaas: nada é gravado nem vai para log.
// Para aprovar mais: dados completos do titular (CPF, e-mail, CEP, número, celular) e o IP de quem paga.
export async function POST(req: NextRequest, { params }: { params: Promise<{ numero: string }> }) {
  const numero = decodeURIComponent((await params).numero)
  const body = await req.json().catch(() => ({})) as { t?: string; parcelas?: number } & Partial<DadosCartao>
  if (!tokenValido(numero, body.t)) return NextResponse.json({ erro: "Link inválido." }, { status: 403 })
  if (!asaasConfigurado()) return NextResponse.json({ erro: "Pagamento no cartão indisponível agora. Pague pelo Pix ou fale com a Enyla." }, { status: 503 })

  const p = await carregarProposta(numero)
  if (!p) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 })
  if (isAberto(p.card)) return NextResponse.json({ erro: "Aprove a proposta antes de pagar." }, { status: 409 })
  const total = Math.round(Number(p.card.preco) * 100) / 100
  if (!(total > 0)) return NextResponse.json({ erro: "Pedido sem valor. Fale com a Enyla." }, { status: 400 })

  const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const pagamentos = ((cfgRow?.data as Record<string, unknown> | null)?.pagamentosCartao ?? {}) as Record<string, PagamentoCartao>
  const atual = pagamentos[numero]
  if (atual && PAGO.has(atual.status)) return NextResponse.json({ ok: true, jaPago: true, valor: atual.valor, parcelas: atual.parcelas })
  // Contra teste de cartões roubados: no máximo 6 tentativas recusadas por pedido em 6 horas
  const recentes = (atual?.recusas ?? []).filter(em => Date.now() - new Date(em).getTime() < 6 * 3600_000)
  if (recentes.length >= 6) return NextResponse.json({ erro: "Muitas tentativas recusadas. Fale com a Enyla para pagar de outro jeito." }, { status: 429 })

  const v = validarCartao(body)
  if ("erro" in v) return NextResponse.json({ erro: v.erro }, { status: 400 })
  const d = v.dados
  const parcelas = Math.min(PARCELAS_MAX_CARTAO, Math.max(1, Math.floor(Number(body.parcelas) || 1)))

  // Cliente no Asaas pelo CPF/CNPJ do titular
  const achado = await asaas<{ data?: { id: string }[] }>(`/customers?cpfCnpj=${d.documento}`)
  let cliente = achado.corpo?.data?.[0]?.id
  if (!cliente) {
    const novo = await asaas<{ id?: string; errors?: { description: string }[] }>("/customers", { method: "POST", body: JSON.stringify({
      name: d.nome, cpfCnpj: d.documento, email: d.email, mobilePhone: d.celular, postalCode: d.cep, addressNumber: d.numeroEndereco,
      notificationDisabled: true, externalReference: numero,
    }) })
    cliente = novo.corpo?.id
    if (!cliente) return NextResponse.json({ erro: novo.corpo?.errors?.[0]?.description ?? "Não foi possível registrar o titular. Confira os dados." }, { status: 400 })
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "0.0.0.0"
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
  const cob = await asaas<CobrancaAsaas & { errors?: { code?: string; description: string }[] }>("/payments", { method: "POST", body: JSON.stringify({
    customer: cliente, billingType: "CREDIT_CARD", dueDate: hoje,
    ...(parcelas > 1 ? { installmentCount: parcelas, totalValue: total } : { value: total }),
    description: `Pedido ${numero} · Enyla Embalagens`, externalReference: `ORC:${numero}`,
    creditCard: { holderName: d.nomeCartao, number: d.numero, expiryMonth: d.mes, expiryYear: d.ano, ccv: d.cvv },
    creditCardHolderInfo: { name: d.nome, email: d.email, cpfCnpj: d.documento, postalCode: d.cep, addressNumber: d.numeroEndereco, mobilePhone: d.celular, phone: d.celular },
    remoteIp: ip,
  }) })

  const c = cob.corpo
  if (!cob.ok || !c?.id) {
    await gravarCampos({ pagamentosCartao: { ...pagamentos, [numero]: { ...(atual ?? { status: "RECUSADO", valor: total, parcelas }), recusas: [...recentes, new Date().toISOString()] } } }).catch(() => null)
    const motivo = c?.errors?.[0]?.description
    return NextResponse.json({ erro: motivo ? `Cartão não aprovado: ${motivo}` : "Cartão não aprovado. Confira os dados ou tente outro cartão." }, { status: 402 })
  }

  const registro: PagamentoCartao = { id: c.id, status: c.status, valor: total, parcelas, em: new Date().toISOString(), recusas: recentes }
  await gravarCampos({ pagamentosCartao: { ...pagamentos, [numero]: registro } })
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  if (PAGO.has(c.status)) {
    await registrarPagoNoCartao(numero, p.card, registro).catch(e => console.error("[cartao]", e))
    await gravarCampos({ pagamentosCartao: { ...pagamentos, [numero]: { ...registro, baixado: true } } }).catch(() => null)
    await notificar("Pago no cartão", `${numero} · ${p.card.nomeCliente} · ${brl(total)}${parcelas > 1 ? ` em ${parcelas}x` : ""}`, { prioridade: "alta", tags: ["credit_card"], link: `${LINK_SISTEMA}/?aba=painel` }).catch(() => null)
    return NextResponse.json({ ok: true, valor: total, parcelas })
  }
  // Em análise de risco do Asaas: a confirmação chega pelo webhook
  await notificar("Cartão em análise", `${numero} · ${p.card.nomeCliente} · ${brl(total)} · status ${c.status}`, { tags: ["hourglass"] }).catch(() => null)
  return NextResponse.json({ ok: true, emAnalise: true, valor: total, parcelas })
}
