import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { verificarToken, gravarStatus, camposDoStatus } from "@/app/lib/metaToken"

const APP_ID     = process.env.META_APP_ID
const APP_SECRET = process.env.META_APP_SECRET

// Salva o token só depois de conferir na Meta: válido, com leitura de anúncios e acesso à conta.
// Token temporário é trocado pelo de 60 dias quando o app está configurado; o recomendado é o permanente.
export async function POST(req: NextRequest) {
  const { token, conta } = await req.json().catch(() => ({})) as { token?: string; conta?: string }
  const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (cfgRow?.data as Record<string, unknown>) ?? {}
  // Só escolhendo a conta de anúncios (token já salvo)
  const colado = token?.trim() || (conta ? cfg.metaToken as string | undefined : undefined)
  if (!colado) return NextResponse.json({ error: "Cole o token." }, { status: 400 })
  const preferida = conta ?? (cfg.metaContaId as string | undefined)

  let final = colado
  let status = await verificarToken(final, preferida)
  if (!status.valido) return NextResponse.json({ error: status.erro ?? "Token inválido." }, { status: 400 })

  if (status.permanente === false && APP_ID && APP_SECRET) {
    const url = new URL("https://graph.facebook.com/v20.0/oauth/access_token")
    url.searchParams.set("grant_type", "fb_exchange_token")
    url.searchParams.set("client_id", APP_ID)
    url.searchParams.set("client_secret", APP_SECRET)
    url.searchParams.set("fb_exchange_token", final)
    const r = await fetch(url.toString()).then(r => r.json()).catch(() => null)
    if (r?.access_token) { final = r.access_token; status = await verificarToken(final, preferida) }
  }

  await gravarStatus({ metaToken: final, ...camposDoStatus(status) })
  return NextResponse.json({
    ok: true, permanente: status.permanente, tipo: status.tipo, aviso: status.erro ?? null, contaId: status.contaId, contas: status.contas,
    expiresAt: status.expiraEm ? new Date(status.expiraEm * 1000).toISOString() : null,
  })
}

// Situação atual; reconfere na Meta se a última verificação tem mais de 6 horas
export async function GET() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (data?.data as Record<string, unknown>) ?? {}
  const token = cfg.metaToken as string | undefined
  if (!token) return NextResponse.json({ hasToken: false, valido: false, canAutoRefresh: !!(APP_ID && APP_SECRET) })

  let campos = {
    metaTokenExpiry: cfg.metaTokenExpiry as number | null, metaTokenTipo: cfg.metaTokenTipo as string | null,
    metaTokenValido: cfg.metaTokenValido as boolean | undefined, metaTokenErro: cfg.metaTokenErro as string | null,
    metaTokenVerificadoEm: cfg.metaTokenVerificadoEm as string | undefined,
    metaContaId: cfg.metaContaId as string | null, metaContas: (cfg.metaContas ?? []) as { id: string; nome: string }[],
  }
  const velho = !campos.metaTokenVerificadoEm || Date.now() - new Date(campos.metaTokenVerificadoEm).getTime() > 6 * 3600_000
  if (velho) {
    const st = await verificarToken(token, cfg.metaContaId as string | undefined)
    campos = camposDoStatus(st)
    await gravarStatus(campos)
  }
  const expiry = campos.metaTokenExpiry
  return NextResponse.json({
    hasToken: true,
    valido: campos.metaTokenValido !== false,
    erro: campos.metaTokenErro ?? null,
    tipo: campos.metaTokenTipo ?? null,
    permanente: campos.metaTokenValido !== false && !expiry && !!campos.metaTokenTipo,
    expiresAt: expiry ? new Date(expiry * 1000).toISOString() : null,
    daysLeft: expiry ? Math.floor((expiry - Date.now() / 1000) / 86400) : null,
    canAutoRefresh: !!(APP_ID && APP_SECRET),
    contaId: campos.metaContaId ?? null,
    contas: campos.metaContas ?? [],
  })
}
