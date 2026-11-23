import { NextRequest, NextResponse } from "next/server"
import { chaveGroq, transcrever } from "@/app/lib/transcricao"

// O Felipe fala com o diretor: o áudio do microfone vira texto pelo Groq (a mesma chave da transcrição do WhatsApp).
// Sem a chave, a tela usa o reconhecimento de voz do navegador.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const chave = await chaveGroq()
  if (!chave) return NextResponse.json({ erro: "Sem chave do Groq", semChave: true }, { status: 503 })
  const form = await req.formData().catch(() => null)
  const arq = form?.get("audio")
  if (!(arq instanceof Blob) || arq.size < 800) return NextResponse.json({ texto: "" })
  if (arq.size > 20_000_000) return NextResponse.json({ erro: "Áudio grande demais" }, { status: 413 })
  try {
    const texto = await transcrever(Buffer.from(await arq.arrayBuffer()), arq.type || "audio/webm", chave)
    return NextResponse.json({ texto: texto ?? "" })
  } catch (e) {
    return NextResponse.json({ erro: String(e).slice(0, 120) }, { status: 502 })
  }
}
