// "A receber" do Digital, no mesmo formato do Pedido do Offset (negocio.ts), para a tela do Financeiro, a porta
// ?o=financeiro&parte=receber e a página do cliente lerem UMA base só. Funções puras: nada é gravado nem cobrado.
// Pago e saldo saem dos lançamentos (dig-{id}-sinal / dig-{id}-restante): pago soma o recebido, pendente é o saldo.
import { COL_FECHADO, type LancamentoFinanceiro } from "../types"
import type { Pedido } from "./negocio"

// O lançamento pendente do restante ainda não tem vencimento (só vence quando o material fica pronto).
// A coluna exige data, e vazio contaria como atrasado nas telas: usa-se uma data-sentinela que nunca vence.
export const SEM_VENCIMENTO = "9999-12-31"

export type PedidoParaReceber = { id: string; nome?: string | null; status: string; teste?: boolean; total: number; sinal: number; quantidade?: number; sinalPagoEm?: string }
export type PedidoReceberDigital = Pedido & { digital: { id: string; sinal: number; pagoEm: string | null; vencimento: string | null } }

const ROTULO: Record<string, string> = { sinal_pago: "Sinal pago", arte: "Arte", producao: "Produção", enviado: "Enviado", aguardando_sinal: "Aguardando sinal" }
const r2 = (n: number) => Math.round(n * 100) / 100
const dia = (s?: string | null) => (s ?? "").slice(0, 10)
const ehDigital = (l: LancamentoFinanceiro) => l.unidade === "digital" && l.tipo === "receita" && !l.estornadoEm
const idDoLancamento = (l: LancamentoFinanceiro) => /^dig-(.+)-(sinal|restante)$/.exec(l.id)?.[1] ?? null
const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

export const ehDataDeVencimento = (s?: string | null) => !!s && s !== SEM_VENCIMENTO

export function receberDigital(pedidos: PedidoParaReceber[] | undefined, lancamentos: LancamentoFinanceiro[], hoje = hojeSP()): PedidoReceberDigital[] {
  const porPedido = new Map<string, LancamentoFinanceiro[]>()
  for (const l of lancamentos) {
    const id = ehDigital(l) ? idDoLancamento(l) : null
    if (id) porPedido.set(id, [...(porPedido.get(id) ?? []), l])
  }
  const out: PedidoReceberDigital[] = []
  for (const [id, receitas] of porPedido) {
    const p = (pedidos ?? []).find(x => x.id === id)
    if (p && (p.teste || p.status === "cancelado")) continue
    const pagas = receitas.filter(l => l.status === "pago")
    const pendentes = receitas.filter(l => l.status !== "pago")
    const recebido = r2(pagas.reduce((s, l) => s + l.valor, 0))
    const saldo = r2(pendentes.reduce((s, l) => s + l.valor, 0))
    const pagoEm = pagas.map(l => dia(l.dataPagamento ?? l.dataVencimento)).filter(Boolean).sort().at(-1) ?? null
    const vencimento = pendentes.map(l => l.dataVencimento).filter(ehDataDeVencimento).sort()[0] ?? null
    const sinalLanc = receitas.find(l => l.id === `dig-${id}-sinal`)
    const total = p?.total ?? r2(recebido + saldo)
    const vencido = vencimento && vencimento < hoje ? saldo : 0
    out.push({
      key: `dig-${id}`, tipo: "card", numero: id, nomeCliente: p?.nome ?? receitas[0].nomeCliente ?? "Cliente", cards: [],
      coluna: COL_FECHADO, etapa: ROTULO[p?.status ?? ""] ?? "Digital", dataFechamento: dia(p?.sinalPagoEm) || undefined,
      valor: total, quantidade: p?.quantidade ?? 0, receitas, despesas: [], recebido, sobras: 0, venda: total, sobrasQuitadas: [],
      aReceber: saldo, cobrado: saldo, vencido, semCobranca: 0, custoDireto: 0,
      digital: { id, sinal: p?.sinal ?? sinalLanc?.valor ?? 0, pagoEm, vencimento },
    })
  }
  return out.sort((a, b) => a.numero.localeCompare(b.numero))
}

export const ehPedidoDigital = (p: Pedido): p is PedidoReceberDigital => !!(p as Partial<PedidoReceberDigital>).digital

/** Offset e Digital na mesma lista (a conta de cada um não muda). */
export const juntarPedidos = (offset: Pedido[], digital: Pedido[]): Pedido[] => [...offset, ...digital]
