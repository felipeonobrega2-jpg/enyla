import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

const APP_ID     = process.env.META_APP_ID
const APP_SECRET = process.env.META_APP_SECRET
const BASE       = "https://graph.facebook.com/v20.0"

export async function GET(request: Request) {
  // Vercel cron passes Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  if (!APP_ID || !APP_SECRET) {
    return NextResponse.json({ error: "META_APP_ID / META_APP_SECRET não configurados" }, { status: 500 })
  }

  try {
    const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
    const cfg = (data?.data as Record<string, unknown>) ?? {}
    const currentToken = cfg.metaToken as string | undefined
    const currentExpiry = cfg.metaTokenExpiry as number | null | undefined

    if (!currentToken) {
      return NextResponse.json({ error: "Nenhum token salvo" }, { status: 400 })
    }

    const daysLeft = currentExpiry
      ? Math.floor((currentExpiry - Date.now() / 1000) / 86400)
      : null

    // Exchange current token for a fresh long-lived token (Meta allows this before expiry)
    const url = new URL(`${BASE}/oauth/access_token`)
    url.searchParams.set("grant_type", "fb_exchange_token")
    url.searchParams.set("client_id", APP_ID)
    url.searchParams.set("client_secret", APP_SECRET)
    url.searchParams.set("fb_exchange_token", currentToken)

    const res  = await fetch(url.toString())
    const body = await res.json()

    if (!body.access_token) {
      return NextResponse.json({
        error: "Meta recusou renovação",
        detail: body.error?.message ?? "sem access_token na resposta",
        daysLeft,
      }, { status: 502 })
    }

    const newExpiry = body.expires_in
      ? Math.floor(Date.now() / 1000) + Number(body.expires_in)
      : null

    const newDaysLeft = newExpiry
      ? Math.floor((newExpiry - Date.now() / 1000) / 86400)
      : null

    await supabase.from("AppConfig").upsert(
      { id: 1, data: { ...cfg, metaToken: body.access_token, metaTokenExpiry: newExpiry } },
      { onConflict: "id" }
    )

    return NextResponse.json({
      ok: true,
      prevDaysLeft: daysLeft,
      newDaysLeft,
      refreshedAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
