import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

// Diz se a integração está pronta para receber mensagens, sem expor o segredo
export async function GET() {
  const { count } = await supabase.from("whatsapp_conversas").select("*", { count: "exact", head: true })
  return NextResponse.json({
    segredoConfigurado: !!process.env.WHATSAPP_WEBHOOK_SECRET,
    totalConversas: count ?? 0,
  })
}
