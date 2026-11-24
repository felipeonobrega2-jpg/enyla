// Cenários-exemplo do cadastro de parceiros (só a equipe: com preço e fornecedor de referência).
// O público só recebe enunciado e versão, pela página /parceiros.
import { NextResponse } from "next/server"
import { lerCenarios, salvarCenarios } from "@/app/lib/parceirosServidor"

export const dynamic = "force-dynamic"

export async function GET() { return NextResponse.json({ cenarios: await lerCenarios() }) }

export async function POST(req: Request) {
  const b = await req.json().catch(() => null) as { cenarios?: unknown } | null
  if (!b || !Array.isArray(b.cenarios)) return NextResponse.json({ erro: "dados" }, { status: 400 })
  return NextResponse.json({ cenarios: await salvarCenarios(b.cenarios) })
}
