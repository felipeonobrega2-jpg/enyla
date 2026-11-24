import { NextRequest, NextResponse } from "next/server"
import { executarEnvio } from "@/app/lib/prospectorEnvioServidor"

// Agendado na Vercel (vercel.json): de hora em hora, segunda a sexta, 12h–20h UTC. A rota confere o horário de verdade
// (9h–17h America/Sao_Paulo, dia útil) e recusa fora dele, mesmo que o cron dispare.
// Rota fora do login (proxy.ts): com CRON_SECRET exige a senha (a mesma que a Vercel já usa nos crons); sem ele, só o agendador da Vercel.
// Com a chave prospector_envio_ativo desligada (padrão), só devolve "desligado" e não envia nada.
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const autorizado = cronSecret
    ? req.headers.get("authorization") === `Bearer ${cronSecret}`
    : /^vercel-cron\//.test(req.headers.get("user-agent") ?? "")
  if (!autorizado) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const r = await executarEnvio()
    return NextResponse.json(r, { status: r.ok ? 200 : 502 })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
