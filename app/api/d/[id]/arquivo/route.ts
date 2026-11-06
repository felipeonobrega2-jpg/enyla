import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { lerPedido, gravarPedido, tokenDigitalValido } from "@/app/lib/digitalServidor"

// Logo e referências do cliente para a designer (página pública do pedido, com o link assinado)
const MAX = 10 * 1024 * 1024
const TIPOS = /^(image\/(png|jpe?g|webp|gif|svg\+xml)|application\/pdf)$/

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id)
  const form = await req.formData().catch(() => null)
  if (!form || !tokenDigitalValido(id, String(form.get("t") ?? ""))) return NextResponse.json({ erro: "Link inválido." }, { status: 403 })
  const { pedido } = await lerPedido(id)
  if (!pedido || pedido.status === "cancelado") return NextResponse.json({ erro: "Orçamento indisponível." }, { status: 404 })
  if ((pedido.briefing?.arquivos?.length ?? 0) >= 8) return NextResponse.json({ erro: "Já tem 8 arquivos. Se precisar de mais, mande no WhatsApp." }, { status: 400 })
  const file = form.get("file") as File | null
  if (!file) return NextResponse.json({ erro: "Escolha um arquivo." }, { status: 400 })
  if (file.size > MAX) return NextResponse.json({ erro: "Arquivo acima de 10 MB." }, { status: 400 })
  if (!TIPOS.test(file.type)) return NextResponse.json({ erro: "Mande imagem (PNG, JPG) ou PDF." }, { status: 400 })

  const path = `digital/${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)}`
  const { error } = await supabase.storage.from("pedido-arquivos").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })
  if (error) return NextResponse.json({ erro: "Não consegui guardar o arquivo. Tente de novo." }, { status: 500 })
  const { data: { publicUrl } } = supabase.storage.from("pedido-arquivos").getPublicUrl(path)
  const novo = await gravarPedido(id, p => ({ ...p, briefing: { ...(p.briefing ?? {}), arquivos: [...(p.briefing?.arquivos ?? []), { nome: file.name.slice(0, 120), url: publicUrl }].slice(0, 8) } }))
  return NextResponse.json({ arquivos: novo?.briefing?.arquivos ?? [] })
}
