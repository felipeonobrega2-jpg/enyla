// Trava de idempotência dos disparos do Prospector (issue #249): um destino + uma campanha + um canal = um envio só.
// Vale para primeiro contato, lembrete e ordem direta, no WhatsApp e no e-mail. Resposta a mensagem recebida não passa por aqui.
import { createHash } from "node:crypto"
import { supabase } from "./supabase"

export const TABELA_IDEM = "prospector_envios_idem"
export const TABELA_PORTA = "porta_idempotencia"
export const MOTIVO_JA_ENVIADO = "já enviado (idempotência)"
export const VALIDADE_CHAVE_MS = 24 * 3600_000
export type CanalIdem = "whatsapp" | "email"

const normalizar = (t: string) => t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
export const hashTexto = (t: string) => createHash("sha256").update(normalizar(t)).digest("hex").slice(0, 24)

/** Campanha da ordem: `campanha` (+ `passo`) se vier; senão hash normalizado do texto. */
export function campanhaDa(x: { campanha?: unknown; passo?: unknown }, texto: string): string {
  const c = String(x.campanha ?? "").trim(), p = String(x.passo ?? "").trim()
  if (c || p) return [c, p].filter(Boolean).join("/").slice(0, 120)
  return `texto:${hashTexto(texto)}`
}

/** Reserva atômica ANTES do envio. true = esta chamada reservou e pode enviar; false = já existe (nada deve sair). Erro de banco = false (não envia na dúvida). */
export async function reservarEnvio(prospectoId: number, canal: CanalIdem, campanha: string): Promise<boolean> {
  const { data, error } = await supabase.from(TABELA_IDEM)
    .upsert([{ prospecto_id: prospectoId, canal, campanha }], { onConflict: "prospecto_id,canal,campanha", ignoreDuplicates: true }).select("id")
  if (error) return false
  return Array.isArray(data) && data.length > 0
}

/** O envio falhou de verdade (nada saiu): devolve a reserva para a nova tentativa poder sair. */
export async function liberarEnvio(prospectoId: number, canal: CanalIdem, campanha: string): Promise<void> {
  await supabase.from(TABELA_IDEM).delete().eq("prospecto_id", prospectoId).eq("canal", canal).eq("campanha", campanha)
}

// ── Idempotency-Key da porta externa ─────────────────────────────────────────
export type RespostaGuardada = { status: number; corpo: unknown }
export type ChavePorta = { primeira: true } | { primeira: false; guardada: RespostaGuardada | null }

/** Reserva a chave (por diretor). Se já existe dentro de 24 h, devolve a resposta da primeira chamada (ou null se ela ainda está em andamento). */
export async function reservarChavePorta(diretor: string, chave: string, agora: number = Date.now()): Promise<ChavePorta> {
  const id = `${diretor}:${chave}`.slice(0, 200)
  const { data } = await supabase.from(TABELA_PORTA).upsert([{ chave: id }], { onConflict: "chave", ignoreDuplicates: true }).select("chave")
  if (Array.isArray(data) && data.length) return { primeira: true }
  const { data: l } = await supabase.from(TABELA_PORTA).select("status, resposta, criado_em").eq("chave", id).maybeSingle()
  const velha = l && agora - new Date(String(l.criado_em)).getTime() > VALIDADE_CHAVE_MS
  if (velha) {   // passou de 24 h: a chave vale de novo
    await supabase.from(TABELA_PORTA).delete().eq("chave", id)
    return reservarChavePorta(diretor, chave, agora)
  }
  return { primeira: false, guardada: l && l.status != null ? { status: Number(l.status), corpo: l.resposta } : null }
}

export async function guardarRespostaPorta(diretor: string, chave: string, r: RespostaGuardada): Promise<void> {
  await supabase.from(TABELA_PORTA).update({ status: r.status, resposta: r.corpo as object }).eq("chave", `${diretor}:${chave}`.slice(0, 200))
}

/** Chamada falhou antes de enviar qualquer coisa de forma definitiva (erro 5xx): libera a chave para repetir. */
export async function soltarChavePorta(diretor: string, chave: string): Promise<void> {
  await supabase.from(TABELA_PORTA).delete().eq("chave", `${diretor}:${chave}`.slice(0, 200))
}
