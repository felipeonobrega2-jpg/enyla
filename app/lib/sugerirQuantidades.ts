// Quantidades que valem oferecer ao cliente: o preço anda em degraus (pacote de 100 folhas, batidas, acerto), então
// perto de cada quantidade orçada costuma haver uma que sai quase pelo mesmo total (o papel já comprado rende mais)
// ou bem mais barata logo abaixo do degrau. Puro: recebe o preço de cada quantidade (calculado pelo motor).

export type PrecoQtd = { quantidade: number; total: number }
export type SugestaoQtd = {
  quantidade: number
  tipo: "rende" | "abaixo" | "volume"
  base: number                 // quantidade orçada que gerou a sugestão
  total: number
  unitario: number
  texto: string                // explicação curta para você (e para o cliente)
}

// Passo "redondo" para a quantidade: 50 até mil, 100 até 5 mil, 500 acima
export const passoDe = (q: number) => (q < 1000 ? 50 : q < 5000 ? 100 : 500)
const redondo = (q: number) => Math.round(q / passoDe(q)) * passoDe(q)

// Quantidades para o motor calcular em volta das orçadas
export function candidatas(orcadas: number[]): number[] {
  const set = new Set<number>()
  for (const q of orcadas) {
    if (!(q > 0)) continue
    const p = passoDe(q)
    for (let c = Math.max(p, Math.floor(q * 0.8 / p) * p); c <= q * 1.6; c += p) set.add(c)
    for (const m of [2, 3]) set.add(redondo(q * m))
  }
  for (const q of orcadas) set.delete(q)
  return [...set].filter(q => q >= 50).sort((a, b) => a - b)
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const num = (v: number) => v.toLocaleString("pt-BR")
const pct = (v: number) => `${Math.round(v * 100)}%`

export function sugerirQuantidades(orcadas: number[], precos: PrecoQtd[], max = 4): SugestaoQtd[] {
  const preco = new Map(precos.filter(p => p.total > 0).map(p => [p.quantidade, p.total]))
  const ja = new Set(orcadas)
  const out: SugestaoQtd[] = []
  const add = (s: Omit<SugestaoQtd, "unitario">) => { if (!ja.has(s.quantidade) && !out.some(o => o.quantidade === s.quantidade)) out.push({ ...s, unitario: s.total / s.quantidade }) }

  for (const q of [...orcadas].sort((a, b) => a - b)) {
    const t = preco.get(q)
    if (!t) continue
    const lista = [...preco.entries()].map(([quantidade, total]) => ({ quantidade, total })).sort((a, b) => a.quantidade - b.quantidade)

    // Rende mais: a maior quantidade acima que custa até 5% a mais no total (e traz pelo menos 8% a mais de caixas)
    const rende = lista.filter(x => x.quantidade >= q * 1.08 && x.quantidade <= q * 1.6 && x.total <= t * 1.05).at(-1)
    if (rende) add({ quantidade: rende.quantidade, tipo: "rende", base: q, total: rende.total,
      texto: `+${num(rende.quantidade - q)} caixas por +${brl(rende.total - t)} (o papel já comprado rende mais). Unitário cai ${pct(1 - (rende.total / rende.quantidade) / (t / q))}.` })

    // Logo abaixo do degrau: até 15% menos caixas e pelo menos 12% mais barato no total
    const abaixo = lista.filter(x => x.quantidade < q && x.quantidade >= q * 0.85 && x.total <= t * 0.88).at(-1)
    if (abaixo) add({ quantidade: abaixo.quantidade, tipo: "abaixo", base: q, total: abaixo.total,
      texto: `${brl(t - abaixo.total)} mais barato no total (−${pct(1 - abaixo.total / t)}) com ${num(q - abaixo.quantidade)} caixas a menos. Bom para cliente que olha o valor final.` })
  }

  // Volume: 2x ou 3x a menor orçada, quando o unitário cai pelo menos 15%
  const menor = Math.min(...orcadas.filter(q => preco.has(q)))
  if (Number.isFinite(menor)) {
    const uBase = preco.get(menor)! / menor
    for (const m of [2, 3]) {
      const v = redondo(menor * m), tv = preco.get(v)
      if (!tv) continue
      const queda = 1 - (tv / v) / uBase
      if (queda >= 0.15) { add({ quantidade: v, tipo: "volume", base: menor, total: tv, texto: `Unitário cai ${pct(queda)} (${brl(uBase)} → ${brl(tv / v)}). Bom para quem compra todo mês.` }); break }
    }
  }
  const ordem = { rende: 0, abaixo: 1, volume: 2 }
  return out.sort((a, b) => ordem[a.tipo] - ordem[b.tipo] || a.quantidade - b.quantidade).slice(0, max)
}
