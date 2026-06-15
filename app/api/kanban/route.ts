import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // NOTE: fornecedor, custoTerceiro, dataEntregaReal columns do not yet exist in Supabase.
    // They must be added via: ALTER TABLE "KanbanCard" ADD COLUMN IF NOT EXISTS "fornecedor" text;
    //                         ALTER TABLE "KanbanCard" ADD COLUMN IF NOT EXISTS "custoTerceiro" numeric;
    //                         ALTER TABLE "KanbanCard" ADD COLUMN IF NOT EXISTS "dataEntregaReal" text;
    // Until then, those fields are excluded from the upsert to prevent silent save failures.
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
      opcoes:              body.opcoes ?? null,
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
