// Página Parceiros aberta pelo link de um convite (público): marca "abriu"
import { NextResponse } from "next/server"
import { conviteAberto } from "@/app/lib/captacaoServidor"

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { c?: string }
  if (b.c && /^CV[A-Z0-9]{6,20}$/.test(b.c)) await conviteAberto(b.c).catch(() => null)
  return NextResponse.json({ ok: true })
}
