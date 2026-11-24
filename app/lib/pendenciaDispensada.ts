// Dispensar pendência com motivo (sem apagar). Cada pendência gerada pelo sistema tem uma chave estável (igual de um dia
// para o outro); dispensar guarda { chave, titulo, motivo, por, em, ate? } em dados_sistema (coleção pendenciaDispensada,
// uma linha por chave). Reabrir só marca reabertaEm: nada é apagado. Não muda o que gera as pendências, só filtra.
// A parte de cima é pura (testável); a de baixo fala com o banco.

export const COLECAO_DISPENSADA = "pendenciaDispensada"

export type Dispensada = { chave: string; titulo: string; motivo: string; por: string; em: string; ate?: string | null; reabertaEm?: string | null; reabertaPor?: string | null }

// Chaves estáveis por origem
export const chaveDono = (id: string) => `dono:${id}`                 // "Depende de você" (pendenciasDono)
export const chaveSistema = (id: string) => `sis:${id}`               // "Precisa de você" (pendencias.ts; o id já é tipo + pedido)
export const chaveDecisao = (...partes: (string | number)[]) => `dec:${partes.join(":")}`   // decisões dos diretores / Vigia
export const slug = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)
export const chaveRecomendacao = (diretor: string, texto: string) => `rec:${diretor}:${slug(texto)}`   // recomendação da reunião (o id da reunião muda a cada dia, o texto da ordem é a identidade)

// Dispensada vale enquanto não foi reaberta e o prazo (ate) não venceu. ate é uma data AAAA-MM-DD: vale até o fim desse dia.
export function vigente(d: Dispensada, agora = Date.now()): boolean {
  if (d.reabertaEm) return false
  if (!d.ate) return true
  const fim = /^\d{4}-\d{2}-\d{2}$/.test(d.ate) ? new Date(`${d.ate}T23:59:59.999-03:00`).getTime() : new Date(d.ate).getTime()
  return isNaN(fim) ? true : agora <= fim
}

export const chavesVigentes = (ds: Dispensada[], agora = Date.now()) => new Set(ds.filter(d => vigente(d, agora)).map(d => d.chave))

export function separar<T>(itens: T[], chaveDe: (x: T) => string, ds: Dispensada[], agora = Date.now()): { visiveis: T[]; dispensados: (T & { dispensa: Dispensada })[] } {
  const por = new Map(ds.filter(d => vigente(d, agora)).map(d => [d.chave, d]))
  const visiveis: T[] = [], dispensados: (T & { dispensa: Dispensada })[] = []
  for (const x of itens) { const d = por.get(chaveDe(x)); if (d) dispensados.push({ ...x, dispensa: d }); else visiveis.push(x) }
  return { visiveis, dispensados }
}

// Valida o pedido de dispensar. Motivo é obrigatório; ate, se vier, tem de ser uma data AAAA-MM-DD.
export function validarDispensa(b: { chave?: unknown; motivo?: unknown; titulo?: unknown; ate?: unknown }): { ok: true; chave: string; motivo: string; titulo: string; ate: string | null } | { ok: false; erro: string } {
  const chave = typeof b.chave === "string" ? b.chave.trim().slice(0, 200) : ""
  if (!chave) return { ok: false, erro: "Faltou a chave da pendência." }
  const motivo = typeof b.motivo === "string" ? b.motivo.trim().slice(0, 500) : ""
  if (!motivo) return { ok: false, erro: "Diga o motivo para dispensar a pendência." }
  const titulo = typeof b.titulo === "string" ? b.titulo.trim().slice(0, 300) : ""
  let ate: string | null = null
  if (b.ate != null && b.ate !== "") {
    if (typeof b.ate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.ate) || isNaN(new Date(`${b.ate}T12:00:00Z`).getTime())) return { ok: false, erro: "ate: data no formato AAAA-MM-DD." }
    ate = b.ate
  }
  return { ok: true, chave, motivo, titulo, ate }
}

// ── Banco (dados_sistema; nunca DELETE) ─────────────────────────────────────────
export async function listarDispensadas(): Promise<Dispensada[]> {
  const { supabase } = await import("./supabase")
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", COLECAO_DISPENSADA).limit(2000)
  return (data ?? []).map(r => r.dados as Dispensada).filter(d => d && typeof d.chave === "string")
}
export async function dispensadasVigentes(): Promise<Dispensada[]> {
  return (await listarDispensadas().catch(() => [])).filter(d => vigente(d))
}

async function gravar(chave: string, dados: Dispensada) {
  const { supabase } = await import("./supabase")
  const { data: atual } = await supabase.from("dados_sistema").select("v").eq("colecao", COLECAO_DISPENSADA).eq("id", chave).maybeSingle()
  const agora = new Date().toISOString()
  const { error } = atual
    ? await supabase.from("dados_sistema").update({ dados, v: (atual.v ?? 0) + 1, atualizado_em: agora }).eq("colecao", COLECAO_DISPENSADA).eq("id", chave)
    : await supabase.from("dados_sistema").insert({ colecao: COLECAO_DISPENSADA, id: chave, dados, v: 1, atualizado_em: agora })
  if (error) throw new Error(error.message)
}

export async function dispensar(b: { chave?: unknown; motivo?: unknown; titulo?: unknown; ate?: unknown }, por: string): Promise<{ ok: true; dispensada: Dispensada } | { ok: false; status: 400; erro: string }> {
  const v = validarDispensa(b)
  if (!v.ok) return { ok: false, status: 400, erro: v.erro }
  const d: Dispensada = { chave: v.chave, titulo: v.titulo || v.chave, motivo: v.motivo, por, em: new Date().toISOString(), ...(v.ate ? { ate: v.ate } : {}) }
  await gravar(v.chave, d)
  return { ok: true, dispensada: d }
}

// Reabrir: a linha fica (histórico) com reabertaEm; a pendência volta na hora
export async function reabrir(chave: unknown, por: string): Promise<{ ok: true; chave: string } | { ok: false; status: 400 | 404; erro: string }> {
  const c = typeof chave === "string" ? chave.trim() : ""
  if (!c) return { ok: false, status: 400, erro: "Faltou a chave da pendência." }
  const atual = (await listarDispensadas()).find(d => d.chave === c)
  if (!atual) return { ok: false, status: 404, erro: "Essa pendência não está dispensada." }
  await gravar(c, { ...atual, reabertaEm: new Date().toISOString(), reabertaPor: por })
  return { ok: true, chave: c }
}
