// Caixaria · custos e preço (lógica pura, usada na tela, no servidor e nos testes).
// É a mesma conta do site (caixaria/lib/preco.ts: Custos, custoRodada, cotar): se mudar lá, mudar aqui.
// O teste tests/custos.test.ts trava os preços de referência.

import { planificacao, cabemNaChapa, type TipoFaca } from "./facas"

export type Custos = {
  impressao: number; papelPorFolha: number; perdaPct: number; laminacaoPorFolha: number
  corteAcerto: number; corteMilheiro: number; logistica: number; colagemPorMil: number; arte: number
  multiplicador: number; acrescimoCartao: number; fatorExpressa: number; descontos: Record<string, number>
  freteFixo: number; fretePorKg: number
  impostoPct: number; taxaPixPct: number; taxaCartaoPct: number
}

export const CUSTOS_PADRAO: Custos = {
  impressao: 350, papelPorFolha: 0.64, perdaPct: 0, laminacaoPorFolha: 0.25,
  corteAcerto: 100, corteMilheiro: 0, logistica: 0, colagemPorMil: 75, arte: 70,
  multiplicador: 2.6875, acrescimoCartao: 0.08, fatorExpressa: 1.155,
  descontos: { 1000: 0, 2000: 0.05, 3000: 0.08, 4000: 0.1 },
  freteFixo: 35, fretePorKg: 3.5,
  impostoPct: 0, taxaPixPct: 0, taxaCartaoPct: 0,
}

export const QUANTIDADES = [1000, 2000, 3000, 4000]
const FOLHAS_RODADA = 1000

export function normalizarCustos(c: Partial<Custos> | null | undefined): Custos {
  const out: Custos = { ...CUSTOS_PADRAO, descontos: { ...CUSTOS_PADRAO.descontos } }
  if (!c) return out
  for (const k of Object.keys(CUSTOS_PADRAO) as (keyof Custos)[]) {
    if (k === "descontos") continue
    const v = Number(c[k])
    if (Number.isFinite(v) && v >= 0) (out[k] as number) = v
  }
  if (!(out.multiplicador > 0)) out.multiplicador = CUSTOS_PADRAO.multiplicador
  if (!(out.fatorExpressa > 0)) out.fatorExpressa = CUSTOS_PADRAO.fatorExpressa
  for (const [q, d] of Object.entries(c.descontos ?? {})) if (Number(d) >= 0 && Number(d) < 0.5) out.descontos[q] = Number(d)
  return out
}

export function custoRodada(c: Custos) {
  const folhas = FOLHAS_RODADA * (1 + c.perdaPct / 100)
  return c.impressao + (c.papelPorFolha + c.laminacaoPorFolha) * folhas + c.corteAcerto + c.corteMilheiro * folhas / 1000 + c.logistica
}

// Partes da rodada, para mostrar de onde vem o custo
export function partesRodada(c: Custos) {
  const folhas = FOLHAS_RODADA * (1 + c.perdaPct / 100)
  return [
    { nome: "Impressão", valor: c.impressao },
    { nome: "Papel", valor: c.papelPorFolha * folhas },
    { nome: "Laminação", valor: c.laminacaoPorFolha * folhas },
    { nome: "Corte e vinco", valor: c.corteAcerto + c.corteMilheiro * folhas / 1000 },
    { nome: "Logística entre fornecedores", valor: c.logistica },
  ]
}

const arredondar = (v: number) => Math.ceil(v / 10) * 10 - 0.1

export type CaixaRef = { tipo: TipoFaca; frente_mm: number; lateral_mm: number; altura_mm: number; lugares?: number | null }

export const lugaresDa = (cx: CaixaRef) => {
  if (cx.lugares) return cx.lugares
  const p = planificacao(cx.tipo, cx.frente_mm, cx.lateral_mm, cx.altura_mm)
  return cabemNaChapa(p.largura, p.altura)
}

// Preço como o site calcula (sem frete embutido)
export function preco(c: Custos, cx: CaixaRef, qtd: number, expressa = false) {
  const porChapa = lugaresDa(cx)
  if (!porChapa) return null
  const rodada = custoRodada(c)
  const custo = (qtd / 1000) * (rodada / porChapa + c.colagemPorMil) + c.arte
  const base = custo * c.multiplicador * (expressa ? c.fatorExpressa : 1) * (1 - (c.descontos[qtd] ?? 0))
  const pix = arredondar(base)
  return { pix, cartao: arredondar(pix * (1 + c.acrescimoCartao)), custo, porChapa, rodada }
}

// O que sobra de um pedido. Normal: paga só a fatia da chapa que ocupa (os outros lugares são de outros clientes).
// Expressa: chapa só dele, paga a rodada inteira.
export function lucro(c: Custos, cx: CaixaRef, qtd: number, expressa = false, cartao = false) {
  const p = preco(c, cx, qtd, expressa)
  if (!p) return null
  const lugares = qtd / 1000
  const rodadas = expressa ? Math.ceil(lugares / p.porChapa) : lugares / p.porChapa
  const producao = rodadas * p.rodada + lugares * c.colagemPorMil + c.arte
  const receita = cartao ? p.cartao : p.pix
  const imposto = receita * c.impostoPct / 100
  const taxa = receita * (cartao ? c.taxaCartaoPct : c.taxaPixPct) / 100
  const sobra = receita - producao - imposto - taxa
  return { receita, producao, imposto, taxa, sobra, margem: receita ? sobra / receita : 0, porChapa: p.porChapa }
}

// Multiplicador que mantém o preço no Pix da caixa de referência (1.000 un) com os custos novos
export function multiplicadorParaManter(c: Custos, cx: CaixaRef, alvoPix: number) {
  const p = preco({ ...c, multiplicador: 1 }, cx, 1000)
  if (!p || !(p.custo > 0)) return c.multiplicador
  return Math.floor(((alvoPix + 0.1 - 0.001) / p.custo) * 10000) / 10000
}

// Caixa de referência: perfume 100 ml (base dos custos da conversa de 08/11/2026)
export const REFERENCIA: CaixaRef & { nome: string } = { nome: "Caixa para perfume 100 ml", tipo: "simples", frente_mm: 65, lateral_mm: 65, altura_mm: 130 }
