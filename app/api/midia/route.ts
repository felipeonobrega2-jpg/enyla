import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { mudarConfig } from "@/app/lib/configAtomica"
import { MidiaAgente, tipoDaMidia } from "@/app/lib/midiaAgente"

// Biblioteca de mídia do agente (rota protegida pelo login): listar, subir, descrever, pausar e tirar
const MAX = 16 * 1024 * 1024   // limite do WhatsApp para vídeo
type Dados = { midiaAgente?: MidiaAgente[] }
const ler = async () => ((await supabase.from("AppConfig").select("data").eq("id", 1).single()).data?.data as Dados | undefined)?.midiaAgente ?? []

export async function GET() { return NextResponse.json({ midia: await ler() }) }

export async function POST(req: NextRequest) {
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/")) {
    const form = await req.formData().catch(() => null)
    const file = form?.get("file") as File | null
    const descricao = String(form?.get("descricao") ?? "").trim().slice(0, 140)
    if (!file) return NextResponse.json({ erro: "Escolha o arquivo." }, { status: 400 })
    const tipo = tipoDaMidia(file.type)
    if (!tipo) return NextResponse.json({ erro: "Mande vídeo (MP4) ou foto (JPG, PNG)." }, { status: 400 })
    if (file.size > MAX) return NextResponse.json({ erro: "Acima de 16 MB: o WhatsApp não aceita. Exporte em 720p." }, { status: 400 })
    const id = `m${Date.now().toString(36)}`
    const path = `midia/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60)}`
    const { error } = await supabase.storage.from("pedido-arquivos").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })
    if (error) return NextResponse.json({ erro: "Não consegui guardar. Tente de novo." }, { status: 500 })
    const { data: { publicUrl } } = supabase.storage.from("pedido-arquivos").getPublicUrl(path)
    const m: MidiaAgente = { id, url: publicUrl, mime: file.type, nome: file.name.slice(0, 120), descricao: descricao || file.name.slice(0, 80), tipo, em: new Date().toISOString(), usos: 0, ativo: true }
    await mudarConfig(d => ({ midiaAgente: [...((d as Dados).midiaAgente ?? []), m].slice(-40) }))
    return NextResponse.json({ midia: await ler() })
  }
  const b = await req.json().catch(() => ({})) as { id?: string; descricao?: string; ativo?: boolean; tirar?: boolean }
  if (!b.id) return NextResponse.json({ erro: "Faltou qual." }, { status: 400 })
  const atual = (await ler()).find(m => m.id === b.id)
  if (b.tirar && atual) {
    const caminho = decodeURIComponent(atual.url.split("/pedido-arquivos/")[1] ?? "")
    if (caminho.startsWith("midia/")) await supabase.storage.from("pedido-arquivos").remove([caminho]).catch(() => null)
  }
  await mudarConfig(d => ({
    midiaAgente: ((d as Dados).midiaAgente ?? []).flatMap(m => m.id !== b.id ? [m] : b.tirar ? [] : [{ ...m, ...(b.descricao != null ? { descricao: b.descricao.trim().slice(0, 140) } : {}), ...(b.ativo != null ? { ativo: b.ativo } : {}) }]),
  }))
  return NextResponse.json({ midia: await ler() })
}
