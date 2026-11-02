import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { evo } from "@/app/lib/evolution"

const BUCKET = "whatsapp-midia"   // privado, mesmo da mídia
const SEM_FOTO_DIAS = 3           // contato sem foto: tenta de novo depois de alguns dias
const FOTO_DIAS = 7               // foto guardada: renova depois de uma semana

// Foto de perfil do contato (rota protegida pelo login). Guarda uma cópia: o link do WhatsApp expira.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ jid: string }> }) {
  const { jid } = await params
  if (!/^[\w.@-]{5,80}$/.test(jid)) return new NextResponse(null, { status: 400 })
  const base = `fotos/${jid.replace(/[@.]/g, "_")}`

  const { data: lista } = await supabase.storage.from(BUCKET).list("fotos", { search: base.slice(6) })
  const arq = (lista ?? []).find(f => f.name.startsWith(base.slice(6)))
  const idadeDias = arq?.created_at ? (Date.now() - new Date(arq.created_at).getTime()) / 86_400_000 : Infinity
  if (arq?.name.endsWith(".none") && idadeDias < SEM_FOTO_DIAS) return new NextResponse(null, { status: 404 })
  if (arq?.name.endsWith(".jpg") && idadeDias < FOTO_DIAS) {
    const { data } = await supabase.storage.from(BUCKET).download(`fotos/${arq.name}`)
    if (data) return new NextResponse(data, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } })
  }

  const r = await evo<{ profilePictureUrl?: string | null }>("/chat/fetchProfilePictureUrl/{i}", { method: "POST", body: JSON.stringify({ number: jid }) })
  const url = r.corpo?.profilePictureUrl
  const img = url ? await fetch(url).then(x => x.ok ? x.arrayBuffer() : null).catch(() => null) : null
  if (arq) await supabase.storage.from(BUCKET).remove([`fotos/${arq.name}`])
  if (!img) {
    await supabase.storage.from(BUCKET).upload(`${base}.none`, new Uint8Array(), { upsert: true }).catch(() => null)
    return new NextResponse(null, { status: 404 })
  }
  await supabase.storage.from(BUCKET).upload(`${base}.jpg`, Buffer.from(img), { contentType: "image/jpeg", upsert: true }).catch(() => null)
  return new NextResponse(img, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } })
}
