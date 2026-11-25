// Dinheiro do digital no Financeiro, como LINHA SEPARADA (unidade "digital"): a margem do Offset não se mistura.
// Cada pedido gera até 3 lançamentos, com id fixo (sincronizar de novo não duplica):
//   sinal recebido (receita) · restante recebido (receita) · custo da Villa (despesa; paga no acerto da semana)
// O Pix que o sistema achou no extrato já fica conciliado com o lançamento.
import type { LancamentoFinanceiro } from "../types"

type Pedido = {
  id: string; nome: string | null; status: string; teste?: boolean; custo: number; sinal: number; restante?: number; total: number
  sinalPagoEm?: string; restantePagoEm?: string; prontoEm?: string; villaEnviadoEm?: string; acertadoEm?: string
  pagamento?: { txId: string; valor: number; data: string } | null; pagamentoFinal?: { txId: string; valor: number; data: string } | null
}
export type LancamentoDigital = LancamentoFinanceiro & { unidade: "digital"; txBanco?: string | null }

const dia = (iso?: string | null) => (iso ?? "").slice(0, 10)
// Acerto com a Villa é toda segunda: o custo vence na segunda seguinte ao envio
export const segundaDoAcerto = (iso: string) => {
  const d = new Date(dia(iso) + "T12:00:00Z"); const falta = ((8 - d.getUTCDay()) % 7) || 7
  d.setUTCDate(d.getUTCDate() + falta); return d.toISOString().slice(0, 10)
}
const forma = (txId?: string | null): LancamentoFinanceiro["formaPagamento"] => /^infinitepay:/.test(txId ?? "") ? "cartao_credito" : "pix"
const doBanco = (txId?: string | null) => txId && !/^(infinitepay|asaas):/.test(txId) ? txId : null

const c2 = (n: number) => Math.round(n * 100) / 100
/** Saldo do pedido: o `restante` gravado (já com frete) ou total − sinal, em centavos exatos. */
export const restanteDe = (p: { restante?: number; total: number; sinal: number }) => c2(p.restante ?? Math.max(0, p.total - p.sinal))

export function lancamentosDoPedido(p: Pedido, criadoEm = new Date().toLocaleString("pt-BR")): LancamentoDigital[] {
  if (p.teste) return []
  const nome = p.nome ?? "Cliente"
  const base = { nomeCliente: nome, unidade: "digital" as const, criadoEm }
  const out: LancamentoDigital[] = []
  if (p.sinalPagoEm) out.push({ ...base, id: `dig-${p.id}-sinal`, tipo: "receita", categoria: "sinal", descricao: `Sinal ${p.id} — ${nome}`,
    valor: p.pagamento?.valor ?? p.sinal, dataVencimento: dia(p.sinalPagoEm), dataPagamento: dia(p.pagamento?.data ?? p.sinalPagoEm), status: "pago",
    formaPagamento: forma(p.pagamento?.txId), obs: `digital:${p.id}:sinal`, txBanco: doBanco(p.pagamento?.txId) })
  if (p.restantePagoEm) out.push({ ...base, id: `dig-${p.id}-restante`, tipo: "receita", categoria: "saldo-final", descricao: `Restante ${p.id} — ${nome}`,
    valor: p.pagamentoFinal?.valor ?? p.restante ?? Math.max(0, p.total - p.sinal), dataVencimento: dia(p.restantePagoEm), dataPagamento: dia(p.pagamentoFinal?.data ?? p.restantePagoEm), status: "pago",
    formaPagamento: forma(p.pagamentoFinal?.txId), obs: `digital:${p.id}:restante`, txBanco: doBanco(p.pagamentoFinal?.txId) })
  // Restante ainda a receber: lançamento pendente, valor exato do pedido (centavos do pedido, sem arredondar para a metade).
  // Só vence depois que o material fica pronto (prontoEm); até lá fica sem vencimento e não conta como atrasado.
  if (p.sinalPagoEm && !p.restantePagoEm && p.status !== "cancelado") out.push({ ...base, id: `dig-${p.id}-restante`, tipo: "receita", categoria: "saldo-final", descricao: `Restante ${p.id} — ${nome}`,
    valor: restanteDe(p), dataVencimento: p.prontoEm ? dia(p.prontoEm) : "", status: "pendente", formaPagamento: "pix", obs: `digital:${p.id}:restante` })
  if (p.villaEnviadoEm && p.status !== "cancelado" && p.custo > 0) out.push({ ...base, id: `dig-${p.id}-villa`, tipo: "despesa", categoria: "fornecedor", descricao: `Villa · ${p.id} — ${nome}`,
    valor: p.custo, dataVencimento: segundaDoAcerto(p.villaEnviadoEm), ...(p.acertadoEm ? { dataPagamento: dia(p.acertadoEm) } : {}), status: p.acertadoEm ? "pago" : "pendente",
    obs: `digital:${p.id}:villa` })
  return out
}
// O que mudou num lançamento que já existe (só os campos que o digital controla)
export const mudou = (a: Partial<LancamentoFinanceiro>, b: Partial<LancamentoFinanceiro>) =>
  a.valor !== b.valor || (a.dataVencimento ?? "") !== (b.dataVencimento ?? "") || a.status !== b.status || (a.dataPagamento ?? null) !== (b.dataPagamento ?? null)

// Servidor: cria o que falta, atualiza o que mudou (custo da Villa acertado) e concilia o Pix com o banco
export async function sincronizarDigitalNoFinanceiro(): Promise<{ criados: number; atualizados: number; conciliados: number } | string> {
  const { supabase } = await import("./supabase")
  const { lerConfig } = await import("./configAtomica")
  const cfg = await lerConfig<{ pedidosDigitais?: Pedido[] }>()
  const desejados = (cfg.pedidosDigitais ?? []).flatMap(p => lancamentosDoPedido(p))
  if (!desejados.length) return { criados: 0, atualizados: 0, conciliados: 0 }
  const { data: existentes, error } = await supabase.from("LancamentoFinanceiro").select("id, valor, status, dataPagamento, dataVencimento").like("id", "dig-%").limit(5000)
  if (error) return `erro: ${error.message}`
  const ja = new Map((existentes ?? []).map(e => [e.id as string, e as Partial<LancamentoFinanceiro>]))
  let criados = 0, atualizados = 0, conciliados = 0
  for (const l of desejados) {
    const { txBanco, ...linha } = l
    const e = ja.get(l.id)
    if (!e) {
      const { error: er } = await supabase.from("LancamentoFinanceiro").insert(linha)
      if (er) return `erro ao lançar ${l.id}: ${er.message}`
      criados++
    } else if (mudou(e, l)) {
      await supabase.from("LancamentoFinanceiro").update({ valor: l.valor, dataVencimento: l.dataVencimento, status: l.status, dataPagamento: l.dataPagamento ?? null }).eq("id", l.id)
      atualizados++
    }
    // Pix achado no extrato: o movimento do banco fica conciliado com este lançamento
    if (txBanco) {
      const { data: tx } = await supabase.from("banco_transacoes").select("id, lancamento_ids").eq("id", txBanco).maybeSingle()
      const ids = (tx?.lancamento_ids as string[] | null) ?? []
      if (tx && !ids.includes(l.id) && !ids.length) {
        await supabase.from("banco_transacoes").update({ lancamento_ids: [l.id], estado: "vinculada" }).eq("id", txBanco)
        conciliados++
      }
    }
  }
  return { criados, atualizados, conciliados }
}
