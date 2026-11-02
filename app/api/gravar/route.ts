import { NextRequest, NextResponse } from "next/server"
import { lerTokenGravacao } from "@/app/lib/tokenGravacao"
import { enviarVoz } from "@/app/lib/enviarAudio"
import { mudarEstado } from "@/app/lib/gravacaoPendente"

export const maxDuration = 60

// Página de gravação no celular (pública): o link assinado só permite mandar áudio para uma conversa, por 10 minutos.
export async function POST(req: NextRequest) {
  const f = await req.formData().catch(() => null)
  const alvo = lerTokenGravacao(String(f?.get("t") ?? ""))
  if (!alvo) return NextResponse.json({ erro: "Link vencido. Gere outro QR code no computador." }, { status: 401 })
  const audio = f?.get("audio") as File | null
  if (!audio) return NextResponse.json({ erro: "Sem áudio." }, { status: 400 })
  const r = await enviarVoz(alvo.jid, Buffer.from(await audio.arrayBuffer()))
  if (r.ok) await mudarEstado(null, "enviado", String(f?.get("t") ?? "")).catch(() => {})
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ erro: r.erro }, { status: 502 })
}
