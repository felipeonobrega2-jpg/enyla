// Formulário público Parceiros ENYLA (sem login): recebe o cadastro com os arquivos
import { NextResponse } from "next/server"
import { receberCadastro } from "@/app/lib/parceirosServidor"
import { metaDoPedido } from "@/app/lib/termosParceriaServidor"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, erro: "Envio inválido." }, { status: 400 })
  const r = await receberCadastro(form, metaDoPedido(req.headers))
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
