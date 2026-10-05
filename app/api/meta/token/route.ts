import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

const APP_ID     = process.env.META_APP_ID
const APP_SECRET = process.env.META_APP_SECRET

export async function POST(req: NextRequest) {
  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: "Token obrigatório" }, { status: 400 })

  let longToken = token
  let expiresAt: number | null = null

  // If APP credentials are available, exchange for long-lived token (~60 days)
  if (APP_ID && APP_SECRET) {
    const url = new URL("https://graph.facebook.com/v20.0/oauth/access_token")
    url.searchParams.set("grant_type", "fb_exchange_token")
    url.searchParams.set("client_id", APP_ID)
    url.searchParams.set("client_secret", APP_SECRET)
    url.searchParams.set("fb_exchange_token", token)

    const res  = await fetch(url.toString())
    const data = await res.json()

    if (data.access_token) {
      longToken = data.access_token
      // expires_in is in seconds
      if (data.expires_in) {
        expiresAt = Math.floor(Date.now() / 1000) + Number(data.expires_in)
      }
    }
  }

  // If we got a long token, debug it to confirm expiry
  if (longToken && APP_ID && APP_SECRET && !expiresAt) {
    const dbgUrl = new URL("https://graph.facebook.com/debug_token")
    dbgUrl.searchParams.set("input_token", longToken)
    dbgUrl.searchParams.set("access_token", `${APP_ID}|${APP_SECRET}`)
    const dbg = await fetch(dbgUrl.toString()).then(r => r.json())
    if (dbg.data?.expires_at) expiresAt = dbg.data.expires_at
  }

  // Persist token in AppConfig
  const { data: existing } = await supabase
    .from("AppConfig")
    .select("data")
    .eq("id", 1)
    .single()

  const current = (existing?.data as Record<string, unknown>) ?? {}
  await supabase.from("AppConfig").upsert(
    { id: 1, data: { ...current, metaToken: longToken, metaTokenExpiry: expiresAt } },
    { onConflict: "id" }
  )

  const expiresDate = expiresAt ? new Date(expiresAt * 1000).toISOString() : null
  return NextResponse.json({ ok: true, expiresAt: expiresDate, longLived: longToken !== token })
}

export async function GET() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (data?.data as Record<string, unknown>) ?? {}
  const expiry = cfg.metaTokenExpiry as number | null
  const hasToken = !!cfg.metaToken

  return NextResponse.json({
    hasToken,
    expiresAt: expiry ? new Date(expiry * 1000).toISOString() : null,
    daysLeft: expiry ? Math.floor((expiry - Date.now() / 1000) / 86400) : null,
    canAutoRefresh: !!(APP_ID && APP_SECRET),
  })
}
