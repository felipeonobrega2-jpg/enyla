// Orçado pelo Felipe: ele já mandou o orçamento pelo WhatsApp. Função pura sobre as mensagens da conversa.
// Vale mensagem enviada pelo número da ENYLA e NÃO escrita pelo agente (o agente guarda os ids do que ele manda,
// o mesmo critério que o sistema usa para separar o Felipe do agente) com PDF/documento ou preço (R$ com valor),
// depois da última pergunta de preço ou medida do lead. O que é orçamento vem de metaMql (não duplica regex).

import { ehMsgDeOrcamento, ehMsgAutomatica } from "./metaMql"

export type MsgOrcado = { id?: string | null; from_me: boolean; tipo: string | null; ts: string; corpo: string | null }
export type OrcadoPeloFelipe = { orcado: boolean; em: string | null; evidencia: string | null }

// O lead perguntando preço, orçamento ou medida (ou mandando a medida)
const PERGUNTA = /(quanto|valor|pre[çc]o|or[çc]amento|cota[çc][ãa]o|cotar|medida|tamanho|\d\s?(x|cm|mm)\b)/i

export function orcadoPeloFelipe(msgs: MsgOrcado[], idsDoAgente: Iterable<string> = []): OrcadoPeloFelipe {
  const agente = idsDoAgente instanceof Set ? idsDoAgente : new Set(idsDoAgente)
  const ord = [...msgs].filter(m => !ehMsgAutomatica(m)).sort((a, b) => a.ts.localeCompare(b.ts))
  const pergunta = [...ord].reverse().find(m => !m.from_me && PERGUNTA.test(m.corpo ?? ""))?.ts ?? ""
  const m = ord.find(x => x.from_me && x.ts > pergunta && !(x.id && agente.has(x.id)) && ehMsgDeOrcamento(x))
  if (!m) return { orcado: false, em: null, evidencia: null }
  const texto = (m.corpo ?? "").replace(/\s+/g, " ").trim()
  const evidencia = /document/i.test(m.tipo ?? "") ? `PDF/documento${texto ? `: ${texto.slice(0, 60)}` : ""}` : texto.slice(0, 80)
  return { orcado: true, em: m.ts, evidencia }
}
