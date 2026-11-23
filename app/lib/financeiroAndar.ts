// Números do 2º andar do prédio (Financeiro), com as mesmas contas das outras telas (lib/negocio): Offset e Digital
// separados. Puro: recebe o quadro e os lançamentos.
import type { KanbanCard, LancamentoFinanceiro } from "../types"
import { montarPedidos, recebiveis } from "./negocio"

export type FinanceiroAndar = {
  recebidoMes: number; pagoMes: number; resultadoMes: number
  aReceber: number; vencido: number; saldoContas: number | null
  porMes: { rotulo: string; receita: number; despesa: number }[]          // últimos 6 meses (Offset)
  digital: { recebidoMes: number; custoVillaMes: number }
  vencidos: { numero: string; cliente: string; valor: number }[]          // maiores primeiro
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

export function financeiroDoAndar(kanban: KanbanCard[], lancamentos: LancamentoFinanceiro[], saldoContas: number | null = null, hoje = new Date()): FinanceiroAndar {
  const offset = lancamentos.filter(l => (l.unidade ?? "offset") === "offset" && l.formaPagamento !== "conta")
  const digital = lancamentos.filter(l => l.unidade === "digital")
  const doMes = (ano: number, mes: number) => (l: LancamentoFinanceiro) => {
    const d = (l.dataPagamento || l.dataVencimento || "").slice(0, 7)
    return d === `${ano}-${String(mes + 1).padStart(2, "0")}`
  }
  const pagos = (lista: LancamentoFinanceiro[], tipo: "receita" | "despesa", f: (l: LancamentoFinanceiro) => boolean) =>
    lista.filter(l => l.tipo === tipo && l.status === "pago" && f(l)).reduce((s, l) => s + l.valor, 0)
  const esteMes = doMes(hoje.getFullYear(), hoje.getMonth())
  const recebidoMes = pagos(offset, "receita", esteMes), pagoMes = pagos(offset, "despesa", esteMes)
  const porMes = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 5 + k, 1)
    const f = doMes(d.getFullYear(), d.getMonth())
    return { rotulo: MESES[d.getMonth()], receita: pagos(offset, "receita", f), despesa: pagos(offset, "despesa", f) }
  })
  const rec = recebiveis(montarPedidos(kanban, offset), offset)
  const vencidos = rec.comSaldo.filter(p => p.vencido > 0.5).sort((a, b) => b.vencido - a.vencido).slice(0, 6)
    .map(p => ({ numero: p.numero, cliente: p.nomeCliente, valor: p.vencido }))
  return {
    recebidoMes, pagoMes, resultadoMes: recebidoMes - pagoMes, aReceber: rec.aReceber, vencido: rec.vencido, saldoContas,
    porMes, vencidos,
    digital: { recebidoMes: pagos(digital, "receita", esteMes), custoVillaMes: digital.filter(l => l.tipo === "despesa" && esteMes(l)).reduce((s, l) => s + l.valor, 0) },
  }
}
