import { NextRequest, NextResponse } from "next/server"
import { configurarWebhook, diagnosticar } from "@/app/lib/evolution"

// Botão "Configurar webhook" (rota protegida pelo login)
export async function POST(req: NextRequest) {
  const r = await configurarWebhook(req.nextUrl.origin)
  return NextResponse.json({ ...r, evolution: await diagnosticar(req.nextUrl.origin) }, { status: r.ok ? 200 : 400 })
}
