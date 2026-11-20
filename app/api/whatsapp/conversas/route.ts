import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { mudarConfig } from "@/app/lib/configAtomica"

export async function GET() {
  const { data, error } = await supabase
    .from("whatsapp_conversas")
    // Só as colunas da lista (sem o resumo da IA, proxima_acao): a tela pede isto a cada poucos segundos, e o
    // select("*") de todas as conversas estourou a cota de tráfego do Supabase em 19/11
    .select("jid, nome, ultima_msg, ultima_at, nao_lidas, foto_url, campanha, ultima_recebida_at, ultima_enviada_at, status_lead, ultima_classificacao_at, fechada_em, etiquetas, telefone, kanban_card_id")
    .order("ultima_at", { ascending: false })
    .limit(1500)

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
  // Etapa e etiquetas: num lugar só (status manda, etiqueta MQL/Descartado é o reflexo), sincronizado no WhatsApp
  if (etapa !== undefined || etiquetas !== undefined) {
    const { definirEtapaManual } = await import("@/app/lib/agenteAuto")
    const limpas = etiquetas !== undefined ? [...new Set(etiquetas.map(e => e.trim()).filter(Boolean))] : undefined
    for (const j of alvo) await definirEtapaManual(j, etapa, limpas)
  } else {
    const campos = fechar !== undefined ? { fechada_em: fechar ? agora : null } : { nao_lidas: 0 }
    const { error } = await supabase.from("whatsapp_conversas").update(campos).in("jid", alvo)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // Você decidiu a etapa ou as etiquetas: o classificador automático não rebaixa mais esta conversa
  if (etapa !== undefined || etiquetas !== undefined) await mudarConfig((d: Record<string, unknown> & { leadManual?: Record<string, string> }) => {
    const m = { ...(d.leadManual ?? {}) }
    for (const j of alvo) m[j] = agora
    return { leadManual: Object.fromEntries(Object.entries(m).sort((a, b) => a[1].localeCompare(b[1])).slice(-1500)) }
  }).catch(() => null)
  return NextResponse.json({ ok: true })
}
