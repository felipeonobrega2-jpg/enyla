"use client"

import { useMemo, useRef, useState, useEffect } from "react"
import {
  FormData, Calculo, PropostaCustom, KanbanCard, Cliente,
  COLUNAS_KANBAN, COL_FECHADO, COL_ENTREGUE, COL_PERDIDO, LancamentoFinanceiro,
} from "../types"
import { Configuracoes } from "../config"
import { brl, num } from "../utils"

const MARCOS = [
  { threshold: 10_000,     label: "Primeiro Salto",    sub: "R$10 mil"     },
  { threshold: 50_000,     label: "Tração Real",        sub: "R$50 mil"     },
  { threshold: 100_000,    label: "6 Dígitos",          sub: "R$100 mil"    },
  { threshold: 500_000,    label: "Meio Milhão",        sub: "R$500 mil"    },
  { threshold: 1_000_000,  label: "Primeiro Milhão",    sub: "R$1 milhão"   },
  { threshold: 10_000_000, label: "Empresa de Verdade", sub: "R$10 milhões" },
]

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
  return "bg-[#5009c4]/10 text-[#5009c4]"
}

function colBg(col: number): string {
  if (col === COL_PERDIDO)  return "#FF3B30"
  if (col === COL_ENTREGUE) return "#5009c4"
  if (col === COL_FECHADO)  return "#34C759"
  if (col === 0)            return "#C7C7CC"
  return "#FF9500" // cols 2-8: em produção
}

// ─── SVG Monthly Chart ────────────────────────────────────────────────────────

interface MonthlyDatum { label: string; year: number; month: number; volume: number; receita: number }

type MesItem = { tipo: "pedido" | "sobra"; numero?: string; nomeCliente: string; valor: number; data: string; coluna?: number }

function fmtItemData(s: string): string {
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  return s.split(",")[0] ?? s
}

function MonthlyChart({ data, onSelectMonth }: { data: MonthlyDatum[]; onSelectMonth?: (index: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null)

  const W = 560, H = 160
  const PAD_L = 52, PAD_B = 28, PAD_T = 12, PAD_R = 12
  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B

  const maxVal = Math.max(...data.map(d => Math.max(d.volume, d.receita)), 1)
  const yMax   = niceMax(maxVal)
  const steps  = 4

  const groupW = chartW / data.length
  const barGap = 2
  const barW   = Math.max(4, (groupW - barGap * 3) / 2)

  const hov = hovered !== null ? data[hovered] : null

  return (
    <div className="relative">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* Grid lines + Y labels */}
        {Array.from({ length: steps + 1 }).map((_, i) => {
          const val = (yMax / steps) * i
          const y   = PAD_T + chartH - (val / yMax) * chartH
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

        {/* X axis */}
        <line x1={PAD_L} y1={PAD_T + chartH} x2={W - PAD_R} y2={PAD_T + chartH}
          stroke="rgba(0,0,0,0.1)" strokeWidth={1} />

        {/* Bars */}
        {data.map((d, i) => {
          const gx    = PAD_L + i * groupW + barGap
          const cx    = gx + barW + barGap / 2
          const hVol  = yMax > 0 ? (d.volume / yMax) * chartH : 0
          const hRec  = yMax > 0 ? (d.receita / yMax) * chartH : 0
          const yVol  = PAD_T + chartH - hVol
          const yRec  = PAD_T + chartH - hRec
          const isHov = hovered === i

          return (
            <g key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelectMonth?.(i)}
              style={{ cursor: onSelectMonth ? "pointer" : undefined }}
            >
              {/* Invisible hit area */}
              <rect x={gx - barGap} y={PAD_T} width={barW * 2 + barGap * 3} height={chartH}
                fill="transparent" />
              {/* Hover column highlight */}
              {isHov && (
                <rect x={gx - barGap} y={PAD_T} width={barW * 2 + barGap * 3} height={chartH}
                  rx={3} fill="rgba(0,0,0,0.03)" />
              )}
              {/* Volume bar */}
              {hVol > 0.5 && (
                <rect x={gx} y={yVol} width={barW} height={hVol}
                  rx={2} fill={isHov ? "#93C5FD" : "rgba(147,197,253,0.5)"} />
              )}
              {/* Receita bar */}
              {hRec > 0.5 && (
                <rect x={gx + barW + barGap} y={yRec} width={barW} height={hRec}
                  rx={2} fill={isHov ? "#5009c4" : "rgba(80,9,196,0.75)"} />
              )}
              {/* X label */}
              <text x={cx} y={PAD_T + chartH + 16} textAnchor="middle"
                fontSize={8.5} fill={isHov ? "#1C1C1E" : "#8E8E93"} fontFamily="system-ui">
                {d.label}
              </text>
            </g>
          )
        })}

        {/* Legend */}
        <rect x={PAD_L} y={H - 9} width={8} height={8} rx={2} fill="rgba(147,197,253,0.6)" />
        <text x={PAD_L + 11} y={H - 2} fontSize={9} fill="#8E8E93" fontFamily="system-ui">Volume orçado</text>
        <rect x={PAD_L + 93} y={H - 9} width={8} height={8} rx={2} fill="#5009c4" />
        <text x={PAD_L + 104} y={H - 2} fontSize={9} fill="#8E8E93" fontFamily="system-ui">Receita confirmada</text>
      </svg>

      {/* Floating tooltip */}
      {hov && (
        <div className="absolute top-0 right-0 pointer-events-none bg-white border border-[rgba(0,0,0,0.08)] rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] px-3.5 py-2.5 min-w-[148px]">
          <p className="text-[11px] font-semibold text-[#1C1C1E] mb-2">{hov.label}</p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: "rgba(147,197,253,0.8)" }} />
                <span className="text-[10px] text-[#8E8E93]">Volume</span>
              </div>
              <span className="text-[11px] font-medium text-[#1C1C1E] tabular-nums">{brl(hov.volume)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-[#5009c4] shrink-0" />
                <span className="text-[10px] text-[#8E8E93]">Receita</span>
              </div>
              <span className="text-[11px] font-semibold text-[#5009c4] tabular-nums">{brl(hov.receita)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MesDetalheModal({
  mes, onClose,
}: {
  mes: { label: string; year: number; volumeItems: MesItem[]; receitaItems: MesItem[] }
  onClose: () => void
}) {
  const [aba, setAba] = useState<"volume" | "receita">("volume")
  const itens = aba === "volume" ? mes.volumeItems : mes.receitaItems
  const total = itens.reduce((s, i) => s + i.valor, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden" style={{ maxHeight: "80vh" }}>

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] shrink-0 flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-[#1C1C1E] text-[16px] leading-tight">{mes.label} de {mes.year}</p>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">{itens.length} item{itens.length !== 1 ? "s" : ""} · {brl(total)}</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-full bg-[rgba(116,116,128,0.1)] flex items-center justify-center text-[#8E8E93] hover:bg-[rgba(116,116,128,0.18)] transition-colors text-lg leading-none shrink-0">
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 px-6 pt-3 shrink-0">
          {([
            { id: "volume" as const,  label: "Volume orçado",       count: mes.volumeItems.length },
            { id: "receita" as const, label: "Receita confirmada",  count: mes.receitaItems.length },
          ]).map(t => (
            <button key={t.id} onClick={() => setAba(t.id)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors ${
                aba === t.id ? "bg-[#1C1C1E] text-white" : "text-[#8E8E93] hover:bg-[rgba(116,116,128,0.08)]"
              }`}>
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {itens.length === 0 ? (
            <p className="text-[12px] text-[#8E8E93] text-center py-8">Nenhum item neste mês.</p>
          ) : (
            <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-xl divide-y divide-[rgba(0,0,0,0.04)] overflow-hidden">
              {itens.map((item, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                  {item.numero && (
                    <span className="text-[9.5px] font-bold text-[#5009c4] bg-[#5009c4]/[0.08] px-1.5 py-0.5 rounded-md shrink-0">{item.numero}</span>
                  )}
                  {item.tipo === "sobra" && (
                    <span className="text-[9.5px] font-semibold text-[#FF9500] bg-[#FF9500]/[0.08] px-1.5 py-0.5 rounded-md shrink-0">Sobra</span>
                  )}
                  <p className="flex-1 text-[12px] text-[rgba(60,60,67,0.75)] truncate">{item.nomeCliente}</p>
                  <p className="text-[10.5px] text-[#8E8E93] shrink-0 tabular-nums">{fmtItemData(item.data)}</p>
                  <p className="font-semibold text-[#1C1C1E] text-[12.5px] tabular-nums shrink-0">{brl(item.valor)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[rgba(60,60,67,0.08)] shrink-0 flex justify-end">
          <button onClick={onClose}
            className="px-5 h-9 text-[12.5px] font-medium text-[#8E8E93] hover:bg-[rgba(116,116,128,0.06)] rounded-xl transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
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

// ─── Gerador de relatório mensal ─────────────────────────────────────────────

function gerarHtmlRelatorio({
  periodoLabel, dreRec, dreDesp,
  kpisData, topClientesData, materiaisData,
  aReceber, aReceberCount, vencidos, vencidosCount,
  dataGeracao,
}: {
  periodoLabel: string
  dreRec: number; dreDesp: number
  kpisData: { receita: number; fechamentos: number; ticket: number; conversao: number; emProducaoCount: number; pipelineGlobal: number; total: number; clientesUnicos: number }
  topClientesData: { nome: string; total: number; count: number }[]
  materiaisData: { nome: string; count: number; value: number }[]
  aReceber: number; aReceberCount: number
  vencidos: number; vencidosCount: number
  dataGeracao: string
}): string {
  const resultado = dreRec - dreDesp
  const kpiBoxes = [
    { label: "Receita confirmada",   val: brl(dreRec),                      sub: "no período"             },
    { label: "Fechamentos",          val: String(kpisData.fechamentos),     sub: `${kpisData.total} orçamentos` },
    { label: "Ticket médio",         val: brl(kpisData.ticket),             sub: "por negócio"            },
    { label: "Conversão",            val: `${num(kpisData.conversao, 1)}%`, sub: "dos orçamentos"         },
    { label: "Em produção",          val: String(kpisData.emProducaoCount), sub: brl(kpisData.pipelineGlobal) + " pipeline" },
  ].map(k => `
    <div class="kpi-box">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-val">${k.val}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join("")

  const clientesRows = topClientesData.slice(0, 6).map((c, i) => `
    <tr>
      <td class="muted" style="width:20px">${i + 1}</td>
      <td>${c.nome}</td>
      <td class="right">${brl(c.total)}</td>
      <td class="right muted">${c.count}×</td>
    </tr>`).join("") || `<tr><td colspan="4" class="muted" style="text-align:center;padding:12px">Sem dados</td></tr>`

  const matRows = materiaisData.slice(0, 6).map(m => `
    <tr>
      <td>${m.nome}</td>
      <td class="right">${m.count} pedido${m.count !== 1 ? "s" : ""}</td>
      <td class="right muted">${brl(m.value)}</td>
    </tr>`).join("") || `<tr><td colspan="3" class="muted" style="text-align:center;padding:12px">Sem dados</td></tr>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório · ${periodoLabel}</title>
<style>
  @page { margin: 18mm 16mm; size: A4 portrait; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; font-size: 10px; color: #111; line-height: 1.45; }

  .header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 10px; border-bottom: 2px solid #111; margin-bottom: 16px; }
  .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.04em; }
  .header-right { text-align: right; }
  .period { font-size: 13px; font-weight: 700; }
  .gen-date { font-size: 8.5px; color: #888; margin-top: 2px; }

  h2 { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 7px; }
  section { margin-bottom: 15px; }

  .dre { background: #f7f7f7; border-radius: 6px; padding: 11px 14px; }
  .dre-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px; }
  .dre-sep { border-top: 1px solid #ddd; margin: 7px 0 5px; }
  .dre-total { display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; }
  .green { color: #166534; }
  .red   { color: #991b1b; }
  .tn    { font-variant-numeric: tabular-nums; }

  .kpi-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 6px; }
  .kpi-box  { border: 1px solid #e5e5e5; border-radius: 6px; padding: 8px 10px; }
  .kpi-label { font-size: 7.5px; color: #888; text-transform: uppercase; letter-spacing: 0.06em; }
  .kpi-val  { font-size: 16px; font-weight: 700; margin: 3px 0 2px; font-variant-numeric: tabular-nums; }
  .kpi-sub  { font-size: 7.5px; color: #aaa; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { text-align: left; padding: 4px 8px; background: #f3f3f3; font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; font-weight: 700; }
  td { padding: 5px 8px; border-bottom: 1px solid #f0f0f0; }
  td.right { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  td.muted { color: #888; }

  .fin-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
  .fin-box  { border-radius: 6px; padding: 10px 12px; }
  .fin-green { background: #f0fdf4; border: 1px solid #bbf7d0; }
  .fin-amber { background: #fffbeb; border: 1px solid #fde68a; }
  .fin-red   { background: #fef2f2; border: 1px solid #fecaca; }
  .fin-label { font-size: 7.5px; color: #888; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 5px; }
  .fin-val   { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .fin-green .fin-val { color: #166534; }
  .fin-amber .fin-val { color: #92400e; }
  .fin-red   .fin-val { color: #991b1b; }
  .fin-sub   { font-size: 8px; margin-top: 3px; }
  .fin-green .fin-sub { color: #4ade80; }
  .fin-amber .fin-sub { color: #f59e0b; }
  .fin-red   .fin-sub { color: #f87171; }

  .footer { border-top: 1px solid #e5e5e5; margin-top: 16px; padding-top: 7px; font-size: 8px; color: #aaa; display: flex; justify-content: space-between; }
</style>
</head>
<body>

<div class="header">
  <div class="brand">Enyla.</div>
  <div class="header-right">
    <div class="period">Relatório · ${periodoLabel}</div>
    <div class="gen-date">Gerado em ${dataGeracao}</div>
  </div>
</div>

<section>
  <h2>Resultado do Período</h2>
  <div class="dre">
    <div class="dre-row"><span>Receita confirmada</span><span class="green tn">${brl(dreRec)}</span></div>
    <div class="dre-row"><span>Despesas pagas</span><span class="red tn">(${brl(dreDesp)})</span></div>
    <div class="dre-sep"></div>
    <div class="dre-total">
      <span>Resultado líquido</span>
      <span class="${resultado >= 0 ? "green" : "red"} tn">${brl(resultado)}</span>
    </div>
  </div>
</section>

<section>
  <h2>Indicadores Operacionais</h2>
  <div class="kpi-grid">${kpiBoxes}</div>
</section>

<section class="two-col">
  <div>
    <h2>Top Clientes</h2>
    <table>
      <thead><tr><th>#</th><th>Cliente</th><th style="text-align:right">Total</th><th style="text-align:right">Pedidos</th></tr></thead>
      <tbody>${clientesRows}</tbody>
    </table>
  </div>
  <div>
    <h2>Materiais</h2>
    <table>
      <thead><tr><th>Material</th><th style="text-align:right">Qtd</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>${matRows}</tbody>
    </table>
  </div>
</section>

<section>
  <h2>Situação Financeira (Global)</h2>
  <div class="fin-grid">
    <div class="fin-box fin-green">
      <div class="fin-label">Recebido no período</div>
      <div class="fin-val">${brl(dreRec)}</div>
      <div class="fin-sub">receita confirmada</div>
    </div>
    <div class="fin-box fin-amber">
      <div class="fin-label">A receber</div>
      <div class="fin-val">${brl(aReceber)}</div>
      <div class="fin-sub">${aReceberCount} título${aReceberCount !== 1 ? "s" : ""} pendente${aReceberCount !== 1 ? "s" : ""}</div>
    </div>
    <div class="fin-box fin-red">
      <div class="fin-label">Em atraso</div>
      <div class="fin-val">${brl(vencidos)}</div>
      <div class="fin-sub">${vencidosCount} título${vencidosCount !== 1 ? "s" : ""} vencido${vencidosCount !== 1 ? "s" : ""}</div>
    </div>
  </div>
</section>

<div class="footer">
  <span>Enyla</span>
  <span>${dataGeracao}</span>
</div>

</body>
</html>`
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardView({ historico, kanban, propostasCustom: _propostasCustom, clientes: _clientes, config: _config, lancamentos = [] }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("mes")
  const [dataInicio, setDataInicio] = useState("")
  const [dataFim, setDataFim]   = useState("")
  const [showMenu, setShowMenu]       = useState(false)
  const [showAlertas, setShowAlertas] = useState(false)
  const menuRef    = useRef<HTMLDivElement>(null)
  const alertasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current    && !menuRef.current.contains(e.target as Node))    setShowMenu(false)
      if (alertasRef.current && !alertasRef.current.contains(e.target as Node)) setShowAlertas(false)
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
      months.push({ label: MESES_PT[d.getMonth()], year: d.getFullYear(), month: d.getMonth(), volume: 0, receita: 0 })
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

  // ── Detalhe do mês selecionado no gráfico ────────────────────────────────────
  const [modalMesIdx, setModalMesIdx] = useState<number | null>(null)

  const mesSelecionado = useMemo(() => {
    if (modalMesIdx === null) return null
    const mes = monthlyData[modalMesIdx]
    if (!mes) return null

    const volumeItems: MesItem[] = kanban
      .filter(c => {
        const cd = parseDataBr(c.data)
        return cd.getFullYear() === mes.year && cd.getMonth() === mes.month
      })
      .map(c => ({ tipo: "pedido" as const, numero: c.numero, nomeCliente: c.nomeCliente, valor: c.preco, data: c.data, coluna: c.coluna }))
      .sort((a, b) => b.valor - a.valor)

    const fechadosCards: MesItem[] = kanban
      .filter(c => c.coluna !== 0 && c.coluna !== COL_PERDIDO)
      .filter(c => {
        const cd = parseDataBr(c.dataFechamento ?? c.data)
        return cd.getFullYear() === mes.year && cd.getMonth() === mes.month
      })
      .map(c => ({ tipo: "pedido" as const, numero: c.numero, nomeCliente: c.nomeCliente, valor: c.preco, data: c.dataFechamento ?? c.data, coluna: c.coluna }))

    const sobrasItems: MesItem[] = lancamentos
      .filter(l => l.categoria === "sobra" && l.tipo === "receita")
      .filter(l => {
        const ref = l.dataPagamento || l.dataVencimento
        if (!ref) return false
        const d = new Date(ref + "T12:00:00")
        return d.getFullYear() === mes.year && d.getMonth() === mes.month
      })
      .map(l => ({ tipo: "sobra" as const, nomeCliente: l.nomeCliente ?? l.descricao, valor: l.valor, data: l.dataPagamento || l.dataVencimento || "" }))

    return {
      label: mes.label,
      year: mes.year,
      volumeItems,
      receitaItems: [...fechadosCards, ...sobrasItems].sort((a, b) => b.valor - a.valor),
    }
  }, [modalMesIdx, monthlyData, kanban, lancamentos])

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
    const colors = ["#5009c4", "#34C759", "#FF3B30", "#AF52DE", "#FF9500", "#5AC8FA"]
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

  // ── Alertas ativos ───────────────────────────────────────────────────────────
  const alertas = useMemo(() => {
    const hj = new Date().toISOString().split("T")[0]
    const amanha = (() => {
      const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]
    })()

    // Link PIX vencido e não pago deixa de ser receita pendente (o cliente não vai mais pagar aquele link específico)
    const vencidos = lancamentos.filter(l =>
      l.tipo === "receita" && l.status !== "pago" && l.categoria !== "sobra" && l.dataVencimento < hj &&
      l.categoria !== "pix_link"
    )
    const vencendoHoje = lancamentos.filter(l =>
      l.tipo === "receita" && l.status !== "pago" && l.categoria !== "sobra" &&
      (l.dataVencimento === hj || l.dataVencimento === amanha)
    )
    const parados = kanban.filter(c => {
      if (c.coluna < 2 || c.coluna > 8) return false
      const ref = c.dataFechamento
      if (!ref) return false
      return Math.floor((Date.now() - new Date(ref + "T00:00:00").getTime()) / 86_400_000) >= 10
    })
    const semRegistro = kanban.filter(c => {
      if (c.coluna === 0 || c.coluna === COL_PERDIDO) return false
      if (!c.dataFechamento) return false
      if (Math.floor((Date.now() - new Date(c.dataFechamento + "T00:00:00").getTime()) / 86_400_000) > 45) return false
      return !lancamentos.some(l => l.cardId === c.id)
    })
    return { vencidos, vencendoHoje, parados, semRegistro }
  }, [lancamentos, kanban])

  // ── Periodo label ────────────────────────────────────────────────────────────
  const periodoLabel = (p: Periodo) => PERIODO_LABEL[p] ?? p

  // ── Relatório PDF ────────────────────────────────────────────────────────────
  function abrirRelatorio() {
    const hj = new Date().toISOString().split("T")[0]
    const { from, to } = periodBounds
    const inPer = (l: LancamentoFinanceiro) => {
      const ref = l.dataPagamento || l.dataVencimento
      if (!ref) return false
      const d = new Date(ref + "T12:00:00")
      if (from && d < from) return false
      if (to   && d > to)   return false
      return true
    }
    const dreRec  = lancamentos.filter(l => l.tipo === "receita" && l.status === "pago" && inPer(l)).reduce((s, l) => s + l.valor, 0)
    const dreDesp = lancamentos.filter(l => l.tipo === "despesa" && l.status === "pago" && inPer(l)).reduce((s, l) => s + l.valor, 0)
    const pendentes   = lancamentos.filter(l =>
      l.tipo === "receita" && l.status !== "pago" && l.categoria !== "sobra" &&
      !(l.categoria === "pix_link" && l.dataVencimento < hj)
    )
    const vencidosArr = pendentes.filter(l => l.dataVencimento < hj)
    const html = gerarHtmlRelatorio({
      periodoLabel: periodoLabel(periodo),
      dreRec, dreDesp,
      kpisData: kpis,
      topClientesData: topClientes.clientes,
      materiaisData: materiais.materiais,
      aReceber:      pendentes.reduce((s, l) => s + l.valor, 0),
      aReceberCount: pendentes.length,
      vencidos:      vencidosArr.reduce((s, l) => s + l.valor, 0),
      vencidosCount: vencidosArr.length,
      dataGeracao:   new Date().toLocaleString("pt-BR"),
    })
    const w = window.open("", "_blank")
    if (!w) return
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

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
    <>
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
                  ? "bg-[#5009c4] text-white shadow-sm"
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
                            ? "text-[#5009c4] font-semibold bg-[#5009c4]/5"
                            : "text-[#1C1C1E] hover:bg-[rgba(0,0,0,0.04)]"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${periodo === id ? "bg-[#5009c4]" : "bg-transparent"}`} />
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
              className="h-8 border border-[rgba(0,0,0,0.12)] rounded-lg px-2 text-[11.5px] text-[#1C1C1E] bg-white focus:outline-none focus:ring-2 focus:ring-[#5009c4]/25 focus:border-[#5009c4]" />
            <span className="text-[#8E8E93] text-xs">→</span>
            <input type="date" value={dataFim}
              onChange={e => { setDataFim(e.target.value); setPeriodo("custom") }}
              className="h-8 border border-[rgba(0,0,0,0.12)] rounded-lg px-2 text-[11.5px] text-[#1C1C1E] bg-white focus:outline-none focus:ring-2 focus:ring-[#5009c4]/25 focus:border-[#5009c4]" />
          </div>

          <button
            onClick={abrirRelatorio}
            className="flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium bg-white border border-[rgba(0,0,0,0.12)] text-[#1C1C1E] hover:bg-[rgba(0,0,0,0.04)] transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.04)] shrink-0"
          >
            <svg className="w-3.5 h-3.5 text-[#8E8E93]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Relatório PDF
          </button>

          <div className="ml-auto flex items-center gap-2">
            {/* Alert bell */}
            {(() => {
              const total = alertas.vencidos.length + alertas.vencendoHoje.length + alertas.parados.length + alertas.semRegistro.length
              if (total === 0) return null
              const cor = alertas.vencidos.length > 0 ? "#FF3B30" : "#FF9500"
              const hj  = new Date().toISOString().split("T")[0]
              return (
                <div className="relative" ref={alertasRef}>
                  <button
                    onClick={() => setShowAlertas(v => !v)}
                    className="relative w-8 h-8 flex items-center justify-center bg-white border border-[rgba(0,0,0,0.12)] rounded-full hover:bg-[rgba(0,0,0,0.03)] transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                  >
                    <svg className="w-4 h-4 text-[#8E8E93]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                    </svg>
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center px-1 leading-none"
                      style={{ background: cor }}>
                      {total}
                    </span>
                  </button>

                  {showAlertas && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-[rgba(0,0,0,0.1)] shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-50 overflow-hidden">
                      {/* Header */}
                      <div className="px-4 py-3 border-b border-[rgba(60,60,67,0.08)] flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-[13px] text-[#1C1C1E]">Alertas</p>
                          <p className="text-[10px] text-[#8E8E93] mt-0.5">{total} item{total !== 1 ? "s" : ""} precisando atenção</p>
                        </div>
                        <button onClick={() => setShowAlertas(false)}
                          className="w-6 h-6 rounded-full bg-[rgba(116,116,128,0.1)] flex items-center justify-center text-[#8E8E93] hover:bg-[rgba(116,116,128,0.18)] text-base leading-none transition-colors">
                          ×
                        </button>
                      </div>

                      <div className="max-h-[60vh] overflow-y-auto divide-y divide-[rgba(60,60,67,0.06)]">

                        {/* Vencidos */}
                        {alertas.vencidos.length > 0 && (
                          <div>
                            <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] shrink-0" />
                              <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#FF3B30] flex-1">Vencidos</p>
                              <p className="text-[9.5px] font-semibold text-[#FF3B30] tabular-nums">
                                {brl(alertas.vencidos.reduce((s, l) => s + l.valor, 0))}
                              </p>
                            </div>
                            {alertas.vencidos.slice(0, 5).map(l => (
                              <div key={l.id} className="px-4 py-2 flex items-start gap-3 hover:bg-[rgba(0,0,0,0.02)] transition-colors">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11.5px] font-medium text-[#1C1C1E] truncate">{l.descricao}</p>
                                  <p className="text-[10px] text-[#8E8E93]">{l.nomeCliente ?? "—"} · venceu {l.dataVencimento}</p>
                                </div>
                                <p className="text-[11px] font-bold text-[#FF3B30] tabular-nums shrink-0">{brl(l.valor)}</p>
                              </div>
                            ))}
                            {alertas.vencidos.length > 5 && (
                              <p className="px-4 pb-2.5 text-[10px] text-[#8E8E93]">+{alertas.vencidos.length - 5} mais</p>
                            )}
                          </div>
                        )}

                        {/* Vencem hoje/amanhã */}
                        {alertas.vencendoHoje.length > 0 && (
                          <div>
                            <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#FF9500] shrink-0" />
                              <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#FF9500] flex-1">Vencem hoje ou amanhã</p>
                              <p className="text-[9.5px] font-semibold text-[#FF9500] tabular-nums">
                                {brl(alertas.vencendoHoje.reduce((s, l) => s + l.valor, 0))}
                              </p>
                            </div>
                            {alertas.vencendoHoje.slice(0, 5).map(l => (
                              <div key={l.id} className="px-4 py-2 flex items-start gap-3 hover:bg-[rgba(0,0,0,0.02)] transition-colors">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11.5px] font-medium text-[#1C1C1E] truncate">{l.descricao}</p>
                                  <p className="text-[10px] text-[#8E8E93]">
                                    {l.nomeCliente ?? "—"} · {l.dataVencimento === hj ? "vence hoje" : "vence amanhã"}
                                  </p>
                                </div>
                                <p className="text-[11px] font-bold text-[#FF9500] tabular-nums shrink-0">{brl(l.valor)}</p>
                              </div>
                            ))}
                            {alertas.vencendoHoje.length > 5 && (
                              <p className="px-4 pb-2.5 text-[10px] text-[#8E8E93]">+{alertas.vencendoHoje.length - 5} mais</p>
                            )}
                          </div>
                        )}

                        {/* Parados em produção */}
                        {alertas.parados.length > 0 && (
                          <div>
                            <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#FF9500] shrink-0" />
                              <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#FF9500] flex-1">Parados em produção</p>
                            </div>
                            {alertas.parados.slice(0, 5).map(c => {
                              const dias = Math.floor((Date.now() - new Date(c.dataFechamento! + "T00:00:00").getTime()) / 86_400_000)
                              return (
                                <div key={c.id} className="px-4 py-2 flex items-start gap-3 hover:bg-[rgba(0,0,0,0.02)] transition-colors">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11.5px] font-medium text-[#1C1C1E] truncate">
                                      {c.numero ? `#${c.numero} · ` : ""}{c.nomeCliente}
                                    </p>
                                    <p className="text-[10px] text-[#8E8E93]">{COLUNAS_KANBAN[c.coluna]} · {dias} dias</p>
                                  </div>
                                  <p className="text-[11px] font-semibold text-[#8E8E93] tabular-nums shrink-0">{brl(c.preco)}</p>
                                </div>
                              )
                            })}
                            {alertas.parados.length > 5 && (
                              <p className="px-4 pb-2.5 text-[10px] text-[#8E8E93]">+{alertas.parados.length - 5} mais</p>
                            )}
                          </div>
                        )}

                        {/* Sem lançamento */}
                        {alertas.semRegistro.length > 0 && (
                          <div>
                            <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#8E8E93] shrink-0" />
                              <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#8E8E93] flex-1">Sem lançamento financeiro</p>
                              <p className="text-[9.5px] font-semibold text-[#8E8E93] tabular-nums">
                                {brl(alertas.semRegistro.reduce((s, c) => s + c.preco, 0))}
                              </p>
                            </div>
                            {alertas.semRegistro.slice(0, 5).map(c => (
                              <div key={c.id} className="px-4 py-2 flex items-start gap-3 hover:bg-[rgba(0,0,0,0.02)] transition-colors">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11.5px] font-medium text-[#1C1C1E] truncate">
                                    {c.numero ? `#${c.numero} · ` : ""}{c.nomeCliente}
                                  </p>
                                  <p className="text-[10px] text-[#8E8E93]">Fechado {c.dataFechamento} · {COLUNAS_KANBAN[c.coluna]}</p>
                                </div>
                                <p className="text-[11px] font-semibold text-[#8E8E93] tabular-nums shrink-0">{brl(c.preco)}</p>
                              </div>
                            ))}
                            {alertas.semRegistro.length > 5 && (
                              <p className="px-4 pb-2.5 text-[10px] text-[#8E8E93]">+{alertas.semRegistro.length - 5} mais</p>
                            )}
                          </div>
                        )}

                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            <div className="text-[11px] text-[#8E8E93] font-medium tabular-nums bg-white border border-[rgba(0,0,0,0.12)] rounded-full px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              {filteredCards.length} orçamento{filteredCards.length !== 1 ? "s" : ""} no período
            </div>
          </div>
        </div>
      </div>

      {/* ── Próximo marco ──────────────────────────────────────────────────── */}
      {(() => {
        const totalFaturado = (_config.baselineFaturamento ?? 0)
          + kanban.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO).reduce((s, c) => s + c.preco, 0)
        const proximoMarco = MARCOS.find(m => m.threshold > totalFaturado) ?? null
        const anteriorMarco = proximoMarco
          ? (MARCOS[MARCOS.indexOf(proximoMarco) - 1] ?? null)
          : MARCOS[MARCOS.length - 1]
        const base = anteriorMarco?.threshold ?? 0
        const topo = proximoMarco?.threshold ?? totalFaturado
        const pct = topo > base ? Math.min((totalFaturado - base) / (topo - base), 1) : 1
        const pctGlobal = proximoMarco ? Math.min(totalFaturado / proximoMarco.threshold, 1) : 1

        return (
          <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] px-5 py-4">
            <div className="flex items-center gap-5">
              {/* Left: labels */}
              <div className="shrink-0">
                <p className="text-[10.5px] font-medium text-[#8E8E93] mb-1">
                  {proximoMarco ? "Próximo marco" : "Faturamento total"}
                </p>
                <p className="text-[15px] font-semibold text-[#1C1C1E] leading-snug">
                  {proximoMarco ? proximoMarco.label : "Todos os marcos conquistados!"}
                </p>
                {proximoMarco && (
                  <p className="text-[11px] tabular-nums font-medium mt-0.5" style={{ color: "#FF9500" }}>
                    {proximoMarco.sub}
                  </p>
                )}
              </div>

              {/* Center: bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  {anteriorMarco && (
                    <span className="text-[9.5px] text-[#8E8E93] tabular-nums">{anteriorMarco.sub}</span>
                  )}
                  <span className="text-[9.5px] text-[#8E8E93] tabular-nums ml-auto">
                    {brl(totalFaturado)}
                  </span>
                  {proximoMarco && (
                    <span className="text-[9.5px] text-[#8E8E93] tabular-nums ml-2">{proximoMarco.sub}</span>
                  )}
                </div>
                <div className="relative h-2 rounded-full overflow-hidden bg-[rgba(0,0,0,0.06)]">
                  <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                    style={{ width: `${pct * 100}%`, background: proximoMarco ? "#FF9500" : "#34C759" }} />
                  {/* Current position marker */}
                  <div className="absolute inset-y-0 flex items-center transition-all duration-700"
                    style={{ left: `${Math.max(pct * 100 - 0.5, 0)}%` }}>
                    <div className="w-2 h-2 rounded-full bg-white shadow-md border-2"
                      style={{ borderColor: proximoMarco ? "#FF9500" : "#34C759" }} />
                  </div>
                </div>
              </div>

              {/* Right: percentage + falta */}
              <div className="shrink-0 text-right">
                <p className="text-[22px] font-semibold tabular-nums leading-none"
                  style={{ color: proximoMarco ? "#FF9500" : "#34C759" }}>
                  {Math.round(pctGlobal * 100)}%
                </p>
                {proximoMarco && (
                  <p className="text-[10px] text-[#8E8E93] mt-1 tabular-nums">
                    Faltam {brl(proximoMarco.threshold - totalFaturado)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })()}

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
          <MonthlyChart data={monthlyData} onSelectMonth={setModalMesIdx} />
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
                      style={{ background: "#5009c4" }}>
                      {c.nome[0]?.toUpperCase() ?? "?"}
                    </div>
                    <p className="text-[12px] font-medium text-[#1C1C1E] truncate flex-1">{c.nome}</p>
                    <p className="text-[11px] font-bold text-[#1C1C1E] tabular-nums">{brl(c.total)}</p>
                    <p className="text-[10px] text-[#8E8E93] tabular-nums shrink-0">{c.count}×</p>
                  </div>
                  <div className="ml-8 h-1.5 bg-[rgba(116,116,128,0.08)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${(c.total / topClientes.maxTotal) * 100}%`, background: "#5009c4" }} />
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
                          style={{ background: "#5009c4" }}>
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
    {mesSelecionado && (
      <MesDetalheModal mes={mesSelecionado} onClose={() => setModalMesIdx(null)} />
    )}
    </>
  )
}
