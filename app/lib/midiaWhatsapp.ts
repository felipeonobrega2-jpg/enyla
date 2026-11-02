// Mídia de uma mensagem do WhatsApp: cópia guardada no armazenamento privado ou, na primeira vez, baixada do Evolution.
// Usada pelo player da conversa e pela transcrição. Só roda no servidor.

import { supabase } from "./supabase"
import { evo } from "./evolution"

const BUCKET = "whatsapp-midia"   // privado

export async function obterMidia(id: string): Promise<{ bytes: Buffer; tipo: string } | null> {
  const caminho = `midia/${id}`
  const guardada = await supabase.storage.from(BUCKET).download(caminho)
  if (guardada.data) return { bytes: Buffer.from(await guardada.data.arrayBuffer()), tipo: guardada.data.type || "application/octet-stream" }

  const r = await evo<{ base64?: string; mimetype?: string }>("/chat/getBase64FromMediaMessage/{i}", {
    method: "POST",
    // Áudio vira mp4 (AAC) no Evolution: o .ogg/opus do WhatsApp não toca em todo navegador
    body: JSON.stringify({ message: { key: { id } }, convertToMp4: true }),
  })
  if (!r.ok || !r.corpo?.base64) return null
  const tipo = (r.corpo.mimetype ?? "application/octet-stream").split(";")[0]
  const bytes = Buffer.from(r.corpo.base64, "base64")
  let up = await supabase.storage.from(BUCKET).upload(caminho, bytes, { contentType: tipo, upsert: true })
  if (up.error && /bucket/i.test(up.error.message)) {
    await supabase.storage.createBucket(BUCKET, { public: false })
    up = await supabase.storage.from(BUCKET).upload(caminho, bytes, { contentType: tipo, upsert: true })
  }
  return { bytes, tipo }
}
