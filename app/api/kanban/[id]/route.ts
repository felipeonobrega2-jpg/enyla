import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    // Exclude columns not yet in Supabase. Remove after ALTER TABLE migration.
    const { fornecedor: _f, custoTerceiro: _c, dataEntregaReal: _d, ...safeBody } = body
    void _f; void _c; void _d
    if (Object.keys(safeBody).length === 0) return NextResponse.json({ ok: true })
    const { error } = await supabase.from("KanbanCard").update(safeBody).eq("id", id)
    if (error) {
      console.error("Kanban PATCH error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
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
    await supabase.from("KanbanCard").delete().eq("id", id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
