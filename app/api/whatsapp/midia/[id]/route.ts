import { NextRequest, NextResponse } from "next/server"
import { obterMidia } from "@/app/lib/midiaWhatsapp"

export const maxDuration = 60

// Foto, áudio, vídeo ou documento de uma mensagem (cópia guardada; primeira vez busca no Evolution)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[\w-]{6,80}$/.test(id)) return NextResponse.json({ erro: "id inválido" }, { status: 400 })
  const m = await obterMidia(id)
  if (!m) return NextResponse.json({ erro: "Mídia indisponível (o WhatsApp pode já ter apagado)." }, { status: 404 })
  return resposta(req, new Blob([new Uint8Array(m.bytes)], { type: m.tipo }), m.tipo)
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
