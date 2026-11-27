// Regras de negócio financeiras centralizadas. Antes, cada tela (Financeiro,
// perfil do cliente, assistente Forma) reimplementava essas regras do zero e
// elas divergiam silenciosamente (ex: perfil do cliente não excluía PIX
// vencido, e "a receber" por lá ignorava pedidos sem nenhum lançamento
// registrado). Qualquer tela que precise saber "quanto falta receber" ou
// "isso conta como atrasado" deve importar daqui, não recalcular.

import { LancamentoFinanceiro, KanbanCard, NegocioParceiro, COL_FECHADO, COL_PERDIDO, COL_HOT } from "../types"
import { montarPedidos, pixExpirado } from "./negocio"

export const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })   // dia em São Paulo (UTC virava amanhã depois das 21h)

// Link PIX vencido e não pago: o link expirou, o cliente não vai mais pagar
// aquele link específico — deixa de contar como receita pendente (só conta de
// novo se a gráfica reemitir).
export function pixVencido(l: LancamentoFinanceiro): boolean {
  return l.categoria === "pix_link" && l.status !== "pago" && l.dataVencimento < hoje()
}

// Categoria neutra (Ajuste neutro, Transferência entre contas próprias): existe nos dois lados, mas não é receita,
// despesa nem faturamento. Vale a marcação `neutra` da categoria; na falta dela, o nome (ou o id) da categoria.
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
const NOMES_NEUTROS = ["ajuste neutro", "transferencia entre contas proprias"]
export const nomeNeutro = (s?: string | null) => !!s && NOMES_NEUTROS.includes(semAcento(s))

/** Ids das categorias marcadas `neutra` (ou de nome neutro) nas listas de receita e despesa. */
export function idsNeutros(...listas: (readonly { id: string; nome: string; neutra?: boolean }[] | undefined)[]): Set<string> {
  const ids = new Set<string>()
  for (const l of listas) for (const c of l ?? []) if (c.neutra === true || nomeNeutro(c.nome) || nomeNeutro(c.id)) ids.add(c.id)
  return ids
}

export function lancamentoNeutro(l: Pick<LancamentoFinanceiro, "categoria">, neutras?: ReadonlySet<string>): boolean {
  return !!l.categoria && (!!neutras?.has(l.categoria) || nomeNeutro(l.categoria))
}

/** Tira os lançamentos neutros: use antes de somar receita, despesa ou faturamento. */
export const semNeutras = <T extends Pick<LancamentoFinanceiro, "categoria">>(ls: T[], neutras?: ReadonlySet<string>): T[] =>
  ls.filter(l => !lancamentoNeutro(l, neutras))

// Entrada que não é receita (ex.: Aporte do Felipe): o dinheiro entrou, então o caixa e o saldo da conta contam;
// mas fica fora da DRE e do "recebido do mês". Vale a natureza da categoria ou o id `entrada-nao-receita`.
export const ENTRADA_NAO_RECEITA = "entrada-nao-receita"
export const NOME_ENTRADA_NAO_RECEITA = "Aportes / entradas que não são receita"

export function idsEntradaNaoReceita(...listas: (readonly { id: string; natureza?: string }[] | undefined)[]): Set<string> {
  const ids = new Set<string>([ENTRADA_NAO_RECEITA])
  for (const l of listas) for (const c of l ?? []) if (c.natureza === ENTRADA_NAO_RECEITA) ids.add(c.id)
  return ids
}

export function lancamentoEntradaNaoReceita(l: Pick<LancamentoFinanceiro, "tipo" | "categoria">, ids?: ReadonlySet<string>): boolean {
  return l.tipo === "receita" && !!l.categoria && (l.categoria === ENTRADA_NAO_RECEITA || !!ids?.has(l.categoria))
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
  return isReceitaPendenteValida(l) && !!l.dataVencimento && l.dataVencimento < hoje()
}

export function pedidosElegiveis(kanban: KanbanCard[]): KanbanCard[] {
  return kanban.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO && c.coluna !== COL_HOT)
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

// Pedidos fechados com total (venda + sobras), pago e quanto falta.
// Vem da camada canônica (lib/negocio): os mesmos números do Painel, Pedidos e celular.
export function calcularPedidosFechados(kanban: KanbanCard[], lancamentos: LancamentoFinanceiro[]): PedidoFechado[] {
  return montarPedidos(kanban, lancamentos).map(p => ({
    key: p.key,
    loteId: p.tipo === "lote" ? p.cards[0].loteId : undefined,
    cardId: p.tipo === "card" ? p.cards[0].id : undefined,
    cliente: p.nomeCliente,
    label: p.numero,
    total: p.venda,
    pago: p.venda - p.aReceber,
    restante: p.aReceber,
  }))
}

export function pedidosAbertos(itens: PedidoFechado[]): PedidoFechado[] {
  return itens.filter(i => i.restante > 0.5)
}

// Pedidos sem registro financeiro completo — inclui os de valor zero
export function contarNaoRegistrados(itens: PedidoFechado[]): number {
  return itens.filter(i => i.total === 0 || i.restante > 0.5).length
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

// Cobranças vencidas, por pedido (mesma régua do Painel: sobras pendentes contam,
// sobras já pagas com o pedido e links Pix vencidos não)
export function calcularVencidos(kanban: KanbanCard[], lancamentos: LancamentoFinanceiro[]): Vencido[] {
  const hj = hoje()
  return montarPedidos(kanban, lancamentos)
    .filter(p => p.vencido > 0.5)
    .map(p => {
      const lancs = p.receitas
        .filter(l => l.status !== "pago" && l.dataVencimento < hj && !p.sobrasQuitadas.includes(l.id) && !pixExpirado(l, hj))
        .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
      const maisAntigo = lancs[0]?.dataVencimento ?? hj
      return {
        key: p.tipo === "lote" ? `lote:${p.cards[0].loteId}` : `card:${p.cards[0].id}`,
        loteId: p.tipo === "lote" ? p.cards[0].loteId : undefined,
        cardId: p.tipo === "card" ? p.cards[0].id : undefined,
        nomeCliente: p.nomeCliente,
        loteNumero: p.tipo === "lote" ? p.numero : undefined,
        cardNumero: p.tipo === "card" ? p.numero : undefined,
        total: p.vencido,
        diasAtraso: Math.floor((Date.now() - new Date(maisAntigo + "T12:00:00").getTime()) / 86_400_000),
        lancamentos: lancs,
      }
    })
    .sort((a, b) => b.total - a.total)
}

// Soma de receita paga (inclui sobras pagas — uma sobra só sai da régua de "a
// receber"/"em atraso", mas dinheiro que já entrou conta normalmente aqui),
// mais comissões de parceria pagas.
export function calcularRecebidoTotal(lancamentos: LancamentoFinanceiro[], negocios: NegocioParceiro[] = [], entradasNaoReceita?: ReadonlySet<string>): number {
  const recebidoLancamentos = somaPago(lancamentos.filter(l => l.tipo === "receita" && l.formaPagamento !== "conta" && !lancamentoEntradaNaoReceita(l, entradasNaoReceita)))
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
export function calcularResumoFinanceiro(kanban: KanbanCard[], lancamentos: LancamentoFinanceiro[], negocios: NegocioParceiro[], entradasNaoReceita?: ReadonlySet<string>): ResumoFinanceiro {
  const itens = calcularPedidosFechados(kanban, lancamentos)
  const abertos = pedidosAbertos(itens)
  const negPendentes = negociosPendentes(negocios)
  const vencidos = calcularVencidos(kanban, lancamentos)

  return {
    recebidoTotal: calcularRecebidoTotal(lancamentos, negocios, entradasNaoReceita),
    aReceberTotal: abertos.reduce((s, i) => s + i.restante, 0) + negPendentes.reduce((s, n) => s + n.comissaoValor, 0),
    emAtrasoTotal: vencidos.reduce((s, v) => s + v.total, 0),
    pedidosAbertos: abertos,
    negociosPendentes: negPendentes,
    vencidos,
  }
}

// Ganho de parceria que você também lançou como receita (ex.: comissão da Jupter que entrou no banco e foi lançada):
// conta uma vez só, pelo lançamento. Par = receita paga, sem pedido, mesmo valor, até 15 dias de distância.
export function parceriasSemLancamento<N extends { comissaoValor: number; dataOrcamento: string }>(negocios: N[], lancamentos: LancamentoFinanceiro[]): N[] {
  const usados = new Set<string>()
  const dia = (d: string) => new Date(d.slice(0, 10) + "T12:00:00").getTime() / 86_400_000
  return negocios.filter(n => {
    const par = lancamentos.find(l => !usados.has(l.id) && l.tipo === "receita" && l.status === "pago" && l.formaPagamento !== "conta" && !l.cardId && !l.loteId
      && Math.abs(l.valor - n.comissaoValor) < 0.01 && Math.abs(dia(l.dataPagamento ?? l.dataVencimento) - dia(n.dataOrcamento)) <= 15)
    if (par) usados.add(par.id)
    return !par
  })
}

// ── DRE (regime de caixa) ──────────────────────────────────────────────────────
// Mesma base do "resultado" do Financeiro: o que foi pago no período, sem os
// lançamentos da conta corrente de fornecedor (débitos e abatimentos não são caixa).

export type LinhaDre = { nome: string; valor: number }

export type Dre = {
  receitaPedidos: number
  receitaSobras: number
  receitaOutras: number
  receitaParcerias: number
  entradaNaoReceita: number        // aportes e afins: entraram no caixa, mas fora da receita
  receita: number
  custosProducao: LinhaDre[]      // despesas ligadas a pedidos, por tipo
  custoProducao: number
  margemBruta: number
  margemBrutaPct: number | null
  despesasOperacionais: LinhaDre[] // demais despesas, por categoria
  despesaOperacional: number
  resultado: number
  resultadoPct: number | null
  impostoEstimado: number
  resultadoAposImposto: number
}

const agrupar = (ls: LancamentoFinanceiro[], nome: (l: LancamentoFinanceiro) => string): LinhaDre[] => {
  const m = new Map<string, number>()
  for (const l of ls) m.set(nome(l), (m.get(nome(l)) ?? 0) + l.valor)
  return [...m.entries()].map(([n, valor]) => ({ nome: n, valor })).sort((a, b) => b.valor - a.valor)
}

export function dreDoPeriodo(args: {
  lancamentos: LancamentoFinanceiro[]
  noPeriodo: (l: LancamentoFinanceiro) => boolean
  parcerias?: number
  nomeCategoria: (id: string) => string
  impostoPct?: number
  neutras?: ReadonlySet<string>
  entradasNaoReceita?: ReadonlySet<string>
}): Dre {
  const { lancamentos, noPeriodo, nomeCategoria } = args
  const base = semNeutras(lancamentos, args.neutras).filter(l => l.status === "pago" && l.formaPagamento !== "conta" && noPeriodo(l))
  const todasReceitas = base.filter(l => l.tipo === "receita")
  const receitas = todasReceitas.filter(l => !lancamentoEntradaNaoReceita(l, args.entradasNaoReceita))
  const despesas = base.filter(l => l.tipo === "despesa")
  const soma = (ls: LancamentoFinanceiro[]) => ls.reduce((s, l) => s + l.valor, 0)
  const ligado = (l: LancamentoFinanceiro) => !!(l.cardId || l.loteId)

  const receitaSobras = soma(receitas.filter(isSobra))
  const receitaPedidos = soma(receitas.filter(l => !isSobra(l) && ligado(l)))
  const receitaOutras = soma(receitas.filter(l => !isSobra(l) && !ligado(l)))
  const receitaParcerias = args.parcerias ?? 0
  const entradaNaoReceita = soma(todasReceitas.filter(l => lancamentoEntradaNaoReceita(l, args.entradasNaoReceita)))
  const receita = receitaSobras + receitaPedidos + receitaOutras + receitaParcerias

  // Custo de produção: ligado a um pedido, ou de categoria de fornecedor/material/terceirização
  const deProducao = (l: LancamentoFinanceiro) => ligado(l) || l.categoria === "fornecedor" || l.categoria === "materiais"
    || /fornecedor|terceiriz|materia|insumo/i.test(nomeCategoria(l.categoria || ""))
  const custosProducao = agrupar(despesas.filter(deProducao), l => l.subcategoria || nomeCategoria(l.categoria || "outros"))
  const despesasOperacionais = agrupar(despesas.filter(l => !deProducao(l)), l => nomeCategoria(l.categoria || "outros"))
  const custoProducao = custosProducao.reduce((s, x) => s + x.valor, 0)
  const despesaOperacional = despesasOperacionais.reduce((s, x) => s + x.valor, 0)
  const margemBruta = receita - custoProducao
  const resultado = margemBruta - despesaOperacional
  const impostoEstimado = Math.max(0, receita * (args.impostoPct ?? 0) / 100)
  return {
    receitaPedidos, receitaSobras, receitaOutras, receitaParcerias, entradaNaoReceita, receita,
    custosProducao, custoProducao, margemBruta, margemBrutaPct: receita > 0 ? margemBruta / receita * 100 : null,
    despesasOperacionais, despesaOperacional, resultado, resultadoPct: receita > 0 ? resultado / receita * 100 : null,
    impostoEstimado, resultadoAposImposto: resultado - impostoEstimado,
  }
}
