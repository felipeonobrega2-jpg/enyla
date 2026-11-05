import { NextRequest, NextResponse } from "next/server"
import { erroClaude } from "@/app/lib/claude"
import { atender } from "@/app/lib/atendenteServidor"

export const maxDuration = 60

// Atendente do WhatsApp: lê o guia, o filtro de leads e a conversa e devolve a resposta sugerida, no seu tom,
// mais o que o cliente já contou do pedido (para pré-preencher o orçamento) e o perfil do lead.
// Só sugere; quem envia é você. (Rota protegida pelo login.)
export async function POST(req: NextRequest) {
  const { jid, outra } = await req.json().catch(() => ({})) as { jid?: string; outra?: boolean }
  if (!jid) return NextResponse.json({ erro: "Conversa não informada." }, { status: 400 })
  try {
    const a = await atender(jid, { outra })   // "Outra": gera de novo; senão reaproveita a da mesma mensagem
    if (!a.ok) return NextResponse.json({ erro: a.erro }, { status: a.status })
    return NextResponse.json(a.r)
  } catch (e) {
    const { error, status } = erroClaude(e)
    return NextResponse.json({ erro: error }, { status })
  }
}
