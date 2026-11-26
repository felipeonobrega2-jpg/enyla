// Despesa vinculada a vários lotes: o valor é o TOTAL da nota (rateado entre os lotes) ou o custo de CADA lote.
// Regra única de rateio; a rodada (#155) deve reaproveitar esta função em vez de duplicar.

export type ModoRateio = "cada" | "quantidade" | "igual"

const cents = (n: number) => Math.round(n * 100)

// Devolve o valor de cada lote, na mesma ordem de `quantidades`. A soma bate com o total ao centavo
// (a sobra de centavos vai para os lotes de maior resto, de forma estável).
export function ratearValor(total: number, quantidades: number[], modo: ModoRateio): number[] {
  const n = quantidades.length
  if (n === 0) return []
  if (modo === "cada") return quantidades.map(() => total)
  const totalC = cents(total)
  const pesos = modo === "quantidade" && quantidades.every(q => q > 0) ? quantidades : quantidades.map(() => 1)
  const soma = pesos.reduce((s, p) => s + p, 0)
  const bruto = pesos.map(p => (totalC * p) / soma)
  const base = bruto.map(Math.floor)
  let sobra = totalC - base.reduce((s, b) => s + b, 0)
  const ordem = bruto.map((b, i) => ({ i, r: b - Math.floor(b) })).sort((a, b) => b.r - a.r || a.i - b.i)
  for (const { i } of ordem) { if (sobra <= 0) break; base[i]++; sobra-- }
  return base.map(c => c / 100)
}
