import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

// Vídeos e fotos que você mandou recentemente: para reaproveitar no follow-up (vídeo de produção, caixinha pronta).
// (Rota protegida pelo login.)
export async function GET() {
  const { data, error } = await supabase.from("whatsapp_mensagens").select("id, jid, tipo, ts, corpo")
    .eq("from_me", true).in("tipo", ["videoMessage", "video", "image", "imageMessage"])
    .order("ts", { ascending: false }).limit(18)
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(m => ({ id: m.id, tipo: /video/i.test(m.tipo) ? "video" : "imagem", ts: m.ts, legenda: m.corpo })))
}
