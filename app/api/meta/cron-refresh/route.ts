import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { verificarToken, gravarStatus, camposDoStatus } from "@/app/lib/metaToken"

const APP_ID     = process.env.META_APP_ID
const APP_SECRET = process.env.META_APP_SECRET

// Agendado na Vercel (vercel.json), todo dia: confere o token na Meta e grava a situação,
// para o Painel avisar quando cair. Token temporário é renovado se o app estiver configurado.
// Rota fora do login (proxy.ts). Com CRON_SECRET na Vercel, exige a senha que o agendador envia;
// sem ele, aceita só o agendador da Vercel (a rota apenas confere o token e não devolve nada sensível).
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const autorizado = cronSecret
    ? request.headers.get("authorization") === `Bearer ${cronSecret}`
    : /^vercel-cron\//.test(request.headers.get("user-agent") ?? "")
  if (!autorizado) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (data?.data as Record<string, unknown>) ?? {}
  let token = cfg.metaToken as string | undefined
  if (!token) return NextResponse.json({ ok: true, semToken: true })

  let status = await verificarToken(token)
  const diasRestantes = status.expiraEm ? (status.expiraEm - Date.now() / 1000) / 86400 : null
  if (status.valido && diasRestantes != null && diasRestantes < 20 && APP_ID && APP_SECRET) {
    const url = new URL("https://graph.facebook.com/v20.0/oauth/access_token")
    url.searchParams.set("grant_type", "fb_exchange_token")
    url.searchParams.set("client_id", APP_ID)
    url.searchParams.set("client_secret", APP_SECRET)
    url.searchParams.set("fb_exchange_token", token)
    const r = await fetch(url.toString()).then(r => r.json()).catch(() => null)
    if (r?.access_token) { token = r.access_token as string; status = await verificarToken(token) }
  }
  await gravarStatus({ metaToken: token, ...camposDoStatus(status) })
  return NextResponse.json({ ok: true, valido: status.valido && !status.erro, permanente: status.permanente, erro: status.erro ?? null })
}
