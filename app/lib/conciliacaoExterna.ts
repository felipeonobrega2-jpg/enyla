// Ação conciliacao da porta externa (só a chave do CFO): decide movimentos de banco_transacoes com aplicar() de bancoServidor
// (vincular, vincularVarios, atualizar, criar, ignorar). O "desfazer" de aplicar() apaga lançamentos de verdade e NÃO é exposto:
// aqui desfazer é lógico (lançamentos criados são estornados, a linha fica; a transação volta a pendente).
import { aplicar, type Decisao } from "./bancoServidor"
import { campos, estornarLogico } from "./lancamentoExterno"
import { supabase } from "./supabase"
import type { LancamentoFinanceiro } from "@/app/types"

export type Pedido = Record<string, unknown>
export type Resultado = { ok: true; resultado: string; tx: Record<string, unknown> | null; lancamentos?: unknown } | { ok: false; status: 400 | 404 | 409; erro: string }

const OPS = ["vincular", "vincularVarios", "atualizar", "criar", "ignorar", "desfazer"]
const agora = () => new Date().toISOString()
// Nunca sai documento da contraparte nem o JSON bruto do banco
const limpa = (t: unknown): Record<string, unknown> | null => {
  if (!t || typeof t !== "object") return null
  const { contraparte_doc: _d, bruto: _b, ...resto } = t as Record<string, unknown>
  void _d; void _b
  return resto
}
const lista = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every(x => typeof x === "string" && x.trim())

async function desfazerLogico(txId: string): Promise<Resultado> {
  const { data } = await supabase.from("banco_transacoes").select("*").eq("id", txId).maybeSingle()
  const tx = data as { estado: string; historico?: { em: string; acao: string; detalhe?: string }[] } | null
  if (!tx) return { ok: false, status: 404, erro: "Transação não encontrada." }
  if (tx.estado === "pendente") return { ok: false, status: 409, erro: "A transação já está pendente; não há o que desfazer." }
  const hist = [...(tx.historico ?? [])]
  const ultimo = [...hist].reverse().find(h => h.acao !== "desfeito")
  let antes: { criados?: string[]; restaurar?: { id: string; campos: Partial<LancamentoFinanceiro> }; restaurarVarios?: { id: string; campos: Partial<LancamentoFinanceiro> }[] } = {}
  try { antes = ultimo?.detalhe ? JSON.parse(ultimo.detalhe) : {} } catch { /* detalhe sem JSON: só volta a transação */ }
  for (const r of [...(antes.restaurarVarios ?? []), ...(antes.restaurar ? [antes.restaurar] : [])]) await supabase.from("LancamentoFinanceiro").update(r.campos).eq("id", r.id)
  for (const id of antes.criados ?? []) await estornarLogico(id, "cfo", "estornado ao desfazer a conciliação")
  hist.push({ em: agora(), acao: "desfeito", detalhe: `por cfo (${ultimo?.acao ?? "?"}); lançamentos criados estornados, nenhum apagado` })
  const { data: nova } = await supabase.from("banco_transacoes").update({ estado: "pendente", lancamento_ids: [], historico: hist, atualizado_em: agora() }).eq("id", txId).select("*").maybeSingle()
  return { ok: true, resultado: `Transação devolvida a pendente; ${antes.criados?.length ?? 0} lançamento(s) criado(s) estornado(s), nenhum apagado.`, tx: limpa(nova), lancamentos: { estornados: antes.criados ?? [] } }
}

export async function conciliacao(b: Pedido): Promise<Resultado> {
  const op = b.operacao
  if (typeof op !== "string" || !OPS.includes(op)) return { ok: false, status: 400, erro: `operacao: ${OPS.join(", ")}.` }
  const txId = typeof b.txId === "string" ? b.txId.trim() : ""
  if (!txId) return { ok: false, status: 400, erro: "txId: obrigatório." }
  if (op === "desfazer") return desfazerLogico(txId)

  let d: Decisao
  if (op === "vincular" || op === "atualizar") {
    if (typeof b.lancamentoId !== "string" || !b.lancamentoId.trim()) return { ok: false, status: 400, erro: "lancamentoId: obrigatório." }
    if (op === "vincular") d = { acao: "vincular", lancamentoId: b.lancamentoId }
    else {
      const c = b.campos && typeof b.campos === "object" && !Array.isArray(b.campos) ? campos(b.campos as Pedido) : null
      if (!c || !c.ok || Object.keys(c.v).length === 0) return { ok: false, status: 400, erro: c && !c.ok ? c.erro : "campos: objeto com ao menos um campo do lançamento." }
      d = { acao: "atualizar", lancamentoId: b.lancamentoId, campos: c.v as Partial<LancamentoFinanceiro> }
    }
  } else if (op === "vincularVarios") {
    if (!lista(b.lancamentoIds)) return { ok: false, status: 400, erro: "lancamentoIds: lista de ids." }
    d = { acao: "vincularVarios", lancamentoIds: b.lancamentoIds as string[] }
  } else if (op === "criar") {
    if (!Array.isArray(b.lancamentos) || b.lancamentos.length === 0 || b.lancamentos.some(l => !l || typeof l !== "object")) return { ok: false, status: 400, erro: "lancamentos: lista com ao menos um lançamento." }
    const out: Partial<LancamentoFinanceiro>[] = []
    for (const l of b.lancamentos as Pedido[]) {
      const c = campos(l)
      if (!c.ok) return { ok: false, status: 400, erro: c.erro }
      if (c.v.tipo === undefined || c.v.descricao === undefined) return { ok: false, status: 400, erro: "cada lançamento exige tipo e descricao." }
      out.push(c.v as Partial<LancamentoFinanceiro>)
    }
    d = { acao: "criar", lancamentos: out, ...(typeof b.ensinar === "boolean" ? { ensinar: b.ensinar } : {}) }
  } else d = { acao: "ignorar", ...(typeof b.sempre === "boolean" ? { sempre: b.sempre } : {}) }

  const r = await aplicar(txId, d)
  if (!r.ok) return { ok: false, status: r.erro === "Transação não encontrada." ? 404 : 409, erro: r.erro ?? "Não aplicou." }
  return { ok: true, resultado: `Transação ${txId}: ${op} aplicada.`, tx: limpa(r.tx), lancamentos: { criados: r.criados?.map(l => l.id), atualizados: r.atualizados?.map(a => a.id) } }
}
