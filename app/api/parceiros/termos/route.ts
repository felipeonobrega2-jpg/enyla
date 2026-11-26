// Aceite dos Termos de Parceria por quem já estava cadastrada (token do cadastro, sem login). Não envia mensagem.
import { NextResponse } from "next/server"
import { aceitarPorToken, metaDoPedido } from "@/app/lib/termosParceriaServidor"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null) as { token?: string } | null
  const r = await aceitarPorToken(String(corpo?.token ?? ""), metaDoPedido(req.headers))
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
