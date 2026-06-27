// Regras de negócio financeiras centralizadas. Antes, cada tela (Financeiro,
// perfil do cliente, assistente Forma) reimplementava essas regras do zero e
// elas divergiam silenciosamente (ex: perfil do cliente não excluía PIX
// vencido, e "a receber" por lá ignorava pedidos sem nenhum lançamento
// registrado). Qualquer tela que precise saber "quanto falta receber" ou
// "isso conta como atrasado" deve importar daqui, não recalcular.

import { LancamentoFinanceiro, KanbanCard, NegocioParceiro, COL_FECHADO, COL_PERDIDO } from "../types"

export const hoje = () => new Date().toISOString().split("T")[0]

// Link PIX vencido e não pago: o link expirou, o cliente não vai mais pagar
// aquele link específico — deixa de contar como receita pendente (só conta de
// novo se a gráfica reemitir).
export function pixVencido(l: LancamentoFinanceiro): boolean {
  return l.categoria === "pix_link" && l.status !== "pago" && l.dataVencimento < hoje()
}

export function isSobra(l: LancamentoFinanceiro): boolean {
  return l.categoria === "sobra"
}

// Receita pendente que de fato deve contar como "a receber"/"em atraso":
// exclui sobras (troco/excedente) e PIX vencidos.
export function isReceitaPendenteValida(l: LancamentoFinanceiro): boolean {
  return l.tipo === "receita" && l.status !== "pago" && !isSobra(l) && !pixVencido(l)
}

export function isAtrasada(l: LancamentoFinanceiro): boolean {
  return isReceitaPendenteValida(l) && l.dataVencimento < hoje()
}

export function pedidosElegiveis(kanban: KanbanCard[]): KanbanCard[] {
  return kanban.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO)
}

function agruparPorChave(
  lancamentos: LancamentoFinanceiro[],
  pred: (l: LancamentoFinanceiro) => boolean,
  chave: (l: LancamentoFinanceiro) => string | undefined
): Record<string, LancamentoFinanceiro[]> {
  const m: Record<string, LancamentoFinanceiro[]> = {}
  for (const l of lancamentos) {
    if (!pred(l)) continue
    const k = chave(l)
    if (!k) continue
    if (!m[k]) m[k] = []
    m[k].push(l)
  }
  return m
}

// Pagamentos (receita, não-sobra, não-PIX-vencido) agrupados por lote/card — suporta parciais.
export function pagamentosPorLote(lancamentos: LancamentoFinanceiro[]) {
  return agruparPorChave(lancamentos, l => l.tipo === "receita" && !!l.loteId && !isSobra(l) && !pixVencido(l), l => l.loteId)
}
export function pagamentosPorCard(lancamentos: LancamentoFinanceiro[]) {
  return agruparPorChave(lancamentos, l => l.tipo === "receita" && !!l.cardId && !isSobra(l) && !pixVencido(l), l => l.cardId)
}
export function sobrasPorLote(lancamentos: LancamentoFinanceiro[]) {
  return agruparPorChave(lancamentos, l => isSobra(l) && !!l.loteId, l => l.loteId)
}
export function sobrasPorCard(lancamentos: LancamentoFinanceiro[]) {
  return agruparPorChave(lancamentos, l => isSobra(l) && !!l.cardId && !l.loteId, l => l.cardId)
}

export function somaPago(lancs: LancamentoFinanceiro[]): number {
  return lancs.filter(l => l.status === "pago").reduce((s, l) => s + l.valor, 0)
}

export type PedidoFechado = {
  key: string
  loteId?: string
  cardId?: string
  cliente: string
  label: string
  total: number
  pago: number
  restante: number
}

// Pra cada pedido fechado (cards de um mesmo lote contam como um pedido só),
// calcula o valor total (preço dos cards + sobras), quanto já foi pago, e
// quanto falta — incluindo pedidos sem NENHUM lançamento registrado (pago=0).
export function calcularPedidosFechados(kanban: KanbanCard[], lancamentos: LancamentoFinanceiro[]): PedidoFechado[] {
  const elegiveis = pedidosElegiveis(kanban)
  const porLote = pagamentosPorLote(lancamentos)
  const porCard = pagamentosPorCard(lancamentos)
  const sobLote = sobrasPorLote(lancamentos)
  const sobCard = sobrasPorCard(lancamentos)

  const itens: PedidoFechado[] = []
  const lotesSeen = new Set<string>()

  for (const c of elegiveis) {
    if (c.loteId) {
      if (lotesSeen.has(c.loteId)) continue
      lotesSeen.add(c.loteId)
      const pago = somaPago(porLote[c.loteId] ?? [])
      const loteCards = elegiveis.filter(cc => cc.loteId === c.loteId)
      const sobras = sobLote[c.loteId] ?? []
      const total = loteCards.reduce((s, cc) => s + cc.preco, 0) + sobras.reduce((s, l) => s + l.valor, 0)
      itens.push({ key: `lote-${c.loteId}`, loteId: c.loteId, cliente: c.nomeCliente, label: c.loteNumero ?? "Lote", total, pago, restante: total - pago })
    } else {
      const pago = somaPago(porCard[c.id] ?? [])
      const sobras = sobCard[c.id] ?? []
      const total = c.preco + sobras.reduce((s, l) => s + l.valor, 0)
      itens.push({ key: `card-${c.id}`, cardId: c.id, cliente: c.nomeCliente, label: c.numero || "Pedido", total, pago, restante: total - pago })
    }
  }
  return itens
}

export function pedidosAbertos(itens: PedidoFechado[]): PedidoFechado[] {
  return itens.filter(i => i.pago < i.total)
}

// Conta pedidos sem registro financeiro completo — inclui os de valor zero
// (nunca tiveram lançamento criado), não só os com saldo positivo.
export function contarNaoRegistrados(itens: PedidoFechado[]): number {
  return itens.filter(i => i.total === 0 || i.pago < i.total).length
}

export function negociosPendentes(negocios: NegocioParceiro[]): NegocioParceiro[] {
  return negocios.filter(n => n.status === "pendente")
}

export type Vencido = {
  key: string
  loteId?: string
  cardId?: string
  nomeCliente: string
  loteNumero?: string
  cardNumero?: string
  total: number
  diasAtraso: number
  lancamentos: LancamentoFinanceiro[]
}

// Lançamentos de receita pendentes e vencidos, agrupados por lote/card.
export function calcularVencidos(lancamentos: LancamentoFinanceiro[]): Vencido[] {
  const atrasados = lancamentos.filter(isAtrasada)
  const grupos: Record<string, Vencido> = {}
  for (const l of atrasados) {
    const key = l.loteId ? `lote:${l.loteId}` : `card:${l.cardId}`
    if (!grupos[key]) {
      const dias = Math.floor((Date.now() - new Date(l.dataVencimento).getTime()) / 86_400_000)
      grupos[key] = {
        key, loteId: l.loteId, cardId: l.cardId,
        nomeCliente: l.nomeCliente || "",
        loteNumero: l.loteNumero, cardNumero: l.cardNumero,
        total: 0, diasAtraso: dias, lancamentos: [],
      }
    }
    grupos[key].total += l.valor
    grupos[key].lancamentos.push(l)
  }
  return Object.values(grupos).sort((a, b) => b.total - a.total)
}

// Soma de receita paga (inclui sobras pagas — uma sobra só sai da régua de "a
// receber"/"em atraso", mas dinheiro que já entrou conta normalmente aqui),
// mais comissões de parceria pagas.
export function calcularRecebidoTotal(lancamentos: LancamentoFinanceiro[], negocios: NegocioParceiro[] = []): number {
  const recebidoLancamentos = somaPago(lancamentos.filter(l => l.tipo === "receita"))
  const recebidoParceiros = somaPago(negocios.map(n => ({ status: n.status, valor: n.comissaoValor, tipo: "receita" } as LancamentoFinanceiro)))
  return recebidoLancamentos + recebidoParceiros
}

export type ResumoFinanceiro = {
  recebidoTotal: number
  aReceberTotal: number
  emAtrasoTotal: number
  pedidosAbertos: PedidoFechado[]
  negociosPendentes: NegocioParceiro[]
  vencidos: Vencido[]
}

// Snapshot completo, sem filtro de período — usado pela assistente Forma e
// por qualquer outra tela que precise do quadro geral em vez de KPIs do mês.
export function calcularResumoFinanceiro(kanban: KanbanCard[], lancamentos: LancamentoFinanceiro[], negocios: NegocioParceiro[]): ResumoFinanceiro {
  const itens = calcularPedidosFechados(kanban, lancamentos)
  const abertos = pedidosAbertos(itens)
  const negPendentes = negociosPendentes(negocios)
  const vencidos = calcularVencidos(lancamentos)

  return {
    recebidoTotal: calcularRecebidoTotal(lancamentos, negocios),
    aReceberTotal: abertos.reduce((s, i) => s + i.restante, 0) + negPendentes.reduce((s, n) => s + n.comissaoValor, 0),
    emAtrasoTotal: vencidos.reduce((s, v) => s + v.total, 0),
    pedidosAbertos: abertos,
    negociosPendentes: negPendentes,
    vencidos,
  }
}
