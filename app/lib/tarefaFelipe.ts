// Porta externa: o diretor põe uma tarefa na lista "Depende de você" do Felipe (acao 'tarefa_felipe').
// Guarda em dados_sistema, coleção tarefaFelipe, uma linha por tarefa. Nada é apagado: cancelar põe canceladaEm,
// feito põe feitoEm. Não manda mensagem a ninguém; a lista (/api/pendencias) é quem mostra para o Felipe.
import type { Pendencia } from "./pendenciasDono"
import type { IdDiretor } from "./diretoria"
import { supabase } from "./supabase"

export const COLECAO_TAREFA = "tarefaFelipe"
export const LIMITE_ABERTAS = 10
export const PREFIXO_ID = "tarefa:"   // id da tarefa na lista "Depende de você"
const SETE_DIAS = 7 * 86_400_000

export type Tarefa = { id: string; titulo: string; detalhe?: string; prazo?: string | null; por: IdDiretor; pedidoPor: string; em: string; feitoEm?: string | null; canceladaEm?: string | null }
export type Resultado = { status: number; corpo: Record<string, unknown> }

const NOME: Record<IdDiretor, string> = { coo: "COO", cco: "CCO", cmo: "CMO", cfo: "CFO", cto: "CTO" }
const dataOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(`${s}T12:00:00Z`).getTime()) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s

export const aberta = (t: Tarefa) => !t.feitoEm && !t.canceladaEm
const feitaRecente = (t: Tarefa, agora: number) => !!t.feitoEm && !t.canceladaEm && agora - new Date(t.feitoEm).getTime() <= SETE_DIAS

// Valida o pedido de criar
export function validarTarefa(b: Record<string, unknown>): { ok: true; titulo: string; detalhe: string; prazo: string | null } | { ok: false; erro: string } {
  const titulo = typeof b.titulo === "string" ? b.titulo.trim() : ""
  if (!titulo) return { ok: false, erro: "titulo: obrigatório." }
  if (titulo.length > 140) return { ok: false, erro: "titulo: no máximo 140 caracteres." }
  if (b.detalhe != null && typeof b.detalhe !== "string") return { ok: false, erro: "detalhe: texto." }
  const detalhe = typeof b.detalhe === "string" ? b.detalhe.trim().slice(0, 2000) : ""
  let prazo: string | null = null
  if (b.prazo != null && b.prazo !== "") {
    if (typeof b.prazo !== "string" || !dataOk(b.prazo)) return { ok: false, erro: "prazo: data no formato AAAA-MM-DD." }
    prazo = b.prazo
  }
  return { ok: true, titulo, detalhe, prazo }
}

// A tarefa como item da lista "Depende de você" (o Felipe marca como feita na tela)
export function comoPendencia(t: Tarefa, agora = Date.now()): Pendencia {
  const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
  const prazoTxt = t.prazo ? `${t.prazo.slice(8, 10)}/${t.prazo.slice(5, 7)}/${t.prazo.slice(0, 4)}` : null
  const fim = t.prazo ? new Date(`${t.prazo}T23:59:59.999-03:00`).getTime() : null
  const urgente = fim != null && fim - agora < 2 * 86_400_000
  return {
    id: PREFIXO_ID + t.id, grupo: "Pedidos dos diretores", titulo: t.titulo,
    porque: `Pedido por ${t.pedidoPor} em ${dia(t.em)}${prazoTxt ? `, prazo ${prazoTxt}` : ""}.`,
    como: t.detalhe || "Sem detalhes além do título.",
    nivel: urgente ? "urgente" : t.prazo ? "importante" : "quando der", feito: !!t.feitoEm, manual: true,
  }
}

// ── Banco (dados_sistema; nunca DELETE) ─────────────────────────────────────────
export async function listarTarefas(): Promise<Tarefa[]> {
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", COLECAO_TAREFA).limit(2000)
  return (data ?? []).map(r => r.dados as Tarefa).filter(t => t && typeof t.id === "string")
}

async function gravar(t: Tarefa) {
  const { data: atual } = await supabase.from("dados_sistema").select("v").eq("colecao", COLECAO_TAREFA).eq("id", t.id).maybeSingle()
  const agora = new Date().toISOString()
  const { error } = atual
    ? await supabase.from("dados_sistema").update({ dados: t, v: (atual.v ?? 0) + 1, atualizado_em: agora }).eq("colecao", COLECAO_TAREFA).eq("id", t.id)
    : await supabase.from("dados_sistema").insert({ colecao: COLECAO_TAREFA, id: t.id, dados: t, v: 1, atualizado_em: agora })
  if (error) throw new Error(error.message)
}

// Para /api/pendencias: abertas e feitas nos últimos 7 dias
export async function tarefasParaLista(agora = Date.now()): Promise<Pendencia[]> {
  const ts = await listarTarefas().catch(() => [])
  return ts.filter(t => aberta(t) || feitaRecente(t, agora)).sort((a, b) => a.em.localeCompare(b.em)).map(t => comoPendencia(t, agora))
}

// O Felipe marca (ou desmarca) como feita na tela. Devolve false se o id não for de tarefa.
export async function marcarTarefa(idLista: string, feito: boolean): Promise<boolean> {
  if (!idLista.startsWith(PREFIXO_ID)) return false
  const id = idLista.slice(PREFIXO_ID.length)
  const t = (await listarTarefas()).find(x => x.id === id)
  if (!t || t.canceladaEm) return true
  await gravar({ ...t, feitoEm: feito ? new Date().toISOString() : null })
  return true
}

// Para ?o=empresa: as tarefas do diretor (abertas e feitas nos últimos 7 dias)
export async function tarefasDoDiretor(diretor: IdDiretor, agora = Date.now()) {
  const ts = (await listarTarefas().catch(() => [])).filter(t => t.por === diretor)
  const vista = (t: Tarefa) => ({ id: t.id, titulo: t.titulo, detalhe: t.detalhe || null, prazo: t.prazo ?? null, pedidaEm: t.em, feitoEm: t.feitoEm ?? null })
  return { tarefasParaFelipe: {
    abertas: ts.filter(aberta).map(vista),
    feitas: ts.filter(t => feitaRecente(t, agora)).map(vista),
  } }
}

// POST { acao:'tarefa_felipe', titulo, detalhe?, prazo? } | { acao:'tarefa_felipe', operacao:'cancelar', id }
export async function acaoTarefaFelipe(diretor: IdDiretor, b: Record<string, unknown>): Promise<Resultado> {
  if (b.operacao === "cancelar") {
    const id = typeof b.id === "string" ? b.id.trim() : ""
    if (!id) return { status: 400, corpo: { erro: "id: obrigatório em cancelar." } }
    const t = (await listarTarefas()).find(x => x.id === id && x.por === diretor)   // só as que ele criou
    if (!t || t.canceladaEm) return { status: 404, corpo: { erro: `Tarefa ${id} não encontrada entre as suas.` } }
    if (t.feitoEm) return { status: 400, corpo: { erro: "O Felipe já marcou essa tarefa como feita." } }
    await gravar({ ...t, canceladaEm: new Date().toISOString() })
    return { status: 200, corpo: { ok: true, resultado: `Tarefa cancelada: ${t.titulo}`, id } }
  }
  if (b.operacao != null && b.operacao !== "criar") return { status: 400, corpo: { erro: "operacao: criar (padrão) ou cancelar." } }
  const v = validarTarefa(b)
  if (!v.ok) return { status: 400, corpo: { erro: v.erro } }
  const abertas = (await listarTarefas()).filter(t => t.por === diretor && aberta(t)).length
  if (abertas >= LIMITE_ABERTAS) return { status: 429, corpo: { erro: `Você já tem ${LIMITE_ABERTAS} tarefas abertas na lista do Felipe. Espere ele fazer ou cancele alguma.` } }
  const t: Tarefa = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), titulo: v.titulo, ...(v.detalhe ? { detalhe: v.detalhe } : {}), prazo: v.prazo,
    por: diretor, pedidoPor: NOME[diretor], em: new Date().toISOString(),
  }
  await gravar(t)
  return { status: 200, corpo: { ok: true, resultado: `Tarefa posta na lista "Depende de você" do Felipe: ${t.titulo}${t.prazo ? ` (prazo ${t.prazo})` : ""}.`, tarefa: { id: t.id, titulo: t.titulo, detalhe: t.detalhe ?? null, prazo: t.prazo } } }
}
