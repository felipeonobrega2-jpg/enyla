import { NextRequest, NextResponse } from "next/server"
import { pedirGravacao, lerGravacao, mudarEstado, VALIDADE_PEDIDO_MS, EstadoGravacao } from "@/app/lib/gravacaoPendente"

// POST: o computador pede a gravação. GET: o celular procura pedido novo (e o computador acompanha).
// PATCH: o celular avisa que abriu ou desistiu. (Rotas protegidas pelo login.)
export async function POST(req: NextRequest) {
  const { jid, nome } = await req.json().catch(() => ({})) as { jid?: string; nome?: string }
  if (!jid) return NextResponse.json({ erro: "Conversa não informada." }, { status: 400 })
  const g = await pedirGravacao(jid, nome ?? "")
  return NextResponse.json({ id: g.id, url: `${req.nextUrl.origin}/gravar?t=${encodeURIComponent(g.token)}`, expira: g.expira })
}

export async function GET() {
  const g = await lerGravacao()
  if (!g || (Date.now() - g.criadoEm > VALIDADE_PEDIDO_MS && g.estado === "aguardando")) return NextResponse.json(null)
  return NextResponse.json(g)
}

export async function PATCH(req: NextRequest) {
  const { id, estado } = await req.json().catch(() => ({})) as { id?: string; estado?: EstadoGravacao }
  if (!id || !estado || !["aberto", "cancelado"].includes(estado)) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 })
  await mudarEstado(id, estado)
  return NextResponse.json({ ok: true })
}
