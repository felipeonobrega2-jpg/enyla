// Porta externa (só leitura): data de entrada em cada etapa da produção, a partir de Tracking.etapas
// (o mesmo histórico que /api/prazos-producao lê). Funções puras: nada é gravado aqui.
// Dias úteis: o mesmo critério de diasUteis.ts (seg a sex, fora feriados).
import { diasUteisEntre } from "./diasUteis"
import type { MovimentoFornecedor } from "./producao"
import type { Rodada } from "./rateioRodada"
import { estatistica, type EtapaRastreio, type Rastreio } from "./prazoProducao"

export type CardProducao = { numero: string; chave?: string; nomeCliente?: string; coluna: number; dataEntregaPrevista?: string | null; aguardandoPagamento?: unknown }
export type LoteFornecedor = { rodadaId?: string; fornecedor: string; enviadoEm: string; retornoEm: string | null }
export type Passagem = { etapa: string; entrou: string; saiu: string | null; diasUteis: number }

const LIMITE = 7000
const JANELA_DIAS = 90
const ACIMA = 1.5
const isoDe = (dataHora: string) => {
  const [d, m, y] = (dataHora ?? "").split(",")[0].trim().split("/")
  return y && m && d ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : null
}
/** Hoje em Brasília, "aaaa-mm-dd". */
export const hojeBrasilia = (agora = new Date()) => agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const somaDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

type Estadia = { coluna: number; entrou: string; saiu: string | null }

/** Sequência de estadias por coluna (só mudanças de coluna), na ordem do histórico. */
export function estadias(etapas: EtapaRastreio[]): Estadia[] {
  const out: Estadia[] = []
  for (const e of etapas ?? []) {
    if ((e.tipo && e.tipo !== "coluna") || !isoDe(e.dataHora)) continue
    if (out.length && out[out.length - 1].coluna === e.coluna) continue
    if (out.length) out[out.length - 1].saiu = e.dataHora
    out.push({ coluna: e.coluna, entrou: e.dataHora, saiu: null })
  }
  return out
}

const diasDe = (e: Estadia, hoje: string) => Math.max(0, diasUteisEntre(isoDe(e.entrou)!, e.saiu ? isoDe(e.saiu)! : hoje))
// Pedido lançado de uma vez (3+ etapas no mesmo dia) não diz nada sobre prazo
const deUmaVez = (es: Estadia[]) => es.length >= 3 && new Set(es.map(e => isoDe(e.entrou))).size === 1

/** Mediana de dias úteis por etapa, com pedidos entregues nos últimos 90 dias. */
export function prazoMedioPorEtapa(rastreios: Rastreio[], nomes: string[], hoje: string): Record<string, number> {
  const corte = somaDias(hoje, -JANELA_DIAS)
  const porEtapa = new Map<number, number[]>()
  for (const r of rastreios) {
    const es = estadias(r.etapas)
    const entregue = es.find(e => e.coluna === 9)
    if (!entregue || isoDe(entregue.entrou)! < corte || deUmaVez(es)) continue
    for (const e of es) if (e.coluna < 9 && e.saiu) porEtapa.set(e.coluna, [...(porEtapa.get(e.coluna) ?? []), diasDe(e, hoje)])
  }
  const out: Record<string, number> = {}
  for (const [c, v] of [...porEtapa].sort((a, b) => a[0] - b[0])) out[nomes[c] ?? String(c)] = estatistica(v)!.mediana
  return out
}

/** Envios do pedido a fornecedor: fornecedor, data de envio e data de retorno (a da rodada, se houver; senão a de recebimento). */
function lotesDoPedido(c: CardProducao, l?: { movimentos?: MovimentoFornecedor[]; rodadas?: Rodada[]; nomeFornecedor?: (id: string) => string }): LoteFornecedor[] {
  if (!l?.movimentos?.length) return []
  if (!c.chave) return []
  return l.movimentos.filter(m => m.pedidoKey === c.chave).map(m => {
    const rod = m.rodadaId ? l.rodadas?.find(r => r.id === m.rodadaId) : undefined
    return { ...(m.rodadaId ? { rodadaId: m.rodadaId } : {}), fornecedor: l.nomeFornecedor?.(m.fornecedorId) ?? m.fornecedorId,
      enviadoEm: m.enviadoEm ?? rod?.enviadoEm ?? "", retornoEm: rod?.retornoEm ?? m.recebidoEm ?? null }
  })
}

/** JSON do detalhe da produção (até 7000 caracteres: se passar, tira o histórico por etapa e depois pedidos). */
export function detalheProducao(cards: CardProducao[], rastreios: Rastreio[], nomes: string[], hoje = hojeBrasilia(), lotes?: { movimentos?: MovimentoFornecedor[]; rodadas?: Rodada[]; nomeFornecedor?: (id: string) => string }): string {
  const medio = prazoMedioPorEtapa(rastreios, nomes, hoje)
  const porNumero = new Map(rastreios.map(r => [r.numero, r.etapas]))
  const pedidos = cards.map(c => {
    const es = estadias(porNumero.get(c.numero) ?? [])
    const atual = [...es].reverse().find(e => e.coluna === c.coluna && !e.saiu)
    const etapa = nomes[c.coluna] ?? String(c.coluna)
    const dias = atual ? diasDe(atual, hoje) : null
    const mediana = medio[etapa]
    const envios = lotesDoPedido(c, lotes)
    return {
      numero: c.numero, cliente: c.nomeCliente, etapa, entregaPrevista: c.dataEntregaPrevista ?? null, aguardandoPagamento: c.aguardandoPagamento ?? null,
      naEtapaDesde: atual?.entrou ?? null, diasUteisNaEtapa: dias,
      acimaDoNormal: dias != null && mediana != null && dias > mediana * ACIMA,
      ...(envios.length ? { lotes: envios } : {}),
      etapas: es.map<Passagem>(e => ({ etapa: nomes[e.coluna] ?? String(e.coluna), entrou: e.entrou, saiu: e.saiu, diasUteis: diasDe(e, hoje) })),
    }
  })
  const monta = (p: unknown[]) => JSON.stringify({ prazoMedioPorEtapa: medio, pedidos: p })
  let s = monta(pedidos)
  if (s.length <= LIMITE) return s
  // 1) sem o histórico por etapa; 2) acima do normal primeiro, e corta pedidos até caber
  const enxutos = pedidos.map(({ etapas: _etapas, ...resto }) => resto).sort((a, b) => Number(b.acimaDoNormal) - Number(a.acimaDoNormal))
  s = monta(enxutos)
  if (s.length <= LIMITE) return s
  let n = enxutos.length
  while (n > 0 && JSON.stringify({ prazoMedioPorEtapa: medio, pedidos: enxutos.slice(0, n), omitidos: enxutos.length - n }).length > LIMITE) n--
  return JSON.stringify({ prazoMedioPorEtapa: medio, pedidos: enxutos.slice(0, n), omitidos: enxutos.length - n })
}
