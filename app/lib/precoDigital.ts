// Preço da impressão digital (produção da Villa Gráfica, do Leandro). O custo é a tabela dele, pelo tamanho da
// caixa aberta (a faca): cabe numa A4 → tabela A4; cabe numa A3 → tabela A3; maior que A3 → consultar a Villa.
// Triplex 300g com laminação fosca ou brilhante. O preço ao cliente é o custo + a arte (designer) + a sua margem.

export type RegraDigital = { arte: number; margem: number }
export const REGRA_DIGITAL_PADRAO: RegraDigital = { arte: 70, margem: 150 }

export type Folha = "A4" | "A3"
// Tabelas que o Leandro passou (A3 300 e 500 un: cotação dele de 04/07 para caixa em A3)
export const TABELA_VILLA: Record<Folha, [number, number][]> = {
  A4: [[20, 119.94], [50, 199.95], [100, 399.95]],   // preços do site da Villa (06/11)
  A3: [[20, 199.95], [50, 349.95], [100, 499.95], [300, 1199.85], [500, 1750]],
}
// Área útil da folha (cm), com margem de 0,5 cm em volta
const UTIL: Record<Folha, [number, number]> = { A4: [20, 28.7], A3: [28.7, 41] }

// Caixa aberta (faca) de um cartucho, em cm, a partir de altura × largura × profundidade
export function facaAberta(A: number, L: number, P: number) {
  return { largura: +(2 * (L + P) + 1.5).toFixed(2), altura: +(A + 2 * P).toFixed(2) }
}

const cabe = (w: number, h: number, [fw, fh]: [number, number]) => (w <= fw && h <= fh) || (h <= fw && w <= fh)

// Em que folha a faca cabe (a menor); null = maior que A3
export function folhaDaFaca(largura: number, altura: number): Folha | null {
  if (largura <= 0 || altura <= 0) return null
  if (cabe(largura, altura, UTIL.A4)) return "A4"
  if (cabe(largura, altura, UTIL.A3)) return "A3"
  return null
}

// Quantidades da tabela da folha
export const quantidadesDa = (folha: Folha) => TABELA_VILLA[folha].map(([q]) => q)

// Custo na Villa: a faixa da tabela que atende a quantidade (75 un paga a faixa de 100); acima da maior faixa, null
export function custoVilla(q: number, folha: Folha): { faixa: number; custo: number } | null {
  const linha = TABELA_VILLA[folha].find(([faixa]) => q <= faixa)
  return linha ? { faixa: linha[0], custo: linha[1] } : null
}

export type PrecoDigital = { q: number; faixa: number; custo: number; arte: number; margem: number; total: number; unit: number }
export function precoDigital(q: number, folha: Folha, regra: RegraDigital = REGRA_DIGITAL_PADRAO): PrecoDigital | null {
  const c = custoVilla(q, folha)
  if (!c || q <= 0) return null
  const total = Math.round((c.custo + regra.arte + regra.margem) * 100) / 100
  return { q, faixa: c.faixa, custo: c.custo, arte: regra.arte, margem: regra.margem, total, unit: total / q }
}
