// Servidor: pedidos Digital (sem teste) + ids de lançamento ligados a uma transação bancária (banco_transacoes.lancamento_ids).
// Só leitura. Usado pela porta (?o=financeiro) e pela tela do Financeiro.
import { supabase } from "./supabase"
import { lerCampos } from "./configAtomica"
import type { PedidoReceber } from "./digitalReceber"

export async function digitalComVinculos(): Promise<{ pedidos: PedidoReceber[]; vinculados: Set<string> }> {
  const { pedidosDigitais } = await lerCampos<{ pedidosDigitais?: PedidoReceber[] }>(["pedidosDigitais"])
  const pedidos = (pedidosDigitais ?? []).filter(p => !p.teste)
  const ids = pedidos.flatMap(p => [`dig-${p.id}-sinal`, `dig-${p.id}-restante`])
  const vinculados = new Set<string>()
  if (ids.length) {
    const { data } = await supabase.from("banco_transacoes").select("lancamento_ids").overlaps("lancamento_ids", ids)
    for (const t of (data ?? []) as { lancamento_ids: string[] | null }[]) for (const i of t.lancamento_ids ?? []) vinculados.add(i)
  }
  return { pedidos, vinculados }
}
