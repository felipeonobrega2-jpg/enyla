import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { atender, lerConfigAtendente } from "@/app/lib/atendenteServidor"
import { AgenteAuto, RegistroAgente, travaDoEnvio, valoresEmReais, PerfilLead, filtroEfetivo } from "@/app/lib/agenteLeads"

export const maxDuration = 60

// Agente de leads (Configurações): estado do modo automático, o que ele fez e simulação sem enviar.
//   GET                      → { auto, log }
//   POST { ligado, ... }     → liga/desliga o modo automático (grava na hora, sem o Salvar da página)
//   POST { simular: true }   → roda o agente nos leads mais recentes e mostra o que ele mandaria (não envia nada)
// (Rota protegida pelo login.)

type Cfg = { agenteAuto?: AgenteAuto; agenteLog?: RegistroAgente[]; filtroLeads?: string }

export type Taxa = { passo: string; enviados: number; responderam: number }

// Quantos responderam depois de cada tipo de mensagem automática (1ª resposta, F1, F2, F3): base para testar versões e vídeos
async function taxas(log: RegistroAgente[]): Promise<Taxa[]> {
  const enviados = log.filter(l => l.enviou)
  if (!enviados.length) return []
  const { data } = await supabase.from("whatsapp_conversas").select("jid, ultima_recebida_at").in("jid", [...new Set(enviados.map(l => l.jid))])
  const recebida = new Map((data ?? []).map(c => [c.jid, c.ultima_recebida_at as string | null]))
  return ["Resposta", "F1", "F2", "F3"].map(passo => {
    const doPasso = enviados.filter(l => (l.passo ?? "Resposta") === passo)
    return { passo, enviados: doPasso.length, responderam: doPasso.filter(l => (recebida.get(l.jid) ?? "") > l.em).length }
  }).filter(t => t.enviados)
}

export async function GET() {
  const cfg = await lerConfigAtendente() as Cfg
  const log = cfg.agenteLog ?? []
  return NextResponse.json({ auto: cfg.agenteAuto ?? { ligado: false }, log: log.slice(0, 80), taxas: await taxas(log) })
}

export type Simulacao = { jid: string; nome: string | null; ultima: string; perfil: PerfilLead; quantidade: number | null; motivo: string; resposta: string; enviaria: boolean; trava: string | null }

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as Partial<AgenteAuto> & { simular?: boolean }
  if (!b.simular) {
    const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
    const d = (data?.data ?? {}) as Record<string, unknown> & Cfg
    const auto: AgenteAuto = { ...(d.agenteAuto ?? { ligado: false }), ...(typeof b.ligado === "boolean" ? { ligado: b.ligado } : {}), ...(b.esperaSeg ? { esperaSeg: b.esperaSeg } : {}), ...(b.maxPorDia ? { maxPorDia: b.maxPorDia } : {}), ...(typeof b.vitrine === "string" ? { vitrine: b.vitrine.trim().slice(0, 400) } : {}) }
    await supabase.from("AppConfig").update({ data: { ...d, agenteAuto: auto } }).eq("id", 1)
    return NextResponse.json({ auto })
  }

  // Leads recentes cuja última mensagem é deles (esperando resposta)
  const cfg = await lerConfigAtendente()
  const { data: convs } = await supabase.from("whatsapp_conversas").select("jid, nome, ultima_msg, ultima_recebida_at, ultima_enviada_at")
    .not("ultima_recebida_at", "is", null).order("ultima_recebida_at", { ascending: false }).limit(40)
  const esperando = (convs ?? []).filter(c => !c.jid.endsWith("@g.us") && (!c.ultima_enviada_at || c.ultima_recebida_at > c.ultima_enviada_at)).slice(0, 6)
  const precos = valoresEmReais(filtroEfetivo(cfg.filtroLeads))
  const out = await Promise.all(esperando.map(async (c): Promise<Simulacao | null> => {
    const a = await atender(c.jid, { cfg, automatico: true }).catch(() => null)
    if (!a?.ok) return null
    const { r, conversa } = a
    const nova = !!conversa.primeiraEm && Date.now() - new Date(conversa.primeiraEm).getTime() < 4 * 86_400_000
    const trava = travaDoEnvio({
      ligado: true, resposta: r.resposta, alerta: r.alerta, podeSozinho: r.pode_enviar_sozinho, lead: r.lead,
      conversaNova: nova, clienteCadastrado: conversa.clienteCadastrado, manualRecente: false,
      enviadasHoje: 0, maxPorDia: 6, jaEncerrouPequeno: false, precosDoFiltro: precos,
    })
    return { jid: c.jid, nome: c.nome, ultima: c.ultima_msg ?? "", perfil: r.lead.perfil, quantidade: r.lead.quantidade_total, motivo: r.lead.motivo, resposta: r.resposta, enviaria: !trava, trava }
  }))
  return NextResponse.json({ simulacao: out.filter(Boolean) })
}
