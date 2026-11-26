// Acompanhamento do pedido Digital montado no servidor: o pagamento vem só do "a receber" (lançamentos do Digital);
// fora dele, "em conferência". Usado pelo /d/[id] (GET) e pelo /d/[id]/acompanhar.
import { supabase } from "./supabase"
import { receberDigital } from "./receberDigital"
import { acompanhamentoDigital } from "./acompanhamentoDigital"
import type { PedidoComBriefing } from "./digital"
import type { LancamentoFinanceiro } from "@/app/types"

export async function acompanhamentoDe(p: PedidoComBriefing) {
  if (!p.sinalPagoEm) return null
  const { data } = await supabase.from("LancamentoFinanceiro").select("*").like("id", `dig-${p.id}-%`).eq("unidade", "digital").limit(20)
  const receber = receberDigital([p], (data ?? []) as LancamentoFinanceiro[]).find(r => r.digital.id === p.id)
  return acompanhamentoDigital(p, receber)
}
