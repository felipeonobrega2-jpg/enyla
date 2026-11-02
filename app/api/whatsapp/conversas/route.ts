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

// Uma ou várias conversas (jid ou jids):
//   { etapa }      etapa escolhida no funil (null volta para a automática)
//   { fechar }     true fecha (some da lista e do funil até o cliente escrever de novo); false reabre
//   { etiquetas }  etiquetas da conversa
//   sem nada       marca como lida
export async function PATCH(req: Request) {
  const { jid, jids, etapa, fechar, etiquetas } = await req.json() as { jid?: string; jids?: string[]; etapa?: string | null; fechar?: boolean; etiquetas?: string[] }
  const alvo = jids ?? (jid ? [jid] : [])
  if (!alvo.length) return NextResponse.json({ error: "jid" }, { status: 400 })
  const agora = new Date().toISOString()
  const campos = etapa !== undefined ? { status_lead: etapa, ultima_classificacao_at: etapa ? agora : null }
    : fechar !== undefined ? { fechada_em: fechar ? agora : null }
    : etiquetas !== undefined ? { etiquetas: [...new Set(etiquetas.map(e => e.trim()).filter(Boolean))] }
    : { nao_lidas: 0 }
  const { error } = await supabase.from("whatsapp_conversas").update(campos).in("jid", alvo)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
