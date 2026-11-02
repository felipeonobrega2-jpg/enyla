import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

// Chave do Groq (transcrição de áudios): fica só no servidor; a tela só sabe se está configurada.
async function gravar(campos: Record<string, unknown>) {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  await supabase.from("AppConfig").upsert({ id: 1, data: { ...((data?.data as object) ?? {}), ...campos } }, { onConflict: "id" })
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
