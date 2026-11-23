import { NextRequest, NextResponse } from "next/server"
import { vigiar } from "@/app/lib/vigiaServidor"

// Chamado pelo servidor (VPS) a cada 5 min com o segredo do webhook no cabeçalho x-token
export const maxDuration = 300   // o follow-up e a retomada esperam entre um envio e outro
export async function POST(req: NextRequest) {
  const segredo = process.env.WHATSAPP_WEBHOOK_SECRET
  if (!segredo || req.headers.get("x-token") !== segredo) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
  return NextResponse.json(await vigiar())
}
