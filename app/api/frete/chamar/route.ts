import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { supabase } from "@/app/lib/supabase"
import { criarPedido, ambienteLalamove } from "@/app/lib/lalamove"
import { Endereco, ParadaFrete, lancamentosDoFrete, telefoneE164 } from "@/app/lib/frete"
import { nomeChave } from "@/app/lib/negocio"
import { gravarCampos } from "@/app/lib/configAtomica"

type Pessoa = { nome: string; telefone: string; observacao?: string }

// Chama o motorista a partir de uma cotação: cria a corrida, grava em "fretes" e lança o custo
// (no pedido, quando ligado a um; senão como custo geral de frete). (Rota protegida pelo login.)
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as {
    quotationId?: string; stopIds?: string[]; valor?: number; veiculo?: string
    paradas?: ParadaFrete[]                 // na ordem: retirada, entregas
    remetente?: Pessoa; destinatarios?: Pessoa[]
    pedido?: { numero?: string; cardId?: string; loteId?: string; cliente?: string } | null
    cobrarCliente?: boolean
    salvarCliente?: { cliente: string; endereco: Endereco; recebedor: string; telefone: string } | null
  }
  const n = b.stopIds?.length ?? 0
  if (!b.quotationId || n < 2 || !b.remetente || b.destinatarios?.length !== n - 1 || b.paradas?.length !== n) return NextResponse.json({ erro: "Cote antes de chamar." }, { status: 400 })
  const telRem = telefoneE164(b.remetente.telefone)
  if (!telRem) return NextResponse.json({ erro: `Telefone de quem entrega na retirada inválido (${b.paradas[0].nome}).` }, { status: 400 })
  const recipients = []
  for (let i = 0; i < b.destinatarios.length; i++) {
    const d = b.destinatarios[i], tel = telefoneE164(d.telefone)
    if (!tel) return NextResponse.json({ erro: `Telefone de quem recebe em "${b.paradas[i + 1].nome}" inválido (DDD + número).` }, { status: 400 })
    recipients.push({ stopId: b.stopIds![i + 1], name: d.nome || b.paradas[i + 1].nome, phone: tel, remarks: d.observacao?.slice(0, 1500) || undefined })
  }

  const r = await criarPedido({
    quotationId: b.quotationId,
    sender: { stopId: b.stopIds![0], name: b.remetente.nome || b.paradas[0].nome, phone: telRem },
    recipients,
    metadata: { pedido: b.pedido?.numero ?? "", cliente: b.pedido?.cliente ?? "" },
  })
  if (!r.ok || !r.dados) return NextResponse.json({ erro: r.erro ?? "Não chamou." }, { status: r.status || 502 })
  const o = r.dados
  const valor = o.priceBreakdown ? Number(o.priceBreakdown.total) : (b.valor ?? 0)
  const agora = new Date().toISOString(), hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
  const trajeto = b.paradas.map(p => p.nome).join(" → ")

  const lancs = lancamentosDoFrete({
    orderId: o.orderId, valor, cliente: b.pedido?.cliente, numero: b.pedido?.numero, cardId: b.pedido?.cardId, loteId: b.pedido?.loteId,
    trajeto, cobrarCliente: !!b.cobrarCliente, hoje, criadoEm: agora, novoId: randomUUID,
  })
  const { error: errL } = await supabase.from("LancamentoFinanceiro").insert(lancs.map(l => ({
    id: l.id, tipo: l.tipo, descricao: l.descricao, valor: l.valor, dataVencimento: l.dataVencimento, dataPagamento: l.dataPagamento ?? null,
    status: l.status, cardId: l.cardId ?? null, cardNumero: l.cardNumero ?? null, nomeCliente: l.nomeCliente ?? null,
    loteId: l.loteId ?? null, loteNumero: l.loteNumero ?? null, categoria: l.categoria ?? null, obs: l.obs ?? null, criadoEm: l.criadoEm,
  })))

  const { data: frete } = await supabase.from("fretes").insert({
    order_id: o.orderId, quotation_id: o.quotationId, pedido_numero: b.pedido?.numero ?? null, card_id: b.pedido?.cardId ?? null, lote_id: b.pedido?.loteId ?? null,
    cliente: b.pedido?.cliente ?? null, status: o.status, share_link: o.shareLink ?? null, valor, cobrar_cliente: !!b.cobrarCliente && !!b.pedido?.cliente,
    retirada: { nome: b.paradas[0].nome, texto: b.paradas[0].texto }, entrega: { texto: b.paradas[n - 1].texto },
    paradas: b.paradas, descricao: trajeto, veiculo: b.veiculo ?? null,
    lancamentos: errL ? [] : lancs.map(l => l.id), ambiente: ambienteLalamove(), criado_em: agora, atualizado_em: agora,
  }).select("*").maybeSingle()

  // Endereço de entrega do cliente guardado para a próxima vez
  if (b.salvarCliente) {
    const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
    const cfg = (cfgRow?.data ?? {}) as Record<string, unknown>
    const s = b.salvarCliente
    const enderecos = { ...((cfg.enderecosClientes as Record<string, unknown>) ?? {}), [nomeChave(s.cliente)]: { ...s.endereco, recebedor: s.recebedor, telefone: s.telefone } }
    await gravarCampos({ enderecosClientes: enderecos })
  }

  return NextResponse.json({ frete, lancamentos: errL ? [] : lancs, avisoLancamento: errL ? `A corrida foi chamada, mas o custo não foi lançado: ${errL.message}` : null })
}
