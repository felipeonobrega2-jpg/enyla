// Porta externa, ação corrigir_categoria_lancamento (só a chave do CTO): corrige SÓ o campo categoria de um lançamento de despesa
// que já existe. Valor, data, status, lote e o resto não mudam; não apaga nem relança. Grava o ID de uma categoria cadastrada.
// Auditoria: AppConfig.correcoesCategoria (chave JSON nova, aditiva) com quem, quando (Brasília), categoria anterior e nova.
import { supabase } from "./supabase"
import { lerCampos, mudarConfig } from "./configAtomica"
import { brasilia, categoriaCadastrada } from "./lancarDespesaExterno"
import type { CategoriaFinanceira } from "@/app/config"

export type RegistroCorrecao = { autor: string; em: string; emIso: string; lancamentoId: string; categoriaAnterior: string | null; categoriaNova: string }
export type Resultado =
  | { ok: true; resultado: string; lancamento: { id: string; categoria: string }; registro: RegistroCorrecao | null }
  | { ok: false; status: 400 | 404 | 500; erro: string }

export async function corrigirCategoriaExterno(diretor: string, b: Record<string, unknown>): Promise<Resultado> {
  const id = typeof b.lancamentoId === "string" ? b.lancamentoId.trim() : ""
  if (!id) return { ok: false, status: 400, erro: "lancamentoId: obrigatório (id do lançamento)." }
  const { categoriasDespesa } = await lerCampos<{ categoriasDespesa?: CategoriaFinanceira[] }>(["categoriasDespesa"])
  const c = categoriaCadastrada(categoriasDespesa, b.categoria)
  if (!c.ok) return { ok: false, status: 400, erro: c.erro }

  const { data } = await supabase.from("LancamentoFinanceiro").select("id, tipo, categoria").eq("id", id)
  const l = ((data ?? []) as { id: string; tipo?: string; categoria?: string | null }[]).find(x => x.id === id)
  if (!l) return { ok: false, status: 404, erro: `Lançamento ${id} não encontrado.` }
  if (l.tipo !== "despesa") return { ok: false, status: 400, erro: "Só lançamentos de despesa têm a categoria corrigida por aqui." }
  if (l.categoria === c.id) return { ok: true, resultado: `Lançamento ${id} já está na categoria ${c.id} (nada mudou).`, lancamento: { id, categoria: c.id }, registro: null }

  const agora = new Date()
  const registro: RegistroCorrecao = { autor: diretor, em: brasilia(agora), emIso: agora.toISOString(), lancamentoId: id, categoriaAnterior: l.categoria ?? null, categoriaNova: c.id }
  // Só o campo categoria; nada além dele entra no update
  const up = await supabase.from("LancamentoFinanceiro").update({ categoria: c.id }).eq("id", id)
  if (up.error) return { ok: false, status: 500, erro: `Não gravou: ${up.error.message}` }
  await mudarConfig<{ correcoesCategoria?: RegistroCorrecao[] }>(cfg => ({ correcoesCategoria: [...(cfg.correcoesCategoria ?? []), registro] }))
  return { ok: true, resultado: `Categoria do lançamento ${id} corrigida de ${registro.categoriaAnterior ?? "(sem categoria)"} para ${c.id}. Valor, data, status e lote não mudaram.`, lancamento: { id, categoria: c.id }, registro }
}
