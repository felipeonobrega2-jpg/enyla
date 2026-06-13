"use client"

import { useMemo, useRef, useState, useEffect } from "react"
import {
  FormData, Calculo, PropostaCustom, KanbanCard, Cliente,
  COLUNAS_KANBAN, COL_FECHADO, COL_ENTREGUE, COL_PERDIDO, LancamentoFinanceiro,
} from "../types"
import { Configuracoes } from "../config"
import { brl, num } from "../utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type HistoricoItem = { form: FormData; calculo: Calculo; data: string; numero?: string }

interface Props {
  historico: HistoricoItem[]
  kanban: KanbanCard[]
  propostasCustom: PropostaCustom[]
  clientes: Cliente[]
  config: Configuracoes
  lancamentos?: LancamentoFinanceiro[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDataBr(s: string): Date {
  try {
    // ISO date YYYY-MM-DD (dataFechamento)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T00:00:00")
    const [d, m, y] = s.split(",")[0].trim().split("/")
    return new Date(+y, +m - 1, +d)
  } catch {
    return new Date(0)
  }
}

function fmtShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return num(v, 0)
}

function niceMax(v: number): number {
  if (v <= 0) return 1000
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  return Math.ceil(v / mag) * mag
}

const MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

function colColor(col: number): string {
  if (col === COL_PERDIDO) return "bg-[#FF3B30]/10 text-[#FF3B30]"
  if (col === COL_ENTREGUE) return "bg-[#34C759]/10 text-[#34C759]"
  if (col === COL_FECHADO) return "bg-[#34C759]/10 text-[#34C759]"
  return "bg-[#007AFF]/10 text-[#007AFF]"
}

function colBg(col: number): string {
  if (col === COL_PERDIDO)  return "#FF3B30"
  if (col === COL_ENTREGUE) return "#007AFF"
  if (col === COL_FECHADO)  return "#34C759"
  if (col === 0)            return "#C7C7CC"
  return "#FF9500" // cols 2-8: em produção
}

// ─── SVG Monthly Chart ────────────────────────────────────────────────────────

interface MonthlyDatum { label: string; volume: number; receita: number }

function MonthlyChart({ data }: { data: MonthlyDatum[] }) {
  const W = 560, H = 160
  const PAD_L = 52, PAD_B = 28, PAD_T = 12, PAD_R = 12
  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B

  const maxVal = Math.max(...data.map(d => d.volume), 1)
  const yMax = niceMax(maxVal)
  const steps = 4

  const groupW = chartW / data.length
  const barGap = 2
  const barW = Math.max(4, (groupW - barGap * 3) / 2)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {/* Y grid lines + labels */}
      {Array.from({ length: steps + 1 }).map((_, i) => {
        const val = (yMax / steps) * i
        const y = PAD_T + chartH - (val / yMax) * chartH
        return (
          <g key={i}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
              stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
            <text x={PAD_L - 6} y={y + 4} textAnchor="end"
              fontSize={9} fill="#8E8E93" fontFamily="system-ui">
              {fmtShort(val)}
            </text>
          </g>
        )
      })}

      {/* X axis line */}
      <line x1={PAD_L} y1={PAD_T + chartH} x2={W - PAD_R} y2={PAD_T + chartH}
        stroke="rgba(0,0,0,0.1)" strokeWidth={1} />

      {/* Bars */}
      {data.map((d, i) => {
        const gx = PAD_L + i * groupW + barGap
        const hVol = yMax > 0 ? (d.volume / yMax) * chartH : 0
        const hRec = yMax > 0 ? (d.receita / yMax) * chartH : 0
        const yVol = PAD_T + chartH - hVol
        const yRec = PAD_T + chartH - hRec
        return (
          <g key={i}>
            {/* Volume bar (light blue) */}
            {hVol > 0 && (
              <rect x={gx} y={yVol} width={barW} height={hVol}
                rx={3} fill="#93C5FD" />
            )}
            {/* Receita bar (blue) */}
            {hRec > 0 && (
              <rect x={gx + barW + barGap} y={yRec} width={barW} height={hRec}
                rx={3} fill="#007AFF" />
            )}
            {/* X label */}
            <text x={gx + barW + barGap / 2} y={PAD_T + chartH + 14}
              textAnchor="middle" fontSize={8.5} fill="#8E8E93" fontFamily="system-ui">
              {d.label}
            </text>
          </g>
        )
      })}

      {/* Legend */}
      <rect x={PAD_L} y={H - 8} width={9} height={9} rx={2} fill="#93C5FD" />
      <text x={PAD_L + 12} y={H - 1} fontSize={9} fill="#8E8E93" fontFamily="system-ui">Volume orçado</text>
      <rect x={PAD_L + 90} y={H - 8} width={9} height={9} rx={2} fill="#007AFF" />
      <text x={PAD_L + 103} y={H - 1} fontSize={9} fill="#8E8E93" fontFamily="system-ui">Receita confirmada</text>
    </svg>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

type Periodo =
  | "mes" | "mes_passado"
  | "trimestre" | "trimestre_passado"
  | "semestre" | "semestre_passado"
  | "ano" | "ano_passado"
  | "ultimos7" | "ultimos14" | "ultimos30" | "ultimos90" | "ultimos12m"
  | "tudo" | "custom"

const PERIODO_LABEL: Record<Periodo, string> = {
  mes:                "Este mês",
  mes_passado:        "Mês passado",
  trimestre:          "Este trimestre",
  trimestre_passado:  "Trimestre passado",
  semestre:           "Este semestre",
  semestre_passado:   "Semestre passado",
  ano:                "Este ano",
  ano_passado:        "Ano passado",
  ultimos7:           "Últimos 7 dias",
  ultimos14:          "Últimos 14 dias",
  ultimos30:          "Últimos 30 dias",
  ultimos90:          "Últimos 90 dias",
  ultimos12m:         "Últimos 12 meses",
  tudo:               "Tudo",
  custom:             "Personalizado",
}

const GRUPOS_PERIODO: { label: string; items: { id: Periodo; label: string }[] }[] = [
  {
    label: "Janelas móveis",
    items: [
      { id: "ultimos7",   label: "Últimos 7 dias"   },
      { id: "ultimos14",  label: "Últimos 14 dias"  },
      { id: "ultimos30",  label: "Últimos 30 dias"  },
      { id: "ultimos90",  label: "Últimos 90 dias"  },
      { id: "ultimos12m", label: "Últimos 12 meses" },
    ],
  },
  {
    label: "Período atual",
    items: [
      { id: "mes",       label: "Este mês"      },
      { id: "trimestre", label: "Este trimestre" },
      { id: "semestre",  label: "Este semestre"  },
      { id: "ano",       label: "Este ano"       },
      { id: "tudo",      label: "Tudo"           },
    ],
  },
  {
    label: "Período anterior",
    items: [
      { id: "mes_passado",       label: "Mês passado"       },
      { id: "trimestre_passado", label: "Trimestre passado" },
      { id: "semestre_passado",  label: "Semestre passado"  },
      { id: "ano_passado",       label: "Ano passado"       },
    ],
  },
]

export default function DashboardView({ historico, kanban, propostasCustom: _propostasCustom, clientes: _clientes, config: _config, lancamentos = [] }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("mes")
  const [dataInicio, setDataInicio] = useState("")
  const [dataFim, setDataFim]   = useState("")
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // ── Period bounds (shared by both filters) ─────────────────────────────────
  const periodBounds = useMemo(() => {
    const now = new Date()
    let from: Date | null = null
    let to: Date | null = null

    if (periodo === "mes") {
      from = new Date(now.getFullYear(), now.getMonth(), 1)
    } else if (periodo === "mes_passado") {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      to   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
    } else if (periodo === "trimestre") {
      from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    } else if (periodo === "trimestre_passado") {
      const q = Math.floor(now.getMonth() / 3)
      from = new Date(now.getFullYear(), (q - 1) * 3, 1)
      to   = new Date(now.getFullYear(), q * 3, 0, 23, 59, 59)
    } else if (periodo === "semestre") {
      from = new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1)
    } else if (periodo === "semestre_passado") {
      if (now.getMonth() < 6) {
        from = new Date(now.getFullYear() - 1, 6, 1)
        to   = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59)
      } else {
        from = new Date(now.getFullYear(), 0, 1)
        to   = new Date(now.getFullYear(), 5, 30, 23, 59, 59)
      }
    } else if (periodo === "ano") {
      from = new Date(now.getFullYear(), 0, 1)
    } else if (periodo === "ano_passado") {
      from = new Date(now.getFullYear() - 1, 0, 1)
      to   = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59)
    } else if (periodo === "ultimos7") {
      from = new Date(now); from.setDate(now.getDate() - 7)
    } else if (periodo === "ultimos14") {
      from = new Date(now); from.setDate(now.getDate() - 14)
    } else if (periodo === "ultimos30") {
      from = new Date(now); from.setDate(now.getDate() - 30)
    } else if (periodo === "ultimos90") {
      from = new Date(now); from.setDate(now.getDate() - 90)
    } else if (periodo === "ultimos12m") {
      from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
    } else if (periodo === "custom") {
      if (dataInicio) from = new Date(dataInicio)
      if (dataFim)   { to = new Date(dataFim); to.setHours(23, 59, 59) }
    }
    return { from, to }
  }, [periodo, dataInicio, dataFim])

  // ── Filter by QUOTE date — for orçamentos, pipeline, funil ─────────────────
  const filteredCards = useMemo(() => {
    const { from, to } = periodBounds
    return kanban.filter(c => {
      const d = parseDataBr(c.data)
      if (from && d < from) return false
      if (to   && d > to)   return false
      return true
    })
  }, [kanban, periodBounds])

  // ── Filter confirmed cards by CLOSE date — for receita, ticket médio ───────
  // "Confirmed" = any card that advanced past col 0 (open quote) and was not lost.
  // This includes cols 1 (Fechado), 2-8 (in production), 9 (Entregue).
  // Uses dataFechamento (set when first reaching col 1) or falls back to quote date.
  const confirmedByCloseDate = useMemo(() => {
    const { from, to } = periodBounds
    return kanban.filter(c => {
      if (c.coluna === 0 || c.coluna === COL_PERDIDO) return false
      const d = parseDataBr(c.dataFechamento ?? c.data)
      if (from && d < from) return false
      if (to   && d > to)   return false
      return true
    })
  }, [kanban, periodBounds])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = filteredCards.length

    // Sobras no período (lancamentos categoria="sobra" tipo="receita")
    const { from, to } = periodBounds
    const sobrasReceita = lancamentos
      .filter(l => l.categoria === "sobra" && l.tipo === "receita")
      .filter(l => {
        const ref = l.dataPagamento || l.dataVencimento
        if (!ref) return false
        const d = new Date(ref + "T12:00:00")
        if (from && d < from) return false
        if (to   && d > to)   return false
        return true
      })
      .reduce((s, l) => s + l.valor, 0)

    // Revenue/closings by CLOSE date (cross-period, e.g. May quote closed in June)
    const receita    = confirmedByCloseDate.reduce((s, c) => s + c.preco, 0) + sobrasReceita
    const fechamentos = confirmedByCloseDate.length
    const entregues  = confirmedByCloseDate.filter(c => c.coluna === COL_ENTREGUE).length
    const ticket     = fechamentos > 0 ? receita / fechamentos : 0

    // Conversion: how many of THIS PERIOD's quotes are now confirmed (cols 1-9) — always ≤ 100%
    const confirmedInPeriod = filteredCards.filter(
      c => c.coluna !== 0 && c.coluna !== COL_PERDIDO
    ).length
    const conversao = total > 0 ? (confirmedInPeriod / total) * 100 : 0

    // Loss rate: among resolved deals (not still open at col 0) how many were lost
    const perdidos   = filteredCards.filter(c => c.coluna === COL_PERDIDO).length
    const resolvidos = filteredCards.filter(c => c.coluna !== 0).length
    const taxaPerda  = resolvidos > 0 ? (perdidos / resolvidos) * 100 : 0

    // Unique clients in period
    const clientesUnicos = new Set(filteredCards.map(c => c.nomeCliente)).size

    // Pipeline: only unconfirmed quotes (col 0) — once confirmed it moves to production
    const pipelineGlobal = kanban
      .filter(c => c.coluna === 0)
      .reduce((s, c) => s + c.preco, 0)

    // Em produção: cards in production stages 2–8 (global)
    const prodCards      = kanban.filter(c => c.coluna >= 2 && c.coluna <= 8)
    const emProducaoCount = prodCards.length
    const emProducaoValor = prodCards.reduce((s, c) => s + c.preco, 0)

    return {
      total, receita, fechamentos, entregues, ticket,
      conversao, taxaPerda, clientesUnicos,
      pipelineGlobal, emProducaoCount, emProducaoValor,
    }
  }, [filteredCards, confirmedByCloseDate, kanban])

  // ── Monthly chart data (last 12 months) ─────────────────────────────────────
  const monthlyData = useMemo(() => {
    const now = new Date()
    const months: MonthlyDatum[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ label: MESES_PT[d.getMonth()], volume: 0, receita: 0 })
    }
    kanban.forEach(card => {
      // Volume bar: by quote date
      const cd = parseDataBr(card.data)
      const diffMonths = (now.getFullYear() - cd.getFullYear()) * 12 + (now.getMonth() - cd.getMonth())
      if (diffMonths >= 0 && diffMonths <= 11) {
        months[11 - diffMonths].volume += card.preco
      }
      // Revenue bar: by close date (dataFechamento when available)
      if (card.coluna !== 0 && card.coluna !== COL_PERDIDO) {
        const closeDate = parseDataBr(card.dataFechamento ?? card.data)
        const closeDiff = (now.getFullYear() - closeDate.getFullYear()) * 12 + (now.getMonth() - closeDate.getMonth())
        if (closeDiff >= 0 && closeDiff <= 11) {
          months[11 - closeDiff].receita += card.preco
        }
      }
    })
    // Add sobras to monthly revenue
    lancamentos
      .filter(l => l.categoria === "sobra" && l.tipo === "receita")
      .forEach(l => {
        const ref = l.dataPagamento || l.dataVencimento
        if (!ref) return
        const d = new Date(ref + "T12:00:00")
        const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
        if (diff >= 0 && diff <= 11) months[11 - diff].receita += l.valor
      })
    return months
  }, [kanban, lancamentos])

  // ── Funil ───────────────────────────────────────────────────────────────────
  const funil = useMemo(() => {
    const map = new Map<number, { count: number; value: number }>()
    filteredCards.forEach(c => {
      const cur = map.get(c.coluna) ?? { count: 0, value: 0 }
      map.set(c.coluna, { count: cur.count + 1, value: cur.value + c.preco })
    })
    const arr = Array.from(map.entries())
      .map(([col, v]) => ({ col, colNome: COLUNAS_KANBAN[col] ?? `Col ${col}`, count: v.count, value: v.value }))
      .sort((a, b) => a.col - b.col)
    const maxCount = Math.max(...arr.map(a => a.count), 1)
    return { stages: arr, maxCount }
  }, [filteredCards])

  // ── Top clientes ────────────────────────────────────────────────────────────
  const topClientes = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>()
    filteredCards
      .filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO)
      .forEach(c => {
        const k = c.nomeCliente || "Sem nome"
        const cur = map.get(k) ?? { total: 0, count: 0 }
        map.set(k, { total: cur.total + c.preco, count: cur.count + 1 })
      })
    const arr = Array.from(map.entries())
      .map(([nome, v]) => ({ nome, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
    const maxTotal = Math.max(...arr.map(a => a.total), 1)
    return { clientes: arr, maxTotal }
  }, [filteredCards])

  // ── Materiais ───────────────────────────────────────────────────────────────
  const materiais = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>()
    filteredCards.forEach(card => {
      let mat = card.materialNome
      if (!mat) {
        const h = historico.find(h => h.numero === card.numero)
        mat = h?.form?.materialNome ?? "Sem material"
      }
      if (!mat) mat = "Sem material"
      const cur = map.get(mat) ?? { count: 0, value: 0 }
      map.set(mat, { count: cur.count + 1, value: cur.value + card.preco })
    })
    const arr = Array.from(map.entries())
      .map(([nome, v]) => ({ nome, count: v.count, value: v.value }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
    const maxCount = Math.max(...arr.map(a => a.count), 1)
    const colors = ["#007AFF", "#34C759", "#FF3B30", "#AF52DE", "#FF9500", "#5AC8FA"]
    return { materiais: arr.map((m, i) => ({ ...m, color: colors[i % colors.length] })), maxCount }
  }, [filteredCards, historico])

  // ── Motivos de perda ────────────────────────────────────────────────────────
  const motivosPerda = useMemo(() => {
    const map = new Map<string, number>()
    filteredCards
      .filter(c => c.coluna === COL_PERDIDO)
      .forEach(c => {
        const k = c.motivoPerdido?.trim() || "Sem motivo"
        map.set(k, (map.get(k) ?? 0) + 1)
      })
    const arr = Array.from(map.entries())
      .map(([motivo, count]) => ({ motivo, count }))
      .sort((a, b) => b.count - a.count)
    const maxCount = Math.max(...arr.map(a => a.count), 1)
    return { motivos: arr, maxCount }
  }, [filteredCards])

  // ── Últimos negócios ─────────────────────────────────────────────────────────
  const ultimosNegocios = useMemo(() => {
    return [...filteredCards]
      .sort((a, b) => parseDataBr(b.data).getTime() - parseDataBr(a.data).getTime())
      .slice(0, 10)
  }, [filteredCards])

  // ── Periodo label ────────────────────────────────────────────────────────────
  const periodoLabel = (p: Periodo) => PERIODO_LABEL[p] ?? p

  // ─── Empty state ─────────────────────────────────────────────────────────────
  if (kanban.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 text-[#8E8E93]">
        <div className="w-16 h-16 rounded-2xl bg-[rgba(116,116,128,0.08)] flex items-center justify-center">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-[#1C1C1E] font-semibold text-sm">Nenhum dado ainda</p>
          <p className="text-[#8E8E93] text-xs mt-1">Salve orçamentos para ver o dashboard</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-5 space-y-5">

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-[#F2F2F7]/95 backdrop-blur-sm py-2 -mx-6 px-6">
        <div className="flex items-center gap-2">

          {/* Period dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(m => !m)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium transition-all ${
                periodo !== "custom"
                  ? "bg-[#007AFF] text-white shadow-sm"
                  : "bg-white border border-[rgba(0,0,0,0.12)] text-[#1C1C1E] hover:bg-[rgba(0,0,0,0.04)]"
              }`}
            >
              <svg className="w-3.5 h-3.5 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 9v7.5" />
              </svg>
              {periodoLabel(periodo)}
              <svg className={`w-3 h-3 opacity-60 transition-transform shrink-0 ${showMenu ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {showMenu && (
              <div className="absolute top-full left-0 mt-1.5 w-52 bg-white rounded-xl border border-[rgba(0,0,0,0.12)] shadow-[0_4px_16px_rgba(0,0,0,0.08)] py-1.5 z-50">
                {GRUPOS_PERIODO.map((grupo, gi) => (
                  <div key={gi}>
                    {gi > 0 && <div className="h-px bg-[rgba(60,60,67,0.12)] my-1" />}
                    <p className="px-3 pt-1.5 pb-0.5 text-[9px] uppercase tracking-wide font-bold text-[#8E8E93]">
                      {grupo.label}
                    </p>
                    {grupo.items.map(({ id, label }) => (
                      <button key={id}
                        onClick={() => { setPeriodo(id); setShowMenu(false) }}
                        className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 transition-colors ${
                          periodo === id
                            ? "text-[#007AFF] font-semibold bg-[#007AFF]/5"
                            : "text-[#1C1C1E] hover:bg-[rgba(0,0,0,0.04)]"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${periodo === id ? "bg-[#007AFF]" : "bg-transparent"}`} />
                        {label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-[rgba(60,60,67,0.12)] mx-0.5" />

          {/* Custom range */}
          <div className="flex items-center gap-1.5">
            <input type="date" value={dataInicio}
              onChange={e => { setDataInicio(e.target.value); setPeriodo("custom") }}
              className="h-8 border border-[rgba(0,0,0,0.12)] rounded-lg px-2 text-[11.5px] text-[#1C1C1E] bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 focus:border-[#007AFF]" />
            <span className="text-[#8E8E93] text-xs">→</span>
            <input type="date" value={dataFim}
              onChange={e => { setDataFim(e.target.value); setPeriodo("custom") }}
              className="h-8 border border-[rgba(0,0,0,0.12)] rounded-lg px-2 text-[11.5px] text-[#1C1C1E] bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 focus:border-[#007AFF]" />
          </div>

          <div className="ml-auto text-[11px] text-[#8E8E93] font-medium tabular-nums bg-white border border-[rgba(0,0,0,0.12)] rounded-full px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {filteredCards.length} orçamento{filteredCards.length !== 1 ? "s" : ""} no período
          </div>
        </div>
      </div>

      {/* ── KPI Row 1 – Financial metrics ──────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-3">
        {/* Receita do período */}
        <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200">
          <p className="text-[10.5px] font-medium text-[#8E8E93] mb-3">Receita do período</p>
          <p className="text-[22px] font-semibold tabular-nums leading-none text-[#1C1C1E] tracking-[-0.01em]">{brl(kpis.receita)}</p>
          <p className="text-[10px] text-[#8E8E93] mt-2">por data de fechamento</p>
        </div>

        {/* Pipeline global */}
        <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200">
          <p className="text-[10.5px] font-medium text-[#8E8E93] mb-3">Pipeline</p>
          <p className="text-[22px] font-semibold tabular-nums leading-none text-[#1C1C1E] tracking-[-0.01em]">{brl(kpis.pipelineGlobal)}</p>
          <p className="text-[10px] text-[#8E8E93] mt-2">cotações aguardando confirmação</p>
        </div>

        {/* Em produção */}
        <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200">
          <p className="text-[10.5px] font-medium text-[#8E8E93] mb-3">Em produção</p>
          <p className="text-[22px] font-semibold tabular-nums leading-none text-[#1C1C1E] tracking-[-0.01em]">{num(kpis.emProducaoCount)}</p>
          <p className="text-[10px] text-[#8E8E93] mt-2">{brl(kpis.emProducaoValor)} em fabricação</p>
        </div>

        {/* Fechamentos */}
        <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200">
          <p className="text-[10.5px] font-medium text-[#8E8E93] mb-3">Fechamentos</p>
          <p className="text-[22px] font-semibold tabular-nums leading-none text-[#1C1C1E] tracking-[-0.01em]">{num(kpis.fechamentos)}</p>
          <p className="text-[10px] text-[#8E8E93] mt-2">{kpis.entregues} entregues no período</p>
        </div>

        {/* Ticket médio */}
        <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200">
          <p className="text-[10.5px] font-medium text-[#8E8E93] mb-3">Ticket médio</p>
          <p className="text-[22px] font-semibold tabular-nums leading-none text-[#1C1C1E] tracking-[-0.01em]">{brl(kpis.ticket)}</p>
          <p className="text-[10px] text-[#8E8E93] mt-2">por negócio fechado</p>
        </div>
      </div>

      {/* ── KPI Row 2 – Operational metrics ────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-3">
        {/* Orçamentos */}
        <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200">
          <p className="text-[10.5px] font-medium text-[#8E8E93] mb-2">Orçamentos</p>
          <p className="text-[20px] font-semibold tabular-nums text-[#1C1C1E] leading-none">{num(kpis.total)}</p>
          <p className="text-[10px] text-[#8E8E93] mt-1.5">realizados no período</p>
        </div>

        {/* Conversão */}
        <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200">
          <p className="text-[10.5px] font-medium text-[#8E8E93] mb-2">Conversão</p>
          <p className="text-[20px] font-semibold tabular-nums leading-none" style={{ color: kpis.conversao >= 30 ? "#34C759" : "#FF9500" }}>
            {num(kpis.conversao, 1)}%
          </p>
          <p className="text-[10px] text-[#8E8E93] mt-1.5">dos orçamentos do período</p>
        </div>

        {/* Taxa de perda */}
        <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200">
          <p className="text-[10.5px] font-medium text-[#8E8E93] mb-2">Taxa de perda</p>
          <p className="text-[20px] font-semibold tabular-nums leading-none" style={{ color: kpis.taxaPerda > 30 ? "#FF3B30" : "#1C1C1E" }}>
            {kpis.taxaPerda > 0 ? `${num(kpis.taxaPerda, 1)}%` : "—"}
          </p>
          <p className="text-[10px] text-[#8E8E93] mt-1.5">dos negócios resolvidos</p>
        </div>

        {/* Clientes únicos */}
        <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200">
          <p className="text-[10.5px] font-medium text-[#8E8E93] mb-2">Clientes únicos</p>
          <p className="text-[20px] font-semibold tabular-nums text-[#1C1C1E] leading-none">{num(kpis.clientesUnicos)}</p>
          <p className="text-[10px] text-[#8E8E93] mt-1.5">atendidos no período</p>
        </div>

        {/* Entregas */}
        <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200">
          <p className="text-[10.5px] font-medium text-[#8E8E93] mb-2">Entregas</p>
          <p className="text-[20px] font-semibold tabular-nums text-[#1C1C1E] leading-none">{num(kpis.entregues)}</p>
          <p className="text-[10px] text-[#8E8E93] mt-1.5">pedidos entregues no período</p>
        </div>
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-4">

        {/* Receita mensal */}
        <div className="col-span-3 bg-white rounded-xl border border-[rgba(0,0,0,0.06)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-200">
          <div className="flex items-center gap-3 mb-4">
            <p className="text-[11px] font-semibold text-[#8E8E93]">Receita mensal</p>
            <div className="flex-1 h-px bg-[rgba(60,60,67,0.12)]" />
            <p className="text-[10px] text-[#8E8E93]">últimos 12 meses</p>
          </div>
          <MonthlyChart data={monthlyData} />
        </div>

        {/* Funil de vendas */}
        <div className="col-span-2 bg-white rounded-xl border border-[rgba(0,0,0,0.06)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-200">
          <div className="flex items-center gap-3 mb-4">
            <p className="text-[11px] font-semibold text-[#8E8E93]">Funil de vendas</p>
            <div className="flex-1 h-px bg-[rgba(60,60,67,0.12)]" />
          </div>
          {funil.stages.length === 0 ? (
            <p className="text-[12px] text-[#8E8E93] text-center py-8">Sem dados no período</p>
          ) : (
            <div className="space-y-2.5">
              {funil.stages.map(s => (
                <div key={s.col} className="flex items-center gap-2.5">
                  <div className="w-[110px] shrink-0 text-[11px] text-[#1C1C1E] font-medium truncate" title={s.colNome}>
                    {s.colNome}
                  </div>
                  <div className="flex-1 h-5 bg-[rgba(116,116,128,0.08)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(8, (s.count / funil.maxCount) * 100)}%`,
                        backgroundColor: colBg(s.col),
                        opacity: 0.75,
                      }}
                    />
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums shrink-0 ${colColor(s.col)}`}>
                    {s.count}
                  </span>
                  <span className="text-[10px] text-[#8E8E93] tabular-nums shrink-0 w-[70px] text-right">
                    {brl(s.value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Analysis row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Top clientes */}
        <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.06)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-200">
          <div className="flex items-center gap-3 mb-4">
            <p className="text-[11px] font-semibold text-[#8E8E93]">Top clientes</p>
            <div className="flex-1 h-px bg-[rgba(60,60,67,0.12)]" />
          </div>
          {topClientes.clientes.length === 0 ? (
            <p className="text-[12px] text-[#8E8E93] text-center py-6">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {topClientes.clientes.map((c, i) => (
                <div key={c.nome} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ background: "#007AFF" }}>
                      {c.nome[0]?.toUpperCase() ?? "?"}
                    </div>
                    <p className="text-[12px] font-medium text-[#1C1C1E] truncate flex-1">{c.nome}</p>
                    <p className="text-[11px] font-bold text-[#1C1C1E] tabular-nums">{brl(c.total)}</p>
                    <p className="text-[10px] text-[#8E8E93] tabular-nums shrink-0">{c.count}×</p>
                  </div>
                  <div className="ml-8 h-1.5 bg-[rgba(116,116,128,0.08)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${(c.total / topClientes.maxTotal) * 100}%`, background: "#007AFF" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Materiais mais usados */}
        <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.06)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-200">
          <div className="flex items-center gap-3 mb-4">
            <p className="text-[11px] font-semibold text-[#8E8E93]">Materiais mais usados</p>
            <div className="flex-1 h-px bg-[rgba(60,60,67,0.12)]" />
          </div>
          {materiais.materiais.length === 0 ? (
            <p className="text-[12px] text-[#8E8E93] text-center py-6">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {materiais.materiais.map(m => (
                <div key={m.nome} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                    <p className="text-[12px] font-medium text-[#1C1C1E] truncate flex-1">{m.nome}</p>
                    <p className="text-[11px] font-bold text-[#1C1C1E] tabular-nums">{num(m.count)}</p>
                    <p className="text-[10px] text-[#8E8E93] tabular-nums shrink-0">{brl(m.value)}</p>
                  </div>
                  <div className="ml-4 h-1.5 bg-[rgba(116,116,128,0.08)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${(m.count / materiais.maxCount) * 100}%`, backgroundColor: m.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Motivos de perda */}
        <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-200">
          <div className="flex items-center gap-3 mb-4">
            <p className="text-[11px] font-semibold text-[#8E8E93]">
              Motivos de perda
            </p>
            <div className="flex-1 h-px bg-[rgba(60,60,67,0.12)]" />
          </div>
          {motivosPerda.motivos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 gap-2">
              <p className="text-[13px] font-semibold text-center text-[#34C759]">Nenhuma perda</p>
              <p className="text-[11px] text-center text-[#8E8E93]">Excelente taxa de conversão!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {motivosPerda.motivos.map(m => (
                <div key={m.motivo} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] font-medium text-[#1C1C1E] truncate flex-1">{m.motivo}</p>
                    <p className="text-[11px] font-bold tabular-nums" style={{ color: "#FF3B30" }}>{m.count}×</p>
                  </div>
                  <div className="h-1.5 bg-[rgba(116,116,128,0.08)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${(m.count / motivosPerda.maxCount) * 100}%`, background: "#FF3B30" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Últimos negócios ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[rgba(60,60,67,0.12)]">
          <p className="text-[11px] font-semibold text-[#8E8E93]">Últimos negócios</p>
          <div className="flex-1 h-px bg-[rgba(60,60,67,0.12)]" />
          <p className="text-[10px] text-[#8E8E93]">10 mais recentes no período</p>
        </div>
        {ultimosNegocios.length === 0 ? (
          <p className="text-[12px] text-[#8E8E93] text-center py-8">Sem negócios no período</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-[rgba(116,116,128,0.04)] border-b border-[rgba(60,60,67,0.12)]">
                <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">Nº</th>
                <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">Cliente</th>
                <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">Material</th>
                <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">Valor</th>
                <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">Qtd</th>
                <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">Estágio</th>
                <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(60,60,67,0.06)]">
              {ultimosNegocios.map(card => {
                const dataFmt = card.data.split(",")[0] ?? card.data
                return (
                  <tr key={card.id} className="hover:bg-[rgba(0,0,0,0.02)] transition-colors">
                    {/* Nº */}
                    <td className="px-4 py-2.5">
                      <span className="bg-[rgba(116,116,128,0.08)] text-[#8E8E93] text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums whitespace-nowrap">
                        {card.numero || "—"}
                      </span>
                    </td>
                    {/* Cliente */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center shrink-0"
                          style={{ background: "#007AFF" }}>
                          {card.nomeCliente[0]?.toUpperCase() ?? "?"}
                        </div>
                        <span className="font-medium text-[#1C1C1E] max-w-[120px] truncate">{card.nomeCliente}</span>
                      </div>
                    </td>
                    {/* Material */}
                    <td className="px-4 py-2.5 text-[#8E8E93] max-w-[120px]">
                      <span className="truncate block">{card.materialNome || "—"}</span>
                    </td>
                    {/* Valor */}
                    <td className="px-4 py-2.5 text-right font-bold text-[#1C1C1E] tabular-nums">
                      {brl(card.preco)}
                    </td>
                    {/* Qtd */}
                    <td className="px-4 py-2.5 text-right text-[#8E8E93] tabular-nums">
                      {num(card.quantidade)}
                    </td>
                    {/* Estágio */}
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${colColor(card.coluna)}`}>
                        {COLUNAS_KANBAN[card.coluna] ?? `Col ${card.coluna}`}
                      </span>
                    </td>
                    {/* Data */}
                    <td className="px-4 py-2.5 text-[#8E8E93] tabular-nums text-[11px]">
                      {dataFmt}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
