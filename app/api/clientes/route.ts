import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await supabase.from("Cliente").upsert({
      id:       body.id,
      nome:     body.nome,
      telefone: body.telefone,
      email:    body.email,
      cnpj:     body.cnpj,
      notas:    body.notas,
      criadoEm: body.criadoEm,
    }, { onConflict: "id" })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
