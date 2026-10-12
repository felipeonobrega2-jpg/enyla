import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

// ── Tipos Evolution API ────────────────────────────────────────────────────

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
    reactionMessage?: { text?: string }
    listResponseMessage?: { singleSelectReply?: { selectedRowId?: string } }
    buttonsResponseMessage?: { selectedDisplayText?: string }
  }
  messageTimestamp?: number
  messageType?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────

function extractBody(msg: WaMessage): { corpo: string | null; tipo: string; media_url: string | null } {
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
function deveIgnorar(jid: string): boolean {
  return (
    jid === "status@broadcast" ||
    jid.endsWith("@g.us") ||
    jid.endsWith("@newsletter") ||
    jid.endsWith("@broadcast")
  )
}

// Grava uma mensagem individual com idempotência
async function gravarMensagem(msg: WaMessage): Promise<void> {
  const { key, pushName, messageTimestamp } = msg
  if (deveIgnorar(key.remoteJid)) return

  const { corpo, tipo, media_url } = extractBody(msg)
  const ts   = new Date((messageTimestamp ?? Date.now() / 1000) * 1000).toISOString()
  const nome = key.fromMe ? undefined : (pushName ?? key.remoteJid.split("@")[0])

  // Upsert conversa — cria ou atualiza ultima_msg/ultima_at
  await supabase.from("whatsapp_conversas").upsert(
    {
      jid:       key.remoteJid,
      ...(nome ? { nome } : {}),
      ultima_msg: corpo ?? `[${tipo}]`,
      ultima_at:  ts,
    },
    { onConflict: "jid", ignoreDuplicates: false }
  )

  if (!key.fromMe) {
    await supabase.rpc("incrementar_nao_lidas", { p_jid: key.remoteJid })
  }

  // Insert mensagem — ignora duplicatas pelo wa_message_id
  await supabase.from("whatsapp_mensagens").upsert(
    { id: key.id, jid: key.remoteJid, from_me: key.fromMe, corpo, tipo, media_url, ts },
    { onConflict: "id", ignoreDuplicates: true }
  )
}

// ── Handler principal ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Validação de token (query param — Evolution API global webhook não suporta headers customizados)
  const token = req.nextUrl.searchParams.get("token")
  if (!token || token !== process.env.WHATSAPP_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body  = await req.json()
    const event = body.event as string

    // ── messages.upsert — mensagem nova em tempo real
    if (event === "messages.upsert") {
      const data = body.data as WaMessage
      await gravarMensagem(data)
      return NextResponse.json({ ok: true })
    }

    // ── messages.set — histórico em lote entregue na conexão inicial da instância
    //    O Evolution dispara este evento ao sincronizar chats do dispositivo.
    //    Caveat: o WhatsApp Web entrega tipicamente os últimos 3 meses de histórico,
    //    não o histórico completo de todos os tempos.
    if (event === "messages.set") {
      // A payload pode vir como array direto ou dentro de { messages: [] }
      const rawData = body.data
      const msgs: WaMessage[] = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.messages)
          ? rawData.messages
          : []

      // Processa em lotes de 50 para não sobrecarregar o Supabase
      const BATCH = 50
      for (let i = 0; i < msgs.length; i += BATCH) {
        await Promise.all(msgs.slice(i, i + BATCH).map(m => gravarMensagem(m).catch(() => {})))
      }

      return NextResponse.json({ ok: true, processed: msgs.length })
    }

    // Outros eventos ignorados silenciosamente
    return NextResponse.json({ ok: true })

  } catch (e) {
    console.error("[whatsapp/webhook]", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
