import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { PREFIXO_PERTO, PREFIXO_FORA, idPerto, lerMarca, sugestoesPerto, type ConversaPerto } from "@/app/lib/perto"

// "Perto de você" (rota protegida pelo login). GET: a lista, com a conversa de cada um, e as sugestões da semana.
// POST { jid, acao: "por" | "tirar" | "dispensar" | "nota", nota? }.
const CAMPOS = "jid, nome, status_lead, etiquetas, ultima_msg, ultima_at, ultima_recebida_at, ultima_enviada_at, fechada_em, kanban_card_id"

async function marcas() {
  const { data } = await supabase.from("agente_tratadas").select("id, em").or(`id.like.${PREFIXO_PERTO}%,id.like.${PREFIXO_FORA}%`).limit(2000)
  const lista = (data ?? []).map(r => lerMarca(r.id as string, r.em as string)).filter(x => !!x)
  const fora = new Set((data ?? []).filter(r => (r.id as string).startsWith(PREFIXO_FORA)).map(r => (r.id as string).slice(PREFIXO_FORA.length)))
  return { lista, fora }
}

export async function GET(req: NextRequest) {
  const { lista, fora } = await marcas()
  if (req.nextUrl.searchParams.get("so") === "jids") return NextResponse.json({ jids: lista.map(m => m.jid) })
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [{ data: daLista }, { data: recentes }] = await Promise.all([
    lista.length ? supabase.from("whatsapp_conversas").select(CAMPOS).in("jid", lista.map(m => m.jid)) : Promise.resolve({ data: [] as ConversaPerto[] }),
    supabase.from("whatsapp_conversas").select(CAMPOS).gte("ultima_at", desde).or("status_lead.is.null,status_lead.not.in.(pedido,perdido,descartado)").order("ultima_at", { ascending: false }).limit(1500),
  ])
  const porJid = new Map((daLista ?? []).map(c => [c.jid, c as ConversaPerto]))
  const itens = lista
    .map(m => ({ ...m, conversa: porJid.get(m.jid) ?? null }))
    .sort((a, b) => (b.conversa?.ultima_at ?? b.em).localeCompare(a.conversa?.ultima_at ?? a.em))
  const sugestoes = sugestoesPerto((recentes ?? []) as ConversaPerto[], new Set(lista.map(m => m.jid)), fora)
  return NextResponse.json({ itens, sugestoes: sugestoes.slice(0, 30), totalSugestoes: sugestoes.length })
}

export async function POST(req: NextRequest) {
  const { jid, acao, nota } = await req.json().catch(() => ({})) as { jid?: string; acao?: string; nota?: string }
  if (!jid || !/^[\w.@:-]+$/.test(jid)) return NextResponse.json({ erro: "jid" }, { status: 400 })
  const { data: atuais } = await supabase.from("agente_tratadas").select("id").like("id", `${PREFIXO_PERTO}${jid}|%`).limit(10)
  const notaAtual = atuais?.[0] ? lerMarca(atuais[0].id as string, "")?.nota ?? "" : ""
  const limpar = async () => { if (atuais?.length) await supabase.from("agente_tratadas").delete().in("id", atuais.map(a => a.id)) }
  if (acao === "por" || acao === "nota") {
    await limpar()
    const { error } = await supabase.from("agente_tratadas").insert({ id: idPerto(jid, acao === "nota" ? nota ?? "" : nota ?? notaAtual) })
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    await supabase.from("agente_tratadas").delete().eq("id", `${PREFIXO_FORA}${jid}`)
  } else if (acao === "tirar") await limpar()
  else if (acao === "dispensar") await supabase.from("agente_tratadas").upsert({ id: `${PREFIXO_FORA}${jid}` })
  else return NextResponse.json({ erro: "acao" }, { status: 400 })
  return NextResponse.json({ ok: true })
}
