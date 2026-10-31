/**
 * Modelo de negócio canônico — ÚNICA fonte das definições usadas nas telas.
 * Nenhuma view deve recontar orçamentos, pedidos, conversão, receita ou ticket
 * por conta própria: importe daqui.
 *
 * Unidades:
 *   Orçamento  = 1 card do kanban (exceto itens terceirizados, que nascem fechados)
 *   Pedido     = 1 lote fechado, ou 1 card fechado sem lote
 *
 * Estados de orçamento:
 *   Aberto     = coluna 0 ("Orçamento realizado") ou Lead quente
 *   Ganho      = colunas 1–9 (Fechado → Entregue)
 *   Perdido    = coluna 10 com motivo real (cliente recusou)
 *   Expirado   = coluna 10 por vencimento automático ("Orçamento sem conclusão")
 *
 * Datas de referência (cada métrica tem UMA):
 *   Orçamentos / conversão → data do orçamento (coorte)
 *   Vendas / receita / ticket → data de fechamento
 *   Recebido → data de pagamento
 *   Pipeline / produção → foto do momento (sem período)
 */

import {
  KanbanCard, LancamentoFinanceiro,
  COL_FECHADO, COL_ENTREGUE, COL_PERDIDO, COL_HOT, COLUNAS_KANBAN,
} from "../types"

// ─── Datas ───────────────────────────────────────────────────────────────────

export type Periodo = { from: Date | null; to: Date | null }
export const SEM_PERIODO: Periodo = { from: null, to: null }

/** Aceita "dd/mm/aaaa, hh:mm:ss" (data do orçamento) e "aaaa-mm-dd" (demais datas). */
export function parseData(s: string | null | undefined): Date | null {
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s.slice(0, 10) + "T12:00:00")
  const [d, m, y] = s.split(",")[0].trim().split("/")
  if (!d || !m || !y) return null
  const dt = new Date(+y, +m - 1, +d, 12)
  return isNaN(dt.getTime()) ? null : dt
}

export function noPeriodo(s: string | null | undefined, p: Periodo): boolean {
  if (!p.from && !p.to) return true
  const d = parseData(s)
  if (!d) return false
  if (p.from && d < p.from) return false
  if (p.to && d > p.to) return false
  return true
}

// ─── Classificação de cards ──────────────────────────────────────────────────

export const isTerceirizado = (c: KanbanCard) => !!c.isTerceirizado || c.materialNome === "Terceirizado"
export const isAberto       = (c: KanbanCard) => c.coluna === 0 || c.coluna === COL_HOT
export const isGanho        = (c: KanbanCard) => c.coluna >= COL_FECHADO && c.coluna <= COL_ENTREGUE

const MOTIVO_EXPIRADO = /^or[cç]amento sem conclus[aã]o\.?$/i
export const isExpirado = (c: KanbanCard) =>
  c.coluna === COL_PERDIDO && (!c.motivoPerdido || MOTIVO_EXPIRADO.test(c.motivoPerdido.trim()))
export const isPerdido  = (c: KanbanCard) => c.coluna === COL_PERDIDO && !isExpirado(c)

export function nomeChave(nome: string | null | undefined): string {
  return (nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ")
}

// ─── Conversão ───────────────────────────────────────────────────────────────

export type Conversao = {
  total: number
  abertos: number
  ganhos: number
  perdidos: number
  expirados: number
  decididos: number
  /** ganhos ÷ (ganhos + perdidos + expirados) — 0–100 */
  taxa: number
}

export function conversao(orcamentos: KanbanCard[]): Conversao {
  let abertos = 0, ganhos = 0, perdidos = 0, expirados = 0
  for (const c of orcamentos) {
    if (isAberto(c)) abertos++
    else if (isGanho(c)) ganhos++
    else if (isExpirado(c)) expirados++
    else if (isPerdido(c)) perdidos++
  }
  const decididos = ganhos + perdidos + expirados
  return {
    total: orcamentos.length, abertos, ganhos, perdidos, expirados, decididos,
    taxa: decididos > 0 ? (ganhos / decididos) * 100 : 0,
  }
}

/** Orçamentos (exclui terceirizados) cuja data de criação cai no período. */
export function orcamentosDoPeriodo(kanban: KanbanCard[], p: Periodo): KanbanCard[] {
  return kanban.filter(c => !isTerceirizado(c) && noPeriodo(c.data, p))
}

// ─── Pedidos ─────────────────────────────────────────────────────────────────

export type Pedido = {
  key: string
  tipo: "lote" | "card"
  numero: string
  nomeCliente: string
  cards: KanbanCard[]
  /** Etapa do pedido = etapa do item MENOS avançado (só entregue quando tudo foi entregue). */
  coluna: number
  etapa: string
  dataFechamento?: string
  dataEntregaPrevista?: string
  dataEntregaReal?: string
  /** Valor contratado (inclui itens terceirizados vendidos ao cliente). */
  valor: number
  quantidade: number
  receitas: LancamentoFinanceiro[]
  despesas: LancamentoFinanceiro[]
  recebido: number
  /** Sobras vendidas ao cliente neste pedido (somam ao que ele deve). */
  sobras: number
  /** Venda efetiva: valor contratado + sobras. Base de margem — o custo lançado já inclui as unidades extras. */
  venda: number
  /** Sobras ainda "pendentes" que o cliente já pagou junto com o pedido (pagou venda + excedente). */
  sobrasQuitadas: string[]
  /** Saldo devedor: valor + sobras − recebido. É o "a receber" em todas as telas. */
  aReceber: number
  /** Parte do saldo com cobrança lançada (pendente). */
  cobrado: number
  /** Parte do saldo cuja cobrança já venceu. */
  vencido: number
  /** Parte do saldo sem nenhuma cobrança lançada. */
  semCobranca: number
  /** Custos diretos lançados (pagos ou na conta do fornecedor). */
  custoDireto: number
}

// Link Pix que venceu sem pagamento: era só um meio de cobrança, não conta como dívida
export const pixExpirado = (l: LancamentoFinanceiro, hojeIso: string) =>
  l.categoria === "pix_link" && l.status !== "pago" && l.dataVencimento < hojeIso

export function montarPedidos(kanban: KanbanCard[], lancamentos: LancamentoFinanceiro[]): Pedido[] {
  const ganhos = kanban.filter(isGanho)
  const grupos = new Map<string, KanbanCard[]>()
  for (const c of ganhos) {
    const k = c.loteId ? `lote-${c.loteId}` : `card-${c.id}`
    const g = grupos.get(k)
    if (g) g.push(c); else grupos.set(k, [c])
  }

  const recPorCard = new Map<string, LancamentoFinanceiro[]>()
  const recPorLote = new Map<string, LancamentoFinanceiro[]>()
  for (const l of lancamentos) {
    if (l.cardId) recPorCard.set(l.cardId, [...(recPorCard.get(l.cardId) ?? []), l])
    else if (l.loteId) recPorLote.set(l.loteId, [...(recPorLote.get(l.loteId) ?? []), l])
  }

  const hojeIso = new Date().toLocaleDateString("sv-SE")
  const pedidos: Pedido[] = []
  for (const [key, cards] of grupos) {
    const loteId = cards[0].loteId
    const lancs = [
      ...cards.flatMap(c => recPorCard.get(c.id) ?? []),
      ...(loteId ? recPorLote.get(loteId) ?? [] : []),
    ]
    const receitas = lancs.filter(l => l.tipo === "receita")
    const despesas = lancs.filter(l => l.tipo === "despesa")

    // Itens terceirizados têm fluxo próprio e não avançam no kanban — não travam a etapa
    const producao = cards.filter(c => !isTerceirizado(c))
    const base = producao.length > 0 ? producao : cards
    const coluna = Math.min(...base.map(c => c.coluna))

    const fechamentos = cards.map(c => c.dataFechamento).filter(Boolean).sort() as string[]
    const previstas   = base.map(c => c.dataEntregaPrevista).filter(Boolean).sort() as string[]
    const reais       = base.map(c => c.dataEntregaReal).filter(Boolean).sort() as string[]

    const recebido = receitas.filter(l => l.status === "pago").reduce((s, l) => s + l.valor, 0)
    const sobras   = receitas.filter(l => l.categoria === "sobra").reduce((s, l) => s + l.valor, 0)
    const valor    = cards.reduce((s, c) => s + c.preco, 0)
    const saldo    = Math.max(0, valor + sobras - recebido)
    // Link Pix vencido não é dívida: o cliente simplesmente não usou aquele link
    const pendentes = receitas.filter(l => l.status !== "pago" && !pixExpirado(l, hojeIso))
    // Cliente pagou venda + excedente nos pagamentos do pedido: as sobras pendentes já estão pagas
    // (não marcamos como pagas no banco para não contar o mesmo dinheiro duas vezes no caixa)
    const pagoSemSobras = receitas.filter(l => l.status === "pago" && l.categoria !== "sobra").reduce((s, l) => s + l.valor, 0)
    const sobrasQuitadas = pagoSemSobras >= valor + sobras - 0.5
      ? receitas.filter(l => l.categoria === "sobra" && l.status !== "pago").map(l => l.id) : []
    const cobrado  = Math.min(saldo, pendentes.reduce((s, l) => s + l.valor, 0))
    const vencido  = Math.min(saldo, pendentes.filter(l => l.dataVencimento < hojeIso).reduce((s, l) => s + l.valor, 0))

    pedidos.push({
      key,
      tipo: loteId ? "lote" : "card",
      numero: (loteId ? cards[0].loteNumero : cards[0].numero) ?? "—",
      nomeCliente: cards[0].nomeCliente,
      cards,
      coluna,
      etapa: COLUNAS_KANBAN[coluna] ?? "—",
      dataFechamento: fechamentos[0],
      dataEntregaPrevista: previstas[previstas.length - 1],
      dataEntregaReal: reais[reais.length - 1],
      valor,
      quantidade: base.reduce((s, c) => s + c.quantidade, 0),
      receitas, despesas, recebido, sobras, venda: valor + sobras, sobrasQuitadas,
      aReceber: saldo, cobrado, vencido, semCobranca: saldo - cobrado,
      custoDireto: despesas
        .filter(l => l.status === "pago" || l.formaPagamento === "conta")
        .reduce((s, l) => s + l.valor, 0),
    })
  }
  return pedidos
}

export const pedidoEmProducao = (p: Pedido) => p.coluna >= COL_FECHADO && p.coluna < COL_ENTREGUE
export const pedidoEntregue   = (p: Pedido) => p.coluna === COL_ENTREGUE

export function diasAte(iso: string, hoje = new Date()): number {
  const d = parseData(iso)
  if (!d) return Infinity
  const h = new Date(hoje); h.setHours(12, 0, 0, 0)
  return Math.round((d.getTime() - h.getTime()) / 86_400_000)
}

// ─── Vendas & caixa ──────────────────────────────────────────────────────────

export function sobrasNoPeriodo(lancamentos: LancamentoFinanceiro[], p: Periodo): number {
  return lancamentos
    .filter(l => l.tipo === "receita" && l.categoria === "sobra" && noPeriodo(l.dataPagamento || l.dataVencimento, p))
    .reduce((s, l) => s + l.valor, 0)
}

export type Vendas = {
  pedidos: Pedido[]
  /** Valor contratado dos pedidos fechados no período. */
  valorPedidos: number
  sobras: number
  /** Receita = valor dos pedidos + sobras vendidas. */
  receita: number
  ticketMedio: number
}

export function vendasDoPeriodo(pedidos: Pedido[], lancamentos: LancamentoFinanceiro[], p: Periodo): Vendas {
  const doPeriodo = pedidos.filter(x => noPeriodo(x.dataFechamento, p))
  const valorPedidos = doPeriodo.reduce((s, x) => s + x.valor, 0)
  const sobras = sobrasNoPeriodo(lancamentos, p)
  return {
    pedidos: doPeriodo,
    valorPedidos,
    sobras,
    receita: valorPedidos + sobras,
    ticketMedio: doPeriodo.length > 0 ? valorPedidos / doPeriodo.length : 0,
  }
}

export type Caixa = { recebido: number; aReceber: number; vencido: number }

export function caixaDoPeriodo(lancamentos: LancamentoFinanceiro[], p: Periodo, hoje = new Date()): Caixa {
  const rec = lancamentos.filter(l => l.tipo === "receita")
  const pendentes = rec.filter(l => l.status !== "pago")
  return {
    recebido: rec.filter(l => l.status === "pago" && noPeriodo(l.dataPagamento ?? l.dataVencimento, p)).reduce((s, l) => s + l.valor, 0),
    aReceber: pendentes.reduce((s, l) => s + l.valor, 0),
    vencido:  pendentes.filter(l => diasAte(l.dataVencimento, hoje) < 0).reduce((s, l) => s + l.valor, 0),
  }
}

/**
 * Recebíveis — o que os clientes ainda devem, em uma conta só.
 *   aReceber    = Σ saldo devedor dos pedidos
 *   vencido     = parte com cobrança vencida
 *   semCobranca = parte sem cobrança lançada
 *   aConferir   = cobranças pendentes que não batem com saldo nenhum: de pedidos já
 *                 quitados (provável baixa esquecida) ou de pedidos que não estão no quadro
 */
export type Recebiveis = {
  aReceber: number
  cobrado: number
  vencido: number
  semCobranca: number
  comSaldo: Pedido[]
  aConferir: LancamentoFinanceiro[]
}

export function recebiveis(pedidos: Pedido[], lancamentos: LancamentoFinanceiro[]): Recebiveis {
  const hojeIso = new Date().toLocaleDateString("sv-SE")
  const comSaldo = pedidos.filter(p => p.aReceber > 0.5)
  const ligados = new Set(pedidos.flatMap(p => p.receitas.map(l => l.id)))
  const quitados = pedidos.filter(p => p.aReceber <= 0.5)
    .flatMap(p => p.receitas.filter(l => l.status !== "pago" && !p.sobrasQuitadas.includes(l.id) && !pixExpirado(l, hojeIso)))
  const soltos = lancamentos.filter(l => l.tipo === "receita" && l.status !== "pago" && !ligados.has(l.id) && l.formaPagamento !== "conta" && !pixExpirado(l, hojeIso))
  const soma = (f: (p: Pedido) => number) => comSaldo.reduce((s, p) => s + f(p), 0)
  return {
    aReceber: soma(p => p.aReceber),
    cobrado: soma(p => p.cobrado),
    vencido: soma(p => p.vencido),
    semCobranca: soma(p => p.semCobranca),
    comSaldo,
    aConferir: [...quitados, ...soltos].sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento)),
  }
}

// ─── Produção (foto do momento) ──────────────────────────────────────────────

export type Producao = {
  emProducao: Pedido[]
  valorEmProducao: number
  entregues: Pedido[]
  atrasados: Pedido[]
  vencendo3d: Pedido[]
  semPrazo: Pedido[]
  porEtapa: { coluna: number; etapa: string; count: number; valor: number }[]
}

export function producao(pedidos: Pedido[], hoje = new Date()): Producao {
  const emProducao = pedidos.filter(pedidoEmProducao)
  const etapas = new Map<number, { count: number; valor: number }>()
  for (const p of emProducao) {
    const e = etapas.get(p.coluna) ?? { count: 0, valor: 0 }
    etapas.set(p.coluna, { count: e.count + 1, valor: e.valor + p.valor })
  }
  return {
    emProducao,
    valorEmProducao: emProducao.reduce((s, p) => s + p.valor, 0),
    entregues: pedidos.filter(pedidoEntregue),
    atrasados: emProducao.filter(p => p.dataEntregaPrevista && diasAte(p.dataEntregaPrevista, hoje) < 0),
    vencendo3d: emProducao.filter(p => {
      if (!p.dataEntregaPrevista) return false
      const d = diasAte(p.dataEntregaPrevista, hoje)
      return d >= 0 && d <= 3
    }),
    semPrazo: emProducao.filter(p => !p.dataEntregaPrevista),
    porEtapa: [...etapas.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([coluna, v]) => ({ coluna, etapa: COLUNAS_KANBAN[coluna] ?? "—", ...v })),
  }
}

/** Valor dos orçamentos em aberto — o que ainda pode virar venda. */
export function pipelineComercial(kanban: KanbanCard[]) {
  const abertos = kanban.filter(c => !isTerceirizado(c) && isAberto(c))
  return { count: abertos.length, valor: abertos.reduce((s, c) => s + c.preco, 0), cards: abertos }
}

// ─── Margem ──────────────────────────────────────────────────────────────────

export type Margem = {
  /** Margem de contribuição ponderada (Σ(venda − custo) ÷ Σ venda) dos pedidos com custo lançado. */
  pct: number | null
  valor: number
  custo: number
  comCusto: number
  total: number
}

export function margemContribuicao(pedidos: Pedido[]): Margem {
  const comCusto = pedidos.filter(p => p.custoDireto > 0)
  const valor = comCusto.reduce((s, p) => s + p.venda, 0)
  const custo = comCusto.reduce((s, p) => s + p.custoDireto, 0)
  return {
    pct: valor > 0 ? ((valor - custo) / valor) * 100 : null,
    valor, custo,
    comCusto: comCusto.length,
    total: pedidos.length,
  }
}

// ─── Clientes ────────────────────────────────────────────────────────────────

export type ClienteResumo = {
  chave: string
  nome: string
  orcamentos: KanbanCard[]
  pedidos: Pedido[]
  conversao: Conversao
  /** Valor contratado em todos os pedidos (lifetime value). */
  ltv: number
  recebido: number
  ultimaData: string
  ehCliente: boolean
}

export function resumoClientes(kanban: KanbanCard[], pedidos: Pedido[]): ClienteResumo[] {
  const map = new Map<string, ClienteResumo>()
  const get = (nome: string) => {
    const k = nomeChave(nome) || "sem nome"
    let r = map.get(k)
    if (!r) {
      r = { chave: k, nome: nome?.trim() || "Sem nome", orcamentos: [], pedidos: [], conversao: conversao([]), ltv: 0, recebido: 0, ultimaData: "", ehCliente: false }
      map.set(k, r)
    }
    return r
  }
  for (const c of kanban) {
    if (isTerceirizado(c)) continue
    const r = get(c.nomeCliente)
    r.orcamentos.push(c)
    const d = parseData(c.data)
    if (d && (!r.ultimaData || d > (parseData(r.ultimaData) as Date))) r.ultimaData = c.data
  }
  for (const p of pedidos) {
    const r = get(p.nomeCliente)
    r.pedidos.push(p)
    r.ltv += p.venda
    r.recebido += p.recebido
  }
  for (const r of map.values()) {
    r.conversao = conversao(r.orcamentos)
    r.ehCliente = r.pedidos.length > 0
  }
  return [...map.values()]
}
