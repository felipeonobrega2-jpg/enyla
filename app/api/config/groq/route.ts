import { NextRequest, NextResponse } from "next/server"
import { gravarCampos } from "@/app/lib/configAtomica"

// Chave do Groq (transcrição de áudios): fica só no servidor; a tela só sabe se está configurada.
async function gravar(campos: Record<string, unknown>) {
  await gravarCampos(campos)
}

export async function POST(req: NextRequest) {
  const { chave } = await req.json().catch(() => ({})) as { chave?: string }
  const c = chave?.trim()
  if (!c) return NextResponse.json({ erro: "Cole a chave." }, { status: 400 })
  const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${c}` } }).catch(() => null)
  if (!r?.ok) return NextResponse.json({ erro: r?.status === 401 ? "O Groq não aceitou essa chave." : "Não deu para falar com o Groq agora." }, { status: 400 })
  await gravar({ groqKey: c })
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  await gravar({ groqKey: null })
  return NextResponse.json({ ok: true })
}
