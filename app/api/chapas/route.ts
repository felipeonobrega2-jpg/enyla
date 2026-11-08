import { NextRequest, NextResponse } from "next/server"
import { chapasAtualizadas, aplicar, type AcaoChapa } from "@/app/lib/chapasServidor"

// Painel de chapas da Caixaria (rota protegida pelo login)
export async function GET() {
  try {
    return NextResponse.json(await chapasAtualizadas())
  } catch (e) {
    console.error("chapas", e)
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as AcaoChapa | null
  if (!b?.acao || !b.chapa) return NextResponse.json({ erro: "Ação inválida" }, { status: 400 })
  try {
    await aplicar(b)
    return NextResponse.json(await chapasAtualizadas())
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 })
  }
}
