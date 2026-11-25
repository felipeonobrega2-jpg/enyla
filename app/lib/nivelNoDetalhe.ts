// ?o=detalhe&area=comercial: o nível e o jaCliente de cada lead/conversa que aparece no detalhe. Só LÊ.
// Os jids saem do próprio texto do detalhe (que já os traz); nenhum telefone, e-mail ou endereço novo na resposta.
import { carregarFontesNivel, classificarNivel, type Nivel } from "./nivelCliente"
import { supabase } from "./supabase"

export const MAX_NIVEIS = 60

export async function niveisDosLeads(detalhe: string | undefined): Promise<{ jid: string; nivel: Nivel; jaCliente: boolean }[]> {
  const jids = [...new Set([...(detalhe ?? "").matchAll(/"jid":"([^"]+)"/g)].map(m => m[1]))].slice(0, MAX_NIVEIS)
  if (!jids.length) return []
  const fontes = await carregarFontesNivel()
  const { data } = fontes.leituraOk ? await supabase.from("whatsapp_conversas").select("jid, nome, telefone").in("jid", jids) : { data: null }
  const porJid = new Map((data ?? []).map(c => [c.jid as string, c as { jid: string; nome: string | null; telefone: string | null }]))
  return jids.map(jid => {
    const n = classificarNivel(porJid.get(jid) ?? { jid, nome: null }, fontes)
    return { jid, nivel: n.nivel, jaCliente: n.jaCliente }
  })
}
