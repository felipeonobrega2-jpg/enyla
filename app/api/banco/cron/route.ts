import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { sincronizar } from "@/app/lib/bancoServidor"

// Agendado na Vercel (vercel.json), a cada 1h: puxa o extrato e prepara as sugestões, sem ninguém logado.
// Rota fora do login (proxy.ts): exige `Authorization: Bearer ${CRON_SECRET}` (o mesmo segredo dos outros crons).
// Sem CRON_SECRET definido, responde 401 e não sincroniza.
export const maxDuration = 60

function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(`Bearer ${esperado}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !segredoConfere(req.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json(await sincronizar())
}
