import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params
  const { data, error } = await supabase
    .from("pedido_arquivos")
    .select("*")
    .eq("card_id", cardId)
    .order("created_at", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params
  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const tipo = (formData.get("tipo") as string) || "arte"
  const cardNumero = (formData.get("cardNumero") as string) || ""

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

  const ext = file.name.split(".").pop()
  const path = `${cardId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from("pedido-arquivos")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from("pedido-arquivos").getPublicUrl(path)

  const { data, error } = await supabase.from("pedido_arquivos").insert({
    card_id: cardId,
    card_numero: cardNumero,
    nome: file.name,
    url: publicUrl,
    tipo,
    tamanho: file.size,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
