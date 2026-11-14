// Registro do agente em tabelas próprias (agente_registro, agente_mensagens, agente_tratadas) em vez de listas no
// AppConfig. Enquanto as tabelas não existem (SQL ainda não rodado), tudo continua na configuração como antes.
import { supabase } from "./supabase"
import type { RegistroAgente } from "./agenteLeads"

export type Registro = RegistroAgente & { ids?: string[] }
export const MAX_REGISTROS = 300
const MAX_IDS = 3000

let tabelas: { ok: boolean; em: number } | null = null
export async function temTabelas(): Promise<boolean> {
  if (tabelas && (tabelas.ok || Date.now() - tabelas.em < 5 * 60_000)) return tabelas.ok
  // Sem "head": numa consulta head o erro de tabela inexistente não aparece
  const { error } = await supabase.from("agente_registro").select("id").limit(1)
  tabelas = { ok: !error, em: Date.now() }
  return tabelas.ok
}

type Linha = { em: string; jid: string; nome: string | null; perfil: string | null; enviou: boolean; texto: string | null; motivo: string | null; passo: string | null; ids: string[] | null }
const deLinha = (l: Linha): Registro => ({
  em: new Date(l.em).toISOString(), jid: l.jid, nome: l.nome, perfil: (l.perfil ?? "indefinido") as Registro["perfil"], enviou: l.enviou,
  texto: l.texto ?? "", motivo: l.motivo ?? "", ...(l.passo ? { passo: l.passo } : {}), ...(l.ids?.length ? { ids: l.ids } : {}),
})

// Os mais recentes primeiro (como era a lista)
export async function lerRegistros(limite = MAX_REGISTROS, filtro?: { jid?: string; desde?: string }): Promise<Registro[] | null> {
  if (!await temTabelas()) return null
  let q = supabase.from("agente_registro").select("em, jid, nome, perfil, enviou, texto, motivo, passo, ids").order("em", { ascending: false }).limit(limite)
  if (filtro?.jid) q = q.eq("jid", filtro.jid)
  if (filtro?.desde) q = q.gte("em", filtro.desde)
  const { data, error } = await q
  return error ? null : (data as Linha[]).map(deLinha)
}

export async function gravarRegistro(r: Registro): Promise<boolean> {
  if (!await temTabelas()) return false
  const { error } = await supabase.from("agente_registro").upsert({
    em: r.em, jid: r.jid, nome: r.nome, perfil: r.perfil, enviou: r.enviou, texto: r.texto, motivo: r.motivo, passo: r.passo ?? null, ids: r.ids ?? [],
  }, { onConflict: "jid,em,motivo", ignoreDuplicates: true })
  return !error
}

export async function lerIdsAgente(): Promise<string[] | null> {
  if (!await temTabelas()) return null
  const { data, error } = await supabase.from("agente_mensagens").select("id").order("em", { ascending: false }).limit(MAX_IDS)
  return error ? null : (data ?? []).map(x => x.id as string)
}

export async function guardarIdAgente(id: string): Promise<boolean> {
  if (!await temTabelas()) return false
  const { error } = await supabase.from("agente_mensagens").upsert({ id }, { onConflict: "id", ignoreDuplicates: true })
  return !error
}

// Reserva atômica: true = esta execução pegou a mensagem; null = sem tabela (usa a configuração)
export async function reservarTratada(id: string): Promise<boolean | null> {
  if (!await temTabelas()) return null
  const { data, error } = await supabase.from("agente_tratadas").upsert({ id }, { onConflict: "id", ignoreDuplicates: true }).select("id")
  if (error) return null
  return (data ?? []).length > 0
}

export async function liberarTratada(id: string): Promise<boolean> {
  if (!await temTabelas()) return false
  const { error } = await supabase.from("agente_tratadas").delete().eq("id", id)
  return !error
}
