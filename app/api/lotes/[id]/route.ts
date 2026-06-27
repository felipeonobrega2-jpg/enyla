import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    // If renaming the numero, check for duplicates and cascade
    if (body.numero !== undefined) {
      const numeroFinal = String(body.numero).trim().toUpperCase()
      if (!numeroFinal) return NextResponse.json({ error: "numero obrigatorio" }, { status: 400 })

      const { data: existing } = await supabase
        .from("Lote")
        .select("id")
        .eq("numero", numeroFinal)
        .neq("id", id)
        .maybeSingle()

      if (existing) return NextResponse.json({ error: "duplicado" }, { status: 409 })

      await supabase.from("Lote").update({ ...body, numero: numeroFinal }).eq("id", id)
      await Promise.all([
        supabase.from("KanbanCard").update({ loteNumero: numeroFinal }).eq("loteId", id),
        supabase.from("NegocioParceiro").update({ loteNumero: numeroFinal }).eq("loteId", id),
        supabase.from("LancamentoFinanceiro").update({ loteNumero: numeroFinal }).eq("loteId", id),
      ])
      return NextResponse.json({ ok: true, numero: numeroFinal })
    }

    await supabase.from("Lote").update(body).eq("id", id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await supabase.from("Lote").delete().eq("id", id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
