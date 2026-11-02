import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

const POR_VEZ = 300

// Mensagens de uma conversa: as mais recentes; com ?antes=<ts>, as anteriores a essa data (botão "carregar anteriores");
// com ?limite=N, só as N últimas (espiada da lista)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jid: string }> }
) {
  const { jid } = await params
  const decoded = decodeURIComponent(jid)
  const antes = req.nextUrl.searchParams.get("antes")
  const limite = Math.min(POR_VEZ, Math.max(1, Number(req.nextUrl.searchParams.get("limite")) || POR_VEZ))

  let q = supabase.from("whatsapp_mensagens").select("*").eq("jid", decoded)
  if (antes) q = q.lt("ts", antes)
  const { data, error } = await q.order("ts", { ascending: false }).limit(limite)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).reverse())
}
