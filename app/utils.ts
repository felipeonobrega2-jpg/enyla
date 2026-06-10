export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
export const num = (v: number, d = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })

export function margemCls(m: number) {
  if (m >= 48) return "text-emerald-600 font-semibold"
  if (m >= 35) return "text-amber-600 font-semibold"
  return "text-rose-500 font-semibold"
}
