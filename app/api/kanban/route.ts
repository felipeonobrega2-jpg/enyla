import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // fornecedor/custoTerceiro columns don't exist yet. For terceirizado cards,
    // pack them into opcoes as { _x: { fornecedor, custoTerceiro } } instead.
    let packedOpcoes = body.opcoes ?? null
    if (
      body.materialNome === "Terceirizado" &&
      (body.fornecedor || body.custoTerceiro != null)
    ) {
      const x: Record<string, unknown> = {}
      if (body.fornecedor) x.fornecedor = body.fornecedor
      if (body.custoTerceiro != null) x.custoTerceiro = body.custoTerceiro
      packedOpcoes = { _x: x }
    }
    const payload: Record<string, unknown> = {
      id:                  body.id,
      numero:              body.numero,
      nomeCliente:         body.nomeCliente,
      dimensoes:           body.dimensoes,
      materialNome:        body.materialNome,
      preco:               body.preco,
      quantidade:          body.quantidade,
      data:                body.data,
      coluna:              body.coluna ?? 0,
      motivoPerdido:       body.motivoPerdido ?? null,
      opcoes:              packedOpcoes,
      loteId:              body.loteId ?? null,
      loteNumero:          body.loteNumero ?? null,
      dataFechamento:      body.dataFechamento ?? null,
      dataEntregaPrevista: body.dataEntregaPrevista ?? null,
    }
    const { error: upsertError } = await supabase.from("KanbanCard").upsert(payload, { onConflict: "id" })
    if (upsertError) {
      console.error("Kanban upsert error:", upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
