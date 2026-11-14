// Bom negócio (MQL) que passou a quantidade e só o ml (ou nem isso) e está esperando: a proposta não sai sem a medida
// (nunca cota só pelo ml) e ninguém pedia. O agente pede a medida uma vez, na sua voz; quando ele responder, a
// proposta fica pronta para você aprovar. Só quando você não está na conversa. Aqui só as regras puras.
import type { DadosPedido } from "./atendente"
import { caixaDosDados } from "./propostaPronta"
import { qualidadeDoLead } from "./marketing"

export const HORAS_ESPERA_MIN = 2        // dá 2 h para você responder primeiro
export const HORAS_ESPERA_MAX = 72       // depois disso já é retomada, não pergunta de medida
export const MINUTOS_ENTRE_PEDIDOS = 10

export type ConvMedida = {
  jid: string; nome: string | null; status_lead: string | null; etiquetas: string[] | null
  ultima_recebida_at: string | null; ultima_enviada_at: string | null; dados: DadosPedido | null; etapa: string | null
}

export function devePedirMedida(c: ConvMedida, ja: Record<string, string>, vinculados: Set<string>, agora = Date.now()): boolean {
  if (/@g\.us$|@broadcast|@newsletter/.test(c.jid) || ja[c.jid] || vinculados.has(c.jid)) return false
  if (qualidadeDoLead(c) !== "mql" || ["pedido", "perdido", "descartado"].includes(c.status_lead ?? "")) return false
  const d = c.dados
  if (!d?.quantidade || d.quantidade < 1 || caixaDosDados(d)) return false
  if (!d.volume_ml && !d.produto) return false                 // nem sabe o que é: a conversa é sua
  const r = c.ultima_recebida_at
  if (!r || (c.ultima_enviada_at && c.ultima_enviada_at > r)) return false   // ele falou por último
  const h = (agora - new Date(r).getTime()) / 3_600_000
  return h >= HORAS_ESPERA_MIN && h <= HORAS_ESPERA_MAX
}

const primeiroNome = (n: string | null) => {
  const x = (n ?? "").trim().split(/\s+/)[0] ?? ""
  return /^[A-ZÀ-Ý][a-zà-ÿ]{2,}$/.test(x) && /[aeiouáéíóúâêôãõ]/i.test(x) ? x : ""
}

export function textoPedirMedida(nome: string | null, d: DadosPedido) {
  const n = primeiroNome(nome)
  const q = d.quantidade!.toLocaleString("pt-BR")
  const doQue = d.volume_ml ? ` para o frasco de ${d.volume_ml} ml` : d.produto ? ` para ${d.produto}` : ""
  const medida = d.volume_ml ? "a altura e a largura (ou o diâmetro) do frasco, em cm" : "a altura, a largura e a profundidade do produto, em cm"
  return `Oi${n ? `, ${n}` : ""}! Pra eu te passar o valor certinho das ${q} caixas${doQue}, me manda ${medida}? Uma foto ao lado de uma régua também serve.`
}
