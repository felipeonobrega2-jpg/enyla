import { NextRequest, NextResponse } from "next/server"
import { fretesDoPedido } from "@/app/lib/freteServidor"

// Corridas de um pedido (as que estão andando são conferidas na Lalamove). (Rota protegida pelo login.)
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  return NextResponse.json(await fretesDoPedido({ numero: p.get("numero"), cardId: p.get("cardId"), loteId: p.get("loteId") }))
}
