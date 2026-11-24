// Quem o Follow-up que já existe enxerga a mais por causa do estado do lead: os orçados pelo Felipe (detectados nas
// mensagens ou marcados à mão), contando a partir da data do orçamento, e quem está perdido (fora). Não envia nada:
// o Follow-up segue as regras, a cota e o horário dele.
import { supabase } from "./supabase"
import { lerEstadosLead } from "./leadEstadoServidor"
import { lerIdsAgente } from "./registroAgente"
import { orcadoPeloFelipe } from "./orcadoPeloFelipe"
import { perdidoAtivo, orcadoManualAtivo } from "./leadEstado"

const cache = new Map<string, { chave: string; em: string | null }>()
const POR_RODADA = 25

export async function leadsDoFollowUp(dias: number, jaDoAgente: Set<string>, idsAgenteCfg: string[] = []): Promise<{ perdidos: Set<string>; orcados: Map<string, string> }> {
  const perdidos = new Set<string>(), orcados = new Map<string, string>()
  const estados = await lerEstadosLead().catch(() => new Map())
  const { data: convs } = await supabase.from("whatsapp_conversas").select("jid, status_lead, ultima_recebida_at, ultima_enviada_at, fechada_em")
    .not("jid", "like", "%@g.us").not("ultima_enviada_at", "is", null).gte("ultima_enviada_at", new Date(Date.now() - dias * 86_400_000).toISOString())
    .order("ultima_enviada_at", { ascending: false }).limit(200)
  const ids = new Set((await lerIdsAgente().catch(() => null)) ?? idsAgenteCfg)
  let lidos = 0
  for (const c of (convs ?? []) as { jid: string; status_lead: string | null; ultima_recebida_at: string | null; ultima_enviada_at: string; fechada_em: string | null }[]) {
    const est = estados.get(c.jid)
    if (perdidoAtivo(est, c.ultima_recebida_at)) { perdidos.add(c.jid); continue }
    const manual = orcadoManualAtivo(est, c.ultima_recebida_at)
    if (manual) { orcados.set(c.jid, manual.em); continue }
    // Detecção só onde o Follow-up poderia agir: o Felipe falou por último e o agente ainda não cuida da conversa
    if (jaDoAgente.has(c.jid) || c.fechada_em || (c.ultima_recebida_at && c.ultima_recebida_at >= c.ultima_enviada_at)) continue
    if (["descartado", "perdido", "orcamento", "negociando", "pedido"].includes(c.status_lead ?? "")) continue
    const chave = `${c.ultima_enviada_at}|${c.ultima_recebida_at ?? ""}`
    let e = cache.get(c.jid)
    if (!e || e.chave !== chave) {
      if (lidos >= POR_RODADA) continue
      lidos++
      const { data } = await supabase.from("whatsapp_mensagens").select("id, from_me, tipo, ts, corpo").eq("jid", c.jid).order("ts", { ascending: false }).limit(120)
      e = { chave, em: orcadoPeloFelipe((data ?? []) as never, ids).em }
      cache.set(c.jid, e)
    }
    if (e.em) orcados.set(c.jid, e.em)
  }
  return { perdidos, orcados }
}
