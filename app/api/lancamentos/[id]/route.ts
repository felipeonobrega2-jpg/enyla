import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const raw = await req.json()
    // Strip columns that don't exist yet (see POST route for migration SQL)
    const KNOWN = new Set(["tipo","descricao","valor","dataVencimento","dataPagamento",
      "status","cardId","cardNumero","nomeCliente","loteId","loteNumero",
      "categoria","formaPagamento","obs",
      "subcategoria","contaId","fornecedorId",
    ])
    const body = Object.fromEntries(Object.entries(raw).filter(([k]) => KNOWN.has(k)))
    const { error } = await supabase.from("LancamentoFinanceiro").update(body).eq("id", id)
    if (error) {
      console.error("LancamentoFinanceiro PATCH error:", error)
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
    await supabase.from("LancamentoFinanceiro").delete().eq("id", id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
