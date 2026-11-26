import { NextRequest, NextResponse } from "next/server"
import { lerPedido, tokenDigitalValido } from "@/app/lib/digitalServidor"
import { acompanhamentoDe } from "@/app/lib/acompanhamentoPedido"

// Só o acompanhamento (etapas, arte, previsão, pago/saldo), com o mesmo token do /d/{id}. Sem Pix, briefing ou quantidades para editar.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id)
  if (!tokenDigitalValido(id, req.nextUrl.searchParams.get("t"))) return NextResponse.json({ erro: "Link inválido." }, { status: 403 })
  const { pedido } = await lerPedido(id)
  if (!pedido || pedido.status === "cancelado") return NextResponse.json({ erro: "Este pedido não está mais disponível. Fale com a gente no WhatsApp." }, { status: 404 })
  const acompanhamento = await acompanhamentoDe(pedido).catch(() => null)
  if (!acompanhamento) return NextResponse.json({ erro: "O acompanhamento abre depois que o sinal for pago." }, { status: 404 })
  return NextResponse.json({ acompanhamento })
}
