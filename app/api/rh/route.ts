import { NextRequest, NextResponse } from "next/server"
import { lerCampos } from "@/app/lib/configAtomica"
import { quadro, type Funcionario } from "@/app/lib/rh"
import { decidirVaga, mudarAprendizado } from "@/app/lib/rhServidor"

// RH (rota protegida pelo login). GET: quadro de funcionários e vagas. PATCH { id, acao: contratar|recusar }.
// POST { id, texto }: ensinar um funcionário. DELETE ?id=&licao=: tirar um aprendizado.
export async function GET() {
  const { funcionarios } = await lerCampos<{ funcionarios?: Funcionario[] }>(["funcionarios"])
  return NextResponse.json({ quadro: quadro(funcionarios) })
}

export async function PATCH(req: NextRequest) {
  const { id, acao } = await req.json().catch(() => ({})) as { id?: string; acao?: string }
  if (!id || (acao !== "contratar" && acao !== "recusar")) return NextResponse.json({ erro: "id/acao" }, { status: 400 })
  await decidirVaga(id, acao)
  return GET()
}

export async function POST(req: NextRequest) {
  const { id, texto } = await req.json().catch(() => ({})) as { id?: string; texto?: string }
  const t = (texto ?? "").trim()
  if (!id || t.length < 3) return NextResponse.json({ erro: "Escreva o que o funcionário deve aprender." }, { status: 400 })
  await mudarAprendizado(id, { texto: t })
  return GET()
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id"), licao = req.nextUrl.searchParams.get("licao")
  if (!id || !licao) return NextResponse.json({ erro: "id/licao" }, { status: 400 })
  await mudarAprendizado(id, { tirar: licao })
  return GET()
}
