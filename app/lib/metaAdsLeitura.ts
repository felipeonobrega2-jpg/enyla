// Leitura ao vivo da Meta Ads (só GET na Graph API) para a porta externa da CMO.
// Rota fina em app/api/externo; aqui ficam token/conta, chamadas, saldo, conversas, shape e cache.
import { lerConfigLinha } from "./configAtomica"
import { saldoDoTexto } from "./metaSaldo"

const BASE = "https://graph.facebook.com/v20.0"
export const TTL_MS = 3 * 60_000
export const RECORTES = { hoje: "today", d7: "last_7d", d30: "last_30d" } as const
type Recorte = keyof typeof RECORTES
type Nivel = "campaign" | "adset" | "ad"

// Mesma prioridade de app/api/meta/route.ts: a primeira com valor vence (sem contagem dupla)
export const LEAD_TYPES_PRIORITY = [
  "onsite_conversion.messaging_conversation_started_7d",
  "messaging_conversation_started_7d",
  "messaging_first_reply_7d",
  "lead",
]

export class ErroMeta extends Error {
  constructor(public status: number, public codigo: string, mensagem: string) { super(mensagem) }
}

type Acao = { action_type: string; value: string }
export function conversasDe(actions: Acao[] | undefined): number {
  const get = (t: string) => Number(actions?.find(a => a.action_type === t)?.value ?? 0) || 0
  return LEAD_TYPES_PRIORITY.reduce((achou, t) => achou > 0 ? achou : get(t), 0)
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const reais = (centavos: unknown) => centavos == null || centavos === "" ? null : num(centavos) / 100

type ContaBruta = { account_status?: number; is_prepay_account?: boolean; currency?: string; amount_spent?: string; spend_cap?: string; funding_source_details?: { display_string?: string } }
export function montarConta(id: string, c: ContaBruta) {
  let saldo = saldoDoTexto(c.funding_source_details?.display_string)
  const cap = num(c.spend_cap)
  if (saldo == null && cap > 0) saldo = Math.max(0, (cap - num(c.amount_spent)) / 100)
  return {
    id, status: c.account_status ?? null, prePaga: c.is_prepay_account ?? null, moeda: c.currency ?? null,
    saldo, limite: cap > 0 ? cap / 100 : null, gastoAcumulado: num(c.amount_spent) / 100,
  }
}

type Metricas = { gasto: number; ctr: number; frequencia: number; conversas: number; impressoes: number; cliques: number; alcance: number }
type Linha = Record<string, unknown> & { actions?: Acao[] }
const CAMPO_ID: Record<Nivel, string> = { campaign: "campaign_id", adset: "adset_id", ad: "ad_id" }
export function metricasDe(l: Linha | undefined): Metricas {
  return { gasto: num(l?.spend), ctr: num(l?.ctr), frequencia: num(l?.frequency), conversas: conversasDe(l?.actions), impressoes: num(l?.impressions), cliques: num(l?.clicks), alcance: num(l?.reach) }
}

type Item = Record<string, unknown>
export function montarItens(nivel: Nivel, itens: Item[], insights: Record<Recorte, Linha[]>) {
  const idx = Object.fromEntries((Object.keys(RECORTES) as Recorte[]).map(r => [r, new Map(insights[r].map(l => [String(l[CAMPO_ID[nivel]]), l]))])) as Record<Recorte, Map<string, Linha>>
  return itens.map(i => {
    const id = String(i.id)
    const m = (r: Recorte) => metricasDe(idx[r].get(id))
    const por = <K extends keyof Metricas>(k: K) => ({ hoje: m("hoje")[k], d7: m("d7")[k], d30: m("d30")[k] })
    return {
      id, nome: i.name ?? null, status: i.status ?? null, statusEfetivo: i.effective_status ?? null,
      ...(nivel !== "campaign" ? { campanhaId: i.campaign_id ?? null } : {}),
      ...(nivel === "ad" ? { conjuntoId: i.adset_id ?? null } : {}),
      ...(nivel !== "ad" ? { verbaDiaria: reais(i.daily_budget), verbaTotal: reais(i.lifetime_budget) } : {}),
      gasto: por("gasto"), ctr: por("ctr"), frequencia: por("frequencia"), conversas: por("conversas"),
      impressoes: por("impressoes"), cliques: por("cliques"), alcance: por("alcance"),
    }
  })
}

export async function resolverTokenConta(): Promise<{ token: string; conta: string }> {
  const { data } = await lerConfigLinha()
  const cfg = (data?.data as Record<string, unknown>) ?? {}
  const env = process.env.META_AD_ACCOUNT_ID
  const bruta = (cfg.metaContaId as string | undefined) ?? env
  const conta = bruta ? (bruta.startsWith("act_") ? bruta : `act_${bruta}`) : ""
  const token = (cfg.metaToken as string | undefined) || process.env.META_ACCESS_TOKEN || ""
  if (!conta) throw new ErroMeta(400, "SEM_CONTA", "Nenhuma conta de anúncios configurada na Meta.")
  if (!token) throw new ErroMeta(401, "TOKEN_MISSING", "Token da Meta não configurado.")
  return { token, conta }
}

async function graph(caminho: string, params: Record<string, string>, token: string) {
  const qs = new URLSearchParams({ ...params, access_token: token })
  let r: Response
  try { r = await fetch(`${BASE}/${caminho}?${qs}`, { signal: AbortSignal.timeout(15000) }) }
  catch { throw new ErroMeta(502, "META_INDISPONIVEL", "Não consegui falar com a Meta.") }
  const j = await r.json().catch(() => ({})) as { error?: { code?: number; error_code?: number; type?: string; message?: string }; data?: Item[] } & Item
  if (j.error) {
    const cod = j.error.code ?? j.error.error_code
    if (cod === 190) throw new ErroMeta(401, "TOKEN_EXPIRED", "A Meta recusou o token (venceu ou foi derrubado).")
    if (j.error.type === "OAuthException") throw new ErroMeta(403, "SEM_ACESSO_CONTA", "O token não tem acesso a esta conta de anúncios.")
    throw new ErroMeta(502, "META_ERRO", "A Meta devolveu um erro ao ler as campanhas.")
  }
  return j
}

const CAMPOS_INSIGHT = "spend,ctr,frequency,impressions,clicks,reach,actions"
const CAMPOS_ITEM: Record<Nivel, string> = {
  campaign: "id,name,status,effective_status,daily_budget,lifetime_budget",
  adset: "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget",
  ad: "id,name,status,effective_status,adset_id,campaign_id",
}
const PLURAL: Record<Nivel, string> = { campaign: "campaigns", adset: "adsets", ad: "ads" }

export async function lerMetaAds(token: string, conta: string) {
  const niveis: Nivel[] = ["campaign", "adset", "ad"]
  const recortes = Object.keys(RECORTES) as Recorte[]
  const [contaBruta, itens, insights] = await Promise.all([
    graph(conta, { fields: "account_status,is_prepay_account,currency,amount_spent,spend_cap,funding_source_details" }, token),
    Promise.all(niveis.map(n => graph(`${conta}/${PLURAL[n]}`, { fields: CAMPOS_ITEM[n], limit: "200" }, token))),
    Promise.all(niveis.map(n => Promise.all(recortes.map(r =>
      graph(`${conta}/insights`, { level: n, fields: `${CAMPO_ID[n]},${CAMPOS_INSIGHT}`, date_preset: RECORTES[r], limit: "500" }, token))))),
  ])
  const ins = (i: number) => Object.fromEntries(recortes.map((r, k) => [r, (insights[i][k].data ?? []) as Linha[]])) as Record<Recorte, Linha[]>
  const em = new Date()
  return {
    em: em.toISOString(),
    conta: montarConta(conta, contaBruta as ContaBruta),
    campanhas: montarItens("campaign", (itens[0].data ?? []) as Item[], ins(0)),
    conjuntos: montarItens("adset", (itens[1].data ?? []) as Item[], ins(1)),
    anuncios: montarItens("ad", (itens[2].data ?? []) as Item[], ins(2)),
    cacheAte: new Date(em.getTime() + TTL_MS).toISOString(),
  }
}

// Cache só na memória do processo, por conta; guarda a resposta pronta (nunca o token)
const cache = new Map<string, { ate: number; dados: Awaited<ReturnType<typeof lerMetaAds>> }>()
export const limparCacheMetaAds = () => cache.clear()

export async function leituraMetaAds() {
  const { token, conta } = await resolverTokenConta()
  const c = cache.get(conta)
  if (c && c.ate > Date.now()) return c.dados
  const dados = await lerMetaAds(token, conta)
  cache.set(conta, { ate: Date.now() + TTL_MS, dados })
  return dados
}
