import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

// Campos gravados só pelo servidor (renovação do token da Meta). A tela envia a
// configuração inteira que carregou; sem isto, salvar qualquer ajuste regravaria
// um token antigo por cima do renovado.
const CAMPOS_DO_SERVIDOR = ["metaToken", "metaTokenExpiry"] as const

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>
    const { data: atual } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
    const salvo = (atual?.data as Record<string, unknown> | undefined) ?? {}
    const proximo: Record<string, unknown> = { ...body }
    for (const k of CAMPOS_DO_SERVIDOR) {
      if (k in salvo) proximo[k] = salvo[k]
      else delete proximo[k]
    }
    await supabase.from("AppConfig").upsert({ id: 1, data: proximo }, { onConflict: "id" })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
