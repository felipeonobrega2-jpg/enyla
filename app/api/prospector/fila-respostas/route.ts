import { NextRequest, NextResponse } from "next/server"
import { processarFila } from "@/app/lib/respostaProspecto"

// Agendado na Vercel (vercel.json): a cada 15 minutos. Reenvia as respostas por e-mail aos prospectos que ficaram em
// emails_saida_fila (cota da Resend esgotada, erro 5xx ou teto do dia), mais antigas primeiro. Sem janela de horário.
// Mesma autenticação dos outros crons: com CRON_SECRET exige a senha; sem ele, só o agendador da Vercel.
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const autorizado = cronSecret
    ? req.headers.get("authorization") === `Bearer ${cronSecret}`
    : /^vercel-cron\//.test(req.headers.get("user-agent") ?? "")
  if (!autorizado) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const r = await processarFila()
    return NextResponse.json(r, { status: r.ok ? 200 : 502 })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
