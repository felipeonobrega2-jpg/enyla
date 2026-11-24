// Leitura e gravação do estado do lead em dados_sistema (coleção leadEstado). Sem DELETE: só insert/update.
import { supabase } from "./supabase"
import { COLECAO_LEAD, type EstadoLead } from "./leadEstado"

export async function lerEstadoLead(jid: string): Promise<EstadoLead | null> {
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", COLECAO_LEAD).eq("id", jid).maybeSingle()
  return (data?.dados as EstadoLead) ?? null
}

export async function lerEstadosLead(): Promise<Map<string, EstadoLead>> {
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", COLECAO_LEAD).limit(2000)
  return new Map((data ?? []).map(r => [(r.dados as EstadoLead).jid, r.dados as EstadoLead]))
}

export async function gravarEstadoLead(e: EstadoLead) {
  const { data: atual } = await supabase.from("dados_sistema").select("v").eq("colecao", COLECAO_LEAD).eq("id", e.jid).maybeSingle()
  const agora = new Date().toISOString()
  const { error } = atual
    ? await supabase.from("dados_sistema").update({ dados: e, v: (atual.v ?? 0) + 1, atualizado_em: agora }).eq("colecao", COLECAO_LEAD).eq("id", e.jid)
    : await supabase.from("dados_sistema").insert({ colecao: COLECAO_LEAD, id: e.jid, dados: e, v: 1, atualizado_em: agora })
  if (error) throw new Error(error.message)
}
