import { NextRequest, NextResponse } from "next/server"
import { aplicarOperacao, type TipoLead } from "@/app/lib/leadEstado"
import { lerEstadoLead, gravarEstadoLead } from "@/app/lib/leadEstadoServidor"

// Marcar perdido (com motivo), orçado à mão ou reabrir uma conversa. (Rota protegida pelo login.) Nada é apagado
// nem enviado ao cliente: o estado vai para dados_sistema (leadEstado) com quem marcou e quando.
//   GET ?jid=                                   → { estado }
//   POST { jid, operacao: perdido|orcado|reabrir, motivo }
export async function GET(req: NextRequest) {
  const jid = req.nextUrl.searchParams.get("jid")
  if (!jid) return NextResponse.json({ erro: "jid obrigatório" }, { status: 400 })
  return NextResponse.json({ estado: await lerEstadoLead(jid) })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { jid?: string; operacao?: string; motivo?: string }
  if (!b.jid || !["perdido", "orcado", "reabrir"].includes(b.operacao ?? "")) return NextResponse.json({ erro: "jid e operacao (perdido, orcado, reabrir) obrigatórios" }, { status: 400 })
  const r = aplicarOperacao(await lerEstadoLead(b.jid), b.jid, b.operacao as TipoLead, "felipe", b.motivo)
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 })
  await gravarEstadoLead(r.estado)
  // No funil, perdido vira a etapa Perdido (como já era à mão)
  if (b.operacao === "perdido") { const { definirEtapaManual } = await import("@/app/lib/agenteAuto"); await definirEtapaManual(b.jid, "perdido").catch(() => null) }
  return NextResponse.json({ ok: true, estado: r.estado })
}
