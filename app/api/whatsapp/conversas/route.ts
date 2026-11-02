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

// Marca como lida; com { etapa }, guarda a etapa escolhida no funil (null volta para a automática)
export async function PATCH(req: Request) {
  const { jid, etapa } = await req.json() as { jid: string; etapa?: string | null }
  const campos = etapa !== undefined
    ? { status_lead: etapa, ultima_classificacao_at: etapa ? new Date().toISOString() : null }
    : { nao_lidas: 0 }
  await supabase.from("whatsapp_conversas").update(campos).eq("jid", jid)
  return NextResponse.json({ ok: true })
}
