import { NextRequest, NextResponse } from "next/server"
import { lerCampos } from "@/app/lib/configAtomica"
import { convocarReuniao, responderRecomendacao, type Reuniao } from "@/app/lib/reuniaoDiretoria"

// Reunião de diretoria (rota protegida pelo login). GET: a última. POST: convoca agora. PATCH: aprovo/depois.
export const maxDuration = 120

export async function GET() {
  const { ultimaReuniao } = await lerCampos<{ ultimaReuniao?: Reuniao }>(["ultimaReuniao"])
  return NextResponse.json({ reuniao: ultimaReuniao ?? null })
}

export async function POST() {
  try { return NextResponse.json({ reuniao: await convocarReuniao() }) }
  catch (e) { return NextResponse.json({ erro: `A diretoria não conseguiu se reunir agora: ${String(e).slice(0, 160)}` }, { status: 502 }) }
}

export async function PATCH(req: NextRequest) {
  const { reuniao, rec, resposta } = await req.json().catch(() => ({})) as { reuniao?: string; rec?: string; resposta?: "aprovo" | "depois" | null }
  if (!reuniao || !rec) return NextResponse.json({ erro: "reuniao/rec" }, { status: 400 })
  const r = await responderRecomendacao(reuniao, rec, resposta ?? null)
  return NextResponse.json({ ok: true, recomendacao: r })
}
