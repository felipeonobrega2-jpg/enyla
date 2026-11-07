// Gastos no servidor: registra o custo de cada chamada à IA, lê saldo e gasto diário da conta de anúncios da Meta,
// monta a seção de gastos e avisa no seu WhatsApp quando IA ou anúncios estão para acabar.

import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { custoUsd, somarUso, diaSP, saldoDoTexto, montarGastos, ultimosDias, GastoDia, Recarga, UsoIA, Gastos, PedidoParaGasto } from "./gastos"
import { evo } from "./evolution"

export type CfgGastos = { alertaDias?: number; recargaIA?: Recarga | null; cotacao?: number | null }
type Cfg = Record<string, unknown> & {
  gastosIA?: Record<string, GastoDia>; gastosCfg?: CfgGastos; gastosMeta?: MetaCache; gastosAvisoEm?: Record<string, string>
  cotacaoDolar?: { valor: number; em: string }; agenteSemCreditoEm?: string; metaToken?: string; metaContaId?: string
  pedidosDigitais?: PedidoParaGasto[]; agenteAuto?: { avisoNumero?: string }
}
type MetaCache = { em: string; saldo: number | null; dias: Record<string, number>; erro?: string | null }

const COTACAO_PADRAO = 5.5
const lerCfg = async () => ((await supabase.from("AppConfig").select("data").eq("id", 1).single()).data?.data ?? {}) as Cfg

// Chamado depois de cada resposta da IA (em claude.ts). Erro aqui nunca derruba a chamada.
export async function registrarUsoIA(modelo: string, uso: UsoIA | null | undefined) {
  if (!uso) return
  const usd = custoUsd(modelo, uso)
  if (!(usd > 0)) return
  await mudarConfig((d: Cfg) => ({ gastosIA: somarUso(d.gastosIA ?? {}, diaSP(), usd) })).catch(() => null)
}

// Cotação do dólar (uma vez por dia, AwesomeAPI pública); se falhar, a última ou a que você definiu
async function cotacao(cfg: Cfg): Promise<number> {
  if (cfg.gastosCfg?.cotacao) return cfg.gastosCfg.cotacao
  const c = cfg.cotacaoDolar
  if (c && Date.now() - new Date(c.em).getTime() < 24 * 3_600_000) return c.valor
  const j = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", { signal: AbortSignal.timeout(4000) }).then(r => r.json()).catch(() => null) as { USDBRL?: { ask?: string } } | null
  const v = Number(j?.USDBRL?.ask)
  if (v > 1 && v < 20) { await mudarConfig(() => ({ cotacaoDolar: { valor: v, em: new Date().toISOString() } })).catch(() => null); return v }
  return c?.valor ?? COTACAO_PADRAO
}

// Conta de anúncios: saldo disponível (pré-paga) e gasto por dia dos últimos 14 dias. Cache de 30 min.
async function lerMeta(cfg: Cfg, forcar = false): Promise<MetaCache | null> {
  const token = cfg.metaToken, conta = cfg.metaContaId
  if (!token || !conta) return null
  const c = cfg.gastosMeta
  if (!forcar && c && Date.now() - new Date(c.em).getTime() < 30 * 60_000) return c
  const BASE = "https://graph.facebook.com/v20.0"
  const t = encodeURIComponent(token)
  try {
    const [conta_, ins] = await Promise.all([
      fetch(`${BASE}/${conta}?fields=currency,is_prepay_account,amount_spent,spend_cap,funding_source_details&access_token=${t}`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()),
      fetch(`${BASE}/${conta}/insights?fields=spend&time_increment=1&time_range=${encodeURIComponent(JSON.stringify({ since: ultimosDias(14)[0], until: diaSP() }))}&access_token=${t}`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()),
    ]) as [{ error?: { message: string }; is_prepay_account?: boolean; amount_spent?: string; spend_cap?: string; funding_source_details?: { display_string?: string } }, { error?: { message: string }; data?: { spend: string; date_start: string }[] }]
    if (conta_.error) throw new Error(conta_.error.message)
    let saldo = saldoDoTexto(conta_.funding_source_details?.display_string)
    // Sem o texto do saldo: limite de gasto da conta menos o gasto (centavos)
    if (saldo == null && Number(conta_.spend_cap) > 0) saldo = Math.max(0, (Number(conta_.spend_cap) - Number(conta_.amount_spent ?? 0)) / 100)
    const dias = Object.fromEntries((ins.data ?? []).map(r => [r.date_start, Number(r.spend) || 0]))
    const novo: MetaCache = { em: new Date().toISOString(), saldo, dias, erro: null }
    await mudarConfig(() => ({ gastosMeta: novo })).catch(() => null)
    return novo
  } catch (e) {
    const novo: MetaCache = { em: new Date().toISOString(), saldo: c?.saldo ?? null, dias: c?.dias ?? {}, erro: String((e as Error).message ?? e).slice(0, 160) }
    await mudarConfig(() => ({ gastosMeta: novo })).catch(() => null)
    return novo
  }
}

export async function gastosAtuais(opts: { forcarMeta?: boolean } = {}): Promise<Gastos & { alertaDias: number }> {
  const cfg = await lerCfg()
  const [cot, meta] = await Promise.all([cotacao(cfg), lerMeta(cfg, opts.forcarMeta)])
  const alertaDias = cfg.gastosCfg?.alertaDias ?? 3
  const g = montarGastos({
    agora: new Date(), alertaDias,
    ia: { dias: cfg.gastosIA ?? {}, recarga: cfg.gastosCfg?.recargaIA ?? null, cotacao: cot, semCreditoEm: cfg.agenteSemCreditoEm ?? null },
    meta, pedidos: (cfg.pedidosDigitais ?? []).filter(p => !(p as { teste?: boolean }).teste),
  })
  return { ...g, alertaDias }
}

// Aviso no WhatsApp quando IA ou anúncios estão para acabar (cada tipo no máximo a cada 12 h; no fim, a cada 4 h)
let rodadaLocal = 0
export async function talvezAvisarGastos() {
  if (Date.now() - rodadaLocal < 30 * 60_000) return
  rodadaLocal = Date.now()
  const g = await gastosAtuais()
  if (!g.alertas.length) return
  const cfg = await lerCfg()
  const avisos = cfg.gastosAvisoEm ?? {}
  const agora = Date.now()
  const enviar = g.alertas.filter(a => {
    const ultimo = avisos[a.tipo] ? agora - new Date(avisos[a.tipo]).getTime() : Infinity
    return ultimo > (a.nivel === "perigo" ? 4 : 12) * 3_600_000
  })
  if (!enviar.length) return
  const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
  if (!destino) return
  const texto = ["💸 *Gastos da operação*", ...enviar.map(a => `${a.nivel === "perigo" ? "🔴" : "🟠"} ${a.texto}`),
    `Gasto por dia: R$ ${g.totalDia.toFixed(2).replace(".", ",")} (IA + anúncios).`, "https://app.enyla.com.br/?aba=gastos"].join("\n")
  await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text: texto }) }).catch(() => null)
  await mudarConfig((d: Cfg) => ({ gastosAvisoEm: { ...(d.gastosAvisoEm ?? {}), ...Object.fromEntries(enviar.map(a => [a.tipo, new Date().toISOString()])) } })).catch(() => null)
}

async function seuNumero() {
  const { seuNumero: n } = await import("./agenteAuto")
  return n()
}
