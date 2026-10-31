// Dias úteis: segunda a sexta, fora feriados nacionais (inclui Carnaval e Corpus Christi).
// Datas em ISO "aaaa-mm-dd".

const iso = (d: Date) => d.toLocaleDateString("sv-SE")
const data = (s: string) => new Date(s.slice(0, 10) + "T12:00:00")

function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(ano, mes - 1, dia, 12)
}

const cache = new Map<number, Set<string>>()
function feriados(ano: number): Set<string> {
  let s = cache.get(ano)
  if (s) return s
  const p = pascoa(ano)
  const rel = (n: number) => { const d = new Date(p); d.setDate(d.getDate() + n); return iso(d) }
  s = new Set([
    ...["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map(md => `${ano}-${md}`),
    rel(-48), rel(-47),   // Carnaval
    rel(-2),              // Sexta-feira Santa
    rel(60),              // Corpus Christi
  ])
  cache.set(ano, s)
  return s
}

export function ehDiaUtil(d: Date | string): boolean {
  const dt = typeof d === "string" ? data(d) : d
  const dia = dt.getDay()
  return dia !== 0 && dia !== 6 && !feriados(dt.getFullYear()).has(iso(dt))
}

/** Data `n` dias úteis depois de `inicio` (o próprio dia de início não conta). */
export function somarDiasUteis(inicio: string, n: number): string {
  const d = data(inicio)
  let faltam = Math.max(0, Math.round(n))
  while (faltam > 0) {
    d.setDate(d.getDate() + 1)
    if (ehDiaUtil(d)) faltam--
  }
  return iso(d)
}

/** Dias úteis de `a` (exclusive) até `b` (inclusive); negativo se `b` vem antes. */
export function diasUteisEntre(a: string, b: string): number {
  if (b < a) return -diasUteisEntre(b, a)
  const d = data(a), fim = data(b)
  let n = 0
  while (d < fim) {
    d.setDate(d.getDate() + 1)
    if (ehDiaUtil(d)) n++
  }
  return n
}
