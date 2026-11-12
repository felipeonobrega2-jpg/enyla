import { NextRequest, NextResponse } from "next/server"
import { listarPropostas, aprovarProposta, descartarProposta, prepararProposta } from "@/app/lib/propostaProntaServidor"
import { atender } from "@/app/lib/atendenteServidor"

export const maxDuration = 60

// Propostas prontas (rota protegida pelo login): lista, aprova (com ou sem ajuste de preço), descarta, ou monta agora
export async function GET() {
  const lista = await listarPropostas()
  return NextResponse.json({ propostas: lista.slice(0, 60) })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { id?: string; acao?: string; preco?: number; jid?: string }
  if (b.acao === "aprovar" && b.id) {
    const r = await aprovarProposta(b.id, typeof b.preco === "number" ? b.preco : undefined)
    return NextResponse.json(r, { status: r.ok ? 200 : 409 })
  }
  if (b.acao === "descartar" && b.id) {
    await descartarProposta(b.id)
    return NextResponse.json({ ok: true })
  }
  // Montar a partir de uma conversa (botão na conversa): a IA lê e tira medida e quantidade
  if (b.acao === "montar" && b.jid) {
    const a = await atender(b.jid, { automatico: true }).catch(e => ({ ok: false as const, erro: String(e), status: 500 }))
    if (!a.ok) return NextResponse.json({ ok: false, erro: a.erro }, { status: 502 })
    const r = await prepararProposta(b.jid, a.r.dados, a.conversa.nome)
    return NextResponse.json(r, { status: r.ok ? 200 : 422 })
  }
  return NextResponse.json({ ok: false, erro: "ação inválida" }, { status: 400 })
}
