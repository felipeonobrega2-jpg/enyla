import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

const ACCOUNT    = process.env.META_AD_ACCOUNT_ID
const APP_ID     = process.env.META_APP_ID
const APP_SECRET = process.env.META_APP_SECRET
const BASE       = "https://graph.facebook.com/v20.0"

async function getToken(): Promise<{ token: string; expiry: number | null }> {
  // 1. Try Supabase (updated via UI without redeployment)
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (data?.data as Record<string, unknown>) ?? {}
  if (cfg.metaToken) {
    return { token: cfg.metaToken as string, expiry: (cfg.metaTokenExpiry as number) ?? null }
  }
  // 2. Fall back to env var (legacy)
  return { token: process.env.META_ACCESS_TOKEN ?? "", expiry: null }
}

async function autoRefresh(currentToken: string, expiry: number | null) {
  if (!APP_ID || !APP_SECRET) return
  const twentyDays = 20 * 86400
  if (expiry && (expiry - Date.now() / 1000) > twentyDays) return // plenty of time left

  // Refresh the token before it expires
  const url = new URL(`${BASE}/oauth/access_token`)
  url.searchParams.set("grant_type", "fb_exchange_token")
  url.searchParams.set("client_id", APP_ID)
  url.searchParams.set("client_secret", APP_SECRET)
  url.searchParams.set("fb_exchange_token", currentToken)

  const res  = await fetch(url.toString())
  const body = await res.json()
  if (!body.access_token) return

  const newExpiry = body.expires_in
    ? Math.floor(Date.now() / 1000) + Number(body.expires_in)
    : null

  const { data: existing } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const current = (existing?.data as Record<string, unknown>) ?? {}
  await supabase.from("AppConfig").upsert(
    { id: 1, data: { ...current, metaToken: body.access_token, metaTokenExpiry: newExpiry } },
    { onConflict: "id" }
  )
}

export async function GET(request: Request) {
  if (!ACCOUNT) return NextResponse.json({ error: "Meta API não configurada" }, { status: 500 })

  const { token, expiry } = await getToken()
  if (!token) return NextResponse.json({ error: "TOKEN_MISSING" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const preset = searchParams.get("preset") || "last_30d"
  const since  = searchParams.get("since")
  const until  = searchParams.get("until")

  const insightFields = [
    "campaign_id", "campaign_name",
    "impressions", "clicks", "spend", "reach",
    "cpm", "cpc", "ctr", "frequency", "actions",
  ].join(",")

  const iParams = new URLSearchParams({
    fields: insightFields,
    level: "campaign",
    access_token: token,
    limit: "200",
  })
  if (since && until) {
    iParams.set("time_range", JSON.stringify({ since, until }))
  } else {
    iParams.set("date_preset", preset)
  }

  const cParams = new URLSearchParams({
    fields: "id,name,status,objective,daily_budget,lifetime_budget",
    access_token: token,
    limit: "200",
  })

  try {
    const [iRes, cRes] = await Promise.all([
      fetch(`${BASE}/${ACCOUNT}/insights?${iParams}`),
      fetch(`${BASE}/${ACCOUNT}/campaigns?${cParams}`),
    ])
    const [iData, cData] = await Promise.all([iRes.json(), cRes.json()])

    // Detect token expiry
    const errCode = iData.error?.code ?? iData.error?.error_code
    if (errCode === 190 || errCode === 463 || iData.error?.type === "OAuthException") {
      return NextResponse.json({ error: "TOKEN_EXPIRED" }, { status: 401 })
    }

    if (iData.error) return NextResponse.json({ error: iData.error.message }, { status: 400 })

    const statusMap = new Map<string, Record<string, unknown>>(
      (cData.data ?? []).map((c: Record<string, unknown>) => [c.id as string, c])
    )

    const insightIds = new Set((iData.data ?? []).map((d: Record<string, unknown>) => d.campaign_id as string))
    const noInsightCampaigns = (cData.data ?? [])
      .filter((c: Record<string, unknown>) => !insightIds.has(c.id as string))
      .map((c: Record<string, unknown>) => ({
        campaign_id: c.id,
        campaign_name: c.name,
        impressions: "0", clicks: "0", spend: "0", reach: "0",
        cpm: "0", cpc: "0", ctr: "0", actions: [],
        info: c,
      }))

    const campaigns = [
      ...(iData.data ?? []).map((insight: Record<string, unknown>) => ({
        ...insight,
        info: statusMap.get(insight.campaign_id as string) ?? null,
      })),
      ...noInsightCampaigns,
    ]

    // Priority order — first non-zero per campaign wins (avoids double-counting)
    const LEAD_TYPES_PRIORITY = [
      "onsite_conversion.messaging_conversation_started_7d",
      "messaging_conversation_started_7d",
      "messaging_first_reply_7d",
      "lead",
    ]
    const totals = (iData.data ?? []).reduce(
      (acc: Record<string, number>, c: Record<string, unknown>) => {
        const acts = c.actions as { action_type: string; value: string }[] | undefined
        const getAct = (t: string) => Number(acts?.find(a => a.action_type === t)?.value ?? 0)
        // Use only the first action type with a value — prevents double-counting
        const conversas = LEAD_TYPES_PRIORITY.reduce((found, t) => found > 0 ? found : getAct(t), 0)
        return {
          impressions: acc.impressions + Number(c.impressions ?? 0),
          clicks:      acc.clicks      + Number(c.clicks      ?? 0),
          spend:       acc.spend       + Number(c.spend       ?? 0),
          reach:       acc.reach       + Number(c.reach       ?? 0),
          conversas:   acc.conversas   + conversas,
        }
      },
      { impressions: 0, clicks: 0, spend: 0, reach: 0, conversas: 0 }
    )

    return NextResponse.json({ campaigns, totals })
  } catch {
    return NextResponse.json({ error: "Falha ao buscar dados da Meta" }, { status: 500 })
  }
}
