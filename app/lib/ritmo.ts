// Fase 4 — valor e ritmo de cada cliente.
//   Curva A/B/C: A = clientes que somam 80% do vendido em 12 meses, B = os próximos 15%, C = o resto
//   Ritmo: intervalo típico entre pedidos (mediana, ignorando pedidos da mesma leva) → quando deve pedir de novo
//   Recompra antecipada: avisar perto da data, antes de o cliente procurar outra gráfica

import { Pedido, nomeChave, isAberto, isTerceirizado } from "./negocio"
import { KanbanCard, COL_FECHADO, COL_ENTREGUE, COL_PERDIDO, COL_HOT } from "../types"

export type Curva = "A" | "B" | "C"
export type StatusRitmo = "unico" | "no_ritmo" | "perto" | "atrasado" | "sumido"

export type RitmoCliente = {
  nome: string
  chave: string
  pedidos: number              // datas de compra distintas
  vendido12m: number
  vendidoTotal: number
  ticket: number
  ultimo: string               // ISO do último fechamento
  diasSemPedir: number
  intervalo: number | null     // dias típicos entre pedidos
  proxima: string | null       // ISO previsto
  status: StatusRitmo
  curva: Curva | null          // só quem comprou nos últimos 12 meses
  emAndamento: boolean         // tem pedido em produção ou orçamento aberto
}

const MESMA_LEVA = 7   // pedidos com menos de 7 dias de diferença contam como a mesma compra
const dia = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00").getTime()
const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

export function ritmoDosClientes(pedidos: Pedido[], kanban: KanbanCard[], hoje = new Date()): RitmoCliente[] {
  const hojeMs = new Date(hoje.toLocaleDateString("sv-SE") + "T12:00:00").getTime()
  const umAno = hojeMs - 365 * 86_400_000
  const porCliente = new Map<string, Pedido[]>()
  for (const p of pedidos) {
    if (!p.dataFechamento) continue
    const k = nomeChave(p.nomeCliente)
    porCliente.set(k, [...(porCliente.get(k) ?? []), p])
  }
  // Em andamento: pedido ainda não entregue ou orçamento aberto (já está conversando; não é hora de lembrar)
  const andamento = new Set(kanban.filter(c => !isTerceirizado(c) && (
    isAberto(c) || c.coluna === COL_HOT || (c.coluna >= COL_FECHADO && c.coluna < COL_ENTREGUE && c.coluna !== COL_PERDIDO)
  )).map(c => nomeChave(c.nomeCliente)))

  const lista: Omit<RitmoCliente, "curva">[] = [...porCliente.entries()].map(([chave, ps]) => {
    const datas = [...new Set(ps.map(p => p.dataFechamento!.slice(0, 10)))].sort()
    const compras: string[] = []
    for (const d of datas) if (!compras.length || dia(d) - dia(compras[compras.length - 1]) >= MESMA_LEVA * 86_400_000) compras.push(d)
    const gaps = compras.slice(1).map((d, i) => Math.round((dia(d) - dia(compras[i])) / 86_400_000))
    const intervalo = gaps.length ? Math.round(mediana(gaps.slice(-4))) : null
    const ultimo = datas[datas.length - 1]
    const diasSemPedir = Math.max(0, Math.round((hojeMs - dia(ultimo)) / 86_400_000))
    const r = intervalo ? diasSemPedir / intervalo : null
    const status: StatusRitmo = r == null ? "unico" : r < 0.8 ? "no_ritmo" : r <= 1.3 ? "perto" : r <= 3 ? "atrasado" : "sumido"
    const vendidoTotal = ps.reduce((s, p) => s + p.venda, 0)
    return {
      nome: ps[ps.length - 1].nomeCliente, chave, pedidos: compras.length,
      vendido12m: ps.filter(p => dia(p.dataFechamento!) >= umAno).reduce((s, p) => s + p.venda, 0),
      vendidoTotal, ticket: vendidoTotal / compras.length, ultimo, diasSemPedir, intervalo,
      proxima: intervalo ? new Date(dia(ultimo) + intervalo * 86_400_000).toLocaleDateString("sv-SE") : null,
      status, emAndamento: andamento.has(chave),
    }
  })

  // Curva A/B/C pelo vendido em 12 meses
  const total = lista.reduce((s, c) => s + c.vendido12m, 0)
  const ordenados = lista.filter(c => c.vendido12m > 0).sort((a, b) => b.vendido12m - a.vendido12m)
  const curva = new Map<string, Curva>()
  let acumulado = 0
  for (const c of ordenados) {
    const antes = total ? acumulado / total : 1
    curva.set(c.chave, antes < 0.8 ? "A" : antes < 0.95 ? "B" : "C")
    acumulado += c.vendido12m
  }
  return lista.map(c => ({ ...c, curva: curva.get(c.chave) ?? null })).sort((a, b) => b.vendido12m - a.vendido12m)
}

// Hora de lembrar: está perto da data ou passou dela, e não está conversando com a Enyla agora
export const hojeDeLembrar = (r: RitmoCliente) =>
  !r.emAndamento && (r.status === "perto" || r.status === "atrasado") && (r.curva === "A" || r.curva === "B" || r.pedidos >= 2)

export const textoRitmo = (r: RitmoCliente) =>
  r.intervalo ? `a cada ~${r.intervalo} dias · há ${r.diasSemPedir}` : `1 compra · há ${r.diasSemPedir} dias`
