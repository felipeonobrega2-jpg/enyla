// Gaveta da diretoria fora do AppConfig (tabela dados_sistema, uma linha por item): planos de cada diretor, ferramentas
// pedidas ao sistema e as conversas do Felipe com cada diretor. Só roda no servidor.
import { supabase } from "./supabase"
import type { IdDiretor } from "./diretoria"

async function ler<T>(colecao: string, id: string): Promise<T | null> {
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", colecao).eq("id", id).maybeSingle()
  return (data?.dados as T) ?? null
}
async function listar<T>(colecao: string): Promise<T[]> {
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", colecao).limit(500)
  return (data ?? []).map(r => r.dados as T)
}
async function gravar(colecao: string, id: string, dados: unknown) {
  const { data: atual } = await supabase.from("dados_sistema").select("v").eq("colecao", colecao).eq("id", id).maybeSingle()
  const agora = new Date().toISOString()
  const { error } = atual
    ? await supabase.from("dados_sistema").update({ dados, v: (atual.v ?? 0) + 1, atualizado_em: agora }).eq("colecao", colecao).eq("id", id)
    : await supabase.from("dados_sistema").insert({ colecao, id, dados, v: 1, atualizado_em: agora })
  if (error) throw new Error(error.message)
}
async function apagar(colecao: string, id: string) {
  await supabase.from("dados_sistema").delete().eq("colecao", colecao).eq("id", id)
}

// ── Planos: o que cada diretor combinou com o Felipe e vai executar ─────────────
export type Plano = { objetivo: string; indicador: string; passos: string[]; em: string }
export async function lerPlanos(): Promise<Partial<Record<IdDiretor, Plano>>> {
  const ls = await listar<Plano & { diretor: IdDiretor }>("diretoriaPlano")
  return Object.fromEntries(ls.map(p => [p.diretor, p]))
}
export const gravarPlano = (diretor: IdDiretor, p: Omit<Plano, "em">) => gravar("diretoriaPlano", diretor, { ...p, diretor, em: new Date().toISOString() })

// ── Ferramentas: conexões/capacidades que os diretores pedem (o Felipe aprova; aprovada entra na fila de construção)
export type Ferramenta = { id: string; nome: string; paraQue: string; motivo: string; pedidoPor: IdDiretor; em: string; status: "pedida" | "aprovada" | "pronta" | "recusada" }
export async function listarFerramentas(): Promise<Ferramenta[]> {
  return (await listar<Ferramenta>("diretoriaFerramenta")).sort((a, b) => b.em.localeCompare(a.em))
}
const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
export async function pedirFerramenta(p: { nome: string; paraQue: string; motivo: string; pedidoPor: IdDiretor }): Promise<Ferramenta> {
  const ja = (await listarFerramentas()).find(f => f.status !== "recusada" && chave(f.nome) === chave(p.nome))
  if (ja) return ja
  const f: Ferramenta = { id: `fe-${Date.now().toString(36)}`, ...p, em: new Date().toISOString(), status: "pedida" }
  await gravar("diretoriaFerramenta", f.id, f)
  return f
}
export async function decidirFerramenta(id: string, status: Ferramenta["status"]) {
  const f = await ler<Ferramenta>("diretoriaFerramenta", id)
  if (f) await gravar("diretoriaFerramenta", id, { ...f, status })
}

// ── Conversas do Felipe com cada diretor ─────────────────────────────────────────
// acoes: o que o diretor fez na conversa (ordem a um funcionário com mensagem para aprovar, vaga, ferramenta, plano, lição)
export type AcaoConversa =
  | { id: string; tipo: "mensagem"; funcionario: string; cliente: string; texto: string; status: "aguardando" | "enviado" | "erro" | "descartado"; erro?: string; em?: string }
  | { id: string; tipo: "vaga"; vagaId: string; nome: string; resumo: string }
  | { id: string; tipo: "ferramenta"; ferramentaId: string; nome: string; resumo: string }
  | { id: string; tipo: "plano"; objetivo: string; passos: string[]; indicador: string }
  | { id: string; tipo: "aprendi"; texto: string }
  | { id: string; tipo: "falha"; texto: string }
export type MsgConversa = { id: string; de: "felipe" | "diretor"; texto: string; em: string; acoes?: AcaoConversa[] }
export async function lerConversa(diretor: IdDiretor): Promise<MsgConversa[]> {
  return (await ler<{ mensagens: MsgConversa[] }>("diretoriaConversa", diretor))?.mensagens ?? []
}
export const gravarConversa = (diretor: IdDiretor, mensagens: MsgConversa[]) => gravar("diretoriaConversa", diretor, { mensagens: mensagens.slice(-60) })
export const apagarConversa = (diretor: IdDiretor) => apagar("diretoriaConversa", diretor)

// ── Foto da empresa para as conversas com os diretores (montada em segundo plano; ver conversaDiretor) ──────────
export const lerFoto = <T>() => ler<T>("diretoriaFoto", "atual")
export const gravarFoto = (foto: unknown) => gravar("diretoriaFoto", "atual", foto)
