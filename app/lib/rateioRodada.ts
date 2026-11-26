/**
 * Rodada de produção: vários pedidos impressos na mesma tiragem. Lógica pura (nada é gravado aqui).
 *
 * Rateia só o que é da tiragem (papel, impressão, acerto, corte e vinco, acabamento por folha e a faca
 * compartilhada). Clichê, fotolito, arte, hot stamping, frete, imposto e faca exclusiva ficam com o pedido dono.
 * Sobra ou posição vazia vai para o puxador (o pedido maior da rodada).
 *
 * Pedido sem rodada não passa por aqui: continua com o custoDireto de sempre.
 */

/** Custo REAL da tiragem que se divide entre os pedidos (R$). */
export type CustoTiragem = {
  papel?: number
  impressao?: number
  acerto?: number
  corteVinco?: number
  /** Acabamento cobrado por folha. */
  acabamento?: number
  /** Faca só entra no rateio quando é compartilhada (facaCompartilhada = true). */
  faca?: number
}

/** Custos que ficam com o pedido dono, fora do rateio (R$). */
export type CustoProprio = {
  cliche?: number
  fotolito?: number
  arte?: number
  hotStamping?: number
  frete?: number
  imposto?: number
  /** Faca exclusiva do pedido. */
  faca?: number
}

export type PedidoDaRodada = {
  /** Mesma chave do pedido em montarPedidos (`lote-<id>` ou `card-<id>`) e em MovimentoFornecedor.pedidoKey. */
  pedidoKey: string
  /** Posições que o pedido ocupa em UMA folha. */
  posicoes: number
  /** Área de uma posição (mm²). Só usada quando os tamanhos na folha são diferentes. */
  areaMm2?: number
  puxador?: boolean
  /** Se informado, é o custo próprio do pedido; se não, vale o custoDireto lançado para ele. */
  custoProprio?: CustoProprio
}

export type Rodada = {
  /** Formato ROD-001. */
  id: string
  fornecedorId?: string
  maquina?: string
  enviadoEm?: string     // ISO yyyy-mm-dd
  retornoEm?: string     // ISO yyyy-mm-dd (data de retorno)
  folhas: number
  /** Posições totais por folha (ocupadas + vazias). */
  posicoesPorFolha: number
  /** Área útil de uma folha (mm²): só para a sobra de área quando o rateio é por área. */
  areaFolhaMm2?: number
  custoTerceiro: CustoTiragem
  facaCompartilhada?: boolean
  pedidos: PedidoDaRodada[]
  /** Só em testes/exemplos: o custo da tiragem não é real. */
  ficticio?: boolean
}

export const somaValores = (o?: Record<string, number | undefined>) =>
  Object.values(o ?? {}).reduce<number>((s, v) => s + (Number.isFinite(v) ? (v as number) : 0), 0)

/** Custo da tiragem que entra no rateio (a faca só quando compartilhada). */
export function custoRateavel(r: Pick<Rodada, "custoTerceiro" | "facaCompartilhada">): number {
  const { faca, ...resto } = r.custoTerceiro
  return somaValores(resto) + (r.facaCompartilhada ? faca ?? 0 : 0)
}

const r2 = (n: number) => Math.round(n * 100) / 100

export type FracaoPedido = {
  pedidoKey: string
  puxador: boolean
  /** Fração própria (posições × folhas ÷ total), sem a sobra. */
  fracaoPropria: number
  /** Fração final: própria + sobra, se for o puxador. Soma 1 entre os pedidos da rodada. */
  fracao: number
  /** R$ da tiragem que cabem ao pedido. */
  custoRateado: number
}

/** Pedido com tamanhos diferentes na mesma folha → rateio por área. */
export const rateioPorArea = (r: Pick<Rodada, "pedidos">) =>
  new Set(r.pedidos.map(p => p.areaMm2 ?? 0)).size > 1

/** Puxador: o marcado; sem marca, o de maior peso (área × posições, ou só posições). */
export function puxadorDaRodada(r: Rodada): string | null {
  const marcado = r.pedidos.find(p => p.puxador)
  if (marcado) return marcado.pedidoKey
  const porArea = rateioPorArea(r)
  const peso = (p: PedidoDaRodada) => p.posicoes * (porArea ? p.areaMm2 ?? 0 : 1)
  return [...r.pedidos].sort((a, b) => peso(b) - peso(a))[0]?.pedidoKey ?? null
}

export function fracoesDaRodada(r: Rodada): FracaoPedido[] {
  if (!r.pedidos.length) return []
  const porArea = rateioPorArea(r)
  const folhas = Math.max(0, r.folhas)
  const peso = (p: PedidoDaRodada) => p.posicoes * folhas * (porArea ? p.areaMm2 ?? 0 : 1)
  const ocupado = r.pedidos.reduce((s, p) => s + peso(p), 0)
  // Capacidade: posições da folha × folhas (ou área da folha × folhas); sem o dado, só o que está ocupado
  const capacidade = porArea
    ? Math.max(ocupado, (r.areaFolhaMm2 ?? 0) * folhas)
    : Math.max(ocupado, Math.max(0, r.posicoesPorFolha) * folhas)
  const base = capacidade > 0 ? capacidade : 1
  const puxador = puxadorDaRodada(r)
  const pool = custoRateavel(r)
  const proprias = r.pedidos.map(p => peso(p) / base)
  const sobra = Math.max(0, 1 - proprias.reduce((s, f) => s + f, 0))
  return r.pedidos.map((p, i) => {
    const ehPuxador = p.pedidoKey === puxador
    const fracao = proprias[i] + (ehPuxador ? sobra : 0)
    return { pedidoKey: p.pedidoKey, puxador: ehPuxador, fracaoPropria: proprias[i], fracao, custoRateado: r2(pool * fracao) }
  })
}

export type ResultadoPedido = FracaoPedido & {
  venda: number
  custoProprio: number
  /** custoProprio + custoRateado */
  custoTotal: number
  /** venda − custoTotal */
  margem: number
  margemPct: number | null
  /** O preço do pedido não cobre custo próprio + fração dele. */
  vermelho: boolean
}

export type ResultadoRodada = {
  rodadaId: string
  vendas: number
  custoTiragem: number
  custosProprios: number
  /** soma das vendas − custo rateável da tiragem − custos próprios */
  margem: number
  margemPct: number | null
  /** Alerta vermelho olha a rodada inteira (mesmo limite de 30% da tela de Pedidos). */
  vermelho: boolean
  pedidos: ResultadoPedido[]
}

export const LIMITE_MARGEM_PCT = 30

/**
 * Margem de cada pedido e da rodada.
 * @param vendas venda efetiva por pedidoKey
 * @param custosDiretos custoDireto lançado por pedidoKey (vale quando a rodada não informa o custo próprio)
 */
export function resultadoDaRodada(r: Rodada, vendas: Record<string, number>, custosDiretos: Record<string, number> = {}): ResultadoRodada {
  const fr = new Map(fracoesDaRodada(r).map(f => [f.pedidoKey, f]))
  const pedidos = r.pedidos.map<ResultadoPedido>(p => {
    const f = fr.get(p.pedidoKey)!
    const venda = vendas[p.pedidoKey] ?? 0
    const custoProprio = p.custoProprio ? somaValores(p.custoProprio) : custosDiretos[p.pedidoKey] ?? 0
    const custoTotal = r2(custoProprio + f.custoRateado)
    const margem = r2(venda - custoTotal)
    return { ...f, venda, custoProprio: r2(custoProprio), custoTotal, margem,
      margemPct: venda > 0 ? r2(margem / venda * 100) : null, vermelho: venda < custoTotal }
  })
  const totalVendas = r2(pedidos.reduce((s, p) => s + p.venda, 0))
  const custosProprios = r2(pedidos.reduce((s, p) => s + p.custoProprio, 0))
  const custoTiragem = r2(custoRateavel(r))
  const margem = r2(totalVendas - custoTiragem - custosProprios)
  const margemPct = totalVendas > 0 ? r2(margem / totalVendas * 100) : null
  return { rodadaId: r.id, vendas: totalVendas, custoTiragem, custosProprios, margem, margemPct,
    vermelho: margemPct != null && margemPct < LIMITE_MARGEM_PCT, pedidos }
}
