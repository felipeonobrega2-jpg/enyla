import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { supabase } from "@/app/lib/supabase"
import { criarPedido, ambienteLalamove } from "@/app/lib/lalamove"
import { Endereco, lancamentosDoFrete, telefoneE164 } from "@/app/lib/frete"
import { nomeChave } from "@/app/lib/negocio"

// Chama o motorista a partir de uma cotação: cria a corrida, grava em "fretes" e lança o custo no pedido
// (e a cobrança do cliente, quando o frete é cobrado à parte). (Rota protegida pelo login.)
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as {
    quotationId?: string; paradas?: string[]; valor?: number; veiculo?: string
    retirada?: { nome: string; contato?: string; telefone?: string; texto: string }
    destinatario?: { nome: string; telefone: string; observacao?: string }
    entrega?: Endereco; salvarEndereco?: boolean
    pedido?: { numero?: string; cardId?: string; loteId?: string; cliente: string }
    cobrarCliente?: boolean
  }
  if (!b.quotationId || b.paradas?.length !== 2 || !b.retirada || !b.destinatario || !b.pedido) return NextResponse.json({ erro: "Cote antes de chamar." }, { status: 400 })
  const telRet = telefoneE164(b.retirada.telefone), telDest = telefoneE164(b.destinatario.telefone)
  if (!telRet) return NextResponse.json({ erro: "Telefone do local de retirada inválido (Configurações → Locais de retirada)." }, { status: 400 })
  if (!telDest) return NextResponse.json({ erro: "Telefone de quem recebe inválido (DDD + número)." }, { status: 400 })

  const r = await criarPedido({
    quotationId: b.quotationId,
    sender: { stopId: b.paradas[0], name: b.retirada.contato || b.retirada.nome, phone: telRet },
    recipients: [{ stopId: b.paradas[1], name: b.destinatario.nome, phone: telDest, remarks: b.destinatario.observacao?.slice(0, 1500) || undefined }],
    metadata: { pedido: b.pedido.numero ?? "", cliente: b.pedido.cliente },
  })
  if (!r.ok || !r.dados) return NextResponse.json({ erro: r.erro ?? "Não chamou." }, { status: r.status || 502 })
  const o = r.dados
  const valor = o.priceBreakdown ? Number(o.priceBreakdown.total) : (b.valor ?? 0)
  const agora = new Date().toISOString(), hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

  // Lançamentos do pedido
  const lancs = lancamentosDoFrete({
    orderId: o.orderId, valor, cliente: b.pedido.cliente, numero: b.pedido.numero, cardId: b.pedido.cardId, loteId: b.pedido.loteId,
    cobrarCliente: !!b.cobrarCliente, hoje, criadoEm: agora, novoId: randomUUID,
  })
  const { error: errL } = await supabase.from("LancamentoFinanceiro").insert(lancs.map(l => ({
    id: l.id, tipo: l.tipo, descricao: l.descricao, valor: l.valor, dataVencimento: l.dataVencimento, dataPagamento: l.dataPagamento ?? null,
    status: l.status, cardId: l.cardId ?? null, cardNumero: l.cardNumero ?? null, nomeCliente: l.nomeCliente ?? null,
    loteId: l.loteId ?? null, loteNumero: l.loteNumero ?? null, categoria: l.categoria ?? null, obs: l.obs ?? null, criadoEm: l.criadoEm,
  })))

  const { data: frete } = await supabase.from("fretes").insert({
    order_id: o.orderId, quotation_id: o.quotationId, pedido_numero: b.pedido.numero ?? null, card_id: b.pedido.cardId ?? null, lote_id: b.pedido.loteId ?? null,
    cliente: b.pedido.cliente, status: o.status, share_link: o.shareLink ?? null, valor, cobrar_cliente: !!b.cobrarCliente,
    retirada: { nome: b.retirada.nome, texto: b.retirada.texto }, entrega: { texto: b.entrega?.texto ?? "" }, veiculo: b.veiculo ?? null,
    lancamentos: errL ? [] : lancs.map(l => l.id), ambiente: ambienteLalamove(), criado_em: agora, atualizado_em: agora,
  }).select("*").maybeSingle()

  // Endereço de entrega guardado para a próxima vez
  if (b.salvarEndereco && b.entrega) {
    const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
    const cfg = (cfgRow?.data ?? {}) as Record<string, unknown>
    const enderecos = { ...((cfg.enderecosClientes as Record<string, unknown>) ?? {}), [nomeChave(b.pedido.cliente)]: { ...b.entrega, recebedor: b.destinatario.nome, telefone: b.destinatario.telefone } }
    await supabase.from("AppConfig").update({ data: { ...cfg, enderecosClientes: enderecos } }).eq("id", 1)
  }

  return NextResponse.json({ frete, lancamentos: errL ? [] : lancs, avisoLancamento: errL ? `A corrida foi chamada, mas o custo não foi lançado: ${errL.message}` : null })
}
