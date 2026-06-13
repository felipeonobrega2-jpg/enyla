import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ numero: string }> }
) {
  try {
    const { numero } = await params
    const loteNumero = decodeURIComponent(numero)

    const { data: lote, error: loteErr } = await supabase
      .from("Lote")
      .select("*")
      .eq("numero", loteNumero)
      .single()

    if (loteErr || !lote) {
      return NextResponse.json({ lote: null, cards: [] })
    }

    const [{ data: cards }, { data: parceiros }, { data: pagamentos }] = await Promise.all([
      supabase.from("KanbanCard").select("*").eq("loteId", lote.id).order("createdAt", { ascending: true }),
      supabase.from("NegocioParceiro").select("*").eq("loteId", lote.id),
      supabase.from("LancamentoFinanceiro")
        .select("id, valor, status, formaPagamento, dataVencimento, dataPagamento")
        .eq("loteId", lote.id)
        .eq("tipo", "receita")
        .or("categoria.is.null,categoria.neq.sobra")
        .order("dataVencimento", { ascending: true }),
    ])

    return NextResponse.json({ lote, cards: cards ?? [], parceiros: parceiros ?? [], pagamentos: pagamentos ?? [] })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
