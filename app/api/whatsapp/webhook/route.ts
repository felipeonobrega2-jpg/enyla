import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

type WaKey = { remoteJid: string; fromMe: boolean; id: string }

type WaMessage = {
  key: WaKey
  pushName?: string
  message?: {
    conversation?: string
    extendedTextMessage?: { text: string }
    imageMessage?: { caption?: string; url?: string }
    audioMessage?: { url?: string }
    documentMessage?: { caption?: string; url?: string; fileName?: string }
    stickerMessage?: { url?: string }
  }
  messageTimestamp?: number
  messageType?: string
}

function extractBody(msg: WaMessage): { corpo: string | null; tipo: string; media_url: string | null } {
  const m = msg.message ?? {}
  if (m.conversation)                   return { corpo: m.conversation, tipo: "text", media_url: null }
  if (m.extendedTextMessage?.text)      return { corpo: m.extendedTextMessage.text, tipo: "text", media_url: null }
  if (m.imageMessage)                   return { corpo: m.imageMessage.caption ?? null, tipo: "image", media_url: m.imageMessage.url ?? null }
  if (m.audioMessage)                   return { corpo: null, tipo: "audio", media_url: m.audioMessage.url ?? null }
  if (m.documentMessage)                return { corpo: m.documentMessage.caption ?? m.documentMessage.fileName ?? null, tipo: "document", media_url: m.documentMessage.url ?? null }
  if (m.stickerMessage)                 return { corpo: null, tipo: "sticker", media_url: m.stickerMessage.url ?? null }
  return { corpo: null, tipo: msg.messageType ?? "unknown", media_url: null }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const event = body.event as string

    if (event !== "messages.upsert") {
      return NextResponse.json({ ok: true })
    }

    const data = body.data as WaMessage
    const { key, pushName, messageTimestamp } = data

    // Ignore status broadcast
    if (key.remoteJid === "status@broadcast") return NextResponse.json({ ok: true })
    // Ignore groups for now
    if (key.remoteJid.endsWith("@g.us")) return NextResponse.json({ ok: true })

    const { corpo, tipo, media_url } = extractBody(data)
    const ts = new Date((messageTimestamp ?? Date.now() / 1000) * 1000).toISOString()
    const nome = key.fromMe ? "Você" : (pushName ?? key.remoteJid.split("@")[0])

    // Upsert conversa
    await supabase.from("whatsapp_conversas").upsert({
      jid:        key.remoteJid,
      nome:       key.fromMe ? undefined : (pushName ?? key.remoteJid.split("@")[0]),
      ultima_msg: corpo ?? `[${tipo}]`,
      ultima_at:  ts,
      nao_lidas:  key.fromMe ? 0 : 1, // will be incremented below if existing
    }, { onConflict: "jid", ignoreDuplicates: false })

    // Increment nao_lidas only for incoming messages
    if (!key.fromMe) {
      await supabase.rpc("incrementar_nao_lidas", { p_jid: key.remoteJid })
    }

    // Insert message (ignore duplicates — Evolution may resend)
    await supabase.from("whatsapp_mensagens").upsert({
      id:       key.id,
      jid:      key.remoteJid,
      from_me:  key.fromMe,
      corpo,
      tipo,
      media_url,
      ts,
    }, { onConflict: "id", ignoreDuplicates: true })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[whatsapp/webhook]", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
