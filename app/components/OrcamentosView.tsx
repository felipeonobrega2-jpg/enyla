"use client"

import { useState, useMemo, useRef } from "react"
import {
  FileText, CheckCircle2, XCircle,
  Target, Clock, BarChart3, Plus, Users,
} from "lucide-react"
import { KanbanCard, PropostaCustom, COL_FECHADO, COL_PERDIDO, COL_ENTREGUE } from "../types"
import { brl, num } from "../utils"
import { HistoricoView, HistItem } from "./HistoricoView"

type OrcTab = "dashboard" | "historico"

type Props = {
  historico: HistItem[]
  propostasCustom: PropostaCustom[]
  kanban: KanbanCard[]
  onNovoOrcamento: () => void
  // histórico passthrough
  onReplicar: (item: HistItem) => void
  onDownloadPdf: (item: HistItem) => void
  onDownloadPdfCliente: (item: HistItem) => void
  onExcluir: (index: number) => void
  onWhatsApp: (item: HistItem) => void
  onPdfCustom: (p: PropostaCustom) => void
  onWhatsAppCustom: (p: PropostaCustom) => void
  onExcluirCustom: (id: string) => void
  onEditarCustom: (p: PropostaCustom) => void
  onPersonalizar?: (item: HistItem) => void
  onDetalhes?: (item: HistItem | PropostaCustom) => void
}

function num2(n: number, d = 1) { return num(n, d) }

export function OrcamentosView(props: Props) {
  const {
    historico, propostasCustom, kanban, onNovoOrcamento,
    onReplicar, onDownloadPdf, onDownloadPdfCliente, onExcluir,
    onWhatsApp, onPdfCustom, onWhatsAppCustom, onExcluirCustom,
    onEditarCustom, onPersonalizar, onDetalhes,
  } = props

  const [tab, setTab] = useState<OrcTab>("dashboard")

  // ── Métricas ────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    // kanban é a fonte única de verdade; exclui sub-entradas de terceirização
    const base = kanban.filter(c => !c.isTerceirizado)

    const totalRealizados = base.length

    const fechados    = base.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO)
    const perdidos    = base.filter(c => c.coluna === COL_PERDIDO)
    const entregues   = base.filter(c => c.coluna === COL_ENTREGUE)
    const emAndamento = base.filter(c => c.coluna >= COL_FECHADO && c.coluna < COL_ENTREGUE && c.coluna !== COL_PERDIDO)

    const totalFechados = fechados.length
    const totalPerdidos = perdidos.length
    // taxa = ganhos ÷ (ganhos + perdidos) — ignora abertos ainda sem decisão
    const resolvidosBase = totalFechados + totalPerdidos
    const taxaConversao  = resolvidosBase > 0 ? (totalFechados / resolvidosBase) * 100 : 0

    // Ticket médio dos orçamentos gerados (histórico calculado)
    const precoIdealItem = (item: HistItem) => {
      const ideal = item.calculo.tabela.find(l => l.quantidade === item.calculo.sweetSpotIdealQtd) ?? item.calculo.tabela[0]
      return item.form.comFaca ? (ideal?.precoComFaca ?? 0) : (ideal?.precoSemFaca ?? 0)
    }
    const ticketMedioOrc = historico.length > 0
      ? historico.reduce((s, i) => s + precoIdealItem(i), 0) / historico.length
      : 0

    // Meses ativos (meses distintos no kanban)
    const mesesSet = new Set<string>()
    base.forEach(c => { if (c.data) mesesSet.add(c.data.slice(3, 10)) })
    const mesesAtivos = mesesSet.size || 1
    const mediaOrcMes = totalRealizados / mesesAtivos

    const clientesUnicos = new Set(base.map(c => c.nomeCliente?.trim().toLowerCase()).filter(Boolean)).size
    const orcPorCliente = clientesUnicos > 0 ? totalRealizados / clientesUnicos : 0

    return {
      totalRealizados,
      totalFechados,
      totalPerdidos,
      taxaConversao,
      ticketMedioOrc,
      mediaOrcMes,
      orcPorCliente,
    }
  }, [historico, propostasCustom, kanban])

  const TAB_STYLE = (active: boolean) =>
    `px-4 py-2 text-[12.5px] font-semibold rounded-lg transition-colors ${
      active
        ? "bg-white text-[#191625] shadow-sm"
        : "text-[#8E8E93] hover:text-[#5e5c68]"
    }`

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-7 pb-5 shrink-0">
        <div>
          <h1 className="text-[20px] font-bold text-[#1C1C1E] tracking-tight">Orçamentos</h1>
          <p className="text-[12px] text-[#8E8E93] mt-0.5">
            {metrics.totalRealizados} realizados · {metrics.totalFechados} fechados · taxa {num2(metrics.taxaConversao, 0)}%
          </p>
        </div>
        <button
          onClick={onNovoOrcamento}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-[#161421] hover:bg-[#0b0914] active:scale-[0.98] transition-all shrink-0">
          <Plus className="w-3.5 h-3.5" />
          Novo orçamento
        </button>
      </div>

      {/* Tab bar */}
      <div className="px-8 pb-4 shrink-0">
        <div className="inline-flex bg-[#F2F2F7] rounded-xl p-1 gap-0.5">
          <button className={TAB_STYLE(tab === "dashboard")} onClick={() => setTab("dashboard")}>
            Dashboard
          </button>
          <button className={TAB_STYLE(tab === "historico")} onClick={() => setTab("historico")}>
            Histórico
            {(historico.length + propostasCustom.length) > 0 && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(116,116,128,0.12)] text-[#8E8E93] font-semibold">
                {historico.length + propostasCustom.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "dashboard" ? (
          <DashboardTab metrics={metrics} kanban={kanban} />
        ) : (
          <div className="px-6 pb-8">
            <HistoricoView
              historico={historico}
              propostasCustom={propostasCustom}
              onReplicar={onReplicar}
              onDownloadPdf={onDownloadPdf}
              onDownloadPdfCliente={onDownloadPdfCliente}
              onExcluir={onExcluir}
              onWhatsApp={onWhatsApp}
              onPdfCustom={onPdfCustom}
              onWhatsAppCustom={onWhatsAppCustom}
              onExcluirCustom={onExcluirCustom}
              onEditarCustom={onEditarCustom}
              onPersonalizar={onPersonalizar}
              onDetalhes={onDetalhes}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Dashboard Tab ────────────────────────────────────────────────────────────

type Metrics = ReturnType<typeof useDummyMetrics>
function useDummyMetrics() { return {} as ReturnType<Parameters<typeof DashboardTab>[0]["metrics"] extends infer M ? () => M : never> }

function DashboardTab({ metrics, kanban }: {
  metrics: {
    totalRealizados: number
    totalFechados: number
    totalPerdidos: number
    taxaConversao: number
    ticketMedioOrc: number
    mediaOrcMes: number
    orcPorCliente: number
  }
  kanban: KanbanCard[]
}) {
  const {
    totalRealizados, totalFechados, totalPerdidos, taxaConversao,
    ticketMedioOrc, mediaOrcMes, orcPorCliente,
  } = metrics

  const convColor = "#8456e8"
  const convBg    = "rgba(132,86,232,0.08)"

  return (
    <div className="px-8 pb-10 space-y-6">

      {/* KPIs — linha 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<FileText className="w-4 h-4" />}
          iconColor="#7c3aed" iconBg="rgba(124,58,237,0.08)"
          label="Total realizados"
          value={String(totalRealizados)}
          sub="orçamentos gerados"
        />
        <KpiCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          iconColor="#15803d" iconBg="rgba(22,163,74,0.08)"
          label="Fechados"
          value={String(totalFechados)}
          sub="pedidos confirmados"
          subColor="#15803d"
        />
        <KpiCard
          icon={<XCircle className="w-4 h-4" />}
          iconColor="#b91c1c" iconBg="rgba(185,28,28,0.08)"
          label="Perdidos"
          value={String(totalPerdidos)}
          sub="negócios encerrados"
          subColor="#b91c1c"
        />
        <KpiCard
          icon={<Target className="w-4 h-4" />}
          iconColor={convColor} iconBg={convBg}
          label="Taxa de conversão"
          value={`${num(taxaConversao, 1)}%`}
          sub="fechados ÷ decididos"
          subColor={convColor}
          highlight
        />
      </div>

      {/* KPIs de volume — linha 2 */}
      <div>
        <SectionLabel>Volume</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          <KpiCard
            icon={<BarChart3 className="w-4 h-4" />}
            iconColor="#7c3aed" iconBg="rgba(124,58,237,0.08)"
            label="Ticket médio orçado"
            value={ticketMedioOrc > 0 ? brl(ticketMedioOrc) : "—"}
            sub="valor médio dos orçamentos"
          />
          <KpiCard
            icon={<Clock className="w-4 h-4" />}
            iconColor="#f59e0b" iconBg="rgba(245,158,11,0.08)"
            label="Orçamentos por mês"
            value={num(mediaOrcMes, 1)}
            sub="média histórica"
          />
          <KpiCard
            icon={<Users className="w-4 h-4" />}
            iconColor="#0ea5e9" iconBg="rgba(14,165,233,0.08)"
            label="Orç. por cliente"
            value={num(orcPorCliente, 1)}
            sub="média por cliente"
          />
        </div>
      </div>

      {/* Gráfico histórico */}
      <div>
        <SectionLabel>Histórico mensal</SectionLabel>
        <div className="mt-3">
          <OrcLineChart kanban={kanban} />
        </div>
      </div>

      {/* Barra de conversão visual */}
      {(totalFechados + totalPerdidos) > 0 && (
        <div>
          <SectionLabel>Conversão</SectionLabel>
          <div className="mt-3 rounded-2xl p-5" style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-faint)" }}>Fechados vs. Perdidos</span>
              <span className="text-[12px] font-bold" style={{ color: convColor }}>{num(taxaConversao, 1)}% conversão</span>
            </div>
            <div className="h-2.5 rounded-full bg-[rgba(185,28,28,0.12)] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${taxaConversao}%`, background: convColor }} />
            </div>
            <div className="flex justify-between mt-2.5 text-[11px] text-[#8E8E93]">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                {totalFechados} fechados
              </span>
              <span className="flex items-center gap-1">
                <XCircle className="w-3 h-3 text-red-500" />
                {totalPerdidos} perdidos
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalRealizados === 0 && (
        <div className="py-20 text-center">
          <div className="flex justify-center mb-3"><FileText className="w-10 h-10 text-[#c7c7cc]" /></div>
          <p className="text-[14px] font-semibold" style={{ color: "var(--text-faint)" }}>Nenhum orçamento ainda</p>
          <p className="text-[12px] text-[#8E8E93] mt-1">Clique em "Novo orçamento" para começar</p>
        </div>
      )}
    </div>
  )
}

function OrcLineChart({ kanban }: { kanban: KanbanCard[] }) {
  const [hovIdx, setHovIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const meses = useMemo(() => {
    const map = new Map<string, number>()
    kanban.filter(c => !c.isTerceirizado).forEach(c => {
      if (!c.data) return
      // c.data pode ser "dd/mm/yyyy, HH:MM:SS" ou "dd/mm/yyyy"
      try {
        const [d, m, y] = c.data.split(",")[0].trim().split("/")
        if (!d || !m || !y) return
        const key = `${y.trim()}-${m.padStart(2, "0")}`
        map.set(key, (map.get(key) ?? 0) + 1)
      } catch { /* skip */ }
    })
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-18)
  }, [kanban])

  if (meses.length < 2) return null

  const VW = 800, VH = 180
  const PL = 28, PR = 16, PT = 20, PB = 32
  const CW = VW - PL - PR
  const CH = VH - PT - PB

  const maxVal = Math.max(...meses.map(([, v]) => v), 1)
  const d = new Date()
  const currentMesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  const currentIdx = meses.findIndex(([ym]) => ym === currentMesKey)
  const totalMeses = meses.length

  const pts = meses.map(([ym, v], i) => ({
    x: PL + (totalMeses > 1 ? (i / (totalMeses - 1)) : 0.5) * CW,
    y: PT + CH - (v / maxVal) * CH,
    v, ym,
  }))

  function smoothPath(points: { x: number; y: number }[]) {
    if (points.length < 2) return ""
    let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x
      const t = 0.35
      path += ` C ${(points[i].x + dx * t).toFixed(1)} ${points[i].y.toFixed(1)}, ${(points[i + 1].x - dx * t).toFixed(1)} ${points[i + 1].y.toFixed(1)}, ${points[i + 1].x.toFixed(1)} ${points[i + 1].y.toFixed(1)}`
    }
    return path
  }

  const linePath = smoothPath(pts)
  const areaPath = linePath + ` L ${pts[pts.length - 1].x.toFixed(1)} ${(PT + CH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(PT + CH).toFixed(1)} Z`

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const svgX = ((e.clientX - rect.left) / rect.width) * VW
    let closest = 0, minDist = Infinity
    pts.forEach((p, i) => { const dist = Math.abs(p.x - svgX); if (dist < minDist) { minDist = dist; closest = i } })
    setHovIdx(closest)
  }

  const hov = hovIdx !== null ? pts[hovIdx] : null
  const gridVals = Array.from({ length: 4 }, (_, i) => Math.round((maxVal / 3) * i))
  const stepLabel = Math.ceil(totalMeses / 7)
  const mesAtual = currentIdx >= 0 ? meses[currentIdx][1] : 0
  const mediaVal = kanban.filter(c => !c.isTerceirizado).length / totalMeses

  function fmtMes(ym: string) {
    const [y, m] = ym.split("-")
    const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
    return `${MESES[parseInt(m) - 1]} ${y.slice(2)}`
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
      <div className="px-6 pt-5 pb-4 flex items-start gap-10" style={{ borderBottom: "1px solid var(--border)" }}>
        <div>
          <p className="text-[10.5px] uppercase tracking-wider font-bold text-[#8E8E93] mb-1">Este mês</p>
          <p className="text-[32px] font-bold tabular-nums leading-none" style={{ color: "var(--text-main)" }}>{mesAtual}</p>
          <p className="text-[11px] text-[#8E8E93] mt-1">orçamentos</p>
        </div>
        <div>
          <p className="text-[10.5px] uppercase tracking-wider font-bold text-[#8E8E93] mb-1">Média mensal</p>
          <p className="text-[32px] font-bold text-[#8456e8] tabular-nums leading-none">{num(mediaVal, 1)}</p>
          <p className="text-[11px] text-[#8E8E93] mt-1">nos últimos {totalMeses} meses</p>
        </div>
        {hovIdx !== null && hovIdx !== currentIdx && (
          <div>
            <p className="text-[10.5px] uppercase tracking-wider font-bold text-[#8E8E93] mb-1">{fmtMes(meses[hovIdx][0])}</p>
            <p className="text-[32px] font-bold tabular-nums leading-none" style={{ color: "var(--text-main)" }}>{meses[hovIdx][1]}</p>
            <p className="text-[11px] text-[#8E8E93] mt-1">orçamentos</p>
          </div>
        )}
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: "100%", display: "block", cursor: "crosshair" }}
        onMouseMove={onMouseMove} onMouseLeave={() => setHovIdx(null)}>
        <defs>
          <linearGradient id="orc-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8456e8" stopOpacity="0.14" />
            <stop offset="85%" stopColor="#8456e8" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {gridVals.map(v => {
          const gy = PT + CH - (v / maxVal) * CH
          return (
            <g key={v}>
              <line x1={PL} y1={gy} x2={VW - PR} y2={gy}
                stroke={v === 0 ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.05)"}
                strokeWidth={1} strokeDasharray={v === 0 ? "" : "4 4"} />
              {v > 0 && <text x={PL - 5} y={gy + 3.5} textAnchor="end" fontSize={9} fill="#c7c7cc"
                fontFamily="-apple-system,sans-serif">{v}</text>}
            </g>
          )
        })}

        <path d={areaPath} fill="url(#orc-grad)" />
        <path d={linePath} fill="none" stroke="#8456e8" strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round" />

        {currentIdx >= 0 && hovIdx !== currentIdx && (
          <circle cx={pts[currentIdx].x} cy={pts[currentIdx].y} r={4.5}
            fill="#8456e8" stroke="white" strokeWidth={2} />
        )}

        {pts.map((p, i) => {
          if (i % stepLabel !== 0 && i !== totalMeses - 1) return null
          return (
            <text key={i} x={p.x} y={VH - 6} textAnchor="middle" fontSize={9} fill="#c7c7cc"
              fontFamily="-apple-system,sans-serif">{fmtMes(meses[i][0])}</text>
          )
        })}

        {hov && (() => {
          const TW = 100, TH = 44, TR = 8
          const tx = Math.min(Math.max(hov.x - TW / 2, PL), VW - PR - TW)
          const ty = Math.max(PT + 4, hov.y - TH - 12)
          return (
            <>
              <line x1={hov.x} y1={PT} x2={hov.x} y2={PT + CH}
                stroke="#8456e8" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.35} />
              <circle cx={hov.x} cy={hov.y} r={5.5} fill="white" stroke="#8456e8" strokeWidth={2.5} />
              <g>
                <rect x={tx} y={ty} width={TW} height={TH} rx={TR} fill="#1C1C1E" />
                <text x={tx + TW / 2} y={ty + 15} textAnchor="middle" fontSize={9.5}
                  fill="rgba(255,255,255,0.55)" fontFamily="-apple-system,sans-serif">
                  {fmtMes(hov.ym)}
                </text>
                <text x={tx + TW / 2} y={ty + 32} textAnchor="middle" fontSize={14}
                  fontWeight="700" fill="white" fontFamily="-apple-system,sans-serif">
                  {hov.v} orç.
                </text>
              </g>
            </>
          )
        })()}
      </svg>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] uppercase tracking-wider font-bold text-[#8E8E93]">{children}</p>
  )
}

function KpiCard({
  icon, iconColor, iconBg, label, value, sub, subColor, highlight,
}: {
  icon: React.ReactNode
  iconColor: string
  iconBg: string
  label: string
  value: string
  sub?: string
  subColor?: string
  highlight?: boolean
}) {
  return (
    <div className={`bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl px-5 py-4 ${highlight ? "ring-1 ring-[rgba(124,58,237,0.1)]" : ""}`}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: iconBg, color: iconColor }}>
          {icon}
        </div>
        <p className="text-[10.5px] uppercase tracking-wider font-semibold text-[#8E8E93] leading-tight">{label}</p>
      </div>
      <p className="text-[22px] font-bold tabular-nums text-[#1C1C1E] tracking-tight leading-none">{value}</p>
      {sub && (
        <p className="text-[11px] mt-1.5" style={{ color: subColor ?? "#8E8E93" }}>{sub}</p>
      )}
    </div>
  )
}
