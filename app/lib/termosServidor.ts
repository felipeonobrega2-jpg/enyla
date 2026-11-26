// Termos de Parceria no servidor: lê o termo vigente (tabela termos_parceria, com o rascunho do código como reserva)
// e grava o aceite (versão, data, ip e user-agent). Não envia nada a ninguém.
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { createHmac, timingSafeEqual } from "crypto"
import { termoVigente, type AceiteTermos, type TermoParceria } from "./termosParceria"
import type { CadastroParceiro } from "./parceiros"

export async function lerTermoVigente(): Promise<TermoParceria> {
  try {
    const { data, error } = await supabase.from("termos_parceria").select("versao, texto, vigente_desde, rascunho").order("vigente_desde", { ascending: false }).limit(20)
    return termoVigente(error ? null : data)
  } catch { return termoVigente(null) }
}

/** Dados do aceite para gravar no cadastro (ip e user-agent vêm dos cabeçalhos da requisição). */
export function aceiteAgora(termo: Pick<TermoParceria, "versao">, req?: { headers: { get(n: string): string | null } } | null): AceiteTermos {
  const ip = (req?.headers.get("x-forwarded-for")?.split(",")[0] ?? req?.headers.get("x-real-ip") ?? "").trim().slice(0, 64) || null
  const userAgent = (req?.headers.get("user-agent") ?? "").slice(0, 300) || null
  return { versao: termo.versao, em: new Date().toISOString(), ip, userAgent }
}

/** Registro permanente do aceite (nunca apagado). Falha quieta: o aceite já está no cadastro. */
export async function registrarAceite(origem: "parceiros" | "fornecedor", referencia: string, a: AceiteTermos, documento?: string) {
  try {
    await supabase.from("termos_aceites").insert({ origem, referencia, versao: a.versao, aceito_em: a.em, ip: a.ip, user_agent: a.userAgent })
    if (documento) await supabase.from("prospectos_parceiros").update({ termos_versao: a.versao, termos_aceitos_em: a.em, termos_ip: a.ip, termos_user_agent: a.userAgent }).eq("cnpj", documento)
  } catch { /* o aceite já está gravado no cadastro */ }
}

// ── Token do cadastro (link /parceiros/termos?aceite=1&c=ID&t=TOKEN) ─────────
// Derivado do id com AUTH_SECRET: serve para cadastros antigos e novos, sem guardar nada.
const segredo = () => process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? ""
export function tokenDoCadastro(id: string): string | null {
  const s = segredo()
  return s && id ? createHmac("sha256", s).update(`termos:${id}`).digest("hex").slice(0, 32) : null
}
export function tokenConfere(id: string, token: string): boolean {
  const esperado = tokenDoCadastro(id)
  if (!esperado || typeof token !== "string" || token.length !== esperado.length) return false
  return timingSafeEqual(Buffer.from(esperado), Buffer.from(token))
}
export const linkDeAceite = (base: string, id: string) => { const t = tokenDoCadastro(id); return t ? `${base.replace(/\/$/, "")}/parceiros/termos?aceite=1&c=${encodeURIComponent(id)}&t=${t}` : null }

type Cfg = Record<string, unknown> & { cadastrosParceiros?: CadastroParceiro[] }

/** Aceite pelo link do cadastro (/parceiros/termos?aceite=1&c=ID&t=TOKEN). Vale para cadastro antigo e para fornecedor em operação. */
export async function aceitarPorLink(id: string, token: string, req?: { headers: { get(n: string): string | null } } | null): Promise<{ ok: true; versao: string } | { ok: false; erro: string }> {
  if (!id || !tokenConfere(id, token)) return { ok: false, erro: "Link inválido. Peça um novo link à ENYLA." }
  const termo = await lerTermoVigente()
  const a = aceiteAgora(termo, req)
  let cadastro: CadastroParceiro | undefined
  await mudarConfig((d: Cfg) => {
    cadastro = (d.cadastrosParceiros ?? []).find(x => x.id === id)
    return cadastro ? { cadastrosParceiros: (d.cadastrosParceiros ?? []).map(x => x.id === id ? { ...x, termos: a } : x) } : null
  })
  await registrarAceite(cadastro ? "parceiros" : "fornecedor", id, a, cadastro?.documento)
  return { ok: true, versao: termo.versao }
}
