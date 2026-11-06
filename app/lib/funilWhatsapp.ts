// Funil de conversas do WhatsApp (antes da venda): em que etapa cada lead está.
//   Automático: sem resposta sua = Novo; você respondeu = Em conversa; cliente ligado com orçamento aberto =
//   Orçamento enviado; card quente = Negociando; card fechado = Virou pedido; 14 dias sem o cliente falar = Perdido.
//   À mão: arrastar para uma etapa vale até o cliente voltar a falar depois de "Perdido".
//   Agente de leads: lead qualificado vai para MQL (você atende); lead pequeno vai para Descartado.
//   MQL anda sozinho quando o cliente ganha orçamento/pedido.
//   Sinais: "responder" (cliente falou por último) e "esfriando" (você falou por último há 3+ dias).

import { KanbanCard, COL_HOT, COL_PERDIDO } from "../types"
import { parseData } from "./negocio"

export type Etapa = "novo" | "mql" | "conversa" | "orcamento" | "negociando" | "pedido" | "perdido" | "descartado"
export const ETAPAS: { id: Etapa; nome: string }[] = [
  { id: "novo", nome: "Novo" },
  { id: "mql", nome: "MQL" },
  { id: "conversa", nome: "Em conversa" },
  { id: "orcamento", nome: "Orçamento enviado" },
  { id: "negociando", nome: "Negociando" },
  { id: "pedido", nome: "Virou pedido" },
  { id: "perdido", nome: "Perdido" },
  { id: "descartado", nome: "Descartado" },
]
const ORDEM = ETAPAS.map(e => e.id)

export const DIAS_ESFRIANDO = 3
export const DIAS_PERDIDO = 14

export type ConversaFunil = {
  ultima_recebida_at?: string | null
  ultima_enviada_at?: string | null
  status_lead?: string | null
  ultima_classificacao_at?: string | null
}

export type PosicaoFunil = { etapa: Etapa; manual: boolean; responder: boolean; esfriando: boolean; card?: KanbanCard; valor?: number }

const dias = (iso: string | null | undefined, hoje: Date) => iso ? (hoje.getTime() - new Date(iso).getTime()) / 86_400_000 : Infinity

// Etapa pelos cards do cliente ligado (o mais recente manda)
function etapaDosCards(cards: KanbanCard[]): { etapa: Etapa; card: KanbanCard } | null {
  const vivos = cards.filter(c => !c.isTerceirizado)
  if (!vivos.length) return null
  const card = [...vivos].sort((a, b) => (parseData(b.data)?.getTime() ?? 0) - (parseData(a.data)?.getTime() ?? 0))[0]
  if (card.coluna === COL_PERDIDO) return { etapa: "perdido", card }
  if (card.coluna === COL_HOT) return { etapa: "negociando", card }
  if (card.coluna === 0) return { etapa: "orcamento", card }
  return { etapa: "pedido", card }
}

export function posicaoNoFunil(c: ConversaFunil, cardsDoCliente: KanbanCard[], hoje = new Date()): PosicaoFunil {
  const recebida = c.ultima_recebida_at ?? null, enviada = c.ultima_enviada_at ?? null
  const responder = !!recebida && (!enviada || recebida > enviada)
  const pelosCards = etapaDosCards(cardsDoCliente)

  let etapa: Etapa = pelosCards?.etapa ?? (enviada ? "conversa" : "novo")
  // Sem o cliente falar há 14 dias e sem pedido: perdido
  if (etapa !== "pedido" && dias(recebida, hoje) >= DIAS_PERDIDO) etapa = "perdido"

  // Etapa escolhida à mão vale, a menos que seja "perdido" e o cliente tenha voltado a falar depois
  let manual = false
  const escolhida = ORDEM.includes(c.status_lead as Etapa) ? c.status_lead as Etapa : null
  if (escolhida) {
    const voltou = escolhida === "perdido" && !!recebida && !!c.ultima_classificacao_at && recebida > c.ultima_classificacao_at
    const andou = escolhida === "mql" && !!pelosCards    // MQL que ganhou orçamento segue pelos cards
    if (!voltou && !andou) { etapa = escolhida; manual = true }
  }

  const ativa = etapa === "mql" || etapa === "conversa" || etapa === "orcamento" || etapa === "negociando"
  const esfriando = ativa && !responder && dias(enviada, hoje) >= DIAS_ESFRIANDO
  const card = pelosCards?.card
  return { etapa, manual, responder: responder && etapa !== "perdido" && etapa !== "descartado", esfriando, card, valor: card && etapa !== "novo" && etapa !== "conversa" ? card.preco : undefined }
}

// Conversa fechada: some da lista e do funil até o cliente escrever depois de fechada
export const estaFechada = (c: { fechada_em?: string | null; ultima_recebida_at?: string | null }) =>
  !!c.fechada_em && !(c.ultima_recebida_at && c.ultima_recebida_at > c.fechada_em)

// "ok", "obrigado", "👍", "valeu, show"…: confirmação, não pede resposta (todas as palavras são de confirmação)
const PALAVRAS_CONFIRMACAO = new Set(["ok", "okk", "okay", "blz", "beleza", "obrigado", "obrigada", "obrigados", "obrigadas", "muito", "obg", "brigado",
  "brigada", "valeu", "vlw", "show", "perfeito", "perfeita", "combinado", "certo", "top", "ta", "tá", "bom", "tranquilo", "fechado", "entendi",
  "otimo", "ótimo", "massa", "joia", "jóia", "de", "nada", "por", "imagina", "tmj", "demais", "legal", "maravilha", "certinho"])
export const ehSoConfirmacao = (t: string | null | undefined) => {
  const x = (t ?? "").trim()
  if (!x || x.length > 40) return false
  if (/^\[(sticker|reaction)/i.test(x)) return true
  const palavras = x.toLowerCase().replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, " ").replace(/[!.,;:?]+/g, " ").split(/\s+/).filter(Boolean)
  if (x.includes("?")) return false
  return palavras.every(p => PALAVRAS_CONFIRMACAO.has(p)) && (palavras.length > 0 || /\p{Extended_Pictographic}/u.test(x))
}

// Esperando você: o cliente falou por último, nos últimos 14 dias, conversa aberta (não vale para grupos).
// Se a última dele é só confirmação ("ok", "👍") depois de uma sua, não pede resposta.
export const aguardandoResposta = (c: { jid?: string; fechada_em?: string | null; ultima_recebida_at?: string | null; ultima_enviada_at?: string | null; ultima_msg?: string | null }, agora = Date.now()) =>
  !c.jid?.endsWith("@g.us") && !estaFechada(c) && !!c.ultima_recebida_at && (!c.ultima_enviada_at || c.ultima_recebida_at > c.ultima_enviada_at)
  && !(c.ultima_enviada_at && ehSoConfirmacao(c.ultima_msg))
  && agora - new Date(c.ultima_recebida_at).getTime() < DIAS_PERDIDO * 86_400_000
