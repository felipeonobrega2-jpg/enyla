import { NextRequest, NextResponse } from "next/server"
import { gravarCampos } from "@/app/lib/configAtomica"
import { falar } from "@/app/lib/vozServidor"

// Chave do Gemini (voz dos diretores): fica só no servidor; a tela só sabe se está configurada.
// Para conferir, o servidor gera uma fala curta de verdade (assim a chave também prova que tem acesso à voz).
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { chave } = await req.json().catch(() => ({})) as { chave?: string }
  const c = chave?.trim()
  if (!c) return NextResponse.json({ erro: "Cole a chave." }, { status: 400 })
  const r = await falar("coo", "Oi, Felipe.", c)
  if (!r.ok) {
    const erro = r.status === 401 || r.status === 403 || /API_KEY_INVALID/.test(r.erro) ? "O Google não aceitou essa chave."
      : r.limite ? "A chave é válida, mas o limite gratuito de voz do dia acabou. Tente de novo amanhã."
      : `O Google não gerou a voz (${r.status}).`
    if (!r.limite) return NextResponse.json({ erro, detalhe: r.erro.slice(0, 200) }, { status: 400 })
  }
  await gravarCampos({ geminiKey: c })
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  await gravarCampos({ geminiKey: null })
  return NextResponse.json({ ok: true })
}
