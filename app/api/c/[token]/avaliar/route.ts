import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { carregarPortal } from "@/app/lib/portalCliente"
import { Avaliacao, COL_ENTREGUE } from "@/app/types"

// "Chegou! Como ficou?": o cliente dá nota (1 a 5) e um comentário opcional a um pedido entregue
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json().catch(() => ({})) as { key?: string; nota?: number; comentario?: string }
  const nota = Math.round(Number(body.nota))
  if (!(nota >= 1 && nota <= 5)) return NextResponse.json({ erro: "Escolha uma nota de 1 a 5." }, { status: 400 })
  const portal = await carregarPortal(token)
  if (!portal) return NextResponse.json({ erro: "Link inválido." }, { status: 403 })
  const pedido = portal.pedidos.find(p => p.key === body.key && p.coluna === COL_ENTREGUE)
  if (!pedido) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 })

  const comentario = (body.comentario ?? "").toString().trim().slice(0, 600) || undefined
  const nova: Avaliacao = { key: pedido.key, numero: pedido.numero, nomeCliente: portal.nome, nota, comentario, em: new Date().toISOString() }
  const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (cfgRow?.data ?? {}) as Record<string, unknown>
  const lista = [nova, ...((cfg.avaliacoes as Avaliacao[] | undefined) ?? []).filter(a => a.key !== pedido.key)].slice(0, 500)
  await supabase.from("AppConfig").update({ data: { ...cfg, avaliacoes: lista } }).eq("id", 1)
  return NextResponse.json({ ok: true })
}
