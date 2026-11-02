import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { evo } from "@/app/lib/evolution"

export const maxDuration = 60

const BUCKET = "whatsapp-midia"   // privado: só sai por esta rota, que exige login

// Foto, áudio, vídeo ou documento de uma mensagem. Primeira vez: baixa do Evolution e guarda uma cópia
// (o WhatsApp apaga mídia antiga dos servidores dele); depois, serve da cópia.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[\w-]{6,80}$/.test(id)) return NextResponse.json({ erro: "id inválido" }, { status: 400 })
  const caminho = `midia/${id}`

  const guardada = await supabase.storage.from(BUCKET).download(caminho)
  if (guardada.data) return resposta(req, guardada.data, guardada.data.type)

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
  return resposta(req, new Blob([bytes], { type: tipo }), tipo)
}

// Entrega por pedaços quando o navegador pede (Range): o Safari só toca áudio/vídeo assim
async function resposta(req: NextRequest, b: Blob, tipo: string) {
  const buf = Buffer.from(await b.arrayBuffer())
  const base = { "Content-Type": tipo || "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=31536000, immutable" }
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") ?? "")
  if (!m) return new NextResponse(buf, { headers: { ...base, "Content-Length": String(buf.length) } })
  const ini = m[1] ? Number(m[1]) : Math.max(0, buf.length - Number(m[2]))
  const fim = m[1] && m[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1
  if (ini >= buf.length || ini > fim) return new NextResponse(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${buf.length}` } })
  return new NextResponse(buf.subarray(ini, fim + 1), { status: 206, headers: { ...base, "Content-Range": `bytes ${ini}-${fim}/${buf.length}`, "Content-Length": String(fim - ini + 1) } })
}
