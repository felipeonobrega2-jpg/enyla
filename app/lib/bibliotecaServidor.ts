// Biblioteca de facas (servidor): os DXF ficam no armazenamento privado (bucket "biblioteca") e um índice em
// biblioteca/indice.json com o que cada um é. Nada disso pesa na configuração do sistema.
import { createHash } from "crypto"
import { supabase } from "./supabase"
import type { Desenho } from "./biblioteca"

const BUCKET = "biblioteca"
const INDICE = "indice.json"

async function garantirBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (!data) await supabase.storage.createBucket(BUCKET, { public: false })
}

export async function lerIndice(): Promise<Desenho[]> {
  const { data } = await supabase.storage.from(BUCKET).download(INDICE)
  if (!data) return []
  try { return JSON.parse(await data.text()) as Desenho[] } catch { return [] }
}

async function gravarIndice(lista: Desenho[]) {
  await supabase.storage.from(BUCKET).upload(INDICE, Buffer.from(JSON.stringify(lista)), { contentType: "application/json", upsert: true })
}

// Guarda o DXF (o mesmo arquivo não duplica: o id é o hash do conteúdo)
export async function guardarDesenho(texto: string, meta: Omit<Desenho, "id" | "criadoEm">): Promise<{ desenho: Desenho; novo: boolean }> {
  await garantirBucket()
  const id = createHash("sha1").update(texto).digest("hex").slice(0, 16)
  const lista = await lerIndice()
  const ja = lista.find(d => d.id === id)
  if (ja) return { desenho: ja, novo: false }
  const { error } = await supabase.storage.from(BUCKET).upload(`dxf/${id}.dxf`, Buffer.from(texto), { contentType: "application/dxf", upsert: true })
  if (error) throw new Error(error.message)
  const desenho: Desenho = { ...meta, id, criadoEm: new Date().toISOString() }
  // Relê na hora de gravar (outro envio pode ter entrado enquanto isso)
  const atual = await lerIndice()
  await gravarIndice([desenho, ...atual.filter(d => d.id !== id)])
  return { desenho, novo: true }
}

export async function lerDxf(id: string): Promise<string | null> {
  if (!/^[a-f0-9]{16}$/.test(id)) return null
  const { data } = await supabase.storage.from(BUCKET).download(`dxf/${id}.dxf`)
  return data ? await data.text() : null
}

export async function renomear(id: string, nome: string) {
  const lista = await lerIndice()
  if (!lista.some(d => d.id === id)) return false
  await gravarIndice(lista.map(d => d.id === id ? { ...d, nome: nome.trim().slice(0, 120) || d.nome } : d))
  return true
}

export async function apagar(id: string) {
  const lista = await lerIndice()
  await gravarIndice(lista.filter(d => d.id !== id))
  await supabase.storage.from(BUCKET).remove([`dxf/${id}.dxf`])
}
