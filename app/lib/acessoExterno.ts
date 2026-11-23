// Porta de acesso dos diretores na nuvem (ex.: Grok Bot, um computador próprio para cada diretor, 24 h por dia).
// Cada diretor tem uma chave própria: com ela lê a empresa e usa as mesmas ferramentas da conversa com o Felipe.
// Guardamos só o hash da chave (tabela dados_sistema, coleção acessoExterno). Só roda no servidor.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { supabase } from "./supabase"
import { DIRETORES, type IdDiretor } from "./diretoria"

export type Acesso = { hash: string; fim: string; criadoEm: string; usadoEm?: string | null; hora?: string; usosNaHora?: number }
const COLECAO = "acessoExterno"
export const LIMITE_POR_HORA = 120   // um diretor em loop não pode gastar sem freio

const hash = (t: string) => createHash("sha256").update(t).digest("hex")
const ehDiretor = (d: string): d is IdDiretor => DIRETORES.some(x => x.id === d)

async function ler(diretor: IdDiretor): Promise<Acesso | null> {
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", COLECAO).eq("id", diretor).maybeSingle()
  return (data?.dados as Acesso) ?? null
}
async function gravar(diretor: IdDiretor, dados: Acesso) {
  const agora = new Date().toISOString()
  const { error } = await supabase.from("dados_sistema").upsert({ colecao: COLECAO, id: diretor, dados, v: 1, atualizado_em: agora }, { onConflict: "colecao,id" })
  if (error) throw new Error(error.message)
}

// Situação das chaves (para a tela): nunca devolve a chave nem o hash
export async function situacaoAcessos(): Promise<Record<IdDiretor, { ativa: boolean; fim: string | null; criadoEm: string | null; usadoEm: string | null }>> {
  const { data } = await supabase.from("dados_sistema").select("id, dados").eq("colecao", COLECAO)
  const por = new Map((data ?? []).map(r => [r.id as string, r.dados as Acesso]))
  return Object.fromEntries(DIRETORES.map(d => {
    const a = por.get(d.id)
    return [d.id, { ativa: !!a?.hash, fim: a?.fim ?? null, criadoEm: a?.criadoEm ?? null, usadoEm: a?.usadoEm ?? null }]
  })) as never
}

// Gera uma chave nova (a anterior para de valer). A chave só aparece uma vez, na tela.
export async function gerarChave(diretor: IdDiretor): Promise<string> {
  const chave = `enyla_${diretor}_${randomBytes(24).toString("base64url")}`
  await gravar(diretor, { hash: hash(chave), fim: chave.slice(-4), criadoEm: new Date().toISOString(), usadoEm: null })
  return chave
}
export async function revogarChave(diretor: IdDiretor) {
  await supabase.from("dados_sistema").delete().eq("colecao", COLECAO).eq("id", diretor)
}

// Confere a chave do cabeçalho Authorization: Bearer. Devolve o diretor, ou o motivo da recusa.
export async function conferirChave(cabecalho: string | null): Promise<{ ok: true; diretor: IdDiretor } | { ok: false; status: number; erro: string }> {
  const chave = (cabecalho ?? "").replace(/^Bearer\s+/i, "").trim()
  const m = /^enyla_([a-z]{3})_[A-Za-z0-9_-]{20,}$/.exec(chave)
  if (!m || !ehDiretor(m[1])) return { ok: false, status: 401, erro: "Chave ausente ou inválida." }
  const diretor = m[1]
  const a = await ler(diretor)
  const h = Buffer.from(hash(chave), "hex")
  if (!a?.hash || !timingSafeEqual(h, Buffer.from(a.hash, "hex"))) return { ok: false, status: 401, erro: "Chave revogada ou inválida." }
  const hora = new Date().toISOString().slice(0, 13)
  const usos = a.hora === hora ? (a.usosNaHora ?? 0) + 1 : 1
  if (usos > LIMITE_POR_HORA) return { ok: false, status: 429, erro: `Limite de ${LIMITE_POR_HORA} chamadas por hora. Espere a próxima hora.` }
  await gravar(diretor, { ...a, usadoEm: new Date().toISOString(), hora, usosNaHora: usos }).catch(() => null)
  return { ok: true, diretor }
}
