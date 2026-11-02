// Mesma pessoa em duas conversas: o WhatsApp identifica pelo número (…@s.whatsapp.net) ou pelo identificador novo
// (…@lid). Junta tudo numa conversa só (a do número, quando houver: é a que envia direto) e guarda o apelido
// para as próximas mensagens já caírem no lugar certo. Só roda no servidor.

import { supabase } from "./supabase"

export type Apelidos = Record<string, string>   // jid que some → jid que fica

export async function lerApelidos(): Promise<Apelidos> {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  return ((data?.data as { apelidosWhatsapp?: Apelidos } | null)?.apelidosWhatsapp) ?? {}
}

// Qual fica: a do número de telefone; entre duas iguais, a que já tem mais histórico decide quem chama
export const qualFica = (a: string, b: string) => a.endsWith("@s.whatsapp.net") && !b.endsWith("@s.whatsapp.net") ? { fica: a, sai: b } : { fica: b, sai: a }

const maisNova = (a?: string | null, b?: string | null) => !a ? b ?? null : !b ? a : a > b ? a : b
const numero = (s?: string | null) => !!s && /^\d+$/.test(s)

export async function juntarConversas(sai: string, fica: string) {
  if (!sai || !fica || sai === fica) return { ok: false as const, erro: "Escolha duas conversas diferentes." }
  const { data: linhas } = await supabase.from("whatsapp_conversas").select("*").in("jid", [sai, fica])
  const a = (linhas ?? []).find(c => c.jid === sai), b = (linhas ?? []).find(c => c.jid === fica)
  // Mensagens passam para a conversa que fica (ids são únicos, não duplica)
  await supabase.from("whatsapp_mensagens").update({ jid: fica }).eq("jid", sai)
  if (a) {
    const novaA = !b || (a.ultima_at ?? "") > (b.ultima_at ?? "")
    const junta = {
      ...(b ?? {}),
      jid: fica,
      nome: b?.nome && !numero(b.nome) ? b.nome : a.nome ?? b?.nome,
      telefone: b?.telefone ?? a.telefone ?? (fica.endsWith("@s.whatsapp.net") ? fica.split("@")[0] : null),
      foto_url: b?.foto_url ?? a.foto_url ?? null,
      ultima_msg: novaA ? a.ultima_msg : b?.ultima_msg ?? a.ultima_msg,
      ultima_at: maisNova(a.ultima_at, b?.ultima_at),
      ultima_recebida_at: maisNova(a.ultima_recebida_at, b?.ultima_recebida_at),
      ultima_enviada_at: maisNova(a.ultima_enviada_at, b?.ultima_enviada_at),
      nao_lidas: (a.nao_lidas ?? 0) + (b?.nao_lidas ?? 0),
      // Origem: a da primeira conversa (o anúncio/site por onde a pessoa chegou)
      campanha: a.campanha ?? b?.campanha ?? null,
      status_lead: b?.status_lead ?? a.status_lead ?? null,
      ultima_classificacao_at: b?.status_lead ? b.ultima_classificacao_at : a.ultima_classificacao_at ?? null,
      fechada_em: b && !b.fechada_em ? null : maisNova(a.fechada_em, b?.fechada_em),
      etiquetas: [...new Set([...(a.etiquetas ?? []), ...(b?.etiquetas ?? [])])],
    }
    await supabase.from("whatsapp_conversas").upsert(junta, { onConflict: "jid" })
    await supabase.from("whatsapp_conversas").delete().eq("jid", sai)
  }
  // Apelido para as próximas mensagens e vínculo com o cliente
  const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (cfgRow?.data ?? {}) as Record<string, unknown>
  const apelidos = { ...((cfg.apelidosWhatsapp as Apelidos) ?? {}), [sai]: fica }
  for (const [k, v] of Object.entries(apelidos)) if (v === sai) apelidos[k] = fica   // corrente: x → sai → fica
  const vinculos = { ...((cfg.vinculosWhatsapp as Record<string, string>) ?? {}) }
  if (sai in vinculos) { if (!(fica in vinculos)) vinculos[fica] = vinculos[sai]; delete vinculos[sai] }
  await supabase.from("AppConfig").update({ data: { ...cfg, apelidosWhatsapp: apelidos, vinculosWhatsapp: vinculos } }).eq("id", 1)
  return { ok: true as const, fica }
}
