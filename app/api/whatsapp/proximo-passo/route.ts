import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { DIAS_ESPERANDO, Passos, ProximoPasso } from "@/app/lib/hoje"

// O próximo passo de uma conversa (Hoje e topo da conversa do WhatsApp). (Rota protegida pelo login.)
//   GET ?jid=                                     → { passo } (ou null)
//   POST { jid, tipo: "esperando" }               → sai do Hoje; volta se ele escrever (não vale "ok") ou em 3 dias
//   POST { jid, tipo: "lembrar", dias | data, nota } → volta no dia (às 9h), com a nota
//   POST { jid, tipo: "fechou" | "perdido" }      → sai de vez (etapa do funil: Virou pedido / Perdido)
//   POST { jid, tipo: "limpar" }                  → volta para a regra automática
const DIAS_GUARDAR = 60

async function lerPassos() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const d = (data?.data ?? {}) as Record<string, unknown> & { proximosPassos?: Passos }
  return { d, passos: d.proximosPassos ?? {} }
}

// Às 9h de São Paulo do dia escolhido (lembrete chega com o resumo da manhã)
const nove = (dia: string) => new Date(`${dia}T09:00:00-03:00`).toISOString()
const diaSP = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

export async function GET(req: NextRequest) {
  const jid = req.nextUrl.searchParams.get("jid")
  if (!jid) return NextResponse.json({ erro: "jid obrigatório" }, { status: 400 })
  const { passos } = await lerPassos()
  return NextResponse.json({ passo: passos[jid] ?? null })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { jid?: string; tipo?: string; dias?: number; data?: string; nota?: string }
  if (!b.jid || !b.tipo) return NextResponse.json({ erro: "jid e tipo obrigatórios" }, { status: 400 })
  const agora = new Date()
  let passo: ProximoPasso | null = null
  if (b.tipo === "esperando") passo = { tipo: "esperando", em: agora.toISOString(), ate: new Date(agora.getTime() + DIAS_ESPERANDO * 86_400_000).toISOString() }
  else if (b.tipo === "lembrar") {
    const dia = b.data && /^\d{4}-\d{2}-\d{2}$/.test(b.data) ? b.data : diaSP(new Date(agora.getTime() + Math.min(90, Math.max(1, Number(b.dias) || 1)) * 86_400_000))
    passo = { tipo: "lembrar", em: agora.toISOString(), ate: nove(dia), ...(b.nota?.trim() ? { nota: b.nota.trim().slice(0, 120) } : {}) }
  } else if (b.tipo === "fechou" || b.tipo === "perdido") {
    const { error } = await supabase.from("whatsapp_conversas").update({ status_lead: b.tipo === "fechou" ? "pedido" : "perdido", ultima_classificacao_at: agora.toISOString() }).eq("jid", b.jid)
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  } else if (b.tipo !== "limpar") return NextResponse.json({ erro: "tipo inválido" }, { status: 400 })

  // Grava lendo a versão mais nova (o resto da configuração não muda) e esquece passos velhos
  const { d, passos } = await lerPassos()
  const limite = agora.getTime() - DIAS_GUARDAR * 86_400_000
  const proximos: Passos = Object.fromEntries(Object.entries(passos).filter(([j, p]) => j !== b.jid && new Date(p.ate).getTime() > limite))
  if (passo) proximos[b.jid] = passo
  await supabase.from("AppConfig").update({ data: { ...d, proximosPassos: proximos } }).eq("id", 1)
  return NextResponse.json({ ok: true, passo })
}
