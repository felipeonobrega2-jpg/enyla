// Dias parado de um orçamento (só exibição): dias desde a última movimentação.
// Movimentação = última mensagem (nossa ou do cliente) da conversa do WhatsApp ligada ao card, ou o fechamento/data
// do card, o que for mais recente. A mudança de coluna não tem carimbo próprio no banco (sem migração); o fechamento
// é o único marco de status gravado. Puro: quem chama passa os dados.
import { parseData } from "./negocio"

export type MovimentoConversa = { recebida: string | null; enviada: string | null }
export type MapaConversas = Record<string, MovimentoConversa>

const DIA = 86_400_000

const tempo = (s: string | null | undefined): number | null => {
  if (!s) return null
  const iso = /^\d{4}-\d{2}-\d{2}T/.test(s) ? new Date(s) : parseData(s)
  const t = iso?.getTime()
  return t == null || isNaN(t) ? null : t
}

/** Momento (ms) da última movimentação, ou null se nenhuma data é válida. */
export function ultimaMovimentacao(
  card: { data?: string | null; dataFechamento?: string | null },
  conversa?: MovimentoConversa | null,
): number | null {
  const ts = [tempo(card.data), tempo(card.dataFechamento), tempo(conversa?.recebida), tempo(conversa?.enviada)].filter((t): t is number => t != null)
  return ts.length ? Math.max(...ts) : null
}

/** Dias inteiros desde a última movimentação (0 se hoje ou futuro); null se não há data. */
export function diasParado(
  card: { data?: string | null; dataFechamento?: string | null },
  conversa?: MovimentoConversa | null,
  agora = Date.now(),
): number | null {
  const t = ultimaMovimentacao(card, conversa)
  return t == null ? null : Math.max(0, Math.floor((agora - t) / DIA))
}
