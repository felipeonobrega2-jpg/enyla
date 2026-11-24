// Ação lancamento da porta externa (só a chave do CFO): criar, editar, desativar e estornar lançamentos financeiros
// (inclui contas a pagar: despesa não paga). Nunca apaga a linha: desativar e estornar são lógicos (estornadoEm/estornadoPor,
// colunas aditivas da migração 20261126_lancamento_estorno.sql). Marcar como pago é só baixa no livro; não dispara pagamento.
import { randomUUID } from "crypto"
import { supabase } from "./supabase"

export type Pedido = Record<string, unknown>
export type Resultado = { ok: true; resultado: string; lancamento: Record<string, unknown> } | { ok: false; status: 400 | 404 | 500; erro: string }

const TIPOS = ["receita", "despesa"], STATUS = ["pendente", "pago", "atrasado"]
const FORMAS = ["pix", "boleto", "cartao_credito", "cartao_debito", "dinheiro", "transferencia", "outro", "conta"]
const TEXTOS = ["categoria", "subcategoria", "contaId", "fornecedorId", "obs", "cardId", "cardNumero", "nomeCliente", "loteId", "loteNumero"] as const
const DATA = /^\d{4}-\d{2}-\d{2}$/
const dataOk = (v: unknown) => typeof v === "string" && DATA.test(v) && !Number.isNaN(Date.parse(v))

export function campos(b: Pedido): { ok: true; v: Record<string, unknown> } | { ok: false; erro: string } {
  const v: Record<string, unknown> = {}
  if (b.tipo !== undefined) { if (!TIPOS.includes(b.tipo as string)) return { ok: false, erro: "tipo: receita ou despesa." }; v.tipo = b.tipo }
  if (b.descricao !== undefined) {
    if (typeof b.descricao !== "string" || !b.descricao.trim()) return { ok: false, erro: "descricao: texto não vazio." }
    v.descricao = b.descricao.trim()
  }
  if (b.valor !== undefined) {
    if (typeof b.valor !== "number" || !Number.isFinite(b.valor) || b.valor <= 0) return { ok: false, erro: "valor: número maior que zero, em reais." }
    v.valor = b.valor
  }
  for (const k of ["dataVencimento", "dataPagamento"] as const) {
    if (b[k] === undefined) continue
    if (!dataOk(b[k])) return { ok: false, erro: `${k}: data AAAA-MM-DD.` }
    v[k] = b[k]
  }
  if (b.status !== undefined) { if (!STATUS.includes(b.status as string)) return { ok: false, erro: "status: pendente, pago ou atrasado." }; v.status = b.status }
  if (b.formaPagamento !== undefined) { if (!FORMAS.includes(b.formaPagamento as string)) return { ok: false, erro: `formaPagamento: ${FORMAS.join(", ")}.` }; v.formaPagamento = b.formaPagamento }
  for (const k of TEXTOS) {
    if (b[k] === undefined) continue
    if (typeof b[k] !== "string") return { ok: false, erro: `${k}: texto.` }
    v[k] = b[k]
  }
  if (v.status === "pago" && v.dataPagamento === undefined && b.operacao === "criar") v.dataPagamento = v.dataVencimento
  return { ok: true, v }
}

// Estorno lógico: a linha fica. Se a migração ainda não rodou, grava só a marca em obs.
export async function estornarLogico(id: string, por: string, motivo: string): Promise<{ ok: boolean; erro?: string }> {
  const { data: atual } = await supabase.from("LancamentoFinanceiro").select("obs").eq("id", id).maybeSingle()
  if (!atual) return { ok: false, erro: "não encontrado" }
  const em = new Date().toISOString()
  const obs = [(atual as { obs?: string | null }).obs, `[${motivo} por ${por} em ${em}]`].filter(Boolean).join(" ")
  let r = await supabase.from("LancamentoFinanceiro").update({ obs, estornadoEm: em, estornadoPor: por }).eq("id", id)
  if (r.error) r = await supabase.from("LancamentoFinanceiro").update({ obs }).eq("id", id)
  return r.error ? { ok: false, erro: r.error.message } : { ok: true }
}

export async function lancamento(b: Pedido): Promise<Resultado> {
  const op = b.operacao
  if (op !== "criar" && op !== "editar" && op !== "desativar" && op !== "estornar") return { ok: false, status: 400, erro: "operacao: criar, editar, desativar ou estornar." }
  const id = typeof b.id === "string" ? b.id.trim() : ""
  if (op !== "criar" && !id) return { ok: false, status: 400, erro: "id: obrigatório em editar, desativar e estornar." }
  const c = op === "desativar" || op === "estornar" ? { ok: true as const, v: {} } : campos(b)
  if (!c.ok) return { ok: false, status: 400, erro: c.erro }
  if (op === "criar" && (c.v.tipo === undefined || c.v.descricao === undefined || c.v.valor === undefined || c.v.dataVencimento === undefined))
    return { ok: false, status: 400, erro: "criar exige tipo, descricao, valor (> 0) e dataVencimento." }
  const em = new Date().toISOString()
  const marca = ` [alterado por cfo em ${em}]`

  if (op === "desativar" || op === "estornar") {
    const { data: l } = await supabase.from("LancamentoFinanceiro").select("*").eq("id", id).maybeSingle()
    if (!l) return { ok: false, status: 404, erro: `Lançamento ${id} não encontrado.` }
    const r = await estornarLogico(id, "cfo", op === "estornar" ? "estornado" : "desativado")
    if (!r.ok) return { ok: false, status: 500, erro: `Não gravou: ${r.erro}` }
    return { ok: true, resultado: `Lançamento "${(l as { descricao: string }).descricao}" ${op === "estornar" ? "estornado" : "desativado"} (a linha continua no livro).`, lancamento: { id, estornadoPor: "cfo", estornadoEm: em, alteradoPor: "cfo", alteradoEm: em } }
  }

  if (op === "criar") {
    const linha: Record<string, unknown> = { status: "pendente", ...c.v, id: randomUUID(), criadoEm: new Date().toLocaleString("pt-BR"), obs: `${(c.v.obs as string | undefined) ?? ""}${marca}`.trim() }
    const { error } = await supabase.from("LancamentoFinanceiro").insert(linha)
    if (error) return { ok: false, status: 500, erro: `Não gravou: ${error.message}` }
    return { ok: true, resultado: `Lançamento "${linha.descricao}" criado (${linha.tipo}, R$ ${linha.valor}, vence ${linha.dataVencimento}).`, lancamento: { ...linha, alteradoPor: "cfo", alteradoEm: em } }
  }

  const { data: l } = await supabase.from("LancamentoFinanceiro").select("*").eq("id", id).maybeSingle()
  if (!l) return { ok: false, status: 404, erro: `Lançamento ${id} não encontrado.` }
  const atual = l as { obs?: string | null; descricao: string }
  if (Object.keys(c.v).length === 0) return { ok: false, status: 400, erro: "editar: mande ao menos um campo para mudar." }
  const mudanca = { ...c.v, obs: `${(c.v.obs as string | undefined) ?? atual.obs ?? ""}${marca}`.trim() }
  const { error } = await supabase.from("LancamentoFinanceiro").update(mudanca).eq("id", id)
  if (error) return { ok: false, status: 500, erro: `Não gravou: ${error.message}` }
  return { ok: true, resultado: `Lançamento "${(c.v.descricao as string | undefined) ?? atual.descricao}" atualizado.`, lancamento: { ...(l as object), ...mudanca, alteradoPor: "cfo", alteradoEm: em } }
}
