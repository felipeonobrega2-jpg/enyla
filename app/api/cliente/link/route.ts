import { NextRequest, NextResponse } from "next/server"
import { tokenCliente } from "@/app/lib/portalCliente"

// Link da página do cliente (rota protegida pelo login)
export async function GET(req: NextRequest) {
  const nome = req.nextUrl.searchParams.get("nome")
  if (!nome?.trim()) return NextResponse.json({ erro: "nome obrigatório" }, { status: 400 })
  return NextResponse.json({ url: `${req.nextUrl.origin}/c/${tokenCliente(nome)}` })
}
