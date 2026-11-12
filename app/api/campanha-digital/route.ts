import { NextRequest, NextResponse } from "next/server"
import { painel, mudar } from "@/app/lib/campanhaDigitalServidor"

export const maxDuration = 60

// Campanha digital (rota protegida pelo login): GET fila, estado e placar · POST { ligada } { porDia } { pular: jid }
export async function GET() {
  return NextResponse.json(await painel())
}
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { ligada?: boolean; porDia?: number; pular?: string }
  await mudar(b)
  return NextResponse.json(await painel())
}
