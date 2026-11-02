import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

// Mensagens rápidas (tabela quick_replies): lista, cria/edita, apaga. Rota protegida pelo login.
export async function GET() {
  const { data, error } = await supabase.from("quick_replies").select("id, atalho, quando_usar, corpo, ativa, ordem").order("ordem").order("atalho")
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { id?: string; atalho?: string; corpo?: string; quando_usar?: string; ativa?: boolean; ordem?: number }
  const atalho = "/" + (b.atalho ?? "").trim().replace(/^\/+/, "").replace(/\s+/g, "-").toLowerCase()
  if (atalho.length < 2 || !b.corpo?.trim()) return NextResponse.json({ erro: "Preencha o atalho e o texto." }, { status: 400 })
  const linha = { atalho, corpo: b.corpo.trim(), quando_usar: b.quando_usar?.trim() || "—", ativa: b.ativa ?? true, ordem: b.ordem ?? 0 }
  const r = b.id
    ? await supabase.from("quick_replies").update(linha).eq("id", b.id).select().single()
    : await supabase.from("quick_replies").insert(linha).select().single()
  if (r.error) return NextResponse.json({ erro: /duplicate|unique/i.test(r.error.message) ? `Já existe o atalho ${atalho}.` : r.error.message }, { status: 400 })
  return NextResponse.json(r.data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ erro: "id" }, { status: 400 })
  await supabase.from("quick_replies").delete().eq("id", id)
  return NextResponse.json({ ok: true })
}
