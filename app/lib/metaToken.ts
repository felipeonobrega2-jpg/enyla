// Token da Meta (anúncios): verifica de verdade na Meta o que foi colado e guarda o resultado.
// Token pessoal sempre vence (horas, ou 60 dias trocado pelo app) e cai quando a senha muda;
// o definitivo é o token de "usuário do sistema" do Business Manager gerado sem data de expiração.
// Só roda no servidor.

import { supabase } from "./supabase"

const BASE = "https://graph.facebook.com/v20.0"

export type StatusToken = {
  valido: boolean
  tipo: "SYSTEM_USER" | "USER" | "PAGE" | "APP" | string | null
  permanente: boolean | null       // null = a Meta não informou (não deu para confirmar)
  expiraEm: number | null          // epoch (s); null = não vence
  temLeituraAnuncios: boolean
  acessaConta: boolean | null      // null = conta de anúncios não configurada
  erro?: string
}

// Lê os detalhes do token na própria Meta (o token serve de credencial para se inspecionar)
export async function verificarToken(token: string): Promise<StatusToken> {
  const appId = process.env.META_APP_ID, appSecret = process.env.META_APP_SECRET
  const credencial = appId && appSecret ? `${appId}|${appSecret}` : token
  const dbg = await fetch(`${BASE}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(credencial)}`)
    .then(r => r.json()).catch(() => null) as { data?: { is_valid?: boolean; type?: string; expires_at?: number; scopes?: string[]; error?: { message?: string } }; error?: { message?: string } } | null
  const d = dbg?.data
  // Sem credencial do app, a Meta pode recusar a inspeção: aí confirma só que o token funciona
  if (dbg?.error && !d) {
    const me = await fetch(`${BASE}/me?fields=id&access_token=${encodeURIComponent(token)}`).then(r => r.json()).catch(() => null)
    if (!me || me.error) return { valido: false, tipo: null, permanente: false, expiraEm: null, temLeituraAnuncios: false, acessaConta: null, erro: traduzir(me?.error?.message ?? "a Meta não aceitou o token") }
    const acessaConta = await enxergaConta(token)
    return { valido: true, tipo: null, permanente: null, expiraEm: null, temLeituraAnuncios: acessaConta !== false, acessaConta,
      erro: acessaConta === false ? "O token não enxerga a conta de anúncios. Atribua a conta ao usuário do sistema no Business Manager." : undefined }
  }
  if (!d || d.is_valid === false || dbg?.error) {
    const msg = d?.error?.message ?? dbg?.error?.message ?? "a Meta não aceitou o token"
    return { valido: false, tipo: d?.type ?? null, permanente: false, expiraEm: d?.expires_at || null, temLeituraAnuncios: false, acessaConta: null, erro: traduzir(msg) }
  }
  const scopes = d.scopes ?? []
  const temLeituraAnuncios = scopes.includes("ads_read") || scopes.includes("ads_management")
  const acessaConta = await enxergaConta(token)
  const expiraEm = d.expires_at ? d.expires_at : null   // 0 = nunca
  return {
    valido: true, tipo: d.type ?? null, permanente: !expiraEm, expiraEm,
    temLeituraAnuncios, acessaConta,
    erro: !temLeituraAnuncios ? "O token não tem a permissão ads_read (ler anúncios)."
      : acessaConta === false ? "O token não enxerga a conta de anúncios. Atribua a conta ao usuário do sistema no Business Manager."
      : undefined,
  }
}

async function enxergaConta(token: string): Promise<boolean | null> {
  const conta = process.env.META_AD_ACCOUNT_ID
  if (!conta) return null
  const id = conta.startsWith("act_") ? conta : `act_${conta}`
  const r = await fetch(`${BASE}/${id}?fields=name&access_token=${encodeURIComponent(token)}`).then(r => r.json()).catch(() => null)
  return !!r && !r.error
}

function traduzir(msg: string) {
  if (/expired|expirou/i.test(msg)) return "O token já venceu."
  if (/password|senha/i.test(msg)) return "O token caiu porque a senha do Facebook mudou."
  if (/logged out|session/i.test(msg)) return "A sessão do Facebook que gerou o token foi encerrada."
  if (/malformed|invalid/i.test(msg)) return "O texto colado não é um token válido."
  return msg
}

// Grava token e situação no config (campos do servidor; a tela não sobrescreve)
export async function gravarStatus(campos: Record<string, unknown>) {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const atual = (data?.data as Record<string, unknown>) ?? {}
  await supabase.from("AppConfig").upsert({ id: 1, data: { ...atual, ...campos } }, { onConflict: "id" })
}

export const camposDoStatus = (s: StatusToken) => ({
  metaTokenExpiry: s.expiraEm,
  metaTokenTipo: s.tipo,
  metaTokenValido: s.valido && !s.erro,
  metaTokenErro: s.erro ?? null,
  metaTokenVerificadoEm: new Date().toISOString(),
})
