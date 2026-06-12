import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

function clientCode(nome: string): string {
  return nome.replace(/\s+/g, "").slice(0, 3).toUpperCase() || "GEN"
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const code = clientCode(body.nomeCliente ?? "")

    // Find the highest sequential number for this client code
    const { data: existing } = await supabase
      .from("Lote")
      .select("numero")
      .like("numero", `${code}-%`)

    const nums = (existing ?? [])
      .map((l: { numero: string }) => parseInt(l.numero.split("-").pop() ?? "0"))
      .filter((n: number) => !isNaN(n) && n > 0)
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
    const numero = `${code}-${String(next).padStart(3, "0")}`

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
