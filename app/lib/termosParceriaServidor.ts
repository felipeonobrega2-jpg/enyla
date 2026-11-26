import { randomBytes } from "crypto"
import { supabase } from "./supabase"
import { TERMOS_PROVISORIO, registroDoAceite, type MetaAceite, type Termos } from "./termosParceria"

// Termos vigentes: o registro de maior vigente_desde que já começou. Sem tabela ou vazia, o texto provisório.
export async function termosVigentes(): Promise<Termos> {
  try {
    const { data } = await supabase.from("termos_parceria").select("versao, texto, rascunho, vigente_desde").lte("vigente_desde", new Date().toISOString()).order("vigente_desde", { ascending: false }).limit(1).maybeSingle()
    if (data?.versao && data.texto) return data as Termos
  } catch { /* usa o provisório */ }
  return TERMOS_PROVISORIO
}

// Cadastro novo que aceitou no formulário: guarda versão, data, IP e navegador
export async function gravarAceiteDoCadastro(cadastroId: string, versao: string, meta: MetaAceite) {
  const { error } = await supabase.from("termos_parceria_aceites").insert({ cadastro_id: cadastroId, token: randomBytes(32).toString("hex"), ...registroDoAceite(versao, meta) })
  return !error
}

export async function aceitePorToken(token: string) {
  if (!/^[a-f0-9]{32,64}$/.test(token)) return null
  const { data } = await supabase.from("termos_parceria_aceites").select("cadastro_id, status, termos_versao, termos_aceitos_em").eq("token", token).maybeSingle()
  return data as { cadastro_id: string; status: string; termos_versao: string | null; termos_aceitos_em: string | null } | null
}

// Parceira já cadastrada aceita pelo link com token
export async function aceitarPorToken(token: string, meta: MetaAceite): Promise<{ ok: true; versao: string } | { ok: false; erro: string }> {
  const a = await aceitePorToken(token)
  if (!a) return { ok: false, erro: "Link inválido. Peça um novo à ENYLA." }
  const t = await termosVigentes()
  const { error } = await supabase.from("termos_parceria_aceites").update(registroDoAceite(t.versao, meta)).eq("token", token)
  if (error) return { ok: false, erro: "Não consegui registrar agora. Tente de novo." }
  return { ok: true, versao: t.versao }
}
