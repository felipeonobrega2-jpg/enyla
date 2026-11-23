import { NextRequest, NextResponse } from "next/server"
import { DIRETORES, type IdDiretor } from "@/app/lib/diretoria"
import { gerarChave, revogarChave, situacaoAcessos } from "@/app/lib/acessoExterno"
import { instrucoesNuvem } from "@/app/lib/instrucoesNuvem"

// Chaves dos diretores na nuvem (rota protegida pelo login). GET: situação; POST { diretor }: chave nova + instruções
// (a chave só aparece aqui, uma vez); DELETE ?diretor=: revoga.
const ehDiretor = (x: unknown): x is IdDiretor => DIRETORES.some(d => d.id === x)

export async function GET() {
  return NextResponse.json(await situacaoAcessos())
}

export async function POST(req: NextRequest) {
  const { diretor } = await req.json().catch(() => ({})) as { diretor?: string }
  if (!ehDiretor(diretor)) return NextResponse.json({ erro: "diretor" }, { status: 400 })
  const chave = await gerarChave(diretor)
  return NextResponse.json({ chave, instrucoes: instrucoesNuvem(diretor, chave, req.nextUrl.origin) })
}

export async function DELETE(req: NextRequest) {
  const d = req.nextUrl.searchParams.get("diretor")
  if (!ehDiretor(d)) return NextResponse.json({ erro: "diretor" }, { status: 400 })
  await revogarChave(d)
  return NextResponse.json({ ok: true })
}
