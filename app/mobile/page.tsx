"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import {
  KanbanCard, LancamentoFinanceiro,
  COLUNAS_KANBAN, COL_FECHADO, COL_PERDIDO, COL_ENTREGUE, COL_HOT, COL_EXPEDICAO,
} from "../types"
import { Configuracoes, CONFIG_PADRAO } from "../config"
import { brl } from "../utils"

// ─── Constants ────────────────────────────────────────────────────────────────

const MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
const MARCOS = [
  { threshold: 10_000,     label: "Primeiro Salto",    sub: "R$10k"    },
  { threshold: 50_000,     label: "Tração Real",        sub: "R$50k"    },
  { threshold: 100_000,    label: "6 Dígitos",          sub: "R$100k"   },
  { threshold: 500_000,    label: "Meio Milhão",        sub: "R$500k"   },
  { threshold: 1_000_000,  label: "Primeiro Milhão",    sub: "R$1M"     },
  { threshold: 10_000_000, label: "Empresa de Verdade", sub: "R$10M"    },
]

const STAGE_COLOR: Record<number, { color: string; bg: string }> = {
  1:  { color: "#009351", bg: "rgba(0,147,81,0.10)"   },
  2:  { color: "#5856D6", bg: "rgba(88,86,214,0.10)"  },
  3:  { color: "#8456e8", bg: "rgba(132,86,232,0.10)" },
  4:  { color: "#c57800", bg: "rgba(197,120,0,0.10)"  },
  5:  { color: "#0ea5e9", bg: "rgba(14,165,233,0.10)" },
  6:  { color: "#e85686", bg: "rgba(232,86,134,0.10)" },
  7:  { color: "#7c3aed", bg: "rgba(124,58,237,0.10)" },
  8:  { color: "#f97316", bg: "rgba(249,115,22,0.10)" },
  9:  { color: "#009351", bg: "rgba(0,147,81,0.10)"   },
  10: { color: "#d33a3c", bg: "rgba(211,58,60,0.10)"  },
}

type TabId = "visao" | "cobrancas" | "producao" | "negocios"
type PeriodoId = "mes" | "mes_ant" | "3m" | "ano" | "tudo"

type ClienteDevedor = { nome: string; total: number; vencido: number; items: LancamentoFinanceiro[] }
type EtapaItem = { col: number; label: string; count: number; valor: number }
type DashData = {
  receita: number; qtd: number; ticket: number; entregues: number; variacao: number | null
  margemMedia: number | null
  recebido: number; despesas: number; saldo: number
  aReceber: number; valorVencido: number; vencidosAll: LancamentoFinanceiro[]
  clientesDevedores: ClienteDevedor[]
  emProducao: number; emProducaoValor: number
  porEtapa: EtapaItem[]; atrasados: KanbanCard[]; vencendoEm5: KanbanCard[]; semDataEntrega: number
  meses6: { label: string; v: number }[]
  totalFaturado: number; proximoMarco: { threshold: number; label: string; sub: string } | null
  pctMarco: number; faturadoMes: number; pctMeta: number
  ultimosNegocios: KanbanCard[]; winRate: number | null; pedsMes: number
}

const PERIODOS: { id: PeriodoId; label: string }[] = [
  { id: "mes",     label: "Este mês"   },
  { id: "mes_ant", label: "Mês ant."   },
  { id: "3m",      label: "3 meses"    },
  { id: "ano",     label: "Este ano"   },
  { id: "tudo",    label: "Tudo"       },
]

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "visao",     label: "Visão Geral", icon: "◻" },
  { id: "cobrancas", label: "Cobranças",   icon: "◻" },
  { id: "producao",  label: "Produção",    icon: "◻" },
  { id: "negocios",  label: "Negócios",    icon: "◻" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseIso(s: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T12:00:00")
  try {
    const [d, m, y] = s.split(",")[0].trim().split("/")
    return new Date(+y, +m - 1, +d, 12)
  } catch { return new Date(0) }
}

function fmtShort(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1).replace(".", ",")}M`
  if (Math.abs(v) >= 1_000) return `R$${(v / 1_000).toFixed(0)}k`
  return brl(v)
}

function fmtDate(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-")
    return `${d}/${m}/${y.slice(2)}`
  }
  return s.split(",")[0] ?? s
}

function daysOverdue(dateStr: string): number {
  return Math.floor((Date.now() - parseIso(dateStr).getTime()) / 86_400_000)
}

function bounds(periodo: PeriodoId, now: Date): { from: Date | null; to: Date | null } {
  const y = now.getFullYear(), m = now.getMonth()
  switch (periodo) {
    case "mes":     return { from: new Date(y, m, 1), to: now }
    case "mes_ant": return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) }
    case "3m":      return { from: new Date(y, m - 2, 1), to: now }
    case "ano":     return { from: new Date(y, 0, 1), to: now }
    case "tudo":    return { from: null, to: null }
  }
}

function prevBounds(periodo: PeriodoId, now: Date): { from: Date | null; to: Date | null } | null {
  const y = now.getFullYear(), m = now.getMonth()
  switch (periodo) {
    case "mes":     return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) }
    case "mes_ant": return { from: new Date(y, m - 2, 1), to: new Date(y, m - 1, 1) }
    case "3m":      return { from: new Date(y, m - 5, 1), to: new Date(y, m - 2, 1) }
    case "ano":     return { from: new Date(y - 1, 0, 1), to: new Date(y, 0, 1) }
    case "tudo":    return null
  }
}

function inRange(d: Date, f: Date | null, t: Date | null): boolean {
  return (!f || d >= f) && (!t || d <= t)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${className}`}>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[10.5px] uppercase tracking-wider font-bold text-[#8E8E93] mb-3">{children}</p>
}

function KpiTile({
  label, value, sub, accent = "#191625", highlight = false, badge,
}: {
  label: string; value: string; sub?: string
  accent?: string; highlight?: boolean; badge?: { text: string; color: string }
}) {
  return (
    <div className={`p-4 rounded-2xl bg-white border ${highlight ? "border-[rgba(132,86,232,0.2)]" : "border-[rgba(0,0,0,0.06)]"} shadow-[0_1px_3px_rgba(0,0,0,0.04)]`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93] mb-2">{label}</p>
      <p className="text-[20px] font-bold tabular-nums leading-none tracking-tight" style={{ color: accent }}>{value}</p>
      {sub && <p className="text-[10px] text-[#8E8E93] mt-1.5 leading-tight">{sub}</p>}
      {badge && (
        <span className="mt-2 inline-flex text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: badge.color, background: badge.color + "18" }}>
          {badge.text}
        </span>
      )}
    </div>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pct * 100, 100)}%`, background: color }} />
    </div>
  )
}

function SaldoBadge({ value }: { value: number }) {
  const pos = value >= 0
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pos ? "text-[#009351] bg-[rgba(0,147,81,0.10)]" : "text-[#d33a3c] bg-[rgba(211,58,60,0.10)]"}`}>
      {pos ? "+" : ""}{fmtShort(value)}
    </span>
  )
}

function MiniChart({ meses }: { meses: { label: string; v: number }[] }) {
  const max = Math.max(...meses.map(m => m.v), 1)
  return (
    <div className="flex items-end gap-1 h-[56px]">
      {meses.map((m, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div className="w-full flex items-end" style={{ height: 40 }}>
            <div
              className="w-full rounded-md transition-all"
              style={{
                height: `${Math.max((m.v / max) * 100, m.v > 0 ? 6 : 0)}%`,
                background: i === meses.length - 1 ? "#8456e8" : "rgba(132,86,232,0.20)",
              }}
            />
          </div>
          <p className="text-[8px] text-[#8E8E93] truncate w-full text-center">{m.label}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MobilePage() {
  const [kanban, setKanban]       = useState<KanbanCard[]>([])
  const [lancs, setLancs]         = useState<LancamentoFinanceiro[]>([])
  const [config, setConfig]       = useState<Configuracoes>(CONFIG_PADRAO)
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<TabId>("visao")
  const [periodo, setPeriodo]     = useState<PeriodoId>("mes")
  const [expandCli, setExpandCli] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/data")
      .then(r => r.json())
      .then(d => {
        if (d.kanban)      setKanban(d.kanban)
        if (d.lancamentos) setLancs(d.lancamentos)
        if (d.config)      setConfig(c => ({ ...CONFIG_PADRAO, ...c, ...d.config }))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const now = useMemo(() => new Date(), [])
  const hoje = now.toISOString().split("T")[0]
  const mesAtualKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const data = useMemo((): DashData => {
    const { from, to } = bounds(periodo, now)
    const pb            = prevBounds(periodo, now)

    const confirmados = kanban.filter(c => c.coluna !== 0 && c.coluna !== COL_PERDIDO && c.coluna !== COL_HOT)

    const noPeriodo = confirmados.filter(c =>
      inRange(parseIso(c.dataFechamento ?? c.data), from, to)
    )

    const receita   = noPeriodo.reduce((s, c) => s + c.preco, 0)
    const qtd       = noPeriodo.length
    const ticket    = qtd > 0 ? receita / qtd : 0
    const entregues = noPeriodo.filter(c => c.coluna === COL_ENTREGUE).length

    const receitaAnterior = pb
      ? confirmados.filter(c => inRange(parseIso(c.dataFechamento ?? c.data), pb.from, pb.to)).reduce((s, c) => s + c.preco, 0)
      : null
    const variacao = receitaAnterior !== null && receitaAnterior > 0
      ? ((receita - receitaAnterior) / receitaAnterior) * 100 : null

    // ── Margens via custosSnapshot ──
    const margens = noPeriodo.flatMap(c => {
      if (!c.custosSnapshot?.length) return []
      const snap = c.custosSnapshot.find(s => s.quantidade === c.quantidade) ?? c.custosSnapshot[0]
      return snap.preco > 0 ? [(snap.preco - snap.total) / snap.preco * 100] : []
    })
    const margemMedia = margens.length ? margens.reduce((s, m) => s + m, 0) / margens.length : null

    // ── Lançamentos financeiros ──
    // Usa dataPagamento se disponível, senão dataVencimento (para lançamentos pagos sem data preenchida)
    const dataEfetiva = (l: LancamentoFinanceiro) => l.dataPagamento || l.dataVencimento

    const recebido = lancs
      .filter(l => l.tipo === "receita" && l.status === "pago" && inRange(parseIso(dataEfetiva(l)), from, to))
      .reduce((s, l) => s + l.valor, 0)

    const despesas = lancs
      .filter(l => l.tipo === "despesa" && l.status === "pago" && inRange(parseIso(dataEfetiva(l)), from, to))
      .reduce((s, l) => s + l.valor, 0)

    const saldo = recebido - despesas

    // A receber: pendentes (excluindo pix_link vencido)
    const pendentes = lancs.filter(l =>
      l.tipo === "receita" && l.status !== "pago" && l.categoria !== "sobra" &&
      !(l.categoria === "pix_link" && l.dataVencimento < hoje)
    )
    const aReceber     = pendentes.reduce((s, l) => s + l.valor, 0)
    const vencidosAll  = pendentes.filter(l => l.dataVencimento < hoje)
      .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
    const valorVencido = vencidosAll.reduce((s, l) => s + l.valor, 0)

    // A receber por cliente
    const porCliente: Record<string, { nome: string; total: number; vencido: number; items: LancamentoFinanceiro[] }> = {}
    pendentes.forEach(l => {
      const key = (l.nomeCliente ?? l.descricao ?? "—").trim()
      if (!porCliente[key]) porCliente[key] = { nome: key, total: 0, vencido: 0, items: [] }
      porCliente[key].total += l.valor
      porCliente[key].items.push(l)
      if (l.dataVencimento < hoje) porCliente[key].vencido += l.valor
    })
    const clientesDevedores = Object.values(porCliente)
      .sort((a, b) => b.total - a.total)

    // ── Produção ──
    const emProducao  = kanban.filter(c => c.coluna >= COL_FECHADO && c.coluna < COL_ENTREGUE && c.coluna !== COL_PERDIDO && c.coluna !== COL_HOT)
    const porEtapa: { col: number; label: string; count: number; valor: number }[] = []
    for (let col = 1; col <= COL_EXPEDICAO; col++) {
      const cards = emProducao.filter(c => c.coluna === col)
      if (cards.length > 0)
        porEtapa.push({ col, label: COLUNAS_KANBAN[col], count: cards.length, valor: cards.reduce((s, c) => s + c.preco, 0) })
    }

    // Alertas de prazo
    const atrasados = emProducao.filter(c => {
      if (!c.dataEntregaPrevista) return false
      return new Date(c.dataEntregaPrevista + "T12:00:00") < now
    }).sort((a, b) => (a.dataEntregaPrevista ?? "").localeCompare(b.dataEntregaPrevista ?? ""))

    const vencendoEm5 = emProducao.filter(c => {
      if (!c.dataEntregaPrevista) return false
      const diff = Math.round((new Date(c.dataEntregaPrevista + "T12:00:00").getTime() - now.getTime()) / 86_400_000)
      return diff >= 0 && diff <= 5
    }).sort((a, b) => (a.dataEntregaPrevista ?? "").localeCompare(b.dataEntregaPrevista ?? ""))

    const semDataEntrega = emProducao.filter(c => !c.dataEntregaPrevista).length

    // ── Chart: últimos 6 meses ──
    const meses6: { label: string; v: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      meses6.push({ label: MESES_PT[d.getMonth()], v: 0 })
    }
    confirmados.forEach(c => {
      const d = parseIso(c.dataFechamento ?? c.data)
      const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
      if (diff >= 0 && diff <= 5) meses6[5 - diff].v += c.preco
    })

    // ── Metas ──
    const totalFaturado = config.baselineFaturamento + confirmados.reduce((s, c) => s + c.preco, 0)
    const proximoMarco  = MARCOS.find(m => m.threshold > totalFaturado) ?? null
    const pctMarco      = proximoMarco ? Math.min(totalFaturado / proximoMarco.threshold, 1) : 1
    const faturadoMes   = confirmados.filter(c => (c.dataFechamento ?? "").startsWith(mesAtualKey)).reduce((s, c) => s + c.preco, 0)
    const pctMeta       = config.metaMensal > 0 ? Math.min(faturadoMes / config.metaMensal, 1) : 0

    // ── Últimos negócios ──
    const ultimosNegocios = [...confirmados]
      .sort((a, b) => parseIso(b.dataFechamento ?? b.data).getTime() - parseIso(a.dataFechamento ?? a.data).getTime())
      .slice(0, 8)

    // ── Taxa de conversão (win rate) ──
    const totalCards = kanban.filter(c => c.coluna !== 0 && c.coluna !== COL_HOT).length
    const perdidos   = kanban.filter(c => c.coluna === COL_PERDIDO).length
    const winRate    = totalCards > 0 ? ((totalCards - perdidos) / totalCards) * 100 : null

    // ── Meses únicos de atividade ──
    const mesesSet = new Set(confirmados.map(c => (c.dataFechamento ?? c.data).slice(0, 7)))
    const mesesAtivos = mesesSet.size || 1
    const pedsMes = confirmados.length / mesesAtivos

    return {
      receita, qtd, ticket, entregues, variacao,
      margemMedia,
      recebido, despesas, saldo,
      aReceber, valorVencido, vencidosAll, clientesDevedores,
      emProducao: emProducao.length, emProducaoValor: emProducao.reduce((s, c) => s + c.preco, 0),
      porEtapa, atrasados, vencendoEm5, semDataEntrega,
      meses6,
      totalFaturado, proximoMarco, pctMarco, faturadoMes, pctMeta,
      ultimosNegocios, winRate, pedsMes,
    }
  }, [kanban, lancs, config, periodo, now, hoje, mesAtualKey])

  // ─── Render ────────────────────────────────────────────────────────────────

  const alertCount = data.atrasados.length + data.vencidosAll.length

  return (
    <div className="min-h-screen bg-[#F2F2F7] pb-28">

      {/* ── Header ── */}
      <header className="bg-white border-b border-[rgba(60,60,67,0.08)] px-4 pt-[max(env(safe-area-inset-top),16px)] pb-0 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <Image src="/brand/enyla-wordmark-dark.png" alt="Enyla" width={1335} height={328} className="h-5 w-auto" priority />
          {alertCount > 0 && (
            <span className="text-[10px] font-bold bg-[#d33a3c] text-white rounded-full px-2 py-0.5">
              {alertCount} alerta{alertCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {/* Period selector — only on visão tab */}
        {tab === "visao" && (
          <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-3">
            {PERIODOS.map(p => (
              <button key={p.id} onClick={() => setPeriodo(p.id)}
                className={`shrink-0 text-[11.5px] font-semibold px-3.5 py-1.5 rounded-full transition-all ${
                  periodo === p.id
                    ? "bg-[#8456e8] text-white shadow-sm"
                    : "bg-[rgba(0,0,0,0.05)] text-[#8E8E93]"
                }`}
              >{p.label}</button>
            ))}
          </div>
        )}
        {tab !== "visao" && <div className="pb-3" />}
      </header>

      {/* ── Content ── */}
      <main className="px-4 pt-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[#8456e8] border-t-transparent animate-spin" />
            <p className="text-[12px] text-[#8E8E93]">Carregando dados…</p>
          </div>
        ) : (
          <>
            {tab === "visao"     && <VisaoTab data={data} config={config} periodo={periodo} />}
            {tab === "cobrancas" && <CobrancasTab data={data} expandCli={expandCli} setExpandCli={setExpandCli} hoje={hoje} />}
            {tab === "producao"  && <ProducaoTab data={data} />}
            {tab === "negocios"  && <NegociosTab data={data} />}
          </>
        )}
      </main>

      {/* ── Bottom Tab Bar ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[rgba(60,60,67,0.08)] flex z-20"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom),8px)" }}>
        {TABS.map(t => {
          const active = tab === t.id
          const hasBadge = t.id === "cobrancas" && data.vencidosAll.length > 0
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center pt-2 pb-1 gap-0.5 transition-colors ${active ? "text-[#8456e8]" : "text-[#8E8E93]"}`}
            >
              <span className="relative">
                <TabIcon id={t.id} active={active} />
                {hasBadge && <span className="absolute -top-0.5 -right-1 w-2 h-2 bg-[#d33a3c] rounded-full border border-white" />}
              </span>
              <span className={`text-[9.5px] font-semibold ${active ? "text-[#8456e8]" : "text-[#8E8E93]"}`}>{t.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

// ─── Tab: Visão Geral ─────────────────────────────────────────────────────────

function VisaoTab({ data, config, periodo }: {
  data: DashData
  config: Configuracoes
  periodo: PeriodoId
}) {
  const periodoLabel = PERIODOS.find(p => p.id === periodo)?.label ?? ""
  return (
    <div className="flex flex-col gap-4">

      {/* Hero */}
      <Card className="p-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93] mb-1.5">Faturamento · {periodoLabel}</p>
        <div className="flex items-baseline gap-2.5 mb-1">
          <p className="text-[32px] font-bold tabular-nums leading-none text-[#191625] tracking-tight">{brl(data.receita)}</p>
          {data.variacao !== null && (
            <span className={`text-[12px] font-bold ${data.variacao >= 0 ? "text-[#009351]" : "text-[#d33a3c]"}`}>
              {data.variacao >= 0 ? "▲" : "▼"} {Math.abs(data.variacao).toFixed(0)}%
            </span>
          )}
        </div>
        <p className="text-[11px] text-[#8E8E93]">
          {data.qtd} pedido{data.qtd !== 1 ? "s" : ""} · ticket médio {brl(data.ticket)}
          {data.margemMedia !== null ? ` · margem ${data.margemMedia.toFixed(0)}%` : ""}
        </p>
      </Card>

      {/* KPIs 2×2 */}
      <div className="grid grid-cols-2 gap-3">
        <KpiTile
          label="Recebido"
          value={fmtShort(data.recebido)}
          accent="#009351"
          sub={data.receita > 0 ? `${Math.round(data.recebido / data.receita * 100)}% do faturado` : "no período"}
        />
        <KpiTile
          label="A receber (total)"
          value={fmtShort(data.aReceber)}
          accent={data.valorVencido > 0 ? "#d33a3c" : "#191625"}
          sub={data.valorVencido > 0 ? `${fmtShort(data.valorVencido)} vencido` : `${data.clientesDevedores.length} cliente${data.clientesDevedores.length !== 1 ? "s" : ""}`}
        />
        <KpiTile
          label="Despesas"
          value={data.despesas > 0 ? fmtShort(data.despesas) : "—"}
          accent={data.despesas > 0 ? "#c57800" : "#8E8E93"}
          sub="pagas no período"
        />
        <KpiTile
          label="Saldo líquido"
          value={(data.saldo >= 0 ? "+" : "") + fmtShort(data.saldo)}
          accent={data.saldo >= 0 ? "#009351" : "#d33a3c"}
          sub="recebido − despesas"
        />
      </div>

      {/* Gráfico 6 meses */}
      <Card className="p-4">
        <SectionTitle>Últimos 6 meses</SectionTitle>
        <MiniChart meses={data.meses6} />
      </Card>

      {/* Metas */}
      <Card className="p-4">
        <SectionTitle>Metas</SectionTitle>
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-[12px] font-semibold text-[#191625]">Meta do mês</p>
              <p className="text-[14px] font-bold tabular-nums" style={{ color: data.pctMeta >= 1 ? "#009351" : "#8456e8" }}>
                {Math.round(data.pctMeta * 100)}%
              </p>
            </div>
            <ProgressBar pct={data.pctMeta} color={data.pctMeta >= 1 ? "#009351" : data.pctMeta >= 0.7 ? "#c57800" : "#8456e8"} />
            <div className="flex justify-between mt-1.5">
              <p className="text-[10px] text-[#8E8E93]">{brl(data.faturadoMes)} de {brl(config.metaMensal)}</p>
              {data.pctMeta < 1 && <p className="text-[10px] text-[#8E8E93]">faltam {brl(config.metaMensal - data.faturadoMes)}</p>}
              {data.pctMeta >= 1 && <p className="text-[10px] text-[#009351] font-semibold">Batida! ✓</p>}
            </div>
          </div>
          {data.proximoMarco && (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <p className="text-[12px] font-semibold text-[#191625]">{data.proximoMarco.label}</p>
                <p className="text-[14px] font-bold tabular-nums text-[#c57800]">{data.proximoMarco.sub}</p>
              </div>
              <ProgressBar pct={data.pctMarco} color="#c57800" />
              <p className="text-[10px] text-[#8E8E93] mt-1.5">{brl(data.totalFaturado)} acumulado</p>
            </div>
          )}
        </div>
      </Card>

      {/* KPIs secundários */}
      <div className="grid grid-cols-3 gap-2.5">
        <KpiTile label="Em produção" value={String(data.emProducao)} sub={fmtShort(data.emProducaoValor)} />
        {data.margemMedia !== null
          ? <KpiTile label="Margem" value={`${data.margemMedia.toFixed(0)}%`} accent={data.margemMedia >= 40 ? "#009351" : data.margemMedia >= 20 ? "#c57800" : "#d33a3c"} sub="média geral" />
          : <KpiTile label="Entregues" value={String(data.entregues)} sub="no período" />
        }
        <KpiTile label="Pedidos/mês" value={data.pedsMes.toFixed(1)} sub="média histórica" />
      </div>

      {/* Alertas rápidos */}
      {(data.atrasados.length > 0 || data.valorVencido > 0) && (
        <Card className="p-4 border-[rgba(211,58,60,0.2)]">
          <SectionTitle>⚠ Atenção</SectionTitle>
          <div className="flex flex-col gap-2.5">
            {data.atrasados.length > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-[#d33a3c] font-medium">{data.atrasados.length} entrega{data.atrasados.length > 1 ? "s" : ""} atrasada{data.atrasados.length > 1 ? "s" : ""}</p>
                <p className="text-[11px] text-[#8E8E93]">{fmtShort(data.atrasados.reduce((s, c) => s + c.preco, 0))}</p>
              </div>
            )}
            {data.valorVencido > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-[#d33a3c] font-medium">{data.vencidosAll.length} cobrança{data.vencidosAll.length > 1 ? "s" : ""} vencida{data.vencidosAll.length > 1 ? "s" : ""}</p>
                <p className="text-[11px] text-[#8E8E93]">{fmtShort(data.valorVencido)}</p>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Tab: Cobranças ───────────────────────────────────────────────────────────

function CobrancasTab({ data, expandCli, setExpandCli, hoje }: {
  data: DashData
  expandCli: string | null
  setExpandCli: (v: string | null) => void
  hoje: string
}) {
  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <Card className="p-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93] mb-1.5">Total a receber</p>
        <p className="text-[32px] font-bold tabular-nums leading-none text-[#191625] tracking-tight">{brl(data.aReceber)}</p>
        <div className="flex gap-3 mt-2">
          {data.valorVencido > 0 && (
            <span className="text-[10px] font-bold text-[#d33a3c] bg-[rgba(211,58,60,0.08)] px-2 py-0.5 rounded-full">
              {brl(data.valorVencido)} vencido
            </span>
          )}
          <span className="text-[10px] font-medium text-[#8E8E93]">
            {data.clientesDevedores.length} cliente{data.clientesDevedores.length !== 1 ? "s" : ""}
          </span>
        </div>
      </Card>

      {/* Por cliente */}
      {data.clientesDevedores.length === 0 ? (
        <Card className="p-6 flex flex-col items-center gap-2">
          <p className="text-[28px]">✓</p>
          <p className="text-[13px] font-semibold text-[#191625]">Tudo em dia</p>
          <p className="text-[11px] text-[#8E8E93]">Nenhum valor pendente</p>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-[rgba(60,60,67,0.07)]">
            {data.clientesDevedores.map(cli => {
              const expanded = expandCli === cli.nome
              return (
                <div key={cli.nome}>
                  <button
                    className="w-full px-4 py-3.5 flex items-center justify-between active:bg-[rgba(0,0,0,0.02)]"
                    onClick={() => setExpandCli(expanded ? null : cli.nome)}
                  >
                    <div className="text-left min-w-0">
                      <p className="text-[13px] font-semibold text-[#191625] truncate">{cli.nome}</p>
                      <p className="text-[10px] text-[#8E8E93] mt-0.5">
                        {cli.items.length} lançamento{cli.items.length !== 1 ? "s" : ""}
                        {cli.vencido > 0 && <span className="text-[#d33a3c] font-medium"> · {brl(cli.vencido)} vencido</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <p className={`text-[15px] font-bold tabular-nums ${cli.vencido > 0 ? "text-[#d33a3c]" : "text-[#191625]"}`}>
                        {brl(cli.total)}
                      </p>
                      <span className="text-[10px] text-[#8E8E93]">{expanded ? "▲" : "▼"}</span>
                    </div>
                  </button>
                  {expanded && (
                    <div className="bg-[#F2F2F7] divide-y divide-[rgba(60,60,67,0.06)]">
                      {cli.items.map(l => {
                        const overdue = l.dataVencimento < hoje
                        const dias    = overdue ? daysOverdue(l.dataVencimento) : 0
                        return (
                          <div key={l.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11.5px] text-[#191625] truncate">{l.descricao || l.cardNumero || "—"}</p>
                              <p className={`text-[10px] mt-0.5 ${overdue ? "text-[#d33a3c] font-medium" : "text-[#8E8E93]"}`}>
                                {overdue ? `${dias}d atrasado` : `vence ${fmtDate(l.dataVencimento)}`}
                              </p>
                            </div>
                            <p className={`text-[12px] font-bold tabular-nums shrink-0 ${overdue ? "text-[#d33a3c]" : "text-[#191625]"}`}>
                              {brl(l.valor)}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Tab: Produção ────────────────────────────────────────────────────────────

function ProducaoTab({ data }: { data: DashData }) {
  return (
    <div className="flex flex-col gap-4">

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3">
        <KpiTile label="Em produção" value={String(data.emProducao)} accent="#8456e8" sub={brl(data.emProducaoValor)} highlight />
        <KpiTile label="Atrasados" value={String(data.atrasados.length)} accent={data.atrasados.length > 0 ? "#d33a3c" : "#009351"} sub="entregas vencidas" />
        <KpiTile label="Vencem em 5d" value={String(data.vencendoEm5.length)} accent={data.vencendoEm5.length > 0 ? "#c57800" : "#8E8E93"} sub="atenção necessária" />
        <KpiTile label="Sem data" value={String(data.semDataEntrega)} accent={data.semDataEntrega > 0 ? "#c57800" : "#8E8E93"} sub="sem prazo definido" />
      </div>

      {/* Pipeline por etapa */}
      {data.porEtapa.length > 0 && (
        <Card>
          <div className="px-4 pt-4 pb-2">
            <SectionTitle>Por etapa</SectionTitle>
          </div>
          <div className="divide-y divide-[rgba(60,60,67,0.07)]">
            {data.porEtapa.map(e => {
              const sc = STAGE_COLOR[e.col] ?? { color: "#8E8E93", bg: "rgba(142,142,147,0.1)" }
              return (
                <div key={e.col} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-[13px] font-bold" style={{ background: sc.bg, color: sc.color }}>
                    {e.count}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-[#191625]">{e.label}</p>
                    <p className="text-[10px] text-[#8E8E93]">{brl(e.valor)}</p>
                  </div>
                  <div className="w-24 shrink-0">
                    <ProgressBar pct={e.count / Math.max(data.emProducao, 1)} color={sc.color} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Atrasados */}
      {data.atrasados.length > 0 && (
        <Card className="border-[rgba(211,58,60,0.15)]">
          <div className="px-4 pt-4 pb-2">
            <SectionTitle>⚠ Entregas atrasadas</SectionTitle>
          </div>
          <div className="divide-y divide-[rgba(60,60,67,0.07)]">
            {data.atrasados.map(c => {
              const dias = Math.round((now_ts() - new Date(c.dataEntregaPrevista! + "T12:00:00").getTime()) / 86_400_000)
              return (
                <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-[#191625] truncate">{c.nomeCliente}</p>
                    <p className="text-[10px] text-[#8E8E93] truncate">{c.numero} · {COLUNAS_KANBAN[c.coluna]}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-bold text-[#d33a3c]">{dias}d atraso</p>
                    <p className="text-[11px] text-[#8E8E93] tabular-nums">{brl(c.preco)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Vencendo em breve */}
      {data.vencendoEm5.length > 0 && (
        <Card className="border-[rgba(197,120,0,0.15)]">
          <div className="px-4 pt-4 pb-2">
            <SectionTitle>Vencem em 5 dias</SectionTitle>
          </div>
          <div className="divide-y divide-[rgba(60,60,67,0.07)]">
            {data.vencendoEm5.map(c => {
              const diff = Math.round((new Date(c.dataEntregaPrevista! + "T12:00:00").getTime() - now_ts()) / 86_400_000)
              return (
                <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-[#191625] truncate">{c.nomeCliente}</p>
                    <p className="text-[10px] text-[#8E8E93] truncate">{c.numero} · {COLUNAS_KANBAN[c.coluna]}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-bold text-[#c57800]">{diff === 0 ? "hoje" : `em ${diff}d`}</p>
                    <p className="text-[11px] text-[#8E8E93] tabular-nums">{brl(c.preco)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {data.emProducao === 0 && (
        <Card className="p-8 flex flex-col items-center gap-2">
          <p className="text-[28px]">🏭</p>
          <p className="text-[13px] font-semibold text-[#191625]">Nada em produção</p>
          <p className="text-[11px] text-[#8E8E93]">Fila vazia por agora</p>
        </Card>
      )}
    </div>
  )
}

// ─── Tab: Negócios ────────────────────────────────────────────────────────────

function NegociosTab({ data }: { data: DashData }) {
  return (
    <div className="flex flex-col gap-4">

      {/* Performance */}
      <div className="grid grid-cols-2 gap-3">
        {data.winRate !== null && (
          <KpiTile label="Win rate" value={`${data.winRate.toFixed(0)}%`} accent={data.winRate >= 60 ? "#009351" : "#c57800"} sub="taxa de fechamento" />
        )}
        <KpiTile label="Pedidos/mês" value={data.pedsMes.toFixed(1)} sub="média histórica" />
        {data.margemMedia !== null && (
          <KpiTile label="Margem média" value={`${data.margemMedia.toFixed(0)}%`} accent={data.margemMedia >= 40 ? "#009351" : data.margemMedia >= 20 ? "#c57800" : "#d33a3c"} sub="nos pedidos calculados" />
        )}
        <KpiTile label="Entregues" value={String(data.ultimosNegocios.filter(c => c.coluna === COL_ENTREGUE).length)} sub="na seleção" />
      </div>

      {/* Últimos negócios */}
      <Card>
        <div className="px-4 pt-4 pb-2">
          <SectionTitle>Últimos negócios</SectionTitle>
        </div>
        {data.ultimosNegocios.length === 0 ? (
          <p className="px-4 pb-4 text-[12px] text-[#8E8E93]">Nenhum negócio ainda</p>
        ) : (
          <div className="divide-y divide-[rgba(60,60,67,0.07)]">
            {data.ultimosNegocios.map(c => {
              const sc = STAGE_COLOR[c.coluna] ?? { color: "#8E8E93", bg: "rgba(142,142,147,0.1)" }
              return (
                <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: sc.bg }}>
                    <span className="text-[9px] font-bold" style={{ color: sc.color }}>
                      {COLUNAS_KANBAN[c.coluna]?.slice(0, 2) ?? "—"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-[#191625] truncate">{c.nomeCliente}</p>
                    <p className="text-[10px] text-[#8E8E93]">
                      {c.numero} · {c.dataFechamento ? fmtDate(c.dataFechamento) : fmtDate(c.data)}
                    </p>
                  </div>
                  <p className="text-[13px] font-bold tabular-nums text-[#191625] shrink-0">{brl(c.preco)}</p>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function TabIcon({ id, active }: { id: TabId; active: boolean }) {
  const c = active ? "#8456e8" : "#8E8E93"
  const s = { width: 22, height: 22 }
  if (id === "visao") return (
    <svg viewBox="0 0 24 24" fill="none" style={s}>
      <rect x="3" y="3" width="8" height="8" rx="2" fill={active ? c : "none"} stroke={c} strokeWidth="1.8"/>
      <rect x="13" y="3" width="8" height="8" rx="2" fill={active ? c : "none"} stroke={c} strokeWidth="1.8"/>
      <rect x="3" y="13" width="8" height="8" rx="2" fill={active ? c : "none"} stroke={c} strokeWidth="1.8"/>
      <rect x="13" y="13" width="8" height="8" rx="2" fill={active ? c : "none"} stroke={c} strokeWidth="1.8"/>
    </svg>
  )
  if (id === "cobrancas") return (
    <svg viewBox="0 0 24 24" fill="none" style={s}>
      <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.8"/>
      <path d="M12 7v1m0 8v1M9.5 10a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
  if (id === "producao") return (
    <svg viewBox="0 0 24 24" fill="none" style={s}>
      <path d="M4 17L4 7l4 4V7l4 4V7l4 10H4z" stroke={c} strokeWidth="1.8" strokeLinejoin="round" fill={active ? c+"33" : "none"}/>
      <path d="M4 20h16" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
  if (id === "negocios") return (
    <svg viewBox="0 0 24 24" fill="none" style={s}>
      <polyline points="3,17 9,11 13,15 21,7" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="17,7 21,7 21,11" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  return null
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function now_ts() { return Date.now() }
