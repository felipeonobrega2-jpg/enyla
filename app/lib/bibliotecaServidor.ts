// Biblioteca de facas (servidor): os DXF ficam no armazenamento privado (bucket "biblioteca") e um índice em
// biblioteca/indice.json com o que cada um é. Nada disso pesa na configuração do sistema.
import { createHash } from "crypto"
import { supabase } from "./supabase"
import type { Desenho } from "./biblioteca"
import { parseDXF, caixaDoDxf } from "./dxf"

const BUCKET = "biblioteca"
const INDICE = "indice.json"

async function garantirBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (!data) await supabase.storage.createBucket(BUCKET, { public: false })
}

// Arquivo do armazenamento sempre fresco: o download comum pode vir de cache e devolver o índice velho (e aí o
// próximo envio regrava por cima e some com o desenho anterior). URL assinada nova a cada leitura, sem cache.
async function lerFresco(caminho: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 60)
  if (!data?.signedUrl) return null
  const r = await fetch(`${data.signedUrl}&t=${Date.now()}`, { cache: "no-store" }).catch(() => null)
  return r?.ok ? await r.text() : null
}

async function idsGuardados(): Promise<string[]> {
  const ids: string[] = []
  for (let de = 0; de < 20000; de += 1000) {
    const { data } = await supabase.storage.from(BUCKET).list("dxf", { limit: 1000, offset: de })
    if (!data?.length) break
    ids.push(...data.map(x => x.name.replace(/\.dxf$/, "")).filter(x => /^[a-f0-9]{16}$/.test(x)))
    if (data.length < 1000) break
  }
  return ids
}

async function gravar(caminho: string, conteudo: string, tipo: string) {
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, Buffer.from(conteudo), { contentType: tipo, upsert: true, cacheControl: "0" })
  if (error) throw new Error(error.message)
}

// O que manda é a pasta dxf/ (a lista vem do banco, nunca de cache); o índice é só o atalho das informações.
// Desenho que está na pasta e faltou no índice volta (pela ficha meta/<id>.json, ou lendo o próprio DXF).
export async function lerIndice(): Promise<Desenho[]> {
  const ids = await idsGuardados()
  if (!ids.length) return []
  let indice: Desenho[] = []
  try { indice = JSON.parse((await lerFresco(INDICE)) ?? "[]") as Desenho[] } catch { indice = [] }
  const tem = new Set(ids)
  const lista = indice.filter(d => tem.has(d.id))
  const faltam = ids.filter(id => !lista.some(d => d.id === id))
  if (!faltam.length && lista.length === indice.length) return lista
  for (const id of faltam) {
    const d = await fichaDe(id)
    if (d) lista.push(d)
  }
  lista.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  await gravar(INDICE, JSON.stringify(lista), "application/json").catch(() => null)
  return lista
}

async function fichaDe(id: string): Promise<Desenho | null> {
  try { const m = await lerFresco(`meta/${id}.json`); if (m) return JSON.parse(m) as Desenho } catch { /* lê o DXF */ }
  const texto = await lerFresco(`dxf/${id}.dxf`)
  const r = texto ? parseDXF(texto) : null
  if (!r) return null
  const c = caixaDoDxf("", r)
  return { id, nome: "desenho.dxf", modelo: c?.modelo, caixa: c ? { largura: c.largura, altura: c.altura, profundidade: c.profundidade } : null, blank: { largura: r.largura, altura: r.altura }, criadoEm: new Date().toISOString() }
}

// Guarda o DXF (o mesmo arquivo não duplica: o id é o hash do conteúdo) e a ficha dele
export async function guardarDesenho(texto: string, meta: Omit<Desenho, "id" | "criadoEm">): Promise<{ desenho: Desenho; novo: boolean }> {
  await garantirBucket()
  const id = createHash("sha1").update(texto).digest("hex").slice(0, 16)
  const lista = await lerIndice()
  const ja = lista.find(d => d.id === id)
  if (ja) return { desenho: ja, novo: false }
  const desenho: Desenho = { ...meta, id, criadoEm: new Date().toISOString() }
  await gravar(`dxf/${id}.dxf`, texto, "application/dxf")
  await gravar(`meta/${id}.json`, JSON.stringify(desenho), "application/json")
  // Relê na hora de gravar (outro envio pode ter entrado enquanto isso; o que escapar volta na próxima leitura)
  const atual = await lerIndice()
  await gravar(INDICE, JSON.stringify([desenho, ...atual.filter(d => d.id !== id)]), "application/json")
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
  const novo = lista.map(d => d.id === id ? { ...d, nome: nome.trim().slice(0, 120) || d.nome } : d)
  await gravar(INDICE, JSON.stringify(novo), "application/json")
  const d = novo.find(x => x.id === id)
  if (d) await gravar(`meta/${id}.json`, JSON.stringify(d), "application/json").catch(() => null)
  return true
}

export async function apagar(id: string) {
  await supabase.storage.from(BUCKET).remove([`dxf/${id}.dxf`, `meta/${id}.json`])
  const lista = await lerIndice()
  await gravar(INDICE, JSON.stringify(lista.filter(d => d.id !== id)), "application/json")
}
