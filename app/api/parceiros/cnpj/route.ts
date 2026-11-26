// Consulta pública de CNPJ para o formulário /parceiros (sem login; só repassa dados públicos da Receita via BrasilAPI)
import { NextResponse } from "next/server"
import { consultarCnpj } from "@/app/lib/cnpjConsulta"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const c = new URL(req.url).searchParams.get("c") ?? ""
  const r = await consultarCnpj(c)
  return NextResponse.json(r, { status: r.ok ? 200 : r.motivo === "invalido" ? 400 : r.motivo === "nao_encontrado" ? 404 : 502 })
}
