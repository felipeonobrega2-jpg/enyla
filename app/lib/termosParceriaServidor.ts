// Termos de Parceria no servidor: lê o texto vigente da tabela, grava o aceite e gera o token do link de aceite.
// Não envia mensagem a ninguém.
import { randomBytes } from "node:crypto"
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { TERMOS_INICIAIS, type TermosParceria } from "./termosParceria"
import type { CadastroParceiro } from "./parceiros"

type Cfg = Record<string, unknown> & { cadastrosParceiros?: CadastroParceiro[] }
export type MetaAceite = { ip?: string; userAgent?: string }

/** Versão vigente: a de maior vigente_desde que já começou. Sem tabela ou sem linha, usa a versão 0.3 embutida. */
export async function lerTermosVigentes(): Promise<TermosParceria> {
  try {
    const { data, error } = await supabase.from("termos_parceria").select("versao, titulo, texto, rascunho, vigente_desde")
      .lte("vigente_desde", new Date().toISOString()).order("vigente_desde", { ascending: false }).limit(1)
    const l = data?.[0] as { versao: string; titulo: string; texto: string; rascunho: boolean; vigente_desde: string } | undefined
    if (!error && l?.versao && l.texto) return { versao: l.versao, titulo: l.titulo, texto: l.texto, rascunho: !!l.rascunho, vigenteDesde: l.vigente_desde }
  } catch { /* tabela ainda não criada */ }
  return TERMOS_INICIAIS
}

export const metaDoPedido = (h: Headers): MetaAceite => ({
  ip: (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim().slice(0, 64) || undefined,
  userAgent: (h.get("user-agent") ?? "").slice(0, 300) || undefined,
})

export const registroDeAceite = (termos: TermosParceria, meta: MetaAceite = {}) => ({
  termosVersao: termos.versao, termosAceitosEm: new Date().toISOString(), termosIp: meta.ip, termosUserAgent: meta.userAgent,
})

/** Aceite pelo link de quem já estava cadastrada (token do cadastro). Não reabre aceite já feito da mesma versão. */
export async function aceitarPorToken(token: string, meta: MetaAceite): Promise<{ ok: boolean; erro?: string }> {
  const t = (token ?? "").trim()
  if (t.length < 16) return { ok: false, erro: "Link inválido." }
  const termos = await lerTermosVigentes()
  let achou = false
  await mudarConfig((d: Cfg) => {
    const lista = d.cadastrosParceiros ?? []
    if (!lista.some(c => c.termosToken === t)) return null
    achou = true
    return { cadastrosParceiros: lista.map(c => c.termosToken === t ? { ...c, ...registroDeAceite(termos, meta) } : c) }
  })
  return achou ? { ok: true } : { ok: false, erro: "Link inválido." }
}

/** Gera (ou devolve) o token do link de aceite de um cadastro antigo. Uso interno; não envia nada. */
export async function garantirTokenTermos(cadastroId: string): Promise<string | null> {
  let token: string | null = null
  await mudarConfig((d: Cfg) => {
    const lista = d.cadastrosParceiros ?? []
    const c = lista.find(x => x.id === cadastroId)
    if (!c) return null
    if (c.termosToken) { token = c.termosToken; return null }
    token = randomBytes(18).toString("base64url")
    return { cadastrosParceiros: lista.map(x => x.id === cadastroId ? { ...x, termosToken: token! } : x) }
  })
  return token
}
