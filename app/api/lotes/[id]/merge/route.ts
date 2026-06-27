import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { targetLoteId, targetLoteNumero } = await req.json()

    // Move all kanban cards from source lote → target lote
    await supabase
      .from("KanbanCard")
      .update({ loteId: targetLoteId, loteNumero: targetLoteNumero })
      .eq("loteId", id)

    // Move all partner items from source lote → target lote
    await supabase
      .from("NegocioParceiro")
      .update({ loteId: targetLoteId, loteNumero: targetLoteNumero })
      .eq("loteId", id)

    // Move all financial entries from source lote → target lote
    await supabase
      .from("LancamentoFinanceiro")
      .update({ loteId: targetLoteId, loteNumero: targetLoteNumero })
      .eq("loteId", id)

    // Delete the now-empty source lote
    await supabase.from("Lote").delete().eq("id", id)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
