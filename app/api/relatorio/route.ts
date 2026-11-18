// Dados do relatório gerencial que não estão no navegador: digital, leads do WhatsApp, gasto em anúncios e a
// confiança dos dados (Auditor). Para o período pedido e o anterior de mesmo tamanho.
import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export const dynamic = "force-dynamic"

type Ped = { id: string; total: number; em: string; sinalPagoEm?: string; teste?: boolean; status: string; quantidade?: number }
type Conv = { jid: string; criado_em: string | null; status_lead: string | null; etiquetas: string[] | null; campanha: string | null }
const dia = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const ok = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

function digital(peds: Ped[], de: string, ate: string) {
  const vivos = peds.filter(p => !p.teste && p.status !== "cancelado")
  const orcados = vivos.filter(p => { const d = dia(p.em); return d >= de && d <= ate })
  const pagos = vivos.filter(p => p.sinalPagoEm && dia(p.sinalPagoEm) >= de && dia(p.sinalPagoEm) <= ate)
  const faturamento = pagos.reduce((t, p) => t + p.total, 0)
  return { orcados: orcados.length, pagos: pagos.length, faturamento, ticket: pagos.length ? faturamento / pagos.length : 0,
    conversao: orcados.length ? orcados.filter(p => p.sinalPagoEm).length / orcados.length * 100 : null, unidades: pagos.reduce((t, p) => t + (p.quantidade ?? 0), 0) }
}
function leads(convs: Conv[], de: string, ate: string) {
  const doPer = convs.filter(c => c.criado_em && dia(c.criado_em) >= de && dia(c.criado_em) <= ate)
  const bom = (c: Conv) => c.status_lead === "mql" || (c.etiquetas ?? []).some(e => /^(ICP|Oportunidade|Lead médio|MQL)$/.test(e))
  const anuncio = (c: Conv) => /anuncio/.test(c.campanha ?? "")
  const fornecedor = (c: Conv) => (c.etiquetas ?? []).includes("Fornecedora")
  const reais = doPer.filter(c => !fornecedor(c))
  return { novos: reais.length, mql: reais.filter(bom).length, doAnuncio: reais.filter(anuncio).length, digital: reais.filter(c => (c.etiquetas ?? []).includes("Digital")).length }
}

async function gastoMeta(cfg: { metaContaId?: string; metaToken?: string }, de: string, ate: string): Promise<number | null> {
  const conta = cfg.metaContaId ?? (process.env.META_AD_ACCOUNT_ID ? (process.env.META_AD_ACCOUNT_ID.startsWith("act_") ? process.env.META_AD_ACCOUNT_ID : `act_${process.env.META_AD_ACCOUNT_ID}`) : null)
  const token = cfg.metaToken ?? process.env.META_ACCESS_TOKEN
  if (!conta || !token) return null
  const q = new URLSearchParams({ fields: "spend", time_range: JSON.stringify({ since: de, until: ate }), access_token: token })
  const j = await fetch(`https://graph.facebook.com/v20.0/${conta}/insights?${q}`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => null) as { data?: { spend?: string }[]; error?: unknown } | null
  if (!j || j.error) return null
  return (j.data ?? []).reduce((t, r) => t + Number(r.spend ?? 0), 0)
}

export async function GET(req: Request) {
  const u = new URL(req.url)
  const de = u.searchParams.get("de"), ate = u.searchParams.get("ate"), deAnt = u.searchParams.get("deAnt"), ateAnt = u.searchParams.get("ateAnt")
  if (!ok(de) || !ok(ate) || !ok(deAnt) || !ok(ateAnt)) return NextResponse.json({ erro: "período" }, { status: 400 })
  // Contato novo = primeira mensagem recebida dele cai no período (a data de criação da conversa é a da importação)
  const desde = `${deAnt}T00:00:00-03:00`, ateTs = `${ate}T23:59:59-03:00`
  const [{ data: c }, convs] = await Promise.all([
    supabase.from("AppConfig").select("data").eq("id", 1).single(),
    (async () => {
      const primeira = new Map<string, string>()
      for (let i = 0; i < 60; i++) {
        const { data } = await supabase.from("whatsapp_mensagens").select("jid, ts").eq("from_me", false).not("jid", "like", "%@g.us").gte("ts", desde).lte("ts", ateTs).order("ts", { ascending: true }).range(i * 1000, i * 1000 + 999)
        for (const m of data ?? []) if (!primeira.has(m.jid)) primeira.set(m.jid, m.ts)
        if (!data || data.length < 1000) break
      }
      // Quem já falava antes do período anterior não é contato novo
      const jids = [...primeira.keys()]
      const antigos = new Set<string>()
      for (let i = 0; i < jids.length; i += 150) {
        const { data } = await supabase.from("whatsapp_mensagens").select("jid").in("jid", jids.slice(i, i + 150)).lt("ts", desde).limit(5000)
        for (const m of data ?? []) antigos.add(m.jid)
      }
      const novos = jids.filter(j => !antigos.has(j))
      const info = new Map<string, Omit<Conv, "criado_em">>()
      for (let i = 0; i < novos.length; i += 150) {
        const { data } = await supabase.from("whatsapp_conversas").select("jid, status_lead, etiquetas, campanha").in("jid", novos.slice(i, i + 150))
        for (const x of data ?? []) info.set(x.jid, x as Omit<Conv, "criado_em">)
      }
      return novos.map(j => ({ jid: j, criado_em: primeira.get(j)!, status_lead: info.get(j)?.status_lead ?? null, etiquetas: info.get(j)?.etiquetas ?? null, campanha: info.get(j)?.campanha ?? null }))
    })(),
  ])
  const cfg = (c?.data ?? {}) as { pedidosDigitais?: Ped[]; metaContaId?: string; metaToken?: string; auditoriaDados?: { em: string; confianca: number; total: number; graves: number; valorEmJogo: number; porRegra?: Record<string, number> } }
  const peds = cfg.pedidosDigitais ?? []
  const [meta, metaAnt] = await Promise.all([gastoMeta(cfg, de!, ate!), gastoMeta(cfg, deAnt!, ateAnt!)])
  return NextResponse.json({
    digital: digital(peds, de!, ate!), digitalAnt: digital(peds, deAnt!, ateAnt!),
    leads: leads(convs, de!, ate!), leadsAnt: leads(convs, deAnt!, ateAnt!),
    meta, metaAnt,
    dados: cfg.auditoriaDados ?? null,
  })
}
