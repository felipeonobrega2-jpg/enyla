// Funil agora: tudo o que está acontecendo, do lead à entrega, em duas linhas (offset e digital). Em cada etapa:
// quantos, quanto vale e quantos estão parados (passou do prazo ou esperando resposta). Puro: o servidor busca os dados.
import { COL_FECHADO, COL_HOT, COL_EXPEDICAO, COL_ENTREGUE, COL_PERDIDO, type KanbanCard } from "../types"
import type { Esperando } from "./esperando"

export type ItemFunil = { nome: string; sub: string; valor: number | null; jid?: string | null; cardId?: string | null; digitalId?: string | null; parado?: string | null }
export type EtapaFunil = { id: string; nome: string; quantos: number; valor: number; parados: number; itens: ItemFunil[] }
export type FunilAgora = { offset: EtapaFunil[]; digital: EtapaFunil[]; esperando: number }

type Conv = { jid: string; nome: string | null; etiquetas: string[] | null; status_lead: string | null; criado_em: string | null; ultima_at?: string | null; fechada_em?: string | null; ultima_recebida_at?: string | null; kanban_card_id?: string | null }
type Ped = { id: string; jid: string; nome?: string | null; total: number; status: string; em: string; quantidade: number; statusEm?: string; sinalPagoEm?: string; arteEnviadaEm?: string; arteAprovadaEm?: string; teste?: boolean; restantePagoEm?: string }

const DIA = 86_400_000
const dias = (iso: string | null | undefined, agora: number) => iso ? Math.floor((agora - new Date(iso).getTime()) / DIA) : 0
const soma = (xs: ItemFunil[]) => xs.reduce((t, x) => t + (x.valor ?? 0), 0)
const etapa = (id: string, nome: string, itens: ItemFunil[]): EtapaFunil =>
  ({ id, nome, quantos: itens.length, valor: soma(itens), parados: itens.filter(x => x.parado).length, itens: [...itens].sort((a, b) => Number(!!b.parado) - Number(!!a.parado) || (b.valor ?? 0) - (a.valor ?? 0)).slice(0, 60) })
const bom = (c: Conv) => c.status_lead === "mql" || (c.etiquetas ?? []).some(e => /^(ICP|Oportunidade|Lead médio|MQL)$/.test(e))
const ehDigital = (c: Conv) => (c.etiquetas ?? []).includes("Digital")
const aberta = (c: Conv) => !(c.fechada_em && (!c.ultima_recebida_at || c.fechada_em >= c.ultima_recebida_at))

export function montarFunilAgora(a: { conversas: Conv[]; cards: KanbanCard[]; pedidos: Ped[]; esperando: Esperando[]; agora?: number; hoje?: string }): FunilAgora {
  const agora = a.agora ?? Date.now()
  const hoje = a.hoje ?? new Date(agora - 3 * 3600_000).toISOString().slice(0, 10)
  const espera = new Map(a.esperando.map(e => [e.jid, e]))
  const parouConv = (jid: string) => { const e = espera.get(jid); return e ? `esperando resposta há ${e.minutos >= 1440 ? `${Math.floor(e.minutos / 1440)}d` : e.minutos >= 60 ? `${Math.floor(e.minutos / 60)}h` : `${e.minutos} min`}` : null }
  const recentes = a.conversas.filter(c => !c.jid.includes("@g.us") && aberta(c) && dias(c.ultima_at ?? c.criado_em, agora) <= 7)
  const comPedidoDigital = new Set(a.pedidos.filter(p => !p.teste).map(p => p.jid))
  const card = (k: KanbanCard, sub: string, parado: string | null = null): ItemFunil => ({ nome: k.nomeCliente, sub: `${k.numero} · ${sub}`, valor: Number(k.preco) || null, cardId: k.id, parado })
  const vivos = a.cards.filter(k => !k.isTerceirizado && k.materialNome !== "Terceirizado")
  const previsto = (k: KanbanCard) => k.dataEntregaPrevista && k.dataEntregaPrevista < hoje && k.coluna < COL_ENTREGUE ? `entrega era ${k.dataEntregaPrevista.split("-").reverse().slice(0, 2).join("/")}` : null
  const coluna = (de: number, ate: number) => vivos.filter(k => k.coluna >= de && k.coluna <= ate)

  // ── Offset ───────────────────────────────────────────────────────────────
  const leads = recentes.filter(c => !bom(c) && !ehDigital(c) && !c.kanban_card_id && !(c.etiquetas ?? []).some(e => /fornecedor|descartado|sem resposta/i.test(e)))
    .map(c => ({ nome: c.nome ?? c.jid.split("@")[0], sub: c.status_lead ? `conversa · ${c.status_lead}` : "conversa", valor: null, jid: c.jid, parado: parouConv(c.jid) }))
  const mql = recentes.filter(c => bom(c) && !c.kanban_card_id)
    .map(c => ({ nome: c.nome ?? c.jid.split("@")[0], sub: (c.etiquetas ?? []).filter(e => /ICP|Oportunidade|médio/.test(e)).join(", ") || "MQL", valor: null, jid: c.jid, parado: parouConv(c.jid) }))
  const jidDoCard = new Map(a.conversas.filter(c => c.kanban_card_id).map(c => [c.kanban_card_id as string, c.jid]))
  const propostas = vivos.filter(k => (k.coluna === 0 || k.coluna === COL_HOT) && dias((k as KanbanCard & { createdAt?: string }).createdAt ?? null, agora) <= 30)
    .map(k => { const jid = jidDoCard.get(k.id) ?? null; return { ...card(k, k.coluna === COL_HOT ? "negociando" : "proposta enviada", jid ? parouConv(jid) : null), jid } })
  const offset: EtapaFunil[] = [
    etapa("leads", "Leads (7 dias)", leads),
    etapa("mql", "MQL", mql),
    etapa("proposta", "Proposta", propostas),
    etapa("fechado", "Fechado (sinal)", coluna(COL_FECHADO, COL_FECHADO).map(k => card(k, "esperando sinal e arte", previsto(k)))),
    etapa("arte", "Arte", coluna(2, 3).map(k => card(k, k.coluna === 2 ? "arte / dieline" : "aprovação da arte", previsto(k)))),
    etapa("producao", "Produção", coluna(4, 7).map(k => card(k, ["fila de impressão", "impressão", "verniz", "acabamento"][k.coluna - 4], previsto(k)))),
    etapa("expedicao", "Expedição", coluna(COL_EXPEDICAO, COL_EXPEDICAO).map(k => card(k, "pronto para sair", previsto(k)))),
    etapa("entregue", "Entregue (30 dias)", vivos.filter(k => k.coluna === COL_ENTREGUE && !!k.dataEntregaReal && dias(k.dataEntregaReal, agora) <= 30).map(k => card(k, "entregue"))),
  ]

  // ── Digital ──────────────────────────────────────────────────────────────
  const ped = a.pedidos.filter(p => !p.teste)
  const pedItem = (p: Ped, sub: string, parado: string | null = null): ItemFunil => ({ nome: p.nome || "Cliente", sub: `${p.id} · ${p.quantidade.toLocaleString("pt-BR")} un · ${sub}`, valor: p.total, jid: p.jid, digitalId: p.id, parado })
  const leadsDig = recentes.filter(c => ehDigital(c) && !comPedidoDigital.has(c.jid))
    .map(c => ({ nome: c.nome ?? c.jid.split("@")[0], sub: "sem orçamento ainda", valor: null, jid: c.jid, parado: parouConv(c.jid) }))
  const digital: EtapaFunil[] = [
    etapa("dleads", "Leads (7 dias)", leadsDig),
    etapa("dorcamento", "Orçamento", ped.filter(p => p.status === "aguardando_sinal" && dias(p.em, agora) <= 15).map(p => pedItem(p, `há ${dias(p.em, agora)}d`, parouConv(p.jid)))),
    etapa("dsinal", "Sinal pago", ped.filter(p => p.status === "sinal_pago" || (p.status === "arte" && !p.arteEnviadaEm)).map(p => { const d = dias(p.statusEm ?? p.sinalPagoEm, agora); return pedItem(p, "arte a fazer", d >= 2 ? `arte parada há ${d}d` : null) })),
    etapa("darte", "Arte (cliente)", ped.filter(p => p.status === "arte" && !!p.arteEnviadaEm && !p.arteAprovadaEm).map(p => { const d = dias(p.arteEnviadaEm, agora); return pedItem(p, "esperando aprovar", d >= 2 ? `sem aprovar há ${d}d` : null) })),
    etapa("dproducao", "Produção", ped.filter(p => p.status === "producao").map(p => { const d = dias(p.arteAprovadaEm ?? p.statusEm, agora); return pedItem(p, p.restantePagoEm ? "restante pago" : "restante a receber", d >= 7 ? `produção há ${d}d` : null) })),
    etapa("denviado", "Enviado (30 dias)", ped.filter(p => p.status === "enviado" && !!p.statusEm && dias(p.statusEm, agora) <= 30).map(p => pedItem(p, "enviado"))),
  ]
  void COL_PERDIDO
  return { offset, digital, esperando: a.esperando.length }
}
