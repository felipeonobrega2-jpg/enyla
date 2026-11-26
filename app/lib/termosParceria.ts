// Termos de Parceria: texto versionado na tabela termos_parceria (troca sem deploy) e registro do aceite.
// Sem a tabela (migration ainda não rodou), vale o rascunho abaixo, igual ao da migration.
import { supabase } from "./supabase"

export type TermosParceria = { versao: string; texto: string; rascunho: boolean; vigenteDesde: string }

export const TERMOS_PROVISORIOS: TermosParceria = {
  versao: "rascunho-1",
  rascunho: true,
  vigenteDesde: "2026-12-01T00:00:00.000Z",
  texto: [
    "RASCUNHO: texto provisório, sem valor jurídico. O texto final virá da ENYLA e do jurídico.",
    "1. Não contato com clientes. A parceira não pode contatar, direta ou indiretamente, nenhum cliente da ENYLA que conheça por meio dos pedidos recebidos, por 24 (vinte e quatro) meses após o último serviço prestado à ENYLA.",
    "2. Multa. O descumprimento desta cláusula sujeita a parceira a multa, cujo valor será definido no texto final.",
  ].join("\n\n"),
}

export async function lerTermosVigentes(): Promise<TermosParceria> {
  try {
    const { data, error } = await supabase.from("termos_parceria").select("versao, texto, rascunho, vigente_desde")
      .lte("vigente_desde", new Date().toISOString()).order("vigente_desde", { ascending: false }).limit(1).maybeSingle()
    if (error || !data) return TERMOS_PROVISORIOS
    return { versao: String(data.versao), texto: String(data.texto), rascunho: !!data.rascunho, vigenteDesde: String(data.vigente_desde) }
  } catch { return TERMOS_PROVISORIOS }
}

export type ContextoAceite = { ip?: string | null; userAgent?: string | null }

export function contextoDaRequisicao(req: Request): ContextoAceite {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || null
  return { ip: ip ? ip.slice(0, 64) : null, userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null }
}

// Registro próprio do aceite (versão, data, ip e user-agent). Falha quieta: a versão e a data também vão no cadastro.
export async function gravarAceite(cadastroId: string, documento: string, versao: string, em: string, ctx: ContextoAceite): Promise<boolean> {
  try {
    const { error } = await supabase.from("parceiros_termos_aceites").insert({
      cadastro_id: cadastroId, documento, termos_versao: versao, termos_aceitos_em: em, ip: ctx.ip ?? null, user_agent: ctx.userAgent ?? null,
    })
    return !error
  } catch { return false }
}
