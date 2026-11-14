// Progresso dos marcos no servidor (mesma conta do Painel: pedidos + sobras + faturamento anterior + digital) e o
// resumo do dia às 19h no seu WhatsApp.
import { supabase } from "./supabase"
import { montarPedidos, vendasDoPeriodo, SEM_PERIODO } from "./negocio"
import { normalizarMetas } from "./metas"
import { progresso, linhaRumo, textoResumoDia, Progresso } from "./animar"
import { mudarConfig } from "./configAtomica"
import { evo } from "./evolution"
import { lerCfg, seuNumero } from "./agenteAuto"
import { montarHoje } from "./hojeServidor"
import type { KanbanCard, LancamentoFinanceiro } from "../types"

const diaSP = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
type Ped = { id: string; total: number; em: string; sinalPagoEm?: string; teste?: boolean; status: string }
type Cfg = Awaited<ReturnType<typeof lerCfg>> & {
  baselineFaturamento?: number; metaMensal?: number; metas?: Parameters<typeof normalizarMetas>[0]
  pedidosDigitais?: Ped[]; resumoDiaEm?: string; gastosIA?: Record<string, { usd: number }>
  propostasProntas?: { em: string }[]; medidaPedida?: Record<string, string>
}

async function todos<T>(tabela: string): Promise<T[]> {
  const out: T[] = []
  for (let de = 0; de < 50000; de += 1000) {
    const { data } = await supabase.from(tabela).select("*").range(de, de + 999)
    if (!data?.length) break
    out.push(...(data as T[]))
    if (data.length < 1000) break
  }
  return out
}

const vendasDigitais = (cfg: Cfg) => (cfg.pedidosDigitais ?? []).filter(p => p.sinalPagoEm && !p.teste && p.status !== "cancelado")

async function calcular(cfg: Cfg, kanban: KanbanCard[], lancs: LancamentoFinanceiro[]): Promise<Progresso> {
  const pedidos = montarPedidos(kanban, lancs)
  const mes = diaSP().slice(0, 7)
  const dig = vendasDigitais(cfg)
  const digitalTotal = dig.reduce((s, p) => s + p.total, 0)
  const digitalMes = dig.filter(p => diaSP(new Date(p.sinalPagoEm!)).startsWith(mes)).reduce((s, p) => s + p.total, 0)
  const tudo = vendasDoPeriodo(pedidos, lancs, SEM_PERIODO)
  const total = (cfg.baselineFaturamento ?? 0) + pedidos.reduce((s, p) => s + p.valor, 0) + tudo.sobras + digitalTotal
  const doMes = pedidos.filter(p => (p.dataFechamento ?? "").startsWith(mes)).reduce((s, p) => s + p.valor, 0)
  return progresso(total, normalizarMetas(cfg.metas).marcos, doMes + digitalMes, cfg.metaMensal ?? 0)
}

// Linha de comemoração para os avisos de venda ("+R$ X rumo ao Meio Milhão · faltam …"); "" se falhar
export async function linhaDeComemoracao(valor: number) {
  try {
    const cfg = await lerCfg() as Cfg
    const [kanban, lancs] = await Promise.all([todos<KanbanCard>("KanbanCard"), todos<LancamentoFinanceiro>("LancamentoFinanceiro")])
    return linhaRumo(valor, await calcular(cfg, kanban, lancs))
  } catch { return "" }
}

// Resumo do dia: uma vez por dia, a partir das 19h (São Paulo)
let rodadaLocal = 0
export async function talvezResumoDoDia() {
  const hora = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }))
  if (hora < 19 || hora >= 22 || Date.now() - rodadaLocal < 10 * 60_000) return
  rodadaLocal = Date.now()
  const hoje = diaSP()
  let minha = false
  await mudarConfig((d: Cfg) => { if (d.resumoDiaEm === hoje) return null; minha = true; return { resumoDiaEm: hoje } })
  if (!minha) return
  const cfg = await lerCfg() as Cfg
  const [kanban, lancs] = await Promise.all([todos<KanbanCard>("KanbanCard"), todos<LancamentoFinanceiro>("LancamentoFinanceiro")])
  const pedidos = montarPedidos(kanban, lancs)
  const deHoje = pedidos.filter(p => p.dataFechamento === hoje)
  const dig = vendasDigitais(cfg)
  const digHoje = dig.filter(p => diaSP(new Date(p.sinalPagoEm!)) === hoje)
  const caixa = lancs.filter(l => l.tipo === "receita" && l.status === "pago" && l.dataPagamento === hoje).reduce((s, l) => s + l.valor, 0)
  const log = (cfg.agenteLog ?? []).filter(l => diaSP(new Date(l.em)) === hoje && l.enviou)
  const corte = Date.now() - 30 * 86_400_000
  const ped30 = (cfg.pedidosDigitais ?? []).filter(p => !p.teste && new Date(p.em).getTime() > corte)
  const pagos30 = ped30.filter(p => p.sinalPagoEm && p.status !== "cancelado")
  const cot = 5.5   // dólar aproximado só para o placar (o custo exato fica em Gastos)
  const custoIA = Object.entries(cfg.gastosIA ?? {}).filter(([d]) => new Date(`${d}T12:00:00`).getTime() > corte).reduce((s, [, g]) => s + (g.usd ?? 0), 0) * cot
  const h = await montarHoje().catch(() => null)
  const texto = textoResumoDia({
    offset: { n: deHoje.length, valor: deHoje.reduce((s, p) => s + p.valor, 0) },
    digital: { n: digHoje.length, valor: digHoje.reduce((s, p) => s + p.total, 0) },
    caixa,
    agente: {
      conversas: new Set(log.map(l => l.jid)).size,
      orcamentosDigitais: (cfg.pedidosDigitais ?? []).filter(p => !p.teste && diaSP(new Date(p.em)) === hoje).length,
      propostas: (cfg.propostasProntas ?? []).filter(p => diaSP(new Date(p.em)) === hoje).length,
      medidas: Object.values(cfg.medidaPedida ?? {}).filter(em => diaSP(new Date(em)) === hoje).length,
    },
    placar: { orcamentos: ped30.length, pagos: pagos30.length, vendido: pagos30.reduce((s, p) => s + p.total, 0), custoIA },
    amanha: { responder: h?.responder.length ?? 0, orcar: h?.orcar?.length ?? 0, retomar: h?.retomar?.length ?? 0 },
    progresso: await calcular(cfg, kanban, lancs).catch(() => null),
    link: "https://app.enyla.com.br/?aba=painel",
  })
  const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
  if (destino) await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text: texto }) }).catch(() => null)
}
