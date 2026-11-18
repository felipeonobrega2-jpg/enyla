// Pagamento do pedido inteiro pela página de aprovação (InfinitePay): registro, confirmação e baixa no financeiro.
// Os dados do cartão nunca passam pelo sistema (ficam na página da InfinitePay).
import type { KanbanCard } from "@/app/types"
import { conferirInfinitePay, numeroDoOrderNsu } from "./infinitePay"

// pagamentosCartao[numero]: o link criado e o resultado. status: "aguardando" | "pago"
export type PagamentoCartao = { orderNsu?: string; url?: string; status: string; valor: number; parcelas?: number; metodo?: string; transacao?: string; em?: string; baixado?: boolean }

const metodoDe = (m?: string) => m === "pix" ? "pix" as const : "cartao_credito" as const

// Pago: o sinal pendente criado na aprovação vira o pagamento total (100%), senão cria um lançamento novo
export async function registrarPagoNoCartao(numero: string, card: Pick<KanbanCard, "nomeCliente" | "loteId" | "loteNumero">, pg: PagamentoCartao) {
  const { supabase } = await import("@/app/lib/supabase")
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
  const forma = metodoDe(pg.metodo)
  const marca = `InfinitePay ${pg.transacao ?? pg.orderNsu ?? ""}`
  const campos = {
    valor: pg.valor, status: "pago", dataPagamento: hoje, formaPagamento: forma, categoria: "pedido",
    descricao: `Pago ${forma === "pix" ? "no Pix" : "no cartão"} (100%)${(pg.parcelas ?? 1) > 1 ? ` em ${pg.parcelas}x` : ""} · ${numero}`,
    obs: `${marca} · cliente pagou na página de aprovação`,
  }
  const { data: ja } = await supabase.from("LancamentoFinanceiro").select("id").ilike("obs", `%${marca}%`).limit(1)
  if (ja?.length) return
  const { data: sinal } = await supabase.from("LancamentoFinanceiro").select("id").eq("cardNumero", numero).eq("categoria", "sinal").eq("status", "pendente").limit(1)
  if (sinal?.[0]) await supabase.from("LancamentoFinanceiro").update(campos).eq("id", sinal[0].id)
  else await supabase.from("LancamentoFinanceiro").insert({
    id: crypto.randomUUID(), tipo: "receita", dataVencimento: hoje, cardNumero: numero, nomeCliente: card.nomeCliente,
    loteId: card.loteId ?? null, loteNumero: card.loteNumero ?? null, criadoEm: new Date().toISOString(), ...campos,
  })
}

// Volta do checkout ou webhook: só baixa depois de conferir na InfinitePay (os dois podem ser forjados) e se o
// valor bate com o pedido. Pode ser chamada várias vezes: baixa uma vez só.
export async function confirmarPagamentoInfinitePay(a: { nsu: string; transacao: string; slug: string }): Promise<"pago" | "pendente" | "invalido"> {
  const numero = numeroDoOrderNsu(a.nsu)
  if (!numero || !a.transacao || !a.slug) return "invalido"
  const { supabase } = await import("@/app/lib/supabase")
  const { gravarCampos } = await import("./configAtomica")
  const { data: cfg } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const todos = ((cfg?.data as Record<string, unknown> | null)?.pagamentosCartao ?? {}) as Record<string, PagamentoCartao>
  const reg = todos[numero]
  if (!reg || reg.orderNsu !== a.nsu) return "invalido"
  if (reg.baixado) return "pago"
  const c = await conferirInfinitePay(a)
  if (!c.pago) return "pendente"
  if (c.valorCentavos != null && c.valorCentavos !== Math.round(reg.valor * 100)) { console.error("[infinitepay] valor não bate", numero, c.valorCentavos, reg.valor); return "invalido" }
  const novo: PagamentoCartao = { ...reg, status: "pago", baixado: true, parcelas: c.parcelas ?? 1, metodo: c.metodo, transacao: a.transacao }
  await gravarCampos({ pagamentosCartao: { ...todos, [numero]: novo } })
  const { data: card } = await supabase.from("KanbanCard").select("nomeCliente, loteId, loteNumero").eq("numero", numero).maybeSingle()
  if (card) await registrarPagoNoCartao(numero, card, novo)
  const { notificar, LINK_SISTEMA } = await import("./notificar")
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  await notificar(c.metodo === "pix" ? "Pago no Pix (InfinitePay)" : "Pago no cartão", `${numero} · ${card?.nomeCliente ?? ""} · ${brl(reg.valor)}${(c.parcelas ?? 1) > 1 ? ` em ${c.parcelas}x` : ""}`,
    { prioridade: "alta", tags: ["credit_card"], link: `${LINK_SISTEMA}/?aba=painel` }).catch(() => null)
  return "pago"
}
