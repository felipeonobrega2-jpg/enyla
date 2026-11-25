// A receber do Digital (mesma lista do Offset, linha "digital"): valor total, sinal, quanto já foi pago, saldo e vencimento do saldo.
// Funções puras; nada é gravado nem baixado. REGRA: só conta como PAGO o lançamento ligado a uma transação bancária
// (banco_transacoes.lancamento_ids contém o id do lançamento). status "pago" sem esse vínculo fica "em conferência".
import type { LancamentoFinanceiro } from "../types"
import { restanteDoPedido } from "./digitalFinanceiro"

export type PedidoReceberDigital = { id: string; nome: string | null; status: string; teste?: boolean; sinal: number; total: number; restante?: number; sinalPagoEm?: string; restantePagoEm?: string; prontoEm?: string }
export type TransacaoVinculo = { id: string; data?: string | null; lancamento_ids?: string[] | null }
export type ItemReceberDigital = {
  id: string; cliente: string; status: string
  valorTotal: number; sinal: number
  /** Só o que está ligado a uma transação do banco. */
  pago: number
  /** Lançado como pago, mas sem vínculo bancário (falta conferir no extrato). */
  emConferencia: number
  saldo: number
  /** Vencimento do saldo: vazio até o material ficar pronto. */
  vencimentoSaldo: string | null
  atrasado: boolean
  pagamentos: { lancamentoId: string; parte: "sinal" | "restante"; valor: number; estado: "pago" | "em conferencia"; data: string | null }[]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const STATUS_ABERTOS = ["sinal_pago", "arte", "producao"]

export function receberDigital(pedidos: PedidoReceberDigital[] | undefined, lancamentos: LancamentoFinanceiro[], transacoes: TransacaoVinculo[], hojeIso = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })): ItemReceberDigital[] {
  const porLanc = new Map<string, TransacaoVinculo>()
  for (const t of transacoes) for (const id of t.lancamento_ids ?? []) if (!porLanc.has(id)) porLanc.set(id, t)
  const lancs = new Map(lancamentos.filter(l => l.unidade === "digital" && l.tipo === "receita" && !l.estornadoEm).map(l => [l.id, l]))
  const itens: ItemReceberDigital[] = []
  for (const p of pedidos ?? []) {
    if (p.teste || p.status === "cancelado") continue
    const sinalL = lancs.get(`dig-${p.id}-sinal`), restL = lancs.get(`dig-${p.id}-restante`)
    const restante = r2(restanteDoPedido(p))
    const pagamentos: ItemReceberDigital["pagamentos"] = []
    for (const [parte, l] of [["sinal", sinalL], ["restante", restL]] as const) {
      if (!l || l.status !== "pago") continue
      const tx = porLanc.get(l.id)
      pagamentos.push({ lancamentoId: l.id, parte, valor: l.valor, estado: tx ? "pago" : "em conferencia", data: tx ? (tx.data ?? l.dataPagamento ?? null)?.slice(0, 10) ?? null : (l.dataPagamento ?? null) })
    }
    const baixado = restL?.status === "pago" || !!p.restantePagoEm
    const saldo = baixado ? 0 : restante
    // Entra: sinal lançado, ou saldo em aberto num pedido ainda em andamento
    if (!sinalL && !p.sinalPagoEm) continue
    if (!STATUS_ABERTOS.includes(p.status) && saldo <= 0.5) continue
    const vencimento = restL && restL.status !== "pago" ? (restL.dataVencimento || null) : (p.prontoEm ? p.prontoEm.slice(0, 10) : null)
    itens.push({
      id: p.id, cliente: p.nome ?? "Cliente", status: p.status,
      valorTotal: r2(p.sinal + restante), sinal: p.sinal,
      pago: r2(pagamentos.filter(x => x.estado === "pago").reduce((s, x) => s + x.valor, 0)),
      emConferencia: r2(pagamentos.filter(x => x.estado === "em conferencia").reduce((s, x) => s + x.valor, 0)),
      saldo, vencimentoSaldo: saldo > 0.5 ? vencimento : null,
      atrasado: saldo > 0.5 && !!vencimento && vencimento < hojeIso, pagamentos,
    })
  }
  return itens
}
