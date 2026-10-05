import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string; id: string }> }
) {
  const { id } = await params

  const { data: arquivo } = await supabase
    .from("pedido_arquivos")
    .select("url")
    .eq("id", id)
    .single()

  if (arquivo?.url) {
    const url = new URL(arquivo.url)
    const pathParts = url.pathname.split("/pedido-arquivos/")
    if (pathParts[1]) {
      await supabase.storage.from("pedido-arquivos").remove([decodeURIComponent(pathParts[1])])
    }
  }

  const { error } = await supabase.from("pedido_arquivos").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
