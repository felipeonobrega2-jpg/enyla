// Servidor: junta pedidosDigitais (AppConfig) com os vínculos bancários (banco_transacoes.lancamento_ids). Só leitura.
import { supabase } from "./supabase"
import { lerConfigLinha } from "./configAtomica"
import type { PedidoReceber, Vinculos } from "./digitalReceber"

export async function lerVinculosDigital(): Promise<Vinculos> {
  const { data } = await supabase.from("banco_transacoes").select("data, lancamento_ids").not("lancamento_ids", "is", null).limit(5000)
  const ids = new Set<string>(), datas = new Map<string, string>()
  for (const t of (data ?? []) as { data?: string; lancamento_ids?: string[] | null }[])
    for (const id of t.lancamento_ids ?? []) if (typeof id === "string" && id.startsWith("dig-")) { ids.add(id); if (t.data) datas.set(id, String(t.data).slice(0, 10)) }
  return { lancamentoIds: ids, dataDaTransacao: datas }
}
export async function lerPedidosDigitais(): Promise<PedidoReceber[]> {
  const { data } = await lerConfigLinha()
  return (((data?.data ?? {}) as { pedidosDigitais?: PedidoReceber[] }).pedidosDigitais ?? [])
}
