import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await supabase.from("KanbanCard").upsert({
      id:            body.id,
      numero:        body.numero,
      nomeCliente:   body.nomeCliente,
      dimensoes:     body.dimensoes,
      materialNome:  body.materialNome,
      preco:         body.preco,
      quantidade:    body.quantidade,
      data:          body.data,
      coluna:        body.coluna ?? 0,
      motivoPerdido: body.motivoPerdido ?? null,
      opcoes:        body.opcoes ?? null,
    }, { onConflict: "id" })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
