import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // Extra metadata (fornecedor, custoTerceiro, projecaoCustos) has no dedicated column.
    // Pack into opcoes: terceirizado → { _x }, normal cards → { _items: [...opcoes], _x }
    let packedOpcoes = body.opcoes ?? null
    const xMeta: Record<string, unknown> = {}
    if (body.fornecedor)           xMeta.fornecedor      = body.fornecedor
    if (body.custoTerceiro != null) xMeta.custoTerceiro  = body.custoTerceiro
    if (body.projecaoCustos)       xMeta.projecaoCustos  = body.projecaoCustos
    if (Object.keys(xMeta).length > 0) {
      if (Array.isArray(packedOpcoes)) {
        packedOpcoes = { _items: packedOpcoes, _x: xMeta }
      } else if (body.materialNome === "Terceirizado") {
        packedOpcoes = { _x: xMeta }
      }
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
