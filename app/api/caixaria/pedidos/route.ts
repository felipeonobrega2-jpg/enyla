import { NextRequest, NextResponse } from "next/server"
import { pedidosSite, lerRecuperacao, registrarRecuperacao, linkEnvioArte, aplicarArte, type AcaoRecuperacao, type AcaoArte, type PedidoSite } from "@/app/caixaria/lib/servidor"

// Caixaria · pedidos do site, últimos 90 dias, e a recuperação de quem parou no pagamento (rota protegida pelo login)
const SEM_TABELA = "Para registrar os contatos, rode supabase/migrations/20261108_caixaria_config.sql no SQL Editor do Supabase."

const paraTela = (p: PedidoSite) => ({
  id: p.id, numero: p.numero, status: p.status, forma: p.forma, criadoEm: p.criado_em, total: Number(p.subtotal), pago: Number(p.valor_pago),
  cliente: p.cliente, cidade: p.entrega ? `${p.entrega.cidade}/${p.entrega.uf}` : "",
  itens: (p.itens ?? []).map(i => ({ nome: i.nome, medida: i.medida, qtd: i.qtd, acab: i.acab, prazo: i.prazo, marca: i.marca ?? null, freteIncluso: !!i.freteIncluso, total: p.forma === "cartao" && i.cartao ? i.cartao : i.total })),
  metodo: (p.mp_pagamentos ?? []).find(x => x.status === "approved")?.metodo ?? null,
  recusado: (p.mp_pagamentos ?? []).some(x => x.status === "rejected"),
  acompanhamento: p.acompanhamento ?? null,
})

export async function GET() {
  try {
    const [pedidos, rec] = await Promise.all([pedidosSite(90), lerRecuperacao().then(r => ({ r, aviso: "" })).catch(() => ({ r: {}, aviso: SEM_TABELA }))])
    return NextResponse.json({ pedidos: pedidos.map(paraTela), recuperacao: rec.r, avisoRecuperacao: rec.aviso })
  } catch (e) {
    console.error("caixaria/pedidos", e)
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as AcaoRecuperacao | AcaoArte | { acao: "arte-link"; pedido: string; nome: string } | null
  if (!b?.acao || !b.pedido) return NextResponse.json({ erro: "Ação inválida" }, { status: 400 })
  try {
    if (b.acao === "arte-link") return NextResponse.json(await linkEnvioArte(b.pedido, String(b.nome ?? "arte")))
    if (b.acao === "arte" || b.acao === "envio" || b.acao === "envio-desfazer") {
      await aplicarArte(b)
      return NextResponse.json({ pedidos: (await pedidosSite(90)).map(paraTela) })
    }
    return NextResponse.json({ recuperacao: await registrarRecuperacao(b) })
  } catch (e) {
    const m = (e as Error).message
    return NextResponse.json({ erro: /does not exist|schema cache|could not find/i.test(m) ? SEM_TABELA : m }, { status: 400 })
  }
}
