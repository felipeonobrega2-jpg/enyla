// Classifica a origem das conversas do WhatsApp (anúncio + campanha, site) e preenche a origem dos clientes ligados.
// Usado pelo botão da tela e pela verificação diária. Só roda no servidor.

import { supabase } from "./supabase"
import { ENTRADAS_PADRAO, entradaDaMensagem, campanhaDoDia, normalizar, OrigemConversa } from "./origemWhatsapp"
import { clienteDaConversa, Vinculos } from "./vinculoWhatsapp"
import { nomeChave } from "./negocio"

const BASE = "https://graph.facebook.com/v20.0"
const CONVERSA = "onsite_conversion.messaging_conversation_started_7d"

async function meta<T>(url: string): Promise<T | null> {
  return fetch(url).then(r => r.json()).then(j => (j?.error ? null : j)).catch(() => null)
}

export async function classificarOrigens() {
  const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (cfgRow?.data ?? {}) as Record<string, any>
  const token = cfg.metaToken as string | undefined, conta = cfg.metaContaId as string | undefined

  // 1. Primeira mensagem recebida de cada conversa
  const primeira = new Map<string, { ts: string; corpo: string }>()
  for (let p = 0; ; p++) {
    const { data } = await supabase.from("whatsapp_mensagens").select("jid, ts, corpo").eq("from_me", false).not("corpo", "is", null)
      .order("ts", { ascending: true }).range(p * 1000, p * 1000 + 999)
    for (const m of data ?? []) if (!primeira.has(m.jid)) primeira.set(m.jid, m)
    if ((data ?? []).length < 1000) break
  }

  // 2. Campanhas que têm cada frase de anúncio, e conversas por dia de cada campanha
  const candidatas = new Map<string, string[]>()   // frase → ids de campanha
  const nomes = new Map<string, string>()
  const porDia = new Map<string, Map<string, number>>()
  if (token && conta) {
    const ads = await meta<{ data?: { campaign?: { id: string; name: string }; creative?: unknown }[] }>(
      `${BASE}/${conta}/ads?fields=campaign{id,name},creative{object_story_spec,asset_feed_spec}&limit=200&access_token=${encodeURIComponent(token)}`)
    for (const ad of ads?.data ?? []) {
      if (!ad.campaign) continue
      const txt = normalizar(JSON.stringify(ad.creative ?? {}))
      nomes.set(ad.campaign.id, ad.campaign.name)
      for (const e of ENTRADAS_PADRAO.filter(e => e.canal === "anuncio"))
        if (txt.includes(normalizar(e.frase))) candidatas.set(e.frase, [...new Set([...(candidatas.get(e.frase) ?? []), ad.campaign.id])])
    }
    const ids = [...new Set([...candidatas.values()].flat())]
    const desde = [...primeira.values()].map(v => v.ts.slice(0, 10)).sort()[0]
    if (ids.length && desde) {
      const range = encodeURIComponent(JSON.stringify({ since: desde, until: new Date().toLocaleDateString("sv-SE") }))
      const filtro = encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "IN", value: ids }]))
      let url: string | null = `${BASE}/${conta}/insights?level=campaign&fields=campaign_id,actions&time_increment=1&time_range=${range}&filtering=${filtro}&limit=500&access_token=${encodeURIComponent(token)}`
      while (url) {
        const pg: { data?: { campaign_id: string; date_start: string; actions?: { action_type: string; value: string }[] }[]; paging?: { next?: string } } | null = await meta(url)
        for (const r of pg?.data ?? []) {
          const n = Number(r.actions?.find(a => a.action_type === CONVERSA)?.value ?? 0)
          if (!n) continue
          const dia = porDia.get(r.date_start) ?? new Map<string, number>()
          dia.set(r.campaign_id, (dia.get(r.campaign_id) ?? 0) + n); porDia.set(r.date_start, dia)
        }
        url = pg?.paging?.next ?? null
      }
    }
  }

  // 3. Origem de cada conversa
  const origens = new Map<string, OrigemConversa>()
  for (const [jid, m] of primeira) {
    const e = entradaDaMensagem(m.corpo)
    if (!e) continue
    if (e.canal !== "anuncio") { origens.set(jid, { canal: e.canal, entrada: m.ts }); continue }
    const dia = new Date(m.ts).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
    const c = campanhaDoDia(dia, candidatas.get(e.frase) ?? [], porDia, nomes)
    origens.set(jid, c ? { canal: "anuncio", ...c, entrada: m.ts } : { canal: "anuncio", entrada: m.ts })
  }
  for (const [jid, o] of origens) await supabase.from("whatsapp_conversas").update({ campanha: JSON.stringify(o) }).eq("jid", jid)

  // 4. Clientes ligados às conversas: preenche a origem de quem ainda não tem
  const { data: conversas } = await supabase.from("whatsapp_conversas").select("jid, nome").in("jid", [...origens.keys()])
  const { data: cards } = await supabase.from("KanbanCard").select("nomeCliente")
  const { data: cadastro } = await supabase.from("Cliente").select("id, nome, origemCampanhaId")
  const nomesClientes = [...new Set((cards ?? []).map(c => c.nomeCliente).filter(Boolean))] as string[]
  const origensClientes = { ...(cfg.origensClientes ?? {}) } as Record<string, { canal: string; detalhe?: string }>
  let clientes = 0
  for (const c of conversas ?? []) {
    const o = origens.get(c.jid)!
    const cli = clienteDaConversa(c, nomesClientes, cfg.vinculosWhatsapp as Vinculos)
    if (!cli) continue
    const k = nomeChave(cli.nome)
    if (origensClientes[k]) continue
    const cad = (cadastro ?? []).find(x => nomeChave(x.nome) === k)
    if (o.canal === "anuncio" && o.campanhaId && cad && !cad.origemCampanhaId) {
      await supabase.from("Cliente").update({ origemCampanhaId: o.campanhaId, origemCampanhaNome: o.campanhaNome }).eq("id", cad.id)
      clientes++
    } else if (!cad?.origemCampanhaId) {
      origensClientes[k] = o.canal === "anuncio" ? { canal: "anuncio", detalhe: o.campanhaNome } : { canal: o.canal }
      clientes++
    }
  }
  const { data: atual } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  await supabase.from("AppConfig").update({ data: { ...((atual?.data as object) ?? {}), origensClientes } }).eq("id", 1)

  const v = [...origens.values()]
  return {
    conversas: origens.size,
    anuncio: v.filter(o => o.canal === "anuncio").length,
    comCampanha: v.filter(o => o.campanhaId).length,
    site: v.filter(o => o.canal === "site").length,
    clientes,
  }
}
