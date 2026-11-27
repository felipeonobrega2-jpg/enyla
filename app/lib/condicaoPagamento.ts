// Condição de pagamento de cada orçamento Offset (27/11/2026, pedido do Felipe): padrão (sinal da configuração na
// aprovação e o restante na entrega) ou personalizada, em parcelas de % com prazo em dias, contados da aprovação ou
// da entrega. Fica no formulário do orçamento (HistoricoItem.form.condicaoPagamento): sem campo, vale o padrão.
// A entrada (o que vence na aprovação) é o que a página de aprovação cobra no Pix. Puro.

export type BaseParcela = "aprovacao" | "entrega"
export type ParcelaCondicao = { pct: number; dias: number; base: BaseParcela }
export type CondicaoPagamento = { tipo: "padrao" } | { tipo: "personalizada"; parcelas: ParcelaCondicao[] }

export const CONDICAO_PADRAO: CondicaoPagamento = { tipo: "padrao" }

/** As parcelas de verdade: o padrão vira sinal% na aprovação + o resto na entrega. */
export function parcelasDa(c: CondicaoPagamento | null | undefined, sinalPct: number): ParcelaCondicao[] {
  if (!c || c.tipo === "padrao" || !c.parcelas?.length) {
    const s = Math.min(100, Math.max(0, sinalPct))
    return [{ pct: s, dias: 0, base: "aprovacao" as const }, { pct: 100 - s, dias: 0, base: "entrega" as const }].filter(p => p.pct > 0)
  }
  return c.parcelas.map(p => ({ pct: Math.max(0, Number(p.pct) || 0), dias: Math.max(0, Math.round(Number(p.dias) || 0)), base: p.base === "entrega" ? "entrega" as const : "aprovacao" as const }))
}

/** Soma das porcentagens (a personalizada precisa fechar 100). */
export const somaPct = (ps: ParcelaCondicao[]) => Math.round(ps.reduce((s, p) => s + p.pct, 0) * 100) / 100
export const condicaoValida = (c: CondicaoPagamento | null | undefined) => !c || c.tipo === "padrao" || (c.parcelas.length > 0 && Math.abs(somaPct(parcelasDa(c, 0)) - 100) < 0.01)

/** % que vence na aprovação (entra no Pix da página de aprovação). */
export const entradaPct = (c: CondicaoPagamento | null | undefined, sinalPct: number) =>
  somaPct(parcelasDa(c, sinalPct).filter(p => p.base === "aprovacao" && p.dias === 0))

const pctTxt = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")}%`
function quando(p: ParcelaCondicao): string {
  if (p.dias === 0) return p.base === "aprovacao" ? "na aprovação" : "na entrega"
  return `em ${p.dias} ${p.dias === 1 ? "dia" : "dias"} ${p.base === "aprovacao" ? "após a aprovação" : "após a entrega"}`
}

/** Texto para o cliente: "50% na aprovação e 50% na entrega". */
export function textoCondicao(c: CondicaoPagamento | null | undefined, sinalPct: number): string {
  const ps = parcelasDa(c, sinalPct)
  if (!ps.length) return "a combinar"
  if (ps.length === 1 && ps[0].pct === 100) return `100% ${quando(ps[0])}`
  const partes = ps.map(p => `${pctTxt(p.pct)} ${quando(p)}`)
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`
}

/** Valores de cada parcela (centavos fechando no total: a diferença de arredondamento vai na última). */
export function valoresDasParcelas(c: CondicaoPagamento | null | undefined, sinalPct: number, total: number): (ParcelaCondicao & { valor: number })[] {
  const ps = parcelasDa(c, sinalPct)
  const centavos = Math.round(total * 100)
  let usado = 0
  return ps.map((p, i) => {
    const v = i === ps.length - 1 ? centavos - usado : Math.round(centavos * p.pct / 100)
    usado += v
    return { ...p, valor: v / 100 }
  })
}

const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}
/** Vencimento de uma parcela (data ISO) a partir da aprovação e da entrega prevista. */
export const vencimentoDa = (p: ParcelaCondicao, aprovadoEm: string, entregaPrevista: string | null | undefined) =>
  somarDias(p.base === "entrega" ? entregaPrevista || aprovadoEm : aprovadoEm, p.dias)
