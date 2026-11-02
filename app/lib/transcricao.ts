// Transcrição dos áudios do WhatsApp (Groq, Whisper large-v3-turbo). O texto vai para o corpo da mensagem de áudio,
// então aparece embaixo do player, entra na busca e fica disponível para o agente. Só roda no servidor.

import { supabase } from "./supabase"
import { obterMidia } from "./midiaWhatsapp"

async function chaveGroq(): Promise<string | null> {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  return ((data?.data as { groqKey?: string | null } | null)?.groqKey) ?? null
}

async function transcrever(bytes: Buffer, tipo: string, chave: string): Promise<string | null> {
  const ext = tipo.includes("mp4") || tipo.includes("m4a") ? "m4a" : tipo.includes("ogg") ? "ogg" : tipo.includes("mpeg") ? "mp3" : "m4a"
  const form = new FormData()
  form.set("file", new Blob([new Uint8Array(bytes)], { type: tipo }), `audio.${ext}`)
  form.set("model", "whisper-large-v3-turbo")
  form.set("language", "pt")
  form.set("response_format", "text")
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${chave}` }, body: form })
  if (!r.ok) throw new Error(`Groq ${r.status}`)
  return (await r.text()).trim().replace(/\s+/g, " ") || null
}

// Transcreve os áudios ainda sem texto (das ids informadas, ou os pendentes de uma conversa), até `limite` por vez
export async function transcreverPendentes(alvo: { ids?: string[]; jid?: string }, limite = 8) {
  const chave = await chaveGroq()
  if (!chave) return { feitos: 0, restantes: 0, erro: "Configure a chave do Groq em Configurações." }
  let q = supabase.from("whatsapp_mensagens").select("id", { count: "exact" }).in("tipo", ["audio", "audioMessage"]).is("corpo", null)
  if (alvo.ids) q = q.in("id", alvo.ids)
  if (alvo.jid) q = q.eq("jid", alvo.jid)
  const { data, count } = await q.order("ts", { ascending: false }).limit(limite)
  let feitos = 0
  for (const { id } of data ?? []) {
    const m = await obterMidia(id)
    const texto = m ? await transcrever(m.bytes, m.tipo, chave).catch(() => null) : null
    // Áudio que não dá para baixar ou sem fala: marca para não tentar de novo a cada vez
    await supabase.from("whatsapp_mensagens").update({ corpo: texto ?? (m ? "[áudio sem fala reconhecida]" : "[áudio indisponível]") }).eq("id", id)
    if (texto) feitos++
  }
  return { feitos, restantes: Math.max(0, (count ?? 0) - (data ?? []).length) }
}
