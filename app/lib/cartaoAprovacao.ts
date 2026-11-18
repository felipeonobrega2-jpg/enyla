// Pagamento no cartão pela página de aprovação (Mercado Pago): registro e baixa no financeiro.
// Os dados do cartão nunca passam pelo sistema (ficam no formulário do Mercado Pago).
import type { KanbanCard } from "@/app/types"

export const PARCELAS_MAX_CARTAO = 12   // juros das parcelas conforme a sua conta do Mercado Pago

export type PagamentoCartao = { id?: string; status: string; valor: number; parcelas: number; em?: string; recusas?: string[]; baixado?: boolean }

// Pago no cartão: o sinal pendente criado na aprovação vira o pagamento total (100%), senão cria um lançamento novo
export async function registrarPagoNoCartao(numero: string, card: Pick<KanbanCard, "nomeCliente" | "loteId" | "loteNumero">, pg: PagamentoCartao) {
  const { supabase } = await import("@/app/lib/supabase")
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
  const campos = {
    valor: pg.valor, status: "pago", dataPagamento: hoje, formaPagamento: "cartao_credito", categoria: "pedido",
    descricao: `Pago no cartão (100%)${pg.parcelas > 1 ? ` em ${pg.parcelas}x` : ""} · ${numero}`,
    obs: `Mercado Pago ${pg.id ?? ""} · cliente pagou na página de aprovação`,
  }
  const { data: sinal } = await supabase.from("LancamentoFinanceiro").select("id").eq("cardNumero", numero).eq("categoria", "sinal").eq("status", "pendente").limit(1)
  if (sinal?.[0]) {
    await supabase.from("LancamentoFinanceiro").update(campos).eq("id", sinal[0].id)
  } else {
    const { data: ja } = await supabase.from("LancamentoFinanceiro").select("id").ilike("obs", `%Mercado Pago ${pg.id}%`).limit(1)
    if (!ja?.length) await supabase.from("LancamentoFinanceiro").insert({
      id: crypto.randomUUID(), tipo: "receita", dataVencimento: hoje, cardNumero: numero, nomeCliente: card.nomeCliente,
      loteId: card.loteId ?? null, loteNumero: card.loteNumero ?? null, criadoEm: new Date().toISOString(), ...campos,
    })
  }
}
