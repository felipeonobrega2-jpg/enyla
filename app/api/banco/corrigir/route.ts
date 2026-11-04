import { NextRequest, NextResponse } from "next/server"
import { reinterpretar } from "@/app/lib/bancoServidor"

export const maxDuration = 60

// Você explica o que é a transação ("é o aluguel do galpão"); a IA refaz a sugestão e, se quiser, guarda como lição.
export async function POST(req: NextRequest) {
  const { id, instrucao, lembrar } = await req.json().catch(() => ({})) as { id?: string; instrucao?: string; lembrar?: boolean }
  if (!id || !instrucao?.trim()) return NextResponse.json({ ok: false, erro: "Escreva o que é essa transação." }, { status: 400 })
  const r = await reinterpretar(id, instrucao, lembrar !== false)
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
