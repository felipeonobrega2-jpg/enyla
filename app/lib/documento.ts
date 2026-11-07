// CPF/CNPJ: limpa, valida o dígito e mascara para mostrar (a página pública nunca devolve o número inteiro)
export const soNumeros = (s: string) => (s ?? "").replace(/\D/g, "")

export function cpfValido(c: string) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}
export function cnpjValido(c: string) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = p.reduce((a, x, i) => a + x * Number(c[i]), 0); const r = s % 11; return r < 2 ? 0 : 11 - r }
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13])
}
export const documentoValido = (s: string) => { const c = soNumeros(s); return c.length === 11 ? cpfValido(c) : cnpjValido(c) }
export const mascararDocumento = (s: string) => { const c = soNumeros(s); return c.length === 11 ? `***.${c.slice(3, 6)}.***-**` : `**.${c.slice(2, 5)}.***/****-${c.slice(12)}` }
