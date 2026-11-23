import { NextRequest, NextResponse } from "next/server"
import { listarFerramentas, decidirFerramenta, type Ferramenta } from "@/app/lib/diretoriaServidor"

// Ferramentas pedidas pelos diretores (rota protegida pelo login). GET lista; PATCH { id, status } (aprovada/recusada/pronta)
export async function GET() { return NextResponse.json({ ferramentas: await listarFerramentas() }) }

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json().catch(() => ({})) as { id?: string; status?: Ferramenta["status"] }
  if (!id || !status || !["aprovada", "recusada", "pronta", "pedida"].includes(status)) return NextResponse.json({ erro: "id/status" }, { status: 400 })
  await decidirFerramenta(id, status)
  return GET()
}
