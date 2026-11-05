import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { faltaColuna, semColunasNovas } from "@/app/lib/negociosDb"


export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const linha = {
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
      nomeCliente:    body.nomeCliente ?? null,
      produto:        body.produto ?? null,
      quantidade:     body.quantidade ?? null,
    }
    let { error } = await supabase.from("NegocioParceiro").upsert(linha, { onConflict: "id" })
    if (faltaColuna(error)) ({ error } = await supabase.from("NegocioParceiro").upsert(semColunasNovas(linha), { onConflict: "id" }))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
