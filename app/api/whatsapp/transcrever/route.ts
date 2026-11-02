import { NextRequest, NextResponse } from "next/server"
import { transcreverPendentes } from "@/app/lib/transcricao"

export const maxDuration = 60

// Transcreve os áudios pendentes de uma conversa, alguns por chamada (a tela repete até zerar). Rota protegida.
export async function POST(req: NextRequest) {
  const { jid } = await req.json().catch(() => ({})) as { jid?: string }
  if (!jid) return NextResponse.json({ erro: "Conversa não informada." }, { status: 400 })
  const r = await transcreverPendentes({ jid })
  return NextResponse.json(r, { status: r.erro ? 400 : 200 })
}
