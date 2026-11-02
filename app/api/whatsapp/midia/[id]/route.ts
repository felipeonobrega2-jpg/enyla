import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { evo } from "@/app/lib/evolution"

export const maxDuration = 60

const BUCKET = "whatsapp-midia"   // privado: só sai por esta rota, que exige login

// Foto, áudio, vídeo ou documento de uma mensagem. Primeira vez: baixa do Evolution e guarda uma cópia
// (o WhatsApp apaga mídia antiga dos servidores dele); depois, serve da cópia.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[\w-]{6,80}$/.test(id)) return NextResponse.json({ erro: "id inválido" }, { status: 400 })
  const caminho = `midia/${id}`

  const guardada = await supabase.storage.from(BUCKET).download(caminho)
  if (guardada.data) return resposta(guardada.data, guardada.data.type)

  const r = await evo<{ base64?: string; mimetype?: string }>("/chat/getBase64FromMediaMessage/{i}", {
    method: "POST",
    // Áudio vira mp4 (AAC) no Evolution: o .ogg/opus do WhatsApp não toca em todo navegador
    body: JSON.stringify({ message: { key: { id } }, convertToMp4: true }),
  })
  if (!r.ok || !r.corpo?.base64) return NextResponse.json({ erro: "Mídia indisponível (o WhatsApp pode já ter apagado)." }, { status: 404 })
  const tipo = (r.corpo.mimetype ?? "application/octet-stream").split(";")[0]
  const bytes = Buffer.from(r.corpo.base64, "base64")

  let up = await supabase.storage.from(BUCKET).upload(caminho, bytes, { contentType: tipo, upsert: true })
  if (up.error && /bucket/i.test(up.error.message)) {
    await supabase.storage.createBucket(BUCKET, { public: false })
    up = await supabase.storage.from(BUCKET).upload(caminho, bytes, { contentType: tipo, upsert: true })
  }
  return resposta(new Blob([bytes], { type: tipo }), tipo)
}

function resposta(b: Blob, tipo: string) {
  return new NextResponse(b, { headers: { "Content-Type": tipo || "application/octet-stream", "Cache-Control": "private, max-age=31536000, immutable" } })
}
