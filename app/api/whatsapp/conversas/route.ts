import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function GET() {
  const { data, error } = await supabase
    .from("whatsapp_conversas")
    .select("*")
    .order("ultima_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function PATCH(req: Request) {
  const { jid } = await req.json()
  await supabase
    .from("whatsapp_conversas")
    .update({ nao_lidas: 0 })
    .eq("jid", jid)
  return NextResponse.json({ ok: true })
}
