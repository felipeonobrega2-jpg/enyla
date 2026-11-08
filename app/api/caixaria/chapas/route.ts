import { NextRequest, NextResponse } from "next/server"
import { chapasAtualizadas, aplicar, type AcaoChapa } from "@/app/caixaria/lib/servidor"

// Caixaria · chapas (rota protegida pelo login)
const SEM_TABELA = "As tabelas da Caixaria ainda não existem. Rode supabase/migrations/20261108_caixaria_chapas.sql no SQL Editor do Supabase."
const mensagem = (e: unknown) => {
  const m = (e as Error).message ?? String(e)
  return /does not exist|could not find the table|schema cache/i.test(m) ? SEM_TABELA : m
}

export async function GET() {
  try {
    return NextResponse.json(await chapasAtualizadas())
  } catch (e) {
    console.error("caixaria/chapas", e)
    return NextResponse.json({ erro: mensagem(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as AcaoChapa | null
  if (!b?.acao || !b.chapa) return NextResponse.json({ erro: "Ação inválida" }, { status: 400 })
  try {
    await aplicar(b)
    return NextResponse.json(await chapasAtualizadas())
  } catch (e) {
    return NextResponse.json({ erro: mensagem(e) }, { status: 400 })
  }
}
