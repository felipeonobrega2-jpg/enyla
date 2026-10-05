import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jid: string }> }
) {
  const { jid } = await params
  const decoded = decodeURIComponent(jid)

  const { data, error } = await supabase
    .from("whatsapp_mensagens")
    .select("*")
    .eq("jid", decoded)
    .order("ts", { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
