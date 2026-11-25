// Conversa do Felipe: nenhum agente automático e nenhuma ordem direta mandam mensagem nela (ordem de 25/11, 18h43:
// "não pode se intrometer conversa com cliente"). Quem decide é o Felipe.
// É do Felipe quando QUALQUER um vale: (1) ele escreveu nas últimas 24 h (celular ou tela, id fora dos do agente);
// (2) a última mensagem from_me (não automática) é dele, mesmo velha; (3) a conversa tem a estrela "Perto de você".
// Única exceção: a conversa que ele passou ao agente ("assuma"). NÃO use o `momento: "com_ele"` do proxima_acao:
// quer dizer "a vez é do cliente", não que o Felipe conduz.
import { ehMensagemAutomaticaDoWhatsapp } from "./agenteLeads"
import { PREFIXO_PERTO } from "./perto"

export const HORAS_CONVERSA_DO_FELIPE = 24
export type MotivoDoFelipe = "escreveu nas últimas 24 h" | "foi o último a falar" | "estrela"
export type MsgFromMe = { id: string; ts: string | number | Date; corpo: string | null; tipo?: string | null }
export type ConversaDoFelipe = { doFelipe: boolean; motivo: MotivoDoFelipe | null }

// Puro. `mensagensFromMe` em qualquer ordem; a decisão não depende dela.
export function conversaDoFelipe(a: { mensagensFromMe: MsgFromMe[]; idsDoAgente: Iterable<string>; estrela: boolean; assumida: boolean; agora?: number }): ConversaDoFelipe {
  if (a.assumida) return { doFelipe: false, motivo: null }
  const agora = a.agora ?? Date.now()
  const ids = new Set(a.idsDoAgente)
  const dele = a.mensagensFromMe
    .filter(m => !ids.has(m.id) && !ehMensagemAutomaticaDoWhatsapp(m.corpo, m.tipo))
    .map(m => new Date(m.ts).getTime())
    .filter(t => Number.isFinite(t))
  const ultimaDele = dele.length ? Math.max(...dele) : 0
  if (ultimaDele && agora - ultimaDele < HORAS_CONVERSA_DO_FELIPE * 3_600_000) return { doFelipe: true, motivo: "escreveu nas últimas 24 h" }
  if (a.estrela) return { doFelipe: true, motivo: "estrela" }
  if (ultimaDele) {
    // O último from_me não automático é dele? (o agente escrever depois devolve a conversa)
    const ultimaAgente = Math.max(0, ...a.mensagensFromMe
      .filter(m => ids.has(m.id) && !ehMensagemAutomaticaDoWhatsapp(m.corpo, m.tipo))
      .map(m => new Date(m.ts).getTime()).filter(t => Number.isFinite(t)))
    if (ultimaDele > ultimaAgente) return { doFelipe: true, motivo: "foi o último a falar" }
  }
  return { doFelipe: false, motivo: null }
}

export const textoDoFelipe = (r: ConversaDoFelipe) => `conversa do Felipe (${r.motivo})`

// Servidor: o que a função pura precisa, com consultas leves (50 from_me mais recentes; duas linhas de agente_tratadas)
export async function lerConversaDoFelipe(jid: string, cfg?: object): Promise<ConversaDoFelipe> {
  const { supabase } = await import("./supabase")
  const c = (cfg ?? await import("./agenteAuto").then(m => m.lerCfg())) as { agenteIds?: string[]; agenteLog?: { ids?: string[] }[] }
  const [{ data: msgs }, { data: marcas }] = await Promise.all([
    supabase.from("whatsapp_mensagens").select("id, ts, corpo, tipo").eq("jid", jid).eq("from_me", true)
      .order("ts", { ascending: false }).order("criado_em", { ascending: false }).order("id", { ascending: false }).limit(50),
    supabase.from("agente_tratadas").select("id").or(`id.eq.assumida|${jid},id.like.${PREFIXO_PERTO}${jid}|*`),
  ])
  const idsDoAgente = [...(c.agenteLog ?? []).flatMap(l => l.ids ?? []), ...(c.agenteIds ?? [])]
  const lista = (marcas ?? []).map(m => m.id as string)
  return conversaDoFelipe({
    mensagensFromMe: (msgs ?? []) as MsgFromMe[], idsDoAgente,
    estrela: lista.some(id => id.startsWith(`${PREFIXO_PERTO}${jid}|`)),
    assumida: lista.includes(`assumida|${jid}`),
  })
}
