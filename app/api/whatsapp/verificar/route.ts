import { NextRequest, NextResponse } from "next/server"
import { diagnosticar } from "@/app/lib/evolution"
import { registrarConexao } from "@/app/lib/whatsappEventos"

// Agendado na Vercel (vercel.json), todo dia: confere a conexão do número, mesmo que o aviso da hora não tenha chegado.
// Rota fora do login (proxy.ts): com CRON_SECRET exige a senha; sem ele, só o agendador da Vercel.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const autorizado = cronSecret
    ? req.headers.get("authorization") === `Bearer ${cronSecret}`
    : /^vercel-cron\//.test(req.headers.get("user-agent") ?? "")
  if (!autorizado) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const d = await diagnosticar(req.nextUrl.origin)
  await registrarConexao(!d.alcancavel ? "servidor fora do ar" : !d.autorizado ? "chave recusada" : d.estado ?? "desconhecido")
  return NextResponse.json({ ok: true, conectado: d.conectado })
}
