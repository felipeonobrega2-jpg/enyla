import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { form, calculo, data, numero, contador } = body

    const ops: PromiseLike<unknown>[] = [
      supabase.from("HistoricoItem")
        .upsert({ numero, form, calculo, data }, { onConflict: "numero" }),
    ]

    if (contador !== undefined) {
      ops.push(
        supabase.from("Contador")
          .upsert({ chave: "orc", valor: contador }, { onConflict: "chave" })
      )
    }

    await Promise.all(ops)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
