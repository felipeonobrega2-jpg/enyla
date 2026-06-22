import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    // fornecedor/custoTerceiro have no columns yet — pack into opcoes._x instead.
    const { fornecedor: pFornecedor, custoTerceiro: pCustoTerceiro, dataEntregaReal: _d, ...baseBody } = body
    void _d
    const safeBody: Record<string, unknown> = { ...baseBody }

    if (pFornecedor !== undefined || pCustoTerceiro !== undefined) {
      const { data: current } = await supabase.from("KanbanCard").select("opcoes").eq("id", id).single()
      const currentX = (current?.opcoes as { _x?: Record<string, unknown> } | null)?._x ?? {}
      const newX: Record<string, unknown> = { ...currentX }
      if (pFornecedor !== undefined) {
        if (pFornecedor) newX.fornecedor = pFornecedor
        else delete newX.fornecedor
      }
      if (pCustoTerceiro !== undefined) newX.custoTerceiro = pCustoTerceiro
      safeBody.opcoes = Object.keys(newX).length ? { _x: newX } : null
    }

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
