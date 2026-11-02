import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { aguardandoResposta, DIAS_PERDIDO } from "@/app/lib/funilWhatsapp"

// Conversas esperando resposta (o cliente falou por último, últimos 14 dias): o aviso que acompanha o sistema todo.
// Leve de propósito: roda a cada poucos segundos. (Rota protegida pelo login.)
export async function GET() {
  const desde = new Date(Date.now() - DIAS_PERDIDO * 86_400_000).toISOString()
  const { data, error } = await supabase.from("whatsapp_conversas")
    .select("jid, nome, ultima_msg, ultima_at, nao_lidas, ultima_recebida_at, ultima_enviada_at, fechada_em, campanha")
    .gte("ultima_recebida_at", desde).order("ultima_recebida_at", { ascending: false }).limit(300)
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).filter(c => aguardandoResposta(c)))
}
