// Cadastros de parceiros (só a equipe): lista e muda o status (aprovado vira fornecedor pela tela Fornecedores)
import { NextResponse } from "next/server"
import { listarCadastros, mudarStatus } from "@/app/lib/parceirosServidor"

export const dynamic = "force-dynamic"

// Cada cadastro sai com `termos` ("pendente_termos" ou "aceito"): pendência visível no painel, sem bloquear ninguém aqui
export async function GET() {
  const [lista, termos] = await Promise.all([listarCadastros(), import("@/app/lib/termosParceriaServidor").then(m => m.situacaoTermosPorCadastro())])
  return NextResponse.json({ cadastros: lista.map(c => ({ ...c, termos: termos[c.id] ?? null })) })
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { id?: string; status?: string; fornecedorId?: string }
  if (!b.id || !["novo", "aprovado", "recusado"].includes(b.status ?? "")) return NextResponse.json({ erro: "dados" }, { status: 400 })
  const email = await mudarStatus(b.id, b.status as "novo" | "aprovado" | "recusado", b.fornecedorId)
  return NextResponse.json({ ok: true, email })
}
