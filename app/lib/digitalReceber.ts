// A receber do Digital (só dados, funções puras): sinal + restante de cada pedido, sem tocar em cobrança nem baixa.
// PAGO (decisão do Felipe, 25/11): só conta como pago se (1) o txId do pagamento começa com "asaas:" (Asaas confirmou,
// por webhook ou consulta) ou (2) o LancamentoFinanceiro está ligado a uma transação bancária (banco_transacoes.lancamento_ids).
// O `status = "pago"` sozinho não basta: o valor fica "em conferência". Sem nome de cliente neste módulo além do cadastro do pedido.
import { restanteDe } from "./digitalFinanceiro"

export type PedidoReceber = {
  id: string; nome?: string | null; status: string; teste?: boolean; total: number; sinal: number; restante?: number
  sinalPagoEm?: string; restantePagoEm?: string; prontoEm?: string
  pagamento?: { txId: string; valor: number; data: string } | null; pagamentoFinal?: { txId: string; valor: number; data: string } | null
  asaas?: { sinal?: { id: string } | null; restante?: { id: string } | null }
}
export type SituacaoParte = "pago" | "em conferencia" | "a receber"
export type ParteReceber = { valor: number; situacao: SituacaoParte; dataRecebimento: string | null; asaasId: string | null }
export type DigitalAReceber = {
  id: string; cliente: string | null; status: string; total: number; sinal: ParteReceber; restante: ParteReceber
  pago: number; emConferencia: number; saldo: number; vencimentoSaldo: string | null; atrasado: boolean
}

const ABERTOS = ["sinal_pago", "arte", "producao"]
const c2 = (n: number) => Math.round(n * 100) / 100
const dia = (s?: string | null) => (s ?? "").slice(0, 10) || null
export const confirmadoPeloAsaas = (txId?: string | null) => /^asaas:/.test(txId ?? "")
export const idAsaas = (txId?: string | null) => confirmadoPeloAsaas(txId) ? (txId as string).slice(6) : null

/** `vinculados`: ids de lançamento (dig-DIG-0001-sinal…) que aparecem em banco_transacoes.lancamento_ids. */
export function situacaoDaParte(txId: string | null | undefined, lancamentoId: string, vinculados: ReadonlySet<string>, pagoEm?: string | null): SituacaoParte {
  if (confirmadoPeloAsaas(txId) || vinculados.has(lancamentoId)) return "pago"
  return pagoEm ? "em conferencia" : "a receber"
}

/** Sinal e restante do pedido, cada um com valor, situação (regra de "pago" acima), data e id da cobrança Asaas. */
export function partesDoPedido(p: PedidoReceber, vinculados: ReadonlySet<string> = new Set()): { sinal: ParteReceber; restante: ParteReceber } {
  const sinalValor = c2(p.pagamento?.valor ?? p.sinal)
  const restValor = c2(p.pagamentoFinal?.valor ?? restanteDe(p))
  const sinalSit = p.sinalPagoEm ? situacaoDaParte(p.pagamento?.txId, `dig-${p.id}-sinal`, vinculados, p.sinalPagoEm) : "a receber"
  const restSit = situacaoDaParte(p.pagamentoFinal?.txId, `dig-${p.id}-restante`, vinculados, p.restantePagoEm)
  return {
    sinal: { valor: sinalValor, situacao: sinalSit, dataRecebimento: sinalSit === "a receber" ? null : dia(p.pagamento?.data ?? p.sinalPagoEm), asaasId: idAsaas(p.pagamento?.txId) ?? p.asaas?.sinal?.id ?? null },
    restante: { valor: restValor, situacao: restSit, dataRecebimento: restSit === "a receber" ? null : dia(p.pagamentoFinal?.data ?? p.restantePagoEm), asaasId: idAsaas(p.pagamentoFinal?.txId) ?? p.asaas?.restante?.id ?? null },
  }
}

export function digitaisAReceber(pedidos: PedidoReceber[] | undefined, vinculados: ReadonlySet<string> = new Set(), hojeIso = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })): DigitalAReceber[] {
  const out: DigitalAReceber[] = []
  for (const p of pedidos ?? []) {
    if (p.teste || p.status === "cancelado" || p.status === "teste") continue
    const temSinal = !!p.sinalPagoEm
    // Entram: sinal lançado, ou saldo em aberto em pedido ainda vivo (sinal_pago, arte, producao e afins)
    if (!temSinal && !ABERTOS.includes(p.status)) continue
    const { sinal, restante } = partesDoPedido(p, vinculados)
    const restValor = restante.valor
    const pago = c2((sinal.situacao === "pago" ? sinal.valor : 0) + (restante.situacao === "pago" ? restante.valor : 0))
    const emConferencia = c2((sinal.situacao === "em conferencia" ? sinal.valor : 0) + (restante.situacao === "em conferencia" ? restante.valor : 0))
    // Saldo = complemento exato do que ainda não entrou nem está em conferência
    const saldo = restante.situacao === "a receber" ? restValor : 0
    if (saldo <= 0 && emConferencia <= 0) continue
    const vencimentoSaldo = saldo > 0 ? dia(p.prontoEm) : null   // só vence com o material pronto
    out.push({ id: p.id, cliente: p.nome ?? null, status: p.status, total: c2(p.total), sinal, restante, pago, emConferencia, saldo,
      vencimentoSaldo, atrasado: !!vencimentoSaldo && vencimentoSaldo < hojeIso })
  }
  return out
}
