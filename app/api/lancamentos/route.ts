import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

// Columns that exist in the Supabase table.
// subcategoria, contaId, fornecedorId are pending — run migration before uncommenting.
// ALTER TABLE "LancamentoFinanceiro" ADD COLUMN IF NOT EXISTS "subcategoria" TEXT,
//   ADD COLUMN IF NOT EXISTS "contaId" TEXT, ADD COLUMN IF NOT EXISTS "fornecedorId" TEXT;
const KNOWN_COLUMNS = new Set([
  "id","tipo","descricao","valor","dataVencimento","dataPagamento",
  "status","cardId","cardNumero","nomeCliente","loteId","loteNumero",
  "categoria","formaPagamento","obs","criadoEm",
  "subcategoria","contaId","fornecedorId",
])

function filterPayload(body: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(body).filter(([k]) => KNOWN_COLUMNS.has(k)))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const payload = filterPayload({
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
      subcategoria:    body.subcategoria ?? null,
      contaId:         body.contaId ?? null,
      fornecedorId:    body.fornecedorId ?? null,
      formaPagamento:  body.formaPagamento ?? null,
      obs:             body.obs ?? null,
      criadoEm:        body.criadoEm,
    })
    console.log("LANC POST payload:", JSON.stringify(payload))
    const { data, error } = await supabase.from("LancamentoFinanceiro").upsert(payload, { onConflict: "id" }).select()
    console.log("LANC POST result:", JSON.stringify({ data, error }))
    if (error) {
      console.error("LancamentoFinanceiro upsert error:", error)
      return NextResponse.json({ error: error.message, details: error }, { status: 500 })
    }
    return NextResponse.json({ ok: true, saved: data })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
