// Envia um áudio como mensagem de voz do WhatsApp (a bolinha de áudio, não arquivo). O Evolution converte o que o
// navegador gravou (webm/ogg/mp4) para o formato de voz. Grava na conversa na hora. Só roda no servidor.

import { supabase } from "./supabase"
import { evo } from "./evolution"
import { gravarLote, WaMessage } from "./whatsappDados"

export const LIMITE_AUDIO = 4 * 1024 * 1024   // ~10 min de voz; acima disso a Vercel recusa o envio

export async function enviarVoz(jid: string, bytes: Buffer): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  if (!bytes.length) return { ok: false, erro: "Áudio vazio." }
  if (bytes.length > LIMITE_AUDIO) return { ok: false, erro: "Áudio grande demais (máx. ~10 min)." }
  // Para quem só tem o identificador novo do WhatsApp (@lid), usa o telefone salvo quando houver
  const { data: conv } = await supabase.from("whatsapp_conversas").select("telefone").eq("jid", jid).maybeSingle()
  const r = await evo<WaMessage>("/message/sendWhatsAppAudio/{i}", {
    method: "POST",
    body: JSON.stringify({ number: conv?.telefone || jid, audio: bytes.toString("base64"), encoding: true }),
  })
  if (!r.ok || !r.corpo?.key?.id) return { ok: false, erro: `Não enviou o áudio (${r.status}). Confira se o número está conectado.` }
  await gravarLote([{ ...r.corpo, key: { ...r.corpo.key, remoteJid: jid, fromMe: true } }])
  return { ok: true, id: r.corpo.key.id }
}
