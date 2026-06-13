import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ numero: string }> }
) {
  try {
    const { numero } = await params
    const { data, error } = await supabase
      .from("Tracking")
      .select("*")
      .eq("numero", decodeURIComponent(numero))
      .single()
    if (error || !data) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

    // Fetch financial data via KanbanCard
    const { data: card } = await supabase
      .from("KanbanCard")
      .select("id, loteId")
      .eq("numero", decodeURIComponent(numero))
      .maybeSingle()

    let pagamentos: unknown[] = []
    if (card) {
      const query = supabase
        .from("LancamentoFinanceiro")
        .select("id, valor, status, formaPagamento, dataVencimento, dataPagamento")
        .eq("tipo", "receita")
        .or("categoria.is.null,categoria.neq.sobra")
        .order("dataVencimento", { ascending: true })

      const { data: pags } = card.loteId
        ? await query.eq("loteId", card.loteId)
        : await query.eq("cardId", card.id)

      pagamentos = pags ?? []
    }

    return NextResponse.json({ ...data, pagamentos })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ numero: string }> }
) {
  try {
    const { numero } = await params
    const body = await req.json()
    const key = decodeURIComponent(numero)
    const payload: Record<string, unknown> = {
      numero:       key,
      nomeCliente:  body.nomeCliente  ?? "",
      descricao:    body.descricao,
      materialNome: body.materialNome,
      quantidade:   body.quantidade   ?? 0,
      preco:        body.preco        ?? 0,
      colunaAtual:  body.colunaAtual  ?? 0,
      etapas:       body.etapas       ?? [],
      criadoEm:     body.criadoEm     ?? "",
    }
    if (body.dataEntregaPrevista !== undefined) {
      payload.dataEntregaPrevista = body.dataEntregaPrevista || null
    }
    await supabase.from("Tracking").upsert(payload, { onConflict: "numero" })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
