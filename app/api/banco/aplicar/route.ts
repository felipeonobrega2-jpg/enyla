import { NextRequest, NextResponse } from "next/server"
import { aplicar, Decisao } from "@/app/lib/bancoServidor"

// Aplica a sua decisão numa transação do banco (vincular, dar baixa, criar, ignorar, desfazer). (Rota protegida.)
export async function POST(req: NextRequest) {
  const { id, decisao } = await req.json().catch(() => ({})) as { id?: string; decisao?: Decisao }
  if (!id || !decisao) return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 })
  const r = await aplicar(id, decisao)
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
