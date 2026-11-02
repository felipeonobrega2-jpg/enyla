import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { evo } from "@/app/lib/evolution"
import { gravarLote, WaMessage } from "@/app/lib/whatsappDados"

export const maxDuration = 60

// Envia pelo seu número (Evolution). Texto: JSON { jid, texto }. Arquivo: multipart { jid, arquivo, legenda }.
// Grava a mensagem enviada na hora, para aparecer na conversa sem esperar o webhook. (Rota protegida pelo login.)
export async function POST(req: NextRequest) {
  const multipart = req.headers.get("content-type")?.includes("multipart/form-data")
  let jid = "", texto = "", arquivo: File | null = null
  if (multipart) {
    const f = await req.formData()
    jid = String(f.get("jid") ?? ""); texto = String(f.get("legenda") ?? ""); arquivo = f.get("arquivo") as File | null
  } else {
    const b = await req.json().catch(() => ({})) as { jid?: string; texto?: string }
    jid = b.jid ?? ""; texto = (b.texto ?? "").trim()
  }
  if (!jid || (!texto && !arquivo)) return NextResponse.json({ erro: "Escreva a mensagem ou escolha um arquivo." }, { status: 400 })

  // Para quem só tem o identificador novo do WhatsApp (@lid), usa o telefone salvo quando houver
  const { data: conv } = await supabase.from("whatsapp_conversas").select("telefone").eq("jid", jid).maybeSingle()
  const number = conv?.telefone || jid

  let r
  if (arquivo) {
    if (arquivo.size > 4 * 1024 * 1024) return NextResponse.json({ erro: "Arquivo acima de 4 MB: mande pelo celular." }, { status: 413 })
    const mime = arquivo.type || "application/octet-stream"
    const mediatype = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document"
    r = await evo<WaMessage>("/message/sendMedia/{i}", {
      method: "POST",
      body: JSON.stringify({ number, mediatype, mimetype: mime, caption: texto || undefined, fileName: arquivo.name, media: Buffer.from(await arquivo.arrayBuffer()).toString("base64") }),
    })
  } else {
    r = await evo<WaMessage>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number, text: texto }) })
  }
  if (!r.ok || !r.corpo?.key?.id) return NextResponse.json({ erro: `Não enviou (${r.status}). Confira se o número está conectado.` }, { status: 502 })

  // Grava já (o webhook depois chega com a mesma mensagem e é ignorado como repetida)
  const enviada = { ...r.corpo, key: { ...r.corpo.key, remoteJid: jid, fromMe: true } }
  await gravarLote([enviada])
  return NextResponse.json({ ok: true, id: r.corpo.key.id })
}
