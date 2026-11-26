// Ação lancamento da porta externa: criar, desativar e estornar só na chave do CFO; editar só na chave do CTO (quem confere não edita).
// Cada edição grava um registro por campo (quem, quando em Brasília, campo, antes e depois) em AppConfig.edicoesLancamento (chave JSON aditiva).
// Lançamentos financeiros
// (inclui contas a pagar: despesa não paga). Nunca apaga a linha: desativar e estornar são lógicos (estornadoEm/estornadoPor,
// colunas aditivas da migração 20261126_lancamento_estorno.sql). Marcar como pago é só baixa no livro; não dispara pagamento.
import { randomUUID } from "crypto"
import { supabase } from "./supabase"
import { mudarConfig, lerCampos } from "./configAtomica"
import { brasilia } from "./lancarDespesaExterno"
import { COMPONENTES } from "./calibragem"
import { CATS_DESPESA_PADRAO, CATS_RECEITA_PADRAO, type CategoriaFinanceira } from "@/app/config"

export type Pedido = Record<string, unknown>
export type Resultado = { ok: true; resultado: string; lancamento: Record<string, unknown>; registro?: RegistroEdicao[] } | { ok: false; status: 400 | 404 | 500; erro: string }

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

// Estorno lógico: a linha fica. Grava estornadoEm/estornadoPor e a marca em obs; se o update das colunas falhar, grava só a marca em obs.
export async function estornarLogico(id: string, por: string, motivo: string): Promise<{ ok: boolean; erro?: string }> {
  const { data: atual } = await supabase.from("LancamentoFinanceiro").select("obs").eq("id", id).maybeSingle()
  if (!atual) return { ok: false, erro: "não encontrado" }
  const em = new Date().toISOString()
  const obs = [(atual as { obs?: string | null }).obs, `[${motivo} por ${por} em ${em}]`].filter(Boolean).join(" ")
  let r = await supabase.from("LancamentoFinanceiro").update({ obs, estornadoEm: em, estornadoPor: por }).eq("id", id)
  if (r.error) r = await supabase.from("LancamentoFinanceiro").update({ obs }).eq("id", id)
  return r.error ? { ok: false, erro: r.error.message } : { ok: true }
}

export type RegistroEdicao = { autor: string; em: string; emIso: string; lancamentoId: string; campo: string; antes: unknown; depois: unknown }
const LIMITE_REGISTROS = 2000

// Categoria gravada é o id de uma categoria cadastrada e ativa (despesa: cadastro ou padrão, mais impressao/frete etc. da calibragem).
export function categoriaValida(id: string, tipo: unknown, cfg: { categoriasDespesa?: CategoriaFinanceira[]; categoriasReceita?: CategoriaFinanceira[] }): boolean {
  const lista = tipo === "receita" ? (cfg.categoriasReceita?.length ? cfg.categoriasReceita : CATS_RECEITA_PADRAO) : (cfg.categoriasDespesa?.length ? cfg.categoriasDespesa : CATS_DESPESA_PADRAO)
  if (lista.some(c => c.id === id && c.ativa !== false)) return true
  return tipo !== "receita" && COMPONENTES.some(c => c.id === id && c.id !== "semCategoria")
}

export async function lancamento(b: Pedido, autor = "cfo"): Promise<Resultado> {
  const op = b.operacao
  if (op !== "criar" && op !== "editar" && op !== "desativar" && op !== "estornar") return { ok: false, status: 400, erro: "operacao: criar, editar, desativar ou estornar." }
  const id = typeof b.id === "string" ? b.id.trim() : ""
  if (op !== "criar" && !id) return { ok: false, status: 400, erro: "id: obrigatório em editar, desativar e estornar." }
  const c = op === "desativar" || op === "estornar" ? { ok: true as const, v: {} } : campos(b)
  if (!c.ok) return { ok: false, status: 400, erro: c.erro }
  if (op === "criar" && (c.v.tipo === undefined || c.v.descricao === undefined || c.v.valor === undefined || c.v.dataVencimento === undefined))
    return { ok: false, status: 400, erro: "criar exige tipo, descricao, valor (> 0) e dataVencimento." }
  const em = new Date().toISOString()
  const marca = ` [alterado por ${autor} em ${em}]`

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
  const atual = l as Record<string, unknown> & { obs?: string | null; descricao: string }
  if (Object.keys(c.v).length === 0) return { ok: false, status: 400, erro: "editar: mande ao menos um campo para mudar." }
  if (c.v.categoria !== undefined) {
    const cfg = await lerCategorias()
    if (!categoriaValida(String(c.v.categoria), c.v.tipo ?? atual.tipo, cfg)) return { ok: false, status: 400, erro: "categoria: mande o id de uma categoria cadastrada e ativa (não um nome livre)." }
  }
  const mudanca = { ...c.v, obs: `${(c.v.obs as string | undefined) ?? atual.obs ?? ""}${marca}`.trim() }
  const registro: RegistroEdicao[] = Object.keys(c.v).filter(k => (atual[k] ?? null) !== c.v[k])
    .map(k => ({ autor, em: brasilia(new Date(em)), emIso: em, lancamentoId: id, campo: k, antes: atual[k] ?? null, depois: c.v[k] }))
  try {
    if (registro.length) await mudarConfig<{ edicoesLancamento?: RegistroEdicao[] }>(cfg => ({ edicoesLancamento: [...(cfg.edicoesLancamento ?? []), ...registro].slice(-LIMITE_REGISTROS) }))
  } catch (e) { return { ok: false, status: 500, erro: `Não gravou (registro da edição falhou, o lançamento não foi alterado): ${e instanceof Error ? e.message : "erro"}` } }
  const { error } = await supabase.from("LancamentoFinanceiro").update(mudanca).eq("id", id)
  if (error) return { ok: false, status: 500, erro: `Não gravou: ${error.message}` }
  return { ok: true, resultado: `Lançamento "${(c.v.descricao as string | undefined) ?? atual.descricao}" atualizado.`, lancamento: { ...(l as object), ...mudanca, alteradoPor: autor, alteradoEm: em }, registro }
}

async function lerCategorias() {
  return lerCampos<{ categoriasDespesa?: CategoriaFinanceira[]; categoriasReceita?: CategoriaFinanceira[] }>(["categoriasDespesa", "categoriasReceita"])
}
