import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data: contData } = await supabase.from("Contador").select("valor").eq("chave", "lote").single()
    const novoContador = (contData?.valor ?? 0) + 1
    const ano = new Date().getFullYear()
    const numero = `LOTE-${ano}-${String(novoContador).padStart(3, "0")}`
    await supabase.from("Contador").upsert({ chave: "lote", valor: novoContador }, { onConflict: "chave" })
    const lote = {
      id: crypto.randomUUID(),
      numero,
      nomeCliente: body.nomeCliente,
      descricao: body.descricao ?? null,
      criadoEm: new Date().toLocaleString("pt-BR"),
    }
    await supabase.from("Lote").insert(lote)
    return NextResponse.json(lote)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
