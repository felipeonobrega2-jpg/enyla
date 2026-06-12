import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await supabase.from("LancamentoFinanceiro").upsert({
      id:              body.id,
      tipo:            body.tipo,
      descricao:       body.descricao,
      valor:           body.valor,
      dataVencimento:  body.dataVencimento,
      dataPagamento:   body.dataPagamento ?? null,
      status:          body.status,
      cardId:          body.cardId ?? null,
      cardNumero:      body.cardNumero ?? null,
      nomeCliente:     body.nomeCliente ?? null,
      loteId:          body.loteId ?? null,
      loteNumero:      body.loteNumero ?? null,
      categoria:       body.categoria ?? null,
      formaPagamento:  body.formaPagamento ?? null,
      obs:             body.obs ?? null,
      criadoEm:        body.criadoEm,
    }, { onConflict: "id" })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
