// A última mensagem de verdade de uma conversa, num lugar só (vigia, Atendente e retomada de parados).
// 25/11: duas mensagens do lead no mesmo segundo (mesmo `ts`) faziam cada consulta devolver uma diferente: o vigia
// despachava a resposta para uma, o Atendente achava que a outra era a última e saía calado. O desempate é sempre
// ts, criado_em e id (todos decrescentes), igual em quem consulta.
import { supabase } from "./supabase"
import { ehMensagemAutomaticaDoWhatsapp, ehSaudacaoAutomaticaDoLead } from "./agenteLeads"

type Ordenavel<T> = { order: (coluna: string, opts: { ascending: boolean }) => T }

// Mais recente primeiro, com desempate determinístico
export function maisRecentesPrimeiro<T extends Ordenavel<T>>(q: T): T {
  return q.order("ts", { ascending: false }).order("criado_em", { ascending: false }).order("id", { ascending: false })
}

export type MensagemReal = { id: string; from_me: boolean; ts: string; corpo: string | null; tipo: string | null }

// Sem o "Estou fora do horário" do WhatsApp Business (sai como se fosse sua) e sem a saudação automática do lead
export function primeiraReal<M extends { from_me: boolean; corpo: string | null; tipo?: string | null }>(msgs: M[]): M | undefined {
  return msgs.find(m => !(m.from_me && ehMensagemAutomaticaDoWhatsapp(m.corpo, m.tipo ?? null)) && !(!m.from_me && ehSaudacaoAutomaticaDoLead(m.corpo)))
}

export async function ultimaMensagemReal(jid: string): Promise<MensagemReal | undefined> {
  const { data } = await maisRecentesPrimeiro(supabase.from("whatsapp_mensagens").select("id, from_me, ts, corpo, tipo").eq("jid", jid)).limit(8)
  return primeiraReal((data ?? []) as MensagemReal[])
}
