import { NextRequest, NextResponse, after } from "next/server"
import { responderSozinho } from "@/app/lib/agenteAuto"

// 2ª etapa da resposta automática do agente de leads (chamada pelo próprio webhook, com o mesmo token).
// Responde na hora e segue em segundo plano: espera mais um pouco, pensa e digita, dentro do minuto da Vercel.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")
  if (!token || token !== process.env.WHATSAPP_WEBHOOK_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { msgId } = await req.json().catch(() => ({})) as { msgId?: string }
  if (!msgId) return NextResponse.json({ error: "msgId" }, { status: 400 })
  after(() => responderSozinho(msgId).catch(e => console.error("[agente]", e)))
  return NextResponse.json({ ok: true })
}
