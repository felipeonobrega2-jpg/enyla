// Prazo de produção do pedido inteiro, etapa por etapa, a partir do rastreio
// (cada mudança de coluna no quadro grava a data). Conta em dias úteis.
//
// Cuidados com o histórico:
//   - pedidos registrados de uma vez (todas as etapas no mesmo dia) não dizem nada → ficam de fora
//   - entrega real do pedido, quando lançada, vale mais que o dia em que o card foi para "Entregue"
//   - mediana junto da média: uma arrumação do quadro não distorce o número

import { diasUteisEntre } from "./diasUteis"

export type EtapaRastreio = { coluna: number; dataHora: string; tipo?: string }
export type Rastreio = { numero: string; etapas: EtapaRastreio[] }

export const TRECHOS: { de: number; ate: number; nome: string }[] = [
  { de: 1, ate: 2, nome: "Fechado → arte" },
  { de: 2, ate: 3, nome: "Arte" },
  { de: 3, ate: 4, nome: "Aprovação" },
  { de: 4, ate: 5, nome: "Fila de impressão" },
  { de: 5, ate: 6, nome: "Impressão" },
  { de: 6, ate: 7, nome: "Verniz" },
  { de: 7, ate: 8, nome: "Acabamento" },
  { de: 8, ate: 9, nome: "Expedição → entrega" },
]

export type Estatistica = { mediana: number; media: number; min: number; max: number; n: number }
export type PrazoProducao = {
  total: Estatistica | null
  trechos: (Estatistica & { nome: string })[]
  pedidosUsados: number
  registradosDeUmaVez: number
}

const isoDe = (dataHora: string) => {
  const [d, m, y] = (dataHora ?? "").split(",")[0].trim().split("/")
  return y && m && d ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : null
}

export function estatistica(v: number[]): Estatistica | null {
  if (!v.length) return null
  const o = [...v].sort((a, b) => a - b)
  const meio = Math.floor(o.length / 2)
  return {
    mediana: o.length % 2 ? o[meio] : (o[meio - 1] + o[meio]) / 2,
    media: o.reduce((s, x) => s + x, 0) / o.length,
    min: o[0], max: o[o.length - 1], n: o.length,
  }
}

export function prazoDeProducao(rastreios: Rastreio[], entregaReal: Record<string, string> = {}): PrazoProducao {
  const porTrecho = new Map<number, number[]>()
  const totais: number[] = []
  let registradosDeUmaVez = 0, pedidosUsados = 0

  for (const r of rastreios) {
    // Primeira vez em cada coluna (ignora observações, preço, aprovação)
    const primeira = new Map<number, string>()
    for (const e of r.etapas ?? []) {
      if (e.tipo && e.tipo !== "coluna") continue
      const d = isoDe(e.dataHora)
      if (d && !primeira.has(e.coluna)) primeira.set(e.coluna, d)
    }
    if (entregaReal[r.numero]) primeira.set(9, entregaReal[r.numero].slice(0, 10))
    if (!primeira.has(1)) continue
    const datas = [...primeira.entries()].filter(([c]) => c >= 1 && c <= 9).map(([, d]) => d)
    if (datas.length >= 3 && new Set(datas).size === 1) { registradosDeUmaVez++; continue }
    pedidosUsados++

    for (const t of TRECHOS) {
      const a = primeira.get(t.de), b = primeira.get(t.ate)
      if (!a || !b || b < a) continue
      porTrecho.set(t.de, [...(porTrecho.get(t.de) ?? []), diasUteisEntre(a, b)])
    }
    if (primeira.has(9) && primeira.get(9)! >= primeira.get(1)!) totais.push(diasUteisEntre(primeira.get(1)!, primeira.get(9)!))
  }

  return {
    total: estatistica(totais),
    trechos: TRECHOS.flatMap(t => { const e = estatistica(porTrecho.get(t.de) ?? []); return e ? [{ nome: t.nome, ...e }] : [] }),
    pedidosUsados, registradosDeUmaVez,
  }
}
