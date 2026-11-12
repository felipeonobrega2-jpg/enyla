import { NextRequest, NextResponse } from "next/server"
import { tempoAteFechar } from "@/app/lib/tempoAteFecharServidor"

export const maxDuration = 60

// Tempo até fechar (rota protegida pelo login). ?forcar=1 recalcula sem o cache de 15 min.
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await tempoAteFechar(req.nextUrl.searchParams.get("forcar") === "1"))
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 })
  }
}
