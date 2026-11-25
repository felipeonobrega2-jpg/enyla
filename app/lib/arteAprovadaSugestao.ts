// Digital: o cliente aprova a arte ou a prova pelo WhatsApp, mas o pedido não fica sabendo. Aqui só a regra pura que
// transforma a resposta do cliente em SUGESTÃO de "arte aprovada". Nada é gravado e nenhuma mensagem sai: quem muda o
// pedido é o clique de uma pessoa (ver arteAprovadaServidor.ts).

export type MsgZap = { id: string; ts: string; from_me: boolean; tipo?: string | null; corpo?: string | null }
export type PedidoSug = { id: string; jid: string; status: string; sinalPagoEm?: string; arteAprovadaEm?: string }
export type DecisaoSug = { pedido: string; msgId: string; decisao: "confirmada" | "descartada"; por: string; em: string }
export type SugestaoArte = { pedido: string; msgId: string; trecho: string; em: string; ambigua: boolean; candidatos: string[] }

const STATUS_OK = ["sinal_pago", "arte"]

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()

const APROVA = [
  /\baprovad[oa]s?\b/, /\baprovo\b/, /\bpode seguir\b/, /\bpode prosseguir\b/, /\bpode sim\b/, /\bpode imprimir\b/,
  /\bpode fazer (uma |a )?prova\b/, /\bpode mandar (imprimir|produzir)\b/, /\bpode produzir\b/,
]
const NEGA = /\bnao (esta |foi |esta |e )?aprovad|\bnao aprovo\b|\bnao pode\b|\bainda nao\b/
// Pedido de mudança na mesma mensagem: não é aprovação
const MUDANCA = /\b(mud\w+|troc\w+|alter\w+|ajust\w+|corrig\w+|tir(ar|e|a)|aument\w+|diminu\w+|trocar|colocar|coloque|coloca|acrescent\w+|retir\w+|mas|porem|so que|so falta|falta)\b/

/** A mensagem do cliente é uma aprovação (sem pergunta, sem negação e sem pedido de mudança)? */
export function ehAprovacao(corpo: string | null | undefined): boolean {
  if (!corpo || corpo.includes("?")) return false
  const t = norm(corpo)
  if (NEGA.test(t) || MUDANCA.test(t)) return false
  return APROVA.some(r => r.test(t))
}

const ehArteDaEmpresa = (m: MsgZap) => m.from_me && /^(image|document)/i.test(m.tipo ?? "")

/** Trecho curto da mensagem (até 120 caracteres). */
export const trechoDe = (corpo: string) => { const c = corpo.replace(/\s+/g, " ").trim(); return c.length > 120 ? c.slice(0, 119) + "…" : c }

/** Primeira aprovação do cliente depois da última arte/prova enviada pela empresa (msgs em ordem de tempo). */
export function aprovacaoNaConversa(msgs: MsgZap[], depoisDe?: string): MsgZap | null {
  const ord = [...msgs].sort((a, b) => a.ts.localeCompare(b.ts))
  let i = -1
  ord.forEach((m, k) => { if (ehArteDaEmpresa(m) && (!depoisDe || m.ts >= depoisDe)) i = k })
  if (i < 0) return null
  return ord.slice(i + 1).find(m => !m.from_me && ehAprovacao(m.corpo)) ?? null
}

/** Sugestões pendentes. Pedidos de uma mesma conversa (mesmo jid) com a mesma mensagem entram como ambíguos. */
export function sugestoesDeArte(pedidos: PedidoSug[], msgsPorJid: Record<string, MsgZap[]>, decisoes: DecisaoSug[] = []): SugestaoArte[] {
  const usadas = new Set(decisoes.map(d => d.msgId))
  const elegiveis = pedidos.filter(p => STATUS_OK.includes(p.status) && !p.arteAprovadaEm)
  const achadas = elegiveis.flatMap(p => {
    const m = aprovacaoNaConversa(msgsPorJid[p.jid] ?? [], p.sinalPagoEm)
    return m && !usadas.has(m.id) ? [{ p, m }] : []
  })
  return achadas.map(({ p, m }) => {
    const candidatos = achadas.filter(x => x.p.jid === p.jid && x.m.id === m.id).map(x => x.p.id)
    return { pedido: p.id, msgId: m.id, trecho: trechoDe(m.corpo ?? ""), em: m.ts, ambigua: candidatos.length > 1, candidatos }
  })
}

/** O que o clique em "Confirmar arte aprovada" faz no pedido: só marca a aprovação (quando e por quem). Etapa e resto intactos. */
export function confirmarArteAprovada<T extends { status: string; arteAprovadaEm?: string }>(p: T, s: Pick<SugestaoArte, "em" | "trecho">, por: string, em: string): (T & { arteAprovadaEm: string; arteAprovadaPor: { por: string; em: string; trecho: string } }) | null {
  if (!STATUS_OK.includes(p.status) || p.arteAprovadaEm) return null
  return { ...p, arteAprovadaEm: s.em, arteAprovadaPor: { por, em, trecho: s.trecho } }
}

/** Aprovações que podem ser gravadas na hora, sem clique: só as NÃO ambíguas (um único pedido esperando naquele jid). */
export const aprovacoesSemAmbiguidade = (pedidos: PedidoSug[], msgsPorJid: Record<string, MsgZap[]>, decisoes: DecisaoSug[] = []) =>
  sugestoesDeArte(pedidos, msgsPorJid, decisoes).filter(s => !s.ambigua)
