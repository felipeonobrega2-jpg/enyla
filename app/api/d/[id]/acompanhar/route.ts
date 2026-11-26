import { NextRequest, NextResponse } from "next/server"
import { lerPedido, tokenDigitalValido } from "@/app/lib/digitalServidor"
import { acompanhamentoDe } from "@/app/lib/acompanhamentoDigitalServidor"

// Link só de acompanhamento (/d/DIG-0001/acompanhar?t=…): mesmo token do /d/[id], devolve apenas o acompanhamento
// (etapas, situação da arte, prazo, pago e saldo). Sem frete, briefing, opções de quantidade, cobrança ou Pix.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id)
  if (!tokenDigitalValido(id, req.nextUrl.searchParams.get("t"))) return NextResponse.json({ erro: "Link inválido." }, { status: 403 })
  const { pedido } = await lerPedido(id)
  if (!pedido || pedido.status === "cancelado") return NextResponse.json({ erro: "Este pedido não está mais disponível. Fale com a gente no WhatsApp." }, { status: 404 })
  const acompanhamento = await acompanhamentoDe(pedido).catch(() => null)
  return NextResponse.json({ acompanhamento })
}
