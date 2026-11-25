// Digital no "a receber" (mesma lista do Offset): valor total, sinal, quanto já foi pago, saldo e vencimento do saldo.
// Funções puras; nada é gravado, cobrado nem baixado.
//
// PAGO (no a receber e no link de acompanhamento) é um destes, nunca o status "pago" sozinho:
//   1. o pagamento do pedido tem txId "asaas:<cobrança>" (confirmado pelo Asaas, webhook ou consulta); ou
//   2. o lançamento está ligado a uma transação bancária (banco_transacoes.lancamento_ids contém o id dele).
// Sem 1 nem 2, o valor fica "em conferência": não entra como pago.
import type { LancamentoFinanceiro } from "../types"
import { restanteDoPedido } from "./digitalFinanceiro"

type Pgto = { txId: string; valor: number; data: string } | null
export type PedidoReceber = {
  id: string; nome: string | null; status: string; teste?: boolean; total: number; sinal: number; restante?: number
  sinalPagoEm?: string; restantePagoEm?: string; prontoEm?: string; pagamento?: Pgto; pagamentoFinal?: Pgto
}
export type ParteDigital = { valor: number; estado: "pago" | "em_conferencia" | "pendente"; data: string | null }
export type ReceberDigital = {
  unidade: "digital"; id: string; cliente: string; status: string
  valorTotal: number; sinal: ParteDigital; restante: ParteDigital
  pago: number; emConferencia: number
  /** Saldo a receber: o restante ainda não recebido (nem em conferência). Complemento exato, em centavos. */
  saldo: number
  vencimentoSaldo: string | null; atrasado: boolean
}

const c2 = (n: number) => Math.round(n * 100) / 100
const dia = (s?: string | null) => (s ?? "").slice(0, 10)
const STATUS_ABERTOS = ["sinal_pago", "arte", "producao"]

/** Ids de lançamento já ligados a alguma transação bancária (banco_transacoes.lancamento_ids). */
export const idsVinculados = (txs: { lancamento_ids?: string[] | null }[]) => new Set(txs.flatMap(t => t.lancamento_ids ?? []))

const parte = (valor: number, pagoEm: string | undefined, pgto: Pgto | undefined, lanc: Pick<LancamentoFinanceiro, "id" | "status" | "dataPagamento"> | undefined, vinculados: Set<string>): ParteDigital => {
  if (!pagoEm) return { valor: c2(valor), estado: "pendente", data: null }
  const asaas = /^asaas:/.test(pgto?.txId ?? "")
  const banco = !!lanc && vinculados.has(lanc.id)
  // Data: a da transação/pagamento; na falta, a do lançamento
  const data = dia(pgto?.data) || dia(lanc?.dataPagamento) || dia(pagoEm) || null
  return { valor: c2(valor), estado: asaas || banco ? "pago" : "em_conferencia", data }
}

export function receberDigital(pedidos: PedidoReceber[], lancamentos: Pick<LancamentoFinanceiro, "id" | "status" | "dataPagamento">[], vinculados: Set<string>, hoje: string): ReceberDigital[] {
  const lanc = new Map(lancamentos.map(l => [l.id, l]))
  const out: ReceberDigital[] = []
  for (const p of pedidos) {
    if (p.teste || p.status === "cancelado" || !p.sinalPagoEm) continue
    const sinal = parte(p.pagamento?.valor ?? p.sinal, p.sinalPagoEm, p.pagamento, lanc.get(`dig-${p.id}-sinal`), vinculados)
    const valorRestante = p.pagamentoFinal?.valor ?? restanteDoPedido(p)
    const restante = parte(valorRestante, p.restantePagoEm, p.pagamentoFinal, lanc.get(`dig-${p.id}-restante`), vinculados)
    const partes = [sinal, restante]
    const pago = c2(partes.filter(x => x.estado === "pago").reduce((s, x) => s + x.valor, 0))
    const emConferencia = c2(partes.filter(x => x.estado === "em_conferencia").reduce((s, x) => s + x.valor, 0))
    const saldo = restante.estado === "pendente" ? restante.valor : 0
    // Entra: pedidos em andamento, ou o que ainda tem saldo ou valor em conferência
    if (!(STATUS_ABERTOS.includes(p.status) || saldo > 0 || emConferencia > 0)) continue
    if (restante.estado === "pago" && sinal.estado === "pago" && !STATUS_ABERTOS.includes(p.status)) continue
    const vencimentoSaldo = saldo > 0 && p.prontoEm ? dia(p.prontoEm) : null
    out.push({ unidade: "digital", id: p.id, cliente: p.nome ?? "Cliente", status: p.status, valorTotal: c2(sinal.valor + valorRestante), sinal, restante,
      pago, emConferencia, saldo, vencimentoSaldo, atrasado: !!vencimentoSaldo && vencimentoSaldo < hoje })
  }
  return out
}
