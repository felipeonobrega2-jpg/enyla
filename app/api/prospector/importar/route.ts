import { NextRequest, NextResponse } from "next/server"
import { importar } from "@/app/lib/prospectorImportadorServidor"

// Agendado na Vercel (vercel.json). Importa uma fatia dos dados abertos de CNPJ para o Prospector e guarda o cursor.
// Rota fora do login (proxy.ts): com CRON_SECRET exige a senha (a mesma que a Vercel já usa nos crons); sem ele, só o agendador da Vercel.
// Não envia mensagem de nenhum canal.
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const autorizado = cronSecret
    ? req.headers.get("authorization") === `Bearer ${cronSecret}`
    : /^vercel-cron\//.test(req.headers.get("user-agent") ?? "")
  if (!autorizado) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const r = await importar()
    return NextResponse.json(r, { status: r.ok ? 200 : 502 })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
