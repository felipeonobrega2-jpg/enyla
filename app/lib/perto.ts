// "Perto de você": os leads que o Felipe quer ter à mão, além de serem MQL. Ele marca com a estrela (na conversa ou
// pelas sugestões do Painel) e eles ficam numa lista curta, com quem está esperando quem.
// Fica na tabela leve agente_tratadas: "perto|<jid>|<nota>" (na lista) e "pertofora|<jid>" (sugestão dispensada).
// Puro: ler as marcas, sugerir e dizer a situação de cada um.
import { ehBomNegocio, perfilDoLead } from "./etapaLead"

export const PREFIXO_PERTO = "perto|"
export const PREFIXO_FORA = "pertofora|"
export type MarcaPerto = { jid: string; nota: string; em: string }

export type ConversaPerto = {
  jid: string; nome: string | null; status_lead?: string | null; etiquetas?: string[] | null
  ultima_msg?: string | null; ultima_at?: string | null; ultima_recebida_at?: string | null; ultima_enviada_at?: string | null
  fechada_em?: string | null; kanban_card_id?: string | null
}

export const idPerto = (jid: string, nota = "") => `${PREFIXO_PERTO}${jid}|${encodeURIComponent(nota.trim().slice(0, 140))}`
export function lerMarca(id: string, em: string): MarcaPerto | null {
  if (!id.startsWith(PREFIXO_PERTO)) return null
  const resto = id.slice(PREFIXO_PERTO.length), i = resto.indexOf("|")
  if (i <= 0) return null
  let nota = ""
  try { nota = decodeURIComponent(resto.slice(i + 1)) } catch { nota = resto.slice(i + 1) }
  return { jid: resto.slice(0, i), nota, em }
}

const PESO_PERFIL = { icp: 3, oportunidade: 2, medio: 1, pequeno: 0 } as const
const FINAL = new Set(["pedido", "perdido", "descartado"])

// Sugestões: bom negócio que falou nos últimos 7 dias, ainda não está na lista nem foi dispensado. ICP e Oportunidade
// primeiro; dentro do perfil, o mais recente.
export function sugestoesPerto(convs: ConversaPerto[], naLista: Set<string>, fora: Set<string>, agora = Date.now(), dias = 7): ConversaPerto[] {
  const desde = agora - dias * 86_400_000
  return convs
    .filter(c => !naLista.has(c.jid) && !fora.has(c.jid) && !FINAL.has(c.status_lead ?? "") && ehBomNegocio(c)
      && c.ultima_at && new Date(c.ultima_at).getTime() >= desde)
    .sort((a, b) => {
      const pa = PESO_PERFIL[perfilDoLead(a) ?? "pequeno"], pb = PESO_PERFIL[perfilDoLead(b) ?? "pequeno"]
      return pb - pa || (b.ultima_at ?? "").localeCompare(a.ultima_at ?? "")
    })
}

// Quem está esperando quem: a última mensagem foi do cliente (esperando você) ou sua (esperando ele)
export function situacao(c: ConversaPerto, agora = Date.now()): { esperandoVoce: boolean; texto: string; dias: number } {
  const rec = c.ultima_recebida_at ? new Date(c.ultima_recebida_at).getTime() : 0
  const env = c.ultima_enviada_at ? new Date(c.ultima_enviada_at).getTime() : 0
  const ultima = Math.max(rec, env, c.ultima_at ? new Date(c.ultima_at).getTime() : 0)
  const dias = ultima ? Math.floor((agora - ultima) / 86_400_000) : 0
  const ha = !ultima ? "" : dias === 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`
  const esperandoVoce = rec > env
  return { esperandoVoce, dias, texto: esperandoVoce ? `esperando você${ha ? ` · ${ha}` : ""}` : `você falou por último${ha ? ` · ${ha}` : ""}` }
}

export const rotuloPerfil = (c: ConversaPerto) => ({ icp: "ICP", oportunidade: "Oportunidade", medio: "Lead médio", pequeno: "Lead pequeno" } as const)[perfilDoLead(c) ?? "pequeno"]
