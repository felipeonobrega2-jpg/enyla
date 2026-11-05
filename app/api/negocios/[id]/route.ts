import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { faltaColuna, semColunasNovas } from "@/app/lib/negociosDb"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    let { error } = await supabase.from("NegocioParceiro").update(body).eq("id", id)
    if (faltaColuna(error)) ({ error } = await supabase.from("NegocioParceiro").update(semColunasNovas(body)).eq("id", id))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
    await supabase.from("NegocioParceiro").delete().eq("id", id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
