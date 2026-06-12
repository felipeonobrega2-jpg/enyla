import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await supabase.from("NegocioParceiro").upsert({
      id:             body.id,
      parceiroId:     body.parceiroId,
      parceiroNome:   body.parceiroNome,
      descricao:      body.descricao,
      tipo:           body.tipo,
      valorVenda:     body.valorVenda,
      valorCusto:     body.valorCusto ?? null,
      comissaoPerc:   body.comissaoPerc,
      comissaoValor:  body.comissaoValor,
      dataOrcamento:  body.dataOrcamento,
      status:         body.status,
      obs:            body.obs ?? null,
      loteId:         body.loteId ?? null,
      loteNumero:     body.loteNumero ?? null,
      statusLote:     body.statusLote ?? null,
      criadoEm:       body.criadoEm,
    }, { onConflict: "id" })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
