import { NextRequest, NextResponse } from "next/server"
import { juntarConversas, qualFica } from "@/app/lib/juntarConversas"

// Junta duas conversas da mesma pessoa (fica a do número de telefone). (Rota protegida pelo login.)
export async function POST(req: NextRequest) {
  const { a, b } = await req.json().catch(() => ({})) as { a?: string; b?: string }
  if (!a || !b) return NextResponse.json({ erro: "Escolha as duas conversas." }, { status: 400 })
  const { fica, sai } = qualFica(a, b)
  const r = await juntarConversas(sai, fica)
  return r.ok ? NextResponse.json({ ok: true, fica }) : NextResponse.json({ erro: r.erro }, { status: 400 })
}
