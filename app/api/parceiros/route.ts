import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await supabase.from("Parceiro").upsert({
      id:              body.id,
      nome:            body.nome,
      categoria:       body.categoria,
      contato:         body.contato ?? null,
      comissaoDefault: body.comissaoDefault ?? 0,
      criadoEm:        body.criadoEm,
    }, { onConflict: "id" })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
