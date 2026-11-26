// Aceite dos Termos de Parceria pelo link do cadastro (público; o token do cadastro identifica quem aceita)
import { NextResponse } from "next/server"
import { aceitarPorLink } from "@/app/lib/termosServidor"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { c?: string; t?: string; aceito?: boolean }
  if (b.aceito !== true) return NextResponse.json({ ok: false, erro: "Marque a caixa para aceitar os Termos de Parceria." }, { status: 400 })
  const r = await aceitarPorLink(String(b.c ?? ""), String(b.t ?? ""), req)
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
