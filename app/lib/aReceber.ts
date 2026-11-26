// UMA conta só para o "A receber": a porta externa (?o=financeiro&parte=receber) e a tela inicial (andar Financeiro) leem daqui.
// Três números: a receber de pedidos (Offset + Digital, sem comissão), comissão pendente de parceria e o total (a soma dos dois).
// Só leitura: nada é gravado, criado, apagado ou cobrado.
import type { KanbanCard, LancamentoFinanceiro } from "../types"
import { montarPedidos, recebiveis } from "./negocio"
import { receberDigital, juntarPedidos, type PedidoParaReceber } from "./receberDigital"

const r2 = (n: number) => Math.round(n * 100) / 100

export type NegocioComissao = { comissaoValor: number; status: string }

export function totaisAReceber(kanban: KanbanCard[], lancamentos: LancamentoFinanceiro[], negocios: NegocioComissao[] = [], pedidosDigitais?: PedidoParaReceber[]) {
  const offset = lancamentos.filter(l => (l.unidade ?? "offset") === "offset" && l.formaPagamento !== "conta")
  const digLancs = lancamentos.filter(l => l.unidade === "digital" && l.formaPagamento !== "conta")
  const digital = receberDigital(pedidosDigitais, digLancs)
  const rec = recebiveis(juntarPedidos(montarPedidos(kanban, offset), digital), [...offset, ...digLancs])
  const pedidos = r2(rec.aReceber)
  const comissaoPendente = r2(negocios.filter(n => n.status === "pendente").reduce((s, n) => s + n.comissaoValor, 0))
  return { rec, digital, pedidos, comissaoPendente, total: r2(pedidos + comissaoPendente) }
}
