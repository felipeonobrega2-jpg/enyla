// Aceite dos Termos de Parceria pela parceira já cadastrada (token do cadastro, sem login)
import { NextResponse } from "next/server"
import { aceitarPorToken } from "@/app/lib/termosParceriaServidor"
import { aceitouTermos, metaDaRequisicao, ERRO_TERMOS } from "@/app/lib/termosParceria"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const b = await req.json().catch(() => null) as { token?: unknown; aceito?: unknown } | null
  if (!b || typeof b.token !== "string") return NextResponse.json({ ok: false, erro: "Link inválido." }, { status: 400 })
  if (!aceitouTermos(b.aceito)) return NextResponse.json({ ok: false, erro: ERRO_TERMOS }, { status: 400 })
  const r = await aceitarPorToken(b.token, metaDaRequisicao(req))
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
