import { NextRequest, NextResponse } from "next/server"
import { lerPedido, tokenDigitalValido, tokenDesignerValido, guardarArte } from "@/app/lib/digitalServidor"
import { auth } from "@/auth"

// Arte do pedido digital: a designer (link com o token dela) ou você (logado, pelo painel) sobe a imagem ou PDF
const MAX = 15 * 1024 * 1024
const TIPOS = /^(image\/(png|jpe?g|webp)|application\/pdf)$/

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id)
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ erro: "Envio inválido." }, { status: 400 })
  const designer = tokenDigitalValido(id, String(form.get("t") ?? "")) && tokenDesignerValido(id, String(form.get("dz") ?? ""))
  const voce = !designer && !!(await auth().catch(() => null))
  if (!designer && !voce) return NextResponse.json({ erro: "Link inválido." }, { status: 403 })
  const { pedido } = await lerPedido(id)
  if (!pedido || pedido.status === "cancelado") return NextResponse.json({ erro: "Pedido indisponível." }, { status: 404 })
  const file = form.get("file") as File | null
  if (!file) return NextResponse.json({ erro: "Escolha o arquivo da arte." }, { status: 400 })
  if (file.size > MAX) return NextResponse.json({ erro: "Arquivo acima de 15 MB: exporte em JPG ou PDF menor." }, { status: 400 })
  if (!TIPOS.test(file.type)) return NextResponse.json({ erro: "Mande a arte em JPG, PNG ou PDF." }, { status: 400 })
  const r = await guardarArte(id, file)
  if (r.erro) return NextResponse.json({ erro: r.erro }, { status: 400 })
  return NextResponse.json({ ok: true, arte: r.pedido?.artes?.at(-1) ?? null })
}
