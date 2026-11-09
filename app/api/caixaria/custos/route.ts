import { NextRequest, NextResponse } from "next/server"
import { lerCustos, salvarCustos, referenciasENYLA } from "@/app/caixaria/lib/servidor"
import type { Custos } from "@/app/caixaria/lib/custos"

// Caixaria · custos e regras de preço (rota protegida pelo login)
const SEM_TABELA = "A tabela de configuração da Caixaria ainda não existe. Rode supabase/migrations/20261108_caixaria_config.sql no SQL Editor do Supabase."
const mensagem = (e: unknown) => {
  const m = (e as Error).message ?? String(e)
  return /does not exist|could not find the table|schema cache/i.test(m) ? SEM_TABELA : m
}

export async function GET() {
  const [atual, refs] = await Promise.allSettled([lerCustos(), referenciasENYLA()])
  return NextResponse.json({
    ...(atual.status === "fulfilled" ? atual.value : { custos: null, erro: mensagem(atual.reason) }),
    ...(refs.status === "fulfilled" ? refs.value : { referencias: [], avisos: ["Não consegui ler o histórico da ENYLA agora."] }),
  })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { custos?: Partial<Custos> } | null
  if (!b?.custos) return NextResponse.json({ erro: "Nada para salvar" }, { status: 400 })
  try {
    const r = await salvarCustos(b.custos)
    return NextResponse.json({ ...(await lerCustos()), ...r })
  } catch (e) {
    return NextResponse.json({ erro: mensagem(e) }, { status: 400 })
  }
}
