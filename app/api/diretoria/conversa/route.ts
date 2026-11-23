import { NextRequest, NextResponse } from "next/server"
import { DIRETORES, type IdDiretor } from "@/app/lib/diretoria"
import { lerConversa, apagarConversa } from "@/app/lib/diretoriaServidor"
import { conversar, responderAcao } from "@/app/lib/conversaDiretor"
import { erroClaude } from "@/app/lib/claude"

// Conversa 1:1 do Felipe com um diretor (rota protegida pelo login). GET ?diretor= ; POST { diretor, texto };
// PATCH { diretor, acao, resposta: aprovo|descartar } (cartão de mensagem a cliente); DELETE ?diretor= (começar do zero)
export const maxDuration = 300
const ehDiretor = (x: unknown): x is IdDiretor => DIRETORES.some(d => d.id === x)

export async function GET(req: NextRequest) {
  const d = req.nextUrl.searchParams.get("diretor")
  if (!ehDiretor(d)) return NextResponse.json({ erro: "diretor" }, { status: 400 })
  return NextResponse.json({ mensagens: await lerConversa(d) })
}

export async function POST(req: NextRequest) {
  const { diretor, texto } = await req.json().catch(() => ({})) as { diretor?: string; texto?: string }
  if (!ehDiretor(diretor) || !texto?.trim()) return NextResponse.json({ erro: "Escreva a mensagem." }, { status: 400 })
  try { return NextResponse.json({ mensagens: await conversar(diretor, texto.trim()) }) }
  catch (e) { const r = erroClaude(e); return NextResponse.json({ erro: r.error }, { status: r.status }) }
}

export async function PATCH(req: NextRequest) {
  const { diretor, acao, resposta, texto } = await req.json().catch(() => ({})) as { diretor?: string; acao?: string; resposta?: string; texto?: string }
  if (!ehDiretor(diretor) || !acao || (resposta !== "aprovo" && resposta !== "descartar")) return NextResponse.json({ erro: "diretor/acao/resposta" }, { status: 400 })
  return NextResponse.json({ mensagens: await responderAcao(diretor, acao, resposta, texto) })
}

export async function DELETE(req: NextRequest) {
  const d = req.nextUrl.searchParams.get("diretor")
  if (!ehDiretor(d)) return NextResponse.json({ erro: "diretor" }, { status: 400 })
  await apagarConversa(d)
  return NextResponse.json({ mensagens: [] })
}
