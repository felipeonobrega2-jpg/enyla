// Formatação única de data e moeda do sistema: sempre pt-BR e America/Sao_Paulo. Ver docs/padrao-visual.md.
// Entrada: "YYYY-MM-DD", ISO com hora ou Date. Data só com dia (sem hora) não sofre deslocamento de fuso.
const TZ = "America/Sao_Paulo"

function paraData(v: string | Date): Date | null {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + "T12:00:00Z")   // meio-dia UTC: o mesmo dia em São Paulo
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d
}

/** "30/11" (curta) ou "30 de novembro" (longa). Com `ano`, acrescenta o ano ("30/11/2026", "30 de novembro de 2026"). Valor inválido vira "". */
export function formatarData(v: string | Date | null | undefined, o: { formato?: "curta" | "longa"; ano?: boolean } = {}): string {
  const d = v ? paraData(v) : null
  if (!d) return ""
  const longa = o.formato === "longa"
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: longa ? "numeric" : "2-digit", ...(longa ? { month: "long" } : { month: "2-digit" }), ...(o.ano ? { year: "numeric" } : {}) }).format(d)
}

/** "25/11 a 30/11"; datas iguais viram uma só; só uma das pontas preenchida vira ela mesma. */
export function formatarIntervaloDatas(de: string | Date | null | undefined, ate: string | Date | null | undefined, o: { formato?: "curta" | "longa"; ano?: boolean } = {}): string {
  const a = formatarData(de, o), b = formatarData(ate, o)
  if (a && b) return a === b ? a : `${a} a ${b}`
  return a || b
}

/** "R$ 1.000,00" */
export function formatarMoeda(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}
