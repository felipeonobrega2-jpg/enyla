// Formatação padrão do sistema: sempre pt-BR e America/Sao_Paulo. Datas ISO "aaaa-mm-dd" (ou ISO completo) entram como dia de Brasília.
const FUSO = "America/Sao_Paulo"
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

// Dia civil (aaaa-mm-dd): "aaaa-mm-dd" puro fica como está; timestamp ISO é convertido para o dia em Brasília.
function dia(v: string | Date): string | null {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10)) && (v.length === 10)) return v
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("sv-SE", { timeZone: FUSO })
}

// "30/11" (curto) ou "30/11/2026" (com ano) ou "30 de novembro" (extenso)
export function formatarData(v: string | Date | null | undefined, estilo: "curto" | "completo" | "extenso" = "curto"): string {
  const s = v ? dia(v) : null
  if (!s) return ""
  const [a, m, d] = s.split("-")
  if (estilo === "completo") return `${d}/${m}/${a}`
  if (estilo === "extenso") return `${Number(d)} de ${MESES[Number(m) - 1]}`
  return `${d}/${m}`
}

// "25/11 a 30/11" (ou só "30/11" quando as pontas são o mesmo dia)
export function formatarIntervaloDatas(de: string | Date, ate: string | Date): string {
  const a = formatarData(de), b = formatarData(ate)
  return a === b ? a : `${a} a ${b}`
}

export const formatarMoeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
