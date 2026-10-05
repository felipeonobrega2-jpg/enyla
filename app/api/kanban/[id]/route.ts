import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    // fornecedor/custoTerceiro/projecaoCustos have no columns — pack into opcoes._x.
    // Normal cards keep their pricing array in opcoes._items; _x carries metadata.
    const { fornecedor: pFornecedor, custoTerceiro: pCustoTerceiro, dataEntregaReal: _d,
      cores: pCores, acabamentos: pAcabamentos, observacoesOS: pObsOS,
      projecaoCustos: pProjecao, prazos: pPrazos,
      prazoRecebimentoInterno: pPrazoRec,
      ...baseBody } = body
    void _d
    const safeBody: Record<string, unknown> = { ...baseBody }
    if (pCores !== undefined)      safeBody.cores = pCores ?? null
    if (pAcabamentos !== undefined) safeBody.acabamentos = pAcabamentos ?? null
    if (pObsOS !== undefined)      safeBody.observacoes_os = pObsOS ?? null

    if (pFornecedor !== undefined || pCustoTerceiro !== undefined || pProjecao !== undefined || pPrazos !== undefined || pPrazoRec !== undefined) {
      const { data: current } = await supabase.from("KanbanCard").select("opcoes").eq("id", id).single()
      const raw = current?.opcoes
      // Support both formats: plain array and wrapped { _items, _x }
      const isWrapped = raw && !Array.isArray(raw) && typeof raw === "object"
      const currentItems = isWrapped
        ? ((raw as { _items?: unknown[] })._items ?? null)
        : (Array.isArray(raw) ? raw : null)
      const currentX = (isWrapped
        ? (raw as { _x?: Record<string, unknown> })._x
        : undefined) ?? {}
      const newX: Record<string, unknown> = { ...currentX }
      if (pFornecedor !== undefined) {
        if (pFornecedor) newX.fornecedor = pFornecedor
        else delete newX.fornecedor
      }
      if (pCustoTerceiro !== undefined) newX.custoTerceiro = pCustoTerceiro
      if (pProjecao !== undefined) {
        if (pProjecao) newX.projecaoCustos = pProjecao
        else delete newX.projecaoCustos
      }
      if (pPrazos !== undefined) {
        if (pPrazos && Object.keys(pPrazos).length > 0) newX.prazos = pPrazos
        else delete newX.prazos
      }
      if (pPrazoRec !== undefined) {
        if (pPrazoRec) newX.prazoRecebimentoInterno = pPrazoRec
        else delete newX.prazoRecebimentoInterno
      }
      const hasX = Object.keys(newX).length > 0
      if (currentItems) {
        safeBody.opcoes = hasX ? { _items: currentItems, _x: newX } : currentItems
      } else {
        safeBody.opcoes = hasX ? { _x: newX } : null
      }
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
