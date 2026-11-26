// Trava da Atendente: gráfica de prospectos_parceiros que responde no WhatsApp não é cliente, a Atendente não responde.
// A mensagem continua gravada e a cadência do Prospector continua parando (detectarRespostas); aqui só se lê.
import { supabase } from "./supabase"
import { lerApelidos } from "./juntarConversas"
import { chaveTelefone } from "./prospectorEnvio"

const POR_PAGINA = 1000
const MAX_PAGINAS = 20

// Chaves (sem 55, sem o 9 extra) de todos os telefones dos prospectos; tabela ausente ou erro = nenhum
async function chavesDosProspectos(): Promise<Set<string>> {
  const chaves = new Set<string>()
  try {
    for (let p = 0; p < MAX_PAGINAS; p++) {
      const { data, error } = await supabase.from("prospectos_parceiros").select("telefone").range(p * POR_PAGINA, (p + 1) * POR_PAGINA - 1)
      if (error || !data) break
      for (const r of data as { telefone?: string | null }[]) { const k = chaveTelefone(r.telefone); if (k.length >= 10) chaves.add(k) }
      if (data.length < POR_PAGINA) break
    }
  } catch { /* sem tabela: sem prospectos */ }
  return chaves
}

/** O jid da conversa (número, com ou sem o 9, ou @lid já ligado a um número) é de um prospecto? */
export async function ehProspecto(jid: string | null | undefined): Promise<boolean> {
  if (!jid) return false
  const candidatos = new Set<string>()
  const juntar = (j: string | null | undefined) => { if (j && j.endsWith("@s.whatsapp.net")) candidatos.add(chaveTelefone(j.split("@")[0])) }
  juntar(jid)
  if (jid.endsWith("@lid")) {
    const ligado = await lerApelidos().then(a => a[jid]).catch(() => undefined)
    juntar(ligado)
  }
  try {
    const { data } = await supabase.from("whatsapp_conversas").select("telefone").eq("jid", jid).maybeSingle()
    const t = chaveTelefone((data as { telefone?: string | null } | null)?.telefone)
    if (t) candidatos.add(t)
  } catch { /* sem a conversa: fica o que o jid já diz */ }
  candidatos.delete("")
  if (![...candidatos].some(k => k.length >= 10)) return false
  const chaves = await chavesDosProspectos()
  return [...candidatos].some(k => chaves.has(k))
}

export type ProspectoDoJid = {
  id: number; razao_social: string | null; nome_fantasia: string | null; telefone: string | null
  etapa: string; opt_out: boolean; historico_etapas: unknown; atualizado_em: string
}

/** A linha do prospecto dono desse jid (mesma casa de números de ehProspecto), ou null. Só lê. */
export async function prospectoDoJid(jid: string | null | undefined): Promise<ProspectoDoJid | null> {
  if (!jid) return null
  const candidatos = new Set<string>()
  const juntar = (j: string | null | undefined) => { if (j && j.endsWith("@s.whatsapp.net")) candidatos.add(chaveTelefone(j.split("@")[0])) }
  juntar(jid)
  if (jid.endsWith("@lid")) juntar(await lerApelidos().then(a => a[jid]).catch(() => undefined))
  candidatos.delete("")
  if (![...candidatos].some(k => k.length >= 10)) return null
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await supabase.from("prospectos_parceiros")
      .select("id, razao_social, nome_fantasia, telefone, etapa, opt_out, historico_etapas, atualizado_em").range(p * POR_PAGINA, (p + 1) * POR_PAGINA - 1)
    if (error || !data) return null
    const achou = (data as ProspectoDoJid[]).find(r => candidatos.has(chaveTelefone(r.telefone)))
    if (achou) return achou
    if (data.length < POR_PAGINA) break
  }
  return null
}
