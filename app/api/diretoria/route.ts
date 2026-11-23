import { NextRequest, NextResponse } from "next/server"
import { lerCampos, mudarConfig } from "@/app/lib/configAtomica"
import { DIRETORES, type IdDiretor, type LicaoDiretor } from "@/app/lib/diretoria"

// Conhecimento de cada diretor (rota protegida pelo login): o Felipe vai abastecendo; os agentes diretores leem
// isso antes de decidir. GET lista; POST { diretor, texto } ensina; DELETE ?diretor=&id= tira.
type Base = Partial<Record<IdDiretor, LicaoDiretor[]>>
const ehDiretor = (x: unknown): x is IdDiretor => DIRETORES.some(d => d.id === x)

export async function GET() {
  const { conhecimentoDiretoria } = await lerCampos<{ conhecimentoDiretoria?: Base }>(["conhecimentoDiretoria"])
  return NextResponse.json({ conhecimento: conhecimentoDiretoria ?? {} })
}

export async function POST(req: NextRequest) {
  const { diretor, texto } = await req.json().catch(() => ({})) as { diretor?: string; texto?: string }
  const t = (texto ?? "").trim().slice(0, 1500)
  if (!ehDiretor(diretor) || t.length < 3) return NextResponse.json({ erro: "Escreva o que o diretor deve saber." }, { status: 400 })
  const licao: LicaoDiretor = { id: `${diretor}-${Date.now().toString(36)}`, texto: t, em: new Date().toISOString() }
  await mudarConfig((d: { conhecimentoDiretoria?: Base }) => ({ conhecimentoDiretoria: { ...(d.conhecimentoDiretoria ?? {}), [diretor]: [licao, ...((d.conhecimentoDiretoria ?? {})[diretor] ?? [])].slice(0, 300) } }))
  return NextResponse.json({ ok: true, licao })
}

export async function DELETE(req: NextRequest) {
  const diretor = req.nextUrl.searchParams.get("diretor"), id = req.nextUrl.searchParams.get("id")
  if (!ehDiretor(diretor) || !id) return NextResponse.json({ erro: "diretor/id" }, { status: 400 })
  await mudarConfig((d: { conhecimentoDiretoria?: Base }) => ({ conhecimentoDiretoria: { ...(d.conhecimentoDiretoria ?? {}), [diretor]: ((d.conhecimentoDiretoria ?? {})[diretor] ?? []).filter(l => l.id !== id) } }))
  return NextResponse.json({ ok: true })
}
