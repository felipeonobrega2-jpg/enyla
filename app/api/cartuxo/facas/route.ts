import { NextRequest, NextResponse } from "next/server"
import { listarFacas, produtosDoSite, salvarFaca, apagarFaca } from "@/app/cartuxo/lib/servidor"
import type { DadosFaca } from "@/app/cartuxo/lib/facas"

// Cartuxo · cadastro de facas (rota protegida pelo login)
const SEM_TABELA = "A tabela de facas ainda não existe. Rode supabase/migrations/20261108_cartuxo_facas.sql no SQL Editor do Supabase."
const mensagem = (e: unknown) => {
  const m = (e as Error).message ?? String(e)
  return /does not exist|could not find the table|schema cache/i.test(m) ? SEM_TABELA : m
}

async function tudo() {
  const [facas, site] = await Promise.all([
    listarFacas(),
    produtosDoSite().then(p => ({ produtos: p, erro: "" })).catch(e => ({ produtos: [], erro: `Não consegui ler as caixas do site: ${(e as Error).message}` })),
  ])
  return { facas, produtos: site.produtos, erroSite: site.erro }
}

export async function GET() {
  try {
    return NextResponse.json(await tudo())
  } catch (e) {
    console.error("cartuxo/facas", e)
    return NextResponse.json({ erro: mensagem(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as ({ acao: "salvar"; faca: DadosFaca } | { acao: "apagar"; id: string }) | null
  try {
    const r = b?.acao === "salvar" ? await salvarFaca(b.faca) : b?.acao === "apagar" ? await apagarFaca(b.id) : null
    if (!r) return NextResponse.json({ erro: "Ação inválida" }, { status: 400 })
    return NextResponse.json({ ...(await tudo()), ...r })
  } catch (e) {
    return NextResponse.json({ erro: mensagem(e) }, { status: 400 })
  }
}
