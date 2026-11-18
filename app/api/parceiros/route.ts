// Cadastros de parceiros (só a equipe): lista e muda o status (aprovado vira fornecedor pela tela Fornecedores)
import { NextResponse } from "next/server"
import { listarCadastros, mudarStatus } from "@/app/lib/parceirosServidor"

export const dynamic = "force-dynamic"

export async function GET() { return NextResponse.json({ cadastros: await listarCadastros() }) }

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { id?: string; status?: string; fornecedorId?: string }
  if (!b.id || !["novo", "aprovado", "recusado"].includes(b.status ?? "")) return NextResponse.json({ erro: "dados" }, { status: 400 })
  await mudarStatus(b.id, b.status as "novo" | "aprovado" | "recusado", b.fornecedorId)
  return NextResponse.json({ ok: true })
}
