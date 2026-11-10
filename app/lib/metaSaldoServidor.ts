// Confere o crédito dos anúncios na Meta (no máximo 1 vez por hora, pegando carona no webhook) e avisa pelo ntfy:
// "acabando" no máximo a cada 12 h, "parada" a cada 3 h enquanto durar.
import { mudarConfig } from "./configAtomica"
import { supabase } from "./supabase"
import { notificar } from "./notificar"
import { ContaMeta, precisaAvisar, situacaoMeta, textoAvisoMeta } from "./metaSaldo"

const BASE = "https://graph.facebook.com/v20.0"

export async function talvezConferirMeta() {
  let minha = false
  await mudarConfig((d: Record<string, unknown> & { metaSaldoVistoEm?: string }) => {
    if (d.metaSaldoVistoEm && Date.now() - new Date(d.metaSaldoVistoEm).getTime() < 3_600_000) return null
    minha = true
    return { metaSaldoVistoEm: new Date().toISOString() }
  })
  if (!minha) return
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (data?.data ?? {}) as { metaToken?: string; metaContaId?: string; metaSaldoAviso?: { tipo: string; em: string } }
  const token = cfg.metaToken ?? process.env.META_ACCESS_TOKEN
  const bruta = cfg.metaContaId ?? process.env.META_AD_ACCOUNT_ID
  if (!token || !bruta) return
  const conta = bruta.startsWith("act_") ? bruta : `act_${bruta}`
  const tk = encodeURIComponent(token)
  const c = await fetch(`${BASE}/${conta}?fields=account_status,disable_reason,funding_source_details,spend_cap,amount_spent,is_prepay_account&access_token=${tk}`, { signal: AbortSignal.timeout(10_000) })
    .then(r => r.json()).catch(() => null) as (ContaMeta & { error?: unknown }) | null
  if (!c || c.error) return
  const ins = await fetch(`${BASE}/${conta}/insights?fields=spend&date_preset=last_7d&access_token=${tk}`, { signal: AbortSignal.timeout(10_000) })
    .then(r => r.json()).catch(() => null) as { data?: { spend?: string }[] } | null
  const media = Number(ins?.data?.[0]?.spend ?? 0) / 7
  const s = situacaoMeta(c, media)
  const tipo = precisaAvisar(s)
  if (!tipo) {
    if (cfg.metaSaldoAviso) await mudarConfig(() => ({ metaSaldoAviso: undefined }))
    return
  }
  const intervalo = (tipo === "parada" ? 3 : 12) * 3_600_000
  const ult = cfg.metaSaldoAviso
  if (ult && ult.tipo === tipo && Date.now() - new Date(ult.em).getTime() < intervalo) return
  await mudarConfig(() => ({ metaSaldoAviso: { tipo, em: new Date().toISOString() } }))
  await notificar(tipo === "parada" ? "Anúncios parados" : "Crédito da Meta acabando", textoAvisoMeta(s, tipo), {
    prioridade: tipo === "parada" ? "urgente" : "alta", link: "https://adsmanager.facebook.com/", tags: ["moneybag"],
  })
}
