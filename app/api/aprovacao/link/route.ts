import { NextRequest, NextResponse } from "next/server"
import { tokenAprovacao } from "@/app/lib/aprovacao"

// Link de aprovação de um orçamento (rota protegida pelo login)
export async function GET(req: NextRequest) {
  const numero = req.nextUrl.searchParams.get("numero")
  if (!numero) return NextResponse.json({ erro: "numero obrigatório" }, { status: 400 })
  const url = `${req.nextUrl.origin}/aprovar/${encodeURIComponent(numero)}?t=${tokenAprovacao(numero)}`
  return NextResponse.json({ url })
}
