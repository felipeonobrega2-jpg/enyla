import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { diagnosticar } from "@/app/lib/evolution"

// Diz se a integração está pronta para receber mensagens, sem expor nenhum segredo
export async function GET(req: NextRequest) {
  const { count } = await supabase.from("whatsapp_conversas").select("*", { count: "exact", head: true })
  return NextResponse.json({
    segredoConfigurado: !!process.env.WHATSAPP_WEBHOOK_SECRET,
    totalConversas: count ?? 0,
    evolution: await diagnosticar(req.nextUrl.origin),
  })
}
