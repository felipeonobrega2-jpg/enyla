// Mensagens do WhatsApp (Evolution) → tabelas whatsapp_conversas / whatsapp_mensagens.
// Grava em lote: o histórico chega com milhares de mensagens de uma vez e, uma a uma, estourava o tempo da Vercel.

import { supabase } from "./supabase"

// ── Tipos Evolution API ────────────────────────────────────────────────────

export type WaKey = { remoteJid: string; fromMe: boolean; id: string; remoteJidAlt?: string }

export type WaMessage = {
  key: WaKey
  pushName?: string
  message?: {
    conversation?: string
    extendedTextMessage?: { text: string }
    imageMessage?: { caption?: string; url?: string }
    audioMessage?: { url?: string }
    documentMessage?: { caption?: string; url?: string; fileName?: string }
    stickerMessage?: { url?: string }
    reactionMessage?: { text?: string }
    listResponseMessage?: { singleSelectReply?: { selectedRowId?: string } }
    buttonsResponseMessage?: { selectedDisplayText?: string }
  }
  messageTimestamp?: number
  messageType?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────

export function extractBody(msg: WaMessage): { corpo: string | null; tipo: string; media_url: string | null } {
  const m = msg.message ?? {}
  if (m.conversation)                       return { corpo: m.conversation, tipo: "text", media_url: null }
  if (m.extendedTextMessage?.text)          return { corpo: m.extendedTextMessage.text, tipo: "text", media_url: null }
  if (m.imageMessage)                       return { corpo: m.imageMessage.caption ?? null, tipo: "image", media_url: m.imageMessage.url ?? null }
  if (m.audioMessage)                       return { corpo: null, tipo: "audio", media_url: m.audioMessage.url ?? null }
  if (m.documentMessage)                    return { corpo: m.documentMessage.caption ?? m.documentMessage.fileName ?? null, tipo: "document", media_url: m.documentMessage.url ?? null }
  if (m.stickerMessage)                     return { corpo: null, tipo: "sticker", media_url: m.stickerMessage.url ?? null }
  if (m.reactionMessage)                    return { corpo: m.reactionMessage.text ?? "👍", tipo: "reaction", media_url: null }
  if (m.listResponseMessage)                return { corpo: m.listResponseMessage.singleSelectReply?.selectedRowId ?? null, tipo: "list_response", media_url: null }
  if (m.buttonsResponseMessage)             return { corpo: m.buttonsResponseMessage.selectedDisplayText ?? null, tipo: "button_response", media_url: null }
  return { corpo: null, tipo: msg.messageType ?? "unknown", media_url: null }
}

// Filtra JIDs irrelevantes (status, grupos, newsletter)
export function deveIgnorar(jid: string): boolean {
  return (
    jid === "status@broadcast" ||
    jid.endsWith("@g.us") ||
    jid.endsWith("@newsletter") ||
    jid.endsWith("@broadcast")
  )
}


// Telefone do contato: o jid antigo já é o número; o novo (@lid) traz o número em remoteJidAlt, quando o WhatsApp informa
function telefoneDe(key: WaKey): string | null {
  for (const j of [key.remoteJid, key.remoteJidAlt]) if (j?.endsWith("@s.whatsapp.net")) return j.split("@")[0]
  return null
}

const tsDe = (m: WaMessage) => new Date((Number(m.messageTimestamp) || Date.now() / 1000) * 1000).toISOString()

/**
 * Grava um lote de mensagens.
 *   contarNaoLidas: só para mensagem nova em tempo real (histórico não vira "não lida")
 *   nomes: nome por jid vindo dos contatos (completa quem só tem o número)
 */
export async function gravarLote(msgs: WaMessage[], opts: { contarNaoLidas?: boolean; nomes?: Map<string, string> } = {}) {
  const validas = msgs.filter(m => m?.key?.remoteJid && m.key.id && !deveIgnorar(m.key.remoteJid))
  if (!validas.length) return 0

  // Conversas: a última mensagem só avança (histórico antigo não sobrescreve a mais nova)
  const porJid = new Map<string, { ts: string; corpo: string; nome?: string; telefone?: string | null }>()
  for (const m of validas) {
    const { corpo, tipo } = extractBody(m)
    const ts = tsDe(m)
    const atual = porJid.get(m.key.remoteJid)
    const nome = !m.key.fromMe && m.pushName ? m.pushName : undefined
    if (!atual || ts > atual.ts) porJid.set(m.key.remoteJid, { ts, corpo: corpo ?? `[${tipo}]`, nome: nome ?? atual?.nome, telefone: telefoneDe(m.key) ?? atual?.telefone })
    else if (nome && !atual.nome) atual.nome = nome
  }
  const jids = [...porJid.keys()]
  const existentes = new Map<string, { ultima_at: string | null; nome: string | null; telefone: string | null }>()
  for (let i = 0; i < jids.length; i += 300) {
    const { data } = await supabase.from("whatsapp_conversas").select("jid, ultima_at, nome, telefone").in("jid", jids.slice(i, i + 300))
    for (const c of data ?? []) existentes.set(c.jid, c)
  }
  const numero = (s?: string | null) => !!s && /^\d+$/.test(s)
  const conversas = jids.map(jid => {
    const n = porJid.get(jid)!, e = existentes.get(jid)
    const nome = opts.nomes?.get(jid) ?? n.nome
    const avanca = !e?.ultima_at || n.ts > e.ultima_at
    return {
      jid,
      // Nome: o que já existe, a menos que seja só o número; senão o do contato/mensagem; senão o número
      nome: e?.nome && !numero(e.nome) ? e.nome : nome ?? e?.nome ?? jid.split("@")[0],
      telefone: e?.telefone ?? n.telefone ?? null,
      ultima_msg: avanca ? n.corpo : undefined,
      ultima_at: avanca ? n.ts : e?.ultima_at,
    }
  }).map(c => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)))
  for (let i = 0; i < conversas.length; i += 500)
    await supabase.from("whatsapp_conversas").upsert(conversas.slice(i, i + 500), { onConflict: "jid", ignoreDuplicates: false })

  const linhas = validas.map(m => {
    const { corpo, tipo, media_url } = extractBody(m)
    return { id: m.key.id, jid: m.key.remoteJid, from_me: !!m.key.fromMe, corpo, tipo, media_url, ts: tsDe(m) }
  })
  for (let i = 0; i < linhas.length; i += 500)
    await supabase.from("whatsapp_mensagens").upsert(linhas.slice(i, i + 500), { onConflict: "id", ignoreDuplicates: true })

  if (opts.contarNaoLidas)
    for (const m of validas) if (!m.key.fromMe) await supabase.rpc("incrementar_nao_lidas", { p_jid: m.key.remoteJid })
  return validas.length
}
