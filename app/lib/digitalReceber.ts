// Digital no "a receber" (#164). Funções puras, nada é gravado, sem dado pessoal além do nome já usado no Financeiro.
// PAGO só conta quando confirmado: (1) txId do pagamento começa com "asaas:" (webhook/consulta do Asaas) ou
// (2) o lançamento está ligado a uma transação bancária (banco_transacoes.lancamento_ids). `status = "pago"` sozinho
// NÃO basta: o valor fica "em conferência". O saldo é o complemento exato (centavos únicos do sinal).

type Tx = { txId: string; valor: number; data: string } | null | undefined
export type PedidoReceber = {
  id: string; nome?: string | null; status: string; teste?: boolean; total: number; sinal: number; restante?: number; frete?: number
  sinalPagoEm?: string; restantePagoEm?: string; prontoEm?: string
  pagamento?: Tx; pagamentoFinal?: Tx
  asaas?: { sinal?: { id: string }; restante?: { id: string } }
}
export type TransacaoVinculada = { lancamento_ids: string[] | null; data?: string | null }
export type ParteRecebida = { valor: number; situacao: "confirmado" | "em conferência"; via: "asaas" | "banco" | null; recebidoEm: string | null }
export type LinhaDigitalReceber = {
  id: string; cliente: string; status: string
  total: number; sinal: number; pago: number; emConferencia: number; saldo: number
  vencimentoSaldo: string | null; atrasado: boolean
  sinalParte: ParteRecebida | null; restanteParte: ParteRecebida | null
}

export const STATUS_ABERTOS = ["sinal_pago", "arte", "producao"]
const r2 = (n: number) => Math.round(n * 100) / 100
const dia = (s?: string | null) => (s ?? "").slice(0, 10)
export const idAsaas = (txId?: string | null) => /^asaas:/.test(txId ?? "") ? (txId as string).slice(6) : null

/** Mapa lancamentoId → data da transação bancária que o liga (só ids de lançamento do Digital). */
export function vinculosDoBanco(txs: TransacaoVinculada[]): Map<string, string | null> {
  const m = new Map<string, string | null>()
  for (const t of txs) for (const id of t.lancamento_ids ?? []) if (id.startsWith("dig-")) m.set(id, t.data ?? null)
  return m
}

function parte(lancId: string, pagoEm: string | undefined, tx: Tx, valorPadrao: number, vinculos: Map<string, string | null>): ParteRecebida | null {
  if (!pagoEm) return null
  const valor = r2(tx?.valor ?? valorPadrao)
  if (idAsaas(tx?.txId)) return { valor, situacao: "confirmado", via: "asaas", recebidoEm: dia(tx?.data ?? pagoEm) }
  if (vinculos.has(lancId)) return { valor, situacao: "confirmado", via: "banco", recebidoEm: dia(vinculos.get(lancId) ?? tx?.data ?? pagoEm) }
  return { valor, situacao: "em conferência", via: null, recebidoEm: null }
}

export const restanteDoPedido = (p: PedidoReceber) => r2(p.restante ?? Math.max(0, p.total - p.sinal))

export function recebiveisDigitais(pedidos: PedidoReceber[] | undefined, vinculos: Map<string, string | null>, hoje: string): LinhaDigitalReceber[] {
  const out: LinhaDigitalReceber[] = []
  for (const p of pedidos ?? []) {
    if (p.teste || p.status === "cancelado" || p.status === "aguardando_sinal") continue
    const rest = restanteDoPedido(p)
    const aberto = !p.restantePagoEm && rest > 0
    if (!p.sinalPagoEm && !aberto) continue
    const s = parte(`dig-${p.id}-sinal`, p.sinalPagoEm, p.pagamento, p.sinal, vinculos)
    const r = parte(`dig-${p.id}-restante`, p.restantePagoEm, p.pagamentoFinal, rest, vinculos)
    const partes = [s, r].filter((x): x is ParteRecebida => !!x)
    const pago = r2(partes.filter(x => x.situacao === "confirmado").reduce((t, x) => t + x.valor, 0))
    const emConferencia = r2(partes.filter(x => x.situacao !== "confirmado").reduce((t, x) => t + x.valor, 0))
    if (!STATUS_ABERTOS.includes(p.status) && !aberto && emConferencia <= 0) continue   // fora do ar: enviado e quitado (confirmado)
    const saldo = aberto ? rest : 0
    const vencimentoSaldo = saldo > 0 && p.prontoEm ? dia(p.prontoEm) : null   // sem material pronto, sem vencimento (não fica atrasado)
    out.push({ id: p.id, cliente: p.nome ?? "Cliente", status: p.status, total: r2(p.sinal + rest), sinal: r2(p.sinal), pago, emConferencia, saldo,
      vencimentoSaldo, atrasado: !!vencimentoSaldo && vencimentoSaldo < hoje, sinalParte: s, restanteParte: r })
  }
  return out
}

/** Consulta do CFO (parte=asaas): por pedido, sem nome, documento, telefone, e-mail ou jid. */
export function consultaAsaas(pedidos: PedidoReceber[] | undefined, vinculos: Map<string, string | null>) {
  return (pedidos ?? []).filter(p => !p.teste).map(p => {
    const rest = restanteDoPedido(p)
    const ficha = (parteNome: "sinal" | "restante", pagoEm: string | undefined, tx: Tx, valor: number, cobranca?: { id: string }) => {
      const q = parte(`dig-${p.id}-${parteNome}`, pagoEm, tx, valor, vinculos)
      return { cobrancaAsaas: idAsaas(tx?.txId) ?? cobranca?.id ?? null, valor: q?.valor ?? valor,
        status: q ? (q.via === "asaas" ? "confirmado pelo Asaas" : q.via === "banco" ? "confirmado pelo banco" : "em conferência") : "aguardando pagamento", recebidoEm: q?.recebidoEm ?? null }
    }
    return { id: p.id, pedidoStatus: p.status, sinal: ficha("sinal", p.sinalPagoEm, p.pagamento, p.sinal, p.asaas?.sinal),
      restante: ficha("restante", p.restantePagoEm, p.pagamentoFinal, rest, p.asaas?.restante) }
  })
}
