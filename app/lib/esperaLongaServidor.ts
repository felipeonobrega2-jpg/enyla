// Espera longa (24 h+): lê as conversas e os pedidos ativos, grava o aviso interno em dados_sistema (sem migração) e
// deixa a lista para a leitura do COO. Nada aqui fala com o cliente: o aviso vira item da caixa de entrada do Felipe
// (Painel e resumo das 8h, 13h e 18h), o mesmo canal da rotina "Ninguém sem resposta".
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { COL_FECHADO, COL_ENTREGUE } from "../types"
import { esperaLonga, deveAvisarEsperaLonga, type EsperaLonga } from "./esperando"

export type EsperaLongaGravada = { em: string; itens: (EsperaLonga & { avisadoEm?: string })[] }

// jid → número do pedido ativo (digital: não cancelado, não enviado, não teste; offset: fechado e ainda não entregue)
export async function pedidosAtivosPorConversa(pedidosDigitais: { id: string; jid: string; status: string; teste?: boolean }[] | undefined): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const { data: cvs } = await supabase.from("whatsapp_conversas").select("jid, kanban_card_id").not("kanban_card_id", "is", null).limit(3000)
  const ids = [...new Set((cvs ?? []).map(c => c.kanban_card_id as string))]
  const ativos = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("KanbanCard").select("id, numero, coluna").in("id", ids.slice(i, i + 200)).gte("coluna", COL_FECHADO).lt("coluna", COL_ENTREGUE)
    for (const k of data ?? []) ativos.set(k.id as string, k.numero as string)
  }
  for (const c of cvs ?? []) { const n = ativos.get(c.kanban_card_id as string); if (n) out[c.jid as string] = n }
  for (const p of pedidosDigitais ?? []) if (!p.teste && !["cancelado", "enviado"].includes(p.status) && p.jid) out[p.jid] = p.id
  return out
}

export async function listarEsperaLonga(pedidosDigitais: Parameters<typeof pedidosAtivosPorConversa>[0], agora = new Date()): Promise<EsperaLonga[]> {
  const { ehSeguraSemIA } = await import("./agenteLeads")
  const { data } = await supabase.from("whatsapp_conversas").select("jid, nome, etiquetas, status_lead, ultima_msg, ultima_recebida_at, ultima_enviada_at, proxima_acao, fechada_em")
    .not("jid", "like", "%@g.us").lt("ultima_recebida_at", new Date(agora.getTime() - 24 * 3600_000).toISOString()).order("ultima_recebida_at", { ascending: false }).limit(2000)
  // O "já te respondo" automático não é resposta
  const convs = (data ?? []).map(c => ehSeguraSemIA(c.ultima_msg as string | null) ? { ...c, ultima_enviada_at: null, ultima_msg: "" } : c)
  return esperaLonga(convs as never, await pedidosAtivosPorConversa(pedidosDigitais), agora.getTime())
}

// Vigia: atualiza a lista e marca quem deve ser avisado hoje (no máximo uma vez por dia por conversa)
export async function avisarEsperaLonga(cfg: { pedidosDigitais?: Parameters<typeof pedidosAtivosPorConversa>[0]; esperaLongaAvisada?: Record<string, string> }, agora = new Date()) {
  const lista = await listarEsperaLonga(cfg.pedidosDigitais, agora)
  const avisadas = cfg.esperaLongaAvisada ?? {}
  const novas = lista.filter(e => deveAvisarEsperaLonga(e.jid, avisadas, agora.getTime()))
  const em = agora.toISOString()
  await mudarConfig((d: { esperaLongaAvisada?: Record<string, string>; esperaLonga?: EsperaLongaGravada }) => {
    const m = { ...(d.esperaLongaAvisada ?? {}) }
    for (const e of lista) if (deveAvisarEsperaLonga(e.jid, m, agora.getTime())) m[e.jid] = em
    for (const k of Object.keys(m)) if (!lista.some(e => e.jid === k) && agora.getTime() - new Date(m[k]).getTime() > 2 * 86_400_000) delete m[k]
    return { esperaLongaAvisada: m, esperaLonga: { em, itens: lista.map(e => ({ ...e, avisadoEm: m[e.jid] })) } satisfies EsperaLongaGravada }
  })
  return { esperandoMais24h: lista.length, comPedido: lista.filter(e => e.pedido).length, avisadas: novas.length }
}
