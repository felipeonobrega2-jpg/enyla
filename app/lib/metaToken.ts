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
  contaId?: string | null          // conta usada (act_…): a escolhida/configurada, se o token enxerga; senão a única que ele enxerga
  contaEscolhida?: boolean         // escolhida por você na tela (fica fixa); falso = automática
  contas?: { id: string; nome: string; gasto: number }[]
  erro?: string
}

// Lê os detalhes do token na própria Meta (o token serve de credencial para se inspecionar)
export async function verificarToken(token: string, contaPreferida?: string | null): Promise<StatusToken> {
  const appId = process.env.META_APP_ID, appSecret = process.env.META_APP_SECRET
  const credencial = appId && appSecret ? `${appId}|${appSecret}` : token
  const dbg = await fetch(`${BASE}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(credencial)}`)
    .then(r => r.json()).catch(() => null) as { data?: { is_valid?: boolean; type?: string; expires_at?: number; scopes?: string[]; error?: { message?: string } }; error?: { message?: string } } | null
  const d = dbg?.data
  // Sem credencial do app, a Meta pode recusar a inspeção: aí confirma só que o token funciona
  if (dbg?.error && !d) {
    const me = await fetch(`${BASE}/me?fields=id&access_token=${encodeURIComponent(token)}`).then(r => r.json()).catch(() => null)
    if (!me || me.error) return { valido: false, tipo: null, permanente: false, expiraEm: null, temLeituraAnuncios: false, acessaConta: null, erro: traduzir(me?.error?.message ?? "a Meta não aceitou o token") }
    const { contaId, contas } = await contaDoToken(token, contaPreferida)
    return { valido: true, tipo: null, permanente: null, expiraEm: null, temLeituraAnuncios: true, acessaConta: !!contaId, contaId, contas,
      erro: semConta(contaId, contas) }
  }
  if (!d || d.is_valid === false || dbg?.error) {
    const msg = d?.error?.message ?? dbg?.error?.message ?? "a Meta não aceitou o token"
    return { valido: false, tipo: d?.type ?? null, permanente: false, expiraEm: d?.expires_at || null, temLeituraAnuncios: false, acessaConta: null, erro: traduzir(msg) }
  }
  const scopes = d.scopes ?? []
  const temLeituraAnuncios = scopes.includes("ads_read") || scopes.includes("ads_management")
  const { contaId, contas } = await contaDoToken(token, contaPreferida)
  const expiraEm = d.expires_at ? d.expires_at : null   // 0 = nunca
  return {
    valido: true, tipo: d.type ?? null, permanente: !expiraEm, expiraEm,
    temLeituraAnuncios, acessaConta: !!contaId, contaId, contas,
    erro: !temLeituraAnuncios ? "O token não tem a permissão ads_read (ler anúncios)." : semConta(contaId, contas),
  }
}

// Contas de anúncio que o token enxerga, e qual usar: a escolhida na tela / configurada na Vercel, se estiver
// entre elas; senão, a única que ele enxerga (escolha automática, refeita a cada verificação). Várias: a tela pede.
async function contaDoToken(token: string, preferida?: string | null): Promise<{ contaId: string | null; contas: { id: string; nome: string; gasto: number }[] }> {
  const r = await fetch(`${BASE}/me/adaccounts?fields=account_id,name,amount_spent&limit=100&access_token=${encodeURIComponent(token)}`).then(r => r.json()).catch(() => null)
  const contas = ((r?.data ?? []) as { account_id: string; name: string; amount_spent?: string }[]).map(a => ({ id: `act_${a.account_id}`, nome: a.name, gasto: Number(a.amount_spent ?? 0) / 100 }))
  const norm = (id?: string | null) => id ? (id.startsWith("act_") ? id : `act_${id}`) : null
  for (const p of [norm(preferida), norm(process.env.META_AD_ACCOUNT_ID)]) if (p && contas.some(c => c.id === p)) return { contaId: p, contas }
  return { contaId: contas.length === 1 ? contas[0].id : null, contas }
}

const semConta = (contaId: string | null, contas: { id: string }[]) =>
  contaId ? undefined
    : contas.length === 0 ? "O token não enxerga nenhuma conta de anúncios. Atribua a conta ao usuário do sistema no Business Manager (Atribuir ativos → Contas de anúncios)."
    : "O token enxerga mais de uma conta de anúncios: escolha qual usar."

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

export const camposDoStatus = (s: StatusToken, escolhida = false) => ({
  metaContaId: s.contaId ?? null,
  metaContaEscolhida: escolhida && !!s.contaId,
  metaContas: s.contas ?? [],
  metaTokenExpiry: s.expiraEm,
  metaTokenTipo: s.tipo,
  metaTokenValido: s.valido && !s.erro,
  metaTokenErro: s.erro ?? null,
  metaTokenVerificadoEm: new Date().toISOString(),
})
