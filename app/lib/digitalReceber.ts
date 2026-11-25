// A receber do Digital (#164) e dados que a página do link (#162) lê. Puro: não cobra, não baixa, não concilia.
// PAGO só conta quando (1) o txId do pagamento do pedido começa com "asaas:" (Asaas confirmou, webhook ou consulta) ou
// (2) o LancamentoFinanceiro está ligado a uma transação bancária (banco_transacoes.lancamento_ids contém o id).
// `status = "pago"` sozinho NÃO basta: sem (1) nem (2) o valor fica "em_conferencia".
// Sem nome, documento, telefone, e-mail ou jid na saída.
import type { LancamentoFinanceiro } from "../types"

type Pgto = { txId: string; valor: number; data: string } | null
export type PedidoReceber = {
  id: string; nome?: string | null; status: string; teste?: boolean; total: number; sinal: number; restante?: number; frete?: number
  sinalPagoEm?: string; restantePagoEm?: string; prontoEm?: string
  pagamento?: Pgto; pagamentoFinal?: Pgto
  asaas?: { sinal?: { id: string; valor: number; fatura?: string; em?: string }; restante?: { id: string; valor: number; fatura?: string; em?: string } }
}
export type EstadoPago = "pago" | "em_conferencia" | "pendente"
export type ParteReceber = { valor: number; estado: EstadoPago; via: "asaas" | "banco" | null; recebidoEm: string | null }
export type CobrancaRestante = { id: string; valor: number; vencimento: string; link: string | null }
export type LinhaReceber = {
  id: string; cliente: string | null; status: string
  total: number; sinal: number; pago: number; saldo: number; vencimentoSaldo: string | null
  parteSinal: ParteReceber; parteRestante: ParteReceber
  prontoEm: string | null; restante: number; cobrancaRestante: CobrancaRestante | null
}
export type Vinculos = { lancamentoIds: Set<string>; dataDaTransacao?: Map<string, string> }   // id do lançamento → data da transação

const cent = (n: number) => Math.round(n * 100)
const reais = (c: number) => c / 100
const dia = (s?: string | null) => (s ?? "").slice(0, 10)
const diaBr = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(s).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
export const ehAsaas = (txId?: string | null) => /^asaas:/.test(txId ?? "")
// Mesma conta de cobrarNoAsaas (restante vence 7 dias depois de criada, em Brasília). O Asaas não devolve o vencimento ao pedido.
export const vencimentoCobranca = (em: string) => new Date(new Date(em).getTime() + 7 * 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 10)

export const idLancamento = (id: string, parte: "sinal" | "restante") => `dig-${id}-${parte}`

function parte(id: string, qual: "sinal" | "restante", valor: number, pagoEm: string | undefined, pg: Pgto | undefined, v: Vinculos): ParteReceber {
  if (!pagoEm) return { valor, estado: "pendente", via: null, recebidoEm: null }
  const lid = idLancamento(id, qual)
  if (ehAsaas(pg?.txId)) return { valor: pg?.valor ?? valor, estado: "pago", via: "asaas", recebidoEm: dia(pg?.data ?? pagoEm) }
  if (v.lancamentoIds.has(lid)) return { valor: pg?.valor ?? valor, estado: "pago", via: "banco", recebidoEm: dia(v.dataDaTransacao?.get(lid) ?? pg?.data ?? pagoEm) }
  return { valor: pg?.valor ?? valor, estado: "em_conferencia", via: null, recebidoEm: null }
}

/** Pedidos Digital com sinal lançado ou saldo em aberto (ignora teste, cancelado e quem ainda não pagou o sinal). */
export function receberDigital(pedidos: PedidoReceber[] | undefined, v: Vinculos): LinhaReceber[] {
  const out: LinhaReceber[] = []
  for (const p of pedidos ?? []) {
    if (p.teste || p.status === "cancelado" || p.status === "aguardando_sinal") continue
    const sinalC = cent(p.pagamento?.valor ?? p.sinal)
    const restC = p.restante != null ? cent(p.restante) : Math.max(0, cent(p.total) - cent(p.sinal))   // complemento exato, em centavos
    const sinal = parte(p.id, "sinal", reais(sinalC), p.sinalPagoEm, p.pagamento, v)
    const rest = parte(p.id, "restante", reais(restC), p.restantePagoEm, p.pagamentoFinal, v)
    if (!p.sinalPagoEm && rest.estado === "pendente" && restC === 0) continue
    if (sinal.estado === "pago" && rest.estado === "pago") continue   // nada em aberto nem em conferência
    const pagoC = (sinal.estado === "pago" ? cent(sinal.valor) : 0) + (rest.estado === "pago" ? cent(rest.valor) : 0)
    const c = p.asaas?.restante
    const venc = p.prontoEm ? (c?.em ? vencimentoCobranca(c.em) : diaBr(p.prontoEm)) : null
    out.push({
      id: p.id, cliente: p.nome ?? null, status: p.status,
      total: p.total, sinal: reais(sinalC), pago: reais(pagoC), saldo: reais(restC),
      vencimentoSaldo: rest.estado === "pendente" ? venc : null,
      parteSinal: sinal, parteRestante: rest,
      prontoEm: p.prontoEm ?? null, restante: reais(restC),
      cobrancaRestante: p.prontoEm && c ? { id: c.id, valor: c.valor, vencimento: c.em ? vencimentoCobranca(c.em) : venc ?? "", link: c.fatura || null } : null,
    })
  }
  return out
}

/** Lançamento pendente do restante (dig-{id}-restante): só existe com o sinal lançado e o restante ainda não baixado.
 *  dataVencimento só é preenchida quando o material ficou pronto; antes disso fica vazia (não está atrasado). */
export function restantePendente(p: PedidoReceber & { nome: string | null }, criadoEm: string): (LancamentoFinanceiro & { unidade: "digital" }) | null {
  if (p.teste || p.status === "cancelado" || !p.sinalPagoEm || p.restantePagoEm) return null
  const valorC = p.restante != null ? cent(p.restante) : Math.max(0, cent(p.total) - cent(p.sinal))
  if (valorC <= 0) return null
  const venc = p.prontoEm ? (p.asaas?.restante?.em ? vencimentoCobranca(p.asaas.restante.em) : diaBr(p.prontoEm)) : ""
  return { id: idLancamento(p.id, "restante"), tipo: "receita", categoria: "saldo-final", descricao: `Restante ${p.id} — ${p.nome ?? "Cliente"}`, nomeCliente: p.nome ?? "Cliente",
    valor: reais(valorC), dataVencimento: venc, status: "pendente", formaPagamento: "pix", obs: `digital:${p.id}:restante`, unidade: "digital", criadoEm }
}

// Consulta do CFO (parte=asaas): por pedido, só ids de cobrança, valor, status e data. Sem nome, documento, telefone, e-mail nem jid.
export type CobrancaAsaasLinha = { cobrancaId: string | null; valor: number; status: "confirmado_asaas" | "em_conferencia" | "pendente"; via: "asaas" | "banco" | null; recebidoEm: string | null }
export type LinhaAsaas = { id: string; sinal: CobrancaAsaasLinha; restante: CobrancaAsaasLinha }
const idAsaas = (txId?: string | null) => ehAsaas(txId) ? (txId as string).slice(6) : null
export function cobrancasAsaas(pedidos: PedidoReceber[] | undefined, v: Vinculos): LinhaAsaas[] {
  const linhas = (pedidos ?? []).filter(p => !p.teste)
  const porId = new Map(receberDigital(linhas, v).map(l => [l.id, l]))
  const mk = (p: PedidoReceber, qual: "sinal" | "restante", pr: ParteReceber): CobrancaAsaasLinha => ({
    cobrancaId: idAsaas((qual === "sinal" ? p.pagamento : p.pagamentoFinal)?.txId) ?? p.asaas?.[qual]?.id ?? null, valor: pr.valor,
    status: pr.estado === "pago" ? "confirmado_asaas" : pr.estado, via: pr.via, recebidoEm: pr.recebidoEm })
  return linhas.filter(p => p.status !== "aguardando_sinal" || p.asaas).map(p => {
    const l = porId.get(p.id)
    // Pedido já quitado não vem em receberDigital: recalcula as partes aqui
    const sinal = l?.parteSinal ?? parte(p.id, "sinal", p.pagamento?.valor ?? p.sinal, p.sinalPagoEm, p.pagamento, v)
    const rest = l?.parteRestante ?? parte(p.id, "restante", p.restante ?? Math.max(0, cent(p.total) - cent(p.sinal)) / 100, p.restantePagoEm, p.pagamentoFinal, v)
    return { id: p.id, sinal: mk(p, "sinal", sinal), restante: mk(p, "restante", rest) }
  })
}
