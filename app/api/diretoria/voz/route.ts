import { NextRequest, NextResponse } from "next/server"
import { DIRETORES, type IdDiretor } from "@/app/lib/diretoria"
import { falar } from "@/app/lib/vozServidor"

// Voz de um diretor (rota protegida pelo login): POST { diretor, texto } → áudio WAV. Sem chave ou no limite do dia,
// responde JSON com semChave/limite e a tela usa a voz do navegador.
export const maxDuration = 60
const ehDiretor = (x: unknown): x is IdDiretor => DIRETORES.some(d => d.id === x)

export async function POST(req: NextRequest) {
  const { diretor, texto } = await req.json().catch(() => ({})) as { diretor?: string; texto?: string }
  if (!ehDiretor(diretor) || !texto?.trim()) return NextResponse.json({ erro: "diretor/texto" }, { status: 400 })
  const r = await falar(diretor, texto.trim().slice(0, 1500))
  if (!r.ok) return NextResponse.json({ erro: r.erro.slice(0, 200), limite: !!r.limite, semChave: !!r.semChave }, { status: r.status })
  return new NextResponse(new Uint8Array(r.audio), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" } })
}
