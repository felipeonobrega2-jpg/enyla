// Aviso de campanha parada na Meta: campanha ACTIVE que vinha gastando e parou. Só lê e avisa (nada de recarregar,
// religar, mexer em verba ou publicar). A detecção é pura; a consulta e o aviso (ntfy, mesmo canal do saldo) ficam abaixo.
import { supabase } from "./supabase"
import { notificar } from "./notificar"
import { resolverTokenConta } from "./metaAdsLeitura"
import { ContaMeta, precisaAvisar, situacaoMeta } from "./metaSaldo"

export const MEDIA_MINIMA = 5          // R$/dia nos 3 dias de referência
export const HORA_CORTE = 12           // hoje R$ 0 só conta depois das 12h (Brasília)
export const INTERVALO_AVISO_MS = 12 * 3_600_000
export const COLECAO_AVISO = "metaCampanhaParadaAviso"
const BASE = "https://graph.facebook.com/v20.0"

export type CampanhaDia = {
  id: string
  nome: string
  effectiveStatus: string | null
  issues?: string[]                    // issues_info (resumos)
  reprovados?: number                  // anúncios reprovados da campanha
  gastoPorDia: Record<string, number>  // AAAA-MM-DD (Brasília) → R$
}
export type CampanhaParada = { id: string; nome: string; ultimoGasto: string | null; motivo: string }
export type Detectada = CampanhaParada & { semSaldo: boolean }

const somaDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function agoraBrasilia(agora: Date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(agora).map(x => [x.type, x.value]))
  return { hoje: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) }
}

export function motivoProvavel(c: CampanhaDia, semSaldo: boolean): string {
  if (semSaldo) return "conta sem saldo ou parada"
  const partes: string[] = []
  if (c.issues?.length) partes.push(...c.issues)
  if (c.reprovados) partes.push(`${c.reprovados} anúncio${c.reprovados > 1 ? "s" : ""} reprovado${c.reprovados > 1 ? "s" : ""}`)
  if (c.effectiveStatus && c.effectiveStatus !== "ACTIVE") partes.push(`status ${c.effectiveStatus}`)
  return partes.length ? partes.join("; ") : "a Meta não informou o motivo (status ACTIVE, sem problemas apontados)"
}

// Função pura: quais campanhas estão paradas agora
export function detectarParadas(campanhas: CampanhaDia[], hoje: string, hora: number, semSaldo = false): Detectada[] {
  const ontem = somaDias(hoje, -1)
  const out: Detectada[] = []
  for (const c of campanhas) {
    if (c.effectiveStatus !== "ACTIVE") continue            // pausada de propósito (ou outro status): não avisa
    const g = (d: string) => c.gastoPorDia[d] ?? 0
    const gHoje = g(hoje), gOntem = g(ontem)
    const ref = gOntem === 0 ? [-4, -3, -2] : [-3, -2, -1]
    const media = ref.reduce((s, n) => s + g(somaDias(hoje, n)), 0) / 3
    if (media <= MEDIA_MINIMA) continue
    if (!(gOntem === 0 || (gHoje === 0 && hora >= HORA_CORTE))) continue
    const ultimo = Object.entries(c.gastoPorDia).filter(([d, v]) => v > 0 && d <= hoje).map(([d]) => d).sort().pop() ?? null
    out.push({ id: c.id, nome: c.nome, ultimoGasto: ultimo, motivo: motivoProvavel(c, semSaldo), semSaldo })
  }
  return out
}

// Dedupe: no máximo 1 aviso por campanha a cada 12 h. Conta sem saldo: o aviso de saldo basta.
export function selecionarAvisos(paradas: Detectada[], ultimos: Record<string, string | undefined>, agora = Date.now()): Detectada[] {
  return paradas.filter(p => !p.semSaldo && !(ultimos[p.id] && agora - new Date(ultimos[p.id]!).getTime() < INTERVALO_AVISO_MS))
}

export function textoAviso(ps: Detectada[]) {
  const dia = (d: string | null) => d ? d.split("-").reverse().slice(0, 2).join("/") : "sem registro"
  return ps.map(p => `${p.nome}: último gasto em ${dia(p.ultimoGasto)}. Motivo provável: ${p.motivo}.`).join("\n")
}

// ── Consulta (só GET na Graph API) ─────────────────────────────────────────────
type Lista<T> = { data?: T[]; error?: unknown }
async function graph<T>(caminho: string, params: Record<string, string>, token: string): Promise<Lista<T>> {
  const qs = new URLSearchParams({ ...params, access_token: token })
  const j = await fetch(`${BASE}/${caminho}?${qs}`, { signal: AbortSignal.timeout(15_000) }).then(r => r.json()).catch(() => null) as Lista<T> | null
  if (!j || j.error) throw new Error("Meta indisponível")
  return j
}

export async function lerCampanhasDia(token: string, conta: string, hoje: string): Promise<CampanhaDia[]> {
  const [camps, ins, ads] = await Promise.all([
    graph<{ id: string; name?: string; effective_status?: string; issues_info?: { error_summary?: string }[] }>(`${conta}/campaigns`, { fields: "id,name,effective_status,issues_info", limit: "200" }, token),
    graph<{ campaign_id: string; spend?: string; date_start: string }>(`${conta}/insights`, { level: "campaign", fields: "campaign_id,spend", time_increment: "1", time_range: JSON.stringify({ since: somaDias(hoje, -4), until: hoje }), limit: "500" }, token),
    graph<{ campaign_id?: string }>(`${conta}/ads`, { fields: "campaign_id", effective_status: JSON.stringify(["DISAPPROVED"]), limit: "500" }, token).catch(() => ({ data: [] })),
  ])
  const gasto = new Map<string, Record<string, number>>()
  for (const l of ins.data ?? []) {
    const m = gasto.get(l.campaign_id) ?? {}
    m[l.date_start] = (m[l.date_start] ?? 0) + (Number(l.spend) || 0)
    gasto.set(l.campaign_id, m)
  }
  const reprov = new Map<string, number>()
  for (const a of ads.data ?? []) if (a.campaign_id) reprov.set(a.campaign_id, (reprov.get(a.campaign_id) ?? 0) + 1)
  return (camps.data ?? []).map(c => ({
    id: c.id, nome: c.name ?? c.id, effectiveStatus: c.effective_status ?? null,
    issues: (c.issues_info ?? []).map(i => i.error_summary).filter((x): x is string => !!x),
    reprovados: reprov.get(c.id) ?? 0, gastoPorDia: gasto.get(c.id) ?? {},
  }))
}

// Leitura para a porta externa (?o=meta_ads e ?o=detalhe&area=marketing): nunca derruba a resposta principal
const cache = new Map<string, { ate: number; dados: CampanhaParada[] }>()
export const limparCacheParadas = () => cache.clear()
export async function campanhasParadasAgora(token: string, conta: string, semSaldo = false): Promise<CampanhaParada[]> {
  const c = cache.get(conta)
  if (c && c.ate > Date.now()) return c.dados
  try {
    const { hoje, hora } = agoraBrasilia()
    const dados = detectarParadas(await lerCampanhasDia(token, conta, hoje), hoje, hora, semSaldo)
      .map(({ id, nome, ultimoGasto, motivo }) => ({ id, nome, ultimoGasto, motivo }))
    cache.set(conta, { ate: Date.now() + 3 * 60_000, dados })
    return dados
  } catch { return [] }
}

async function lerAvisos(): Promise<Record<string, string>> {
  const { data } = await supabase.from("dados_sistema").select("id, dados").eq("colecao", COLECAO_AVISO).limit(500)
  return Object.fromEntries((data ?? []).map(r => [r.id as string, (r.dados as { em?: string })?.em ?? ""]))
}
async function gravarAviso(id: string) {
  const agora = new Date().toISOString()
  const { data: atual } = await supabase.from("dados_sistema").select("v").eq("colecao", COLECAO_AVISO).eq("id", id).maybeSingle()
  if (atual) await supabase.from("dados_sistema").update({ dados: { em: agora }, v: (atual.v ?? 0) + 1, atualizado_em: agora }).eq("colecao", COLECAO_AVISO).eq("id", id)
  else await supabase.from("dados_sistema").insert({ colecao: COLECAO_AVISO, id, dados: { em: agora }, v: 1, atualizado_em: agora })
}

// Chamado pela rotina que já confere o saldo (talvezConferirMeta). Avisa só o Felipe.
export async function avisarCampanhasParadas(token: string, conta: string, c: ContaMeta, gastoMedioDia: number) {
  try {
    const semSaldo = precisaAvisar(situacaoMeta(c, gastoMedioDia)) === "parada"
    const { hoje, hora } = agoraBrasilia()
    const paradas = detectarParadas(await lerCampanhasDia(token, conta, hoje), hoje, hora, semSaldo)
    const avisar = selecionarAvisos(paradas, await lerAvisos())
    if (!avisar.length) return
    for (const p of avisar) await gravarAviso(p.id)
    await notificar(avisar.length > 1 ? "Campanhas paradas" : "Campanha parada", textoAviso(avisar), { prioridade: "alta", link: "https://adsmanager.facebook.com/", tags: ["warning"] })
  } catch { /* não atrapalha o aviso de saldo */ }
}

// Para a porta externa: lista de campanhas paradas (vazia se a Meta falhar). `conta` é o bloco já lido, se houver.
export async function paradasParaLeitura(conta?: { status: number | null; saldo: number | null }): Promise<CampanhaParada[]> {
  try {
    const r = await resolverTokenConta()
    const semSaldo = !!conta && ((conta.status != null && conta.status !== 1) || (conta.saldo != null && conta.saldo <= 0.5))
    return await campanhasParadasAgora(r.token, r.conta, semSaldo)
  } catch { return [] }
}
