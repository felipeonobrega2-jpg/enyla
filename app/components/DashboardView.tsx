"use client"

import React, { useMemo, useRef, useState, useEffect } from "react"
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart,
  BarChart2, Target, AlertTriangle, Users,
} from "lucide-react"
import {
  FormData, Calculo, PropostaCustom, KanbanCard, Cliente,
  COLUNAS_KANBAN, COL_FECHADO, COL_ENTREGUE, COL_PERDIDO, COL_HOT, LancamentoFinanceiro,
} from "../types"
import { Configuracoes } from "../config"
import { brl, num } from "../utils"
import { dreGerencial } from "../lib/metrics"

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
  isDark?: boolean
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

function countVendas(cards: KanbanCard[]): number {
  const sold = cards.filter(c => !c.isTerceirizado)
  const loteIds = new Set(sold.filter(c => c.loteId).map(c => c.loteId!))
  return loteIds.size + sold.filter(c => !c.loteId).length
}

function colColor(col: number): string {
  if (col === COL_PERDIDO) return "bg-[#d33a3c]/10 text-[#d33a3c]"
  if (col === COL_ENTREGUE) return "bg-[#009351]/10 text-[#009351]"
  if (col === COL_FECHADO) return "bg-[#009351]/10 text-[#009351]"
  return "bg-[#8456e8]/10 text-[#8456e8]"
}

function colBg(col: number): string {
  if (col === COL_PERDIDO)  return "#d33a3c"
  if (col === COL_ENTREGUE) return "#8456e8"
  if (col === COL_FECHADO)  return "#009351"
  if (col === 0)            return "#C7C7CC"
  return "#c57800" // cols 2-8: em produção
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

  const BARS_H = 180
  const maxVal = Math.max(...data.map(d => Math.max(d.volume, d.receita)), 1)
  const yMax   = niceMax(maxVal)
  const yLabels = [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0]

  const hov = hovered !== null ? data[hovered] : null

  return (
    <div>
      <div style={{ display: "flex", gap: 14 }}>
        {/* Y-axis labels */}
        <div style={{
          height: BARS_H,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          color: "var(--text-faint)",
          textAlign: "right",
          userSelect: "none",
          flexShrink: 0,
        }}>
          {yLabels.map((v, i) => <span key={i}>{fmtShort(v)}</span>)}
        </div>

        {/* Chart area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
          {/* Bars row */}
          <div style={{
            height: BARS_H,
            display: "flex",
            alignItems: "flex-end",
            gap: 10,
            borderLeft: "1px solid var(--border)",
            paddingLeft: 10,
            overflow: "visible",
          }}>
            {data.map((d, i) => {
              const hVol  = yMax > 0 && d.volume  > 0 ? Math.max(2, Math.round((d.volume  / yMax) * BARS_H)) : 0
              const hRec  = yMax > 0 && d.receita > 0 ? Math.max(2, Math.round((d.receita / yMax) * BARS_H)) : 0
              const isHov = hovered === i
              return (
                <div
                  key={i}
                  style={{ flex: "1 1 0", display: "flex", justifyContent: "center", alignItems: "flex-end", cursor: onSelectMonth ? "pointer" : undefined }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onSelectMonth?.(i)}
                >
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 3 }}>
                    <div style={{
                      width: 9, height: hVol || 2,
                      background: isHov ? "#c9bcf8" : "#e3d9ff",
                      borderRadius: "3px 3px 0 0",
                      opacity: hVol === 0 ? 0 : 1,
                      transition: "background 0.1s",
                    }} />
                    <div style={{
                      width: 9, height: hRec || 2,
                      background: "#8456e8",
                      borderRadius: "3px 3px 0 0",
                      opacity: isHov ? 0.82 : hRec === 0 ? 0 : 1,
                      transition: "opacity 0.1s",
                    }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* X labels row */}
          <div style={{ display: "flex", gap: 10, paddingLeft: 10, marginTop: 5 }}>
            {data.map((d, i) => (
              <div key={i} style={{
                flex: "1 1 0",
                textAlign: "center",
                fontSize: 11,
                fontFamily: "Manrope, sans-serif",
                color: hovered === i ? "#8456e8" : "var(--text-faint)",
                transition: "color 0.1s",
                userSelect: "none",
              }}>
                {d.label}
              </div>
            ))}
          </div>

          {/* Tooltip */}
          {hov && (
            <div style={{
              position: "absolute",
              top: 0,
              right: 0,
              pointerEvents: "none",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
              padding: "10px 14px",
              minWidth: 148,
              zIndex: 10,
            }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-main)", marginBottom: 8 }}>{hov.label}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: "#e3d9ff", display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: "var(--text-faint)" }}>Volume</span>
                  </div>
                  <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 500, color: "var(--text-main)" }}>{brl(hov.volume)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: "#8456e8", display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: "var(--text-faint)" }}>Receita</span>
                  </div>
                  <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 600, color: "#8456e8" }}>{brl(hov.receita)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 18, marginTop: 14, fontSize: 12, color: "var(--text-faint)", fontFamily: "Manrope, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#e3d9ff", display: "inline-block", flexShrink: 0 }} />
          <span>Volume orçado</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#8456e8", display: "inline-block", flexShrink: 0 }} />
          <span>Receita confirmada</span>
        </div>
      </div>
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
            <p className="font-bold text-[#191625] text-[16px] leading-tight">{mes.label} de {mes.year}</p>
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
                aba === t.id ? "bg-[#0b0914] text-white" : "text-[#8E8E93] hover:bg-[rgba(116,116,128,0.08)]"
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
                    <span className="text-[9.5px] font-bold text-[#8456e8] bg-[#8456e8]/[0.08] px-1.5 py-0.5 rounded-md shrink-0">{item.numero}</span>
                  )}
                  {item.tipo === "sobra" && (
                    <span className="text-[9.5px] font-semibold text-[#c57800] bg-[#c57800]/[0.08] px-1.5 py-0.5 rounded-md shrink-0">Sobra</span>
                  )}
                  <p className="flex-1 text-[12px] text-[#5e5c68] truncate">{item.nomeCliente}</p>
                  <p className="text-[10.5px] text-[#8E8E93] shrink-0 tabular-nums">{fmtItemData(item.data)}</p>
                  <p className="font-semibold text-[#191625] text-[12.5px] tabular-nums shrink-0">{brl(item.valor)}</p>
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
  kpisData: { receita: number; vendas: number; ticket: number; conversao: number; pipelineGlobal: number; total: number; clientesUnicos: number }
  topClientesData: { nome: string; total: number; count: number }[]
  materiaisData: { nome: string; count: number; value: number }[]
  aReceber: number; aReceberCount: number
  vencidos: number; vencidosCount: number
  dataGeracao: string
}): string {
  const resultado = dreRec - dreDesp
  const kpiBoxes = [
    { label: "Receita confirmada",   val: brl(dreRec),                      sub: "no período"             },
    { label: "Vendas",               val: String(kpisData.vendas),          sub: `${kpisData.total} orçamentos` },
    { label: "Ticket médio",         val: brl(kpisData.ticket),             sub: "por negócio"            },
    { label: "Conversão",            val: `${num(kpisData.conversao, 1)}%`, sub: "dos orçamentos"         },
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

// ─── Funil de Vendas ─────────────────────────────────────────────────────────

function FunilVendas({
  leads, alcance, cliques, leadsQualificados, orcamentos, vendas, loading, isDark,
}: {
  leads: number | null         // Meta: conversas iniciadas
  alcance: number | null
  cliques: number | null
  leadsQualificados: number    // CRM: contatos únicos
  orcamentos: number
  vendas: number
  loading: boolean
  isDark: boolean
}) {
  function trapezoid(topW: number, botW: number) {
    const l = (100 - topW) / 2, r = (100 + topW) / 2
    const bl = (100 - botW) / 2, br = (100 + botW) / 2
    return `polygon(${l}% 0%, ${r}% 0%, ${br}% 100%, ${bl}% 100%)`
  }

  const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val))

  const w0 = 100
  const w1 = alcance && alcance > 0 && cliques != null
    ? clamp(Math.round((cliques / alcance) * 100), 56, 100) : 80
  const w2 = cliques && cliques > 0 && leads != null
    ? clamp(Math.round((leads / cliques) * w1), 40, w1) : Math.round(w1 * 0.55)
  const w3 = leads && leads > 0
    ? clamp(Math.round((leadsQualificados / leads) * w2), 32, w2) : Math.round(w2 * 0.65)
  const w4 = leadsQualificados > 0
    ? clamp(Math.round((orcamentos / leadsQualificados) * w3), 22, w3) : Math.round(w3 * 0.6)
  const w5 = orcamentos > 0
    ? clamp(Math.round((vendas / orcamentos) * w4), 12, w4) : Math.round(w4 * 0.5)

  const stages = [
    {
      key: "alcance", label: "Alcance",
      count: alcance as number | null, isLoading: loading,
      topW: w0, botW: w1,
      bg: isDark ? "rgba(142,142,147,0.20)" : "rgba(142,142,147,0.14)",
      numColor: "var(--text-sub)",
    },
    {
      key: "cliques", label: "Cliques",
      count: cliques as number | null, isLoading: loading,
      topW: w1, botW: w2,
      bg: isDark ? "rgba(132,86,232,0.22)" : "rgba(132,86,232,0.14)",
      numColor: "#8456e8",
    },
    {
      key: "conversas", label: "Conversas",
      count: leads as number | null, isLoading: loading,
      topW: w2, botW: w3,
      bg: isDark ? "rgba(132,86,232,0.40)" : "rgba(132,86,232,0.28)",
      numColor: "#8456e8",
    },
    {
      key: "leads", label: "Leads",
      count: leadsQualificados as number | null, isLoading: false,
      topW: w3, botW: w4,
      bg: "#8456e8",
      numColor: "#ffffff",
    },
    {
      key: "orcamentos", label: "Orçamentos",
      count: orcamentos as number | null, isLoading: false,
      topW: w4, botW: w5,
      bg: isDark ? "rgba(132,86,232,0.85)" : "#6d3fc4",
      numColor: "#ffffff",
    },
    {
      key: "vendas", label: "Novos clientes",
      count: vendas as number | null, isLoading: false,
      topW: w5, botW: Math.max(10, w5 - 8),
      bg: "#009351",
      numColor: "#ffffff",
    },
  ]

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, userSelect: "none" }}>
      {stages.map((s, i) => {
        const prev    = stages[i - 1]
        const prevCnt = prev?.count
        const convPct = prevCnt != null && prevCnt > 0 && s.count != null
          ? Math.round((s.count / prevCnt) * 100) : null

        return (
          <div key={s.key}>
            {/* Label + pct ABOVE the bar — always outside clip-path, never cut */}
            <div style={{
              display: "flex", alignItems: "baseline", justifyContent: "center",
              gap: 5, marginTop: i === 0 ? 0 : 4, marginBottom: 2,
            }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-sub)", letterSpacing: "0.1px" }}>
                {s.label}
              </span>
              {convPct !== null && (
                <span style={{ fontSize: 9.5, fontWeight: 500, color: "var(--text-faint)" }}>
                  · {convPct}%
                </span>
              )}
            </div>

            {/* Trapezoid: only the bg div gets clip-path; number is centered and safe */}
            <div style={{ position: "relative", height: 36 }}>
              <div style={{
                position: "absolute", inset: 0,
                clipPath: trapezoid(s.topW, s.botW),
                background: s.bg,
                transition: "clip-path 0.5s ease",
              }} />
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{
                  fontSize: 17, fontWeight: 800, color: s.numColor,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}>
                  {s.isLoading ? "…" : s.count != null ? s.count.toLocaleString("pt-BR") : "—"}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────

function KpiCard({ icon, iconBg, iconColor, label, value, sub, subColor, valueColor, highlight }: {
  icon: React.ReactNode; iconBg: string; iconColor: string
  label: string; value: string; sub?: string
  subColor?: string; valueColor?: string; highlight?: boolean
}) {
  return (
    <div className={`rounded-2xl px-5 py-4 ${highlight ? "ring-2 ring-[rgba(132,86,232,0.18)]" : ""}`}
      style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: iconBg, color: iconColor }}>
          {icon}
        </div>
        <p className="text-[10.5px] uppercase tracking-wider font-semibold leading-tight" style={{ color: "var(--text-faint)" }}>{label}</p>
      </div>
      <p className="text-[22px] font-bold tabular-nums tracking-tight leading-none" style={{ color: valueColor ?? "var(--text-main)" }}>{value}</p>
      {sub && <p className="text-[11px] mt-1.5" style={{ color: subColor ?? "var(--text-faint)" }}>{sub}</p>}
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardView({ historico, kanban, propostasCustom: _propostasCustom, clientes: _clientes, config: _config, lancamentos = [], isDark = false }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("mes")
  const [dataInicio, setDataInicio] = useState("")
  const [dataFim, setDataFim]   = useState("")
  const [showMenu, setShowMenu]       = useState(false)
  const [showAlertas, setShowAlertas] = useState(false)
  const [leadsCount, setLeadsCount]   = useState<number | null>(null)
  const [alcanceCount, setAlcanceCount] = useState<number | null>(null)
  const [cliquesCount, setCliquesCount] = useState<number | null>(null)
  const [leadsLoading, setLeadsLoading] = useState(false)
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

  // ── Meta Ads: conversas iniciadas para o funil de vendas ─────────────────
  useEffect(() => {
    const { from, to } = periodBounds
    setLeadsLoading(true)
    const url = from
      ? `/api/meta?since=${from.toISOString().split("T")[0]}&until=${to ? to.toISOString().split("T")[0] : new Date().toISOString().split("T")[0]}`
      : `/api/meta?preset=maximum`
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (!d.campaigns) return
        // Filter hidden campaigns (same key as MetaAdsView uses)
        let hidden: Set<string>
        try { hidden = new Set(JSON.parse(localStorage.getItem("meta_hidden_campaigns") ?? "[]")) }
        catch { hidden = new Set() }
        const LEAD_TYPES = [
          "onsite_conversion.messaging_conversation_started_7d",
          "messaging_conversation_started_7d",
          "messaging_first_reply_7d",
          "lead",
        ]
        type CampRaw = { campaign_id: string; actions?: { action_type: string; value: string }[]; reach?: string; clicks?: string }
        const vis = (d.campaigns as CampRaw[]).filter(c => !hidden.has(c.campaign_id))
        const leads = vis.reduce((sum, c) => {
          const l = LEAD_TYPES.reduce((found, t) => found > 0 ? found : Number(c.actions?.find(a => a.action_type === t)?.value ?? 0), 0)
          return sum + l
        }, 0)
        setLeadsCount(leads > 0 ? leads : null)
        setAlcanceCount(vis.reduce((s, c) => s + Number(c.reach ?? 0), 0) || null)
        setCliquesCount(vis.reduce((s, c) => s + Number(c.clicks ?? 0), 0) || null)
      })
      .catch(() => { setLeadsCount(null); setAlcanceCount(null); setCliquesCount(null) })
      .finally(() => setLeadsLoading(false))
  }, [periodBounds])

  // ── Filter confirmed cards by CLOSE date — for receita, ticket médio ───────
  // "Confirmed" = any card that advanced past col 0 (open quote) and was not lost.
  // This includes cols 1 (Fechado), 2-8 (in production), 9 (Entregue).
  // Uses dataFechamento (set when first reaching col 1) or falls back to quote date.
  const confirmedByCloseDate = useMemo(() => {
    const { from, to } = periodBounds
    return kanban.filter(c => {
      if (c.coluna === 0 || c.coluna === COL_PERDIDO || c.coluna === COL_HOT) return false
      if (c.isTerceirizado) return false
      const d = parseDataBr(c.dataFechamento ?? c.data)
      if (from && d < from) return false
      if (to   && d > to)   return false
      return true
    })
  }, [kanban, periodBounds])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    // Exclui sub-entradas de terceirização (mesma regra que OrcamentosView)
    const basePeriod = filteredCards.filter(c => !c.isTerceirizado)
    const total = basePeriod.length

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
    const receita   = confirmedByCloseDate.reduce((s, c) => s + c.preco, 0) + sobrasReceita
    const vendas    = countVendas(confirmedByCloseDate)
    const entregues = confirmedByCloseDate.filter(c => c.coluna === COL_ENTREGUE).length
    const ticket    = vendas > 0 ? receita / vendas : 0

    // Conversão: ganhos ÷ (ganhos + perdidos) — mesma fórmula que OrcamentosView
    const ganhos   = basePeriod.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO).length
    const perdidos = basePeriod.filter(c => c.coluna === COL_PERDIDO).length
    const resolvidosConv = ganhos + perdidos
    const conversao = resolvidosConv > 0 ? (ganhos / resolvidosConv) * 100 : 0

    // Unique clients in period
    const clientesUnicos = new Set(basePeriod.map(c => c.nomeCliente)).size

    // Pipeline: only unconfirmed quotes (col 0) — once confirmed it moves to production
    const pipelineGlobal = kanban
      .filter(c => c.coluna === 0)
      .reduce((s, c) => s + c.preco, 0)

    return {
      total, receita, vendas, entregues, ticket,
      conversao, clientesUnicos,
      pipelineGlobal,
    }
  }, [filteredCards, confirmedByCloseDate, kanban])

  const hotKpi = useMemo(() => {
    const cards = kanban.filter(c => c.coluna === COL_HOT)
    return { count: cards.length, total: cards.reduce((s, c) => s + c.preco, 0) }
  }, [kanban])

  // ── Margem por pedido ────────────────────────────────────────────────────────
  const margemData = useMemo(() => {
    const despesasByCard = new Map<string, number>()
    lancamentos.forEach(l => {
      if (l.tipo !== "despesa" || !l.cardId) return
      despesasByCard.set(l.cardId, (despesasByCard.get(l.cardId) ?? 0) + l.valor)
    })

    const cards = kanban
      .filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO && c.coluna !== COL_HOT && despesasByCard.has(c.id))
      .map(c => {
        const custo = despesasByCard.get(c.id)!
        const margem = c.preco - custo
        const pct = c.preco > 0 ? (margem / c.preco) * 100 : 0
        return { id: c.id, numero: c.numero, nomeCliente: c.nomeCliente, preco: c.preco, custo, margem, pct }
      })
      .sort((a, b) => b.pct - a.pct)

    const avgPct = cards.length > 0 ? cards.reduce((s, c) => s + c.pct, 0) / cards.length : null
    const avgMargem = cards.length > 0 ? cards.reduce((s, c) => s + c.margem, 0) / cards.length : null
    return { cards, avgPct, avgMargem }
  }, [kanban, lancamentos])

  // ── Concentração de cliente (all-time LTV) ──────────────────────────────────
  const concentracaoData = useMemo(() => {
    const lancPagas = lancamentos.filter(l => l.tipo === "receita" && l.status === "pago")
    if (lancPagas.length === 0) return null
    const ltvMap = new Map<string, number>()
    for (const l of lancPagas) {
      const nomeCard = l.cardId ? kanban.find(c => c.id === l.cardId)?.nomeCliente : null
      const nomeLote = l.loteId ? kanban.find(c => c.loteId === l.loteId)?.nomeCliente : null
      const nome = (nomeCard ?? nomeLote ?? l.nomeCliente ?? "").trim()
      if (nome) ltvMap.set(nome, (ltvMap.get(nome) ?? 0) + l.valor)
    }
    if (ltvMap.size === 0) return null
    const total = [...ltvMap.values()].reduce((s, v) => s + v, 0)
    if (total === 0) return null
    let topNome = "", topValor = 0
    for (const [nome, valor] of ltvMap) {
      if (valor > topValor) { topNome = nome; topValor = valor }
    }
    const pct = (topValor / total) * 100
    return { topNome, topValor, total, pct }
  }, [lancamentos, kanban])

  // ── DRE Gerencial (lib/metrics) ─────────────────────────────────────────────
  const lucroLiquidoData = useMemo(() => {
    const { from, to } = periodBounds
    const sobrasReceita = lancamentos
      .filter(l => {
        if (l.categoria !== "sobra" || l.tipo !== "receita") return false
        const ref = l.dataPagamento || l.dataVencimento
        if (!ref) return false
        const d = new Date(ref + "T12:00:00")
        if (from && d < from) return false
        if (to   && d > to)   return false
        return true
      })
      .reduce((s, l) => s + l.valor, 0)
    return dreGerencial(confirmedByCloseDate, lancamentos, sobrasReceita, from, to)
  }, [confirmedByCloseDate, lancamentos, periodBounds])

  const geracaoCaixa = useMemo(() => {
    const { from, to } = periodBounds
    const inPeriod = (l: LancamentoFinanceiro) => {
      const ref = l.dataPagamento || l.dataVencimento
      if (!ref) return false
      const d = new Date(ref + "T12:00:00")
      if (from && d < from) return false
      if (to   && d > to)   return false
      return true
    }
    const entrou = lancamentos.filter(l => l.tipo === "receita" && l.status === "pago" && inPeriod(l)).reduce((s, l) => s + l.valor, 0)
    const saiu   = lancamentos.filter(l => l.tipo === "despesa" && l.status === "pago" && inPeriod(l)).reduce((s, l) => s + l.valor, 0)
    return { entrou, saiu, liquido: entrou - saiu }
  }, [lancamentos, periodBounds])

  function margemColor(pct: number) {
    if (pct >= 40) return "#009351"
    if (pct >= 20) return "#c57800"
    return "#d33a3c"
  }

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
      if (card.coluna !== 0 && card.coluna !== COL_PERDIDO && card.coluna !== COL_HOT) {
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
      .filter(c => c.coluna !== 0 && c.coluna !== COL_PERDIDO && c.coluna !== COL_HOT)
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

  // ── Funil de vendas (mensagens → orçamentos → primeiras vendas) ─────────────
  const funilVendas = useMemo(() => {
    const orcamentos = filteredCards.filter(c => !c.isTerceirizado).length

    const { from } = periodBounds
    const periodoInicio = from ? from.toISOString().split("T")[0] : null

    // Clientes únicos que FECHARAM no período
    const sold = confirmedByCloseDate.filter(c => !c.isTerceirizado)
    const uniqueClients = new Set(sold.map(c => c.nomeCliente?.trim().toLowerCase()).filter(Boolean))

    // Primeiras vendas = clientes sem nenhum fechamento ANTES do período
    const primeirasVendas = [...uniqueClients].filter(nome => {
      if (!periodoInicio) return true // sem filtro de período, conta todos
      return !kanban.some(c =>
        c.nomeCliente?.trim().toLowerCase() === nome &&
        c.coluna >= COL_FECHADO &&
        c.coluna !== COL_PERDIDO &&
        c.coluna !== COL_HOT &&
        !c.isTerceirizado &&
        c.dataFechamento && c.dataFechamento < periodoInicio
      )
    }).length

    return { orcamentos, vendas: primeirasVendas }
  }, [filteredCards, confirmedByCloseDate, periodBounds, kanban])

  // ── Funil ───────────────────────────────────────────────────────────────────
  const funil = useMemo(() => {
    const map = new Map<number, { count: number; value: number }>()
    filteredCards
      .filter(c => c.coluna !== COL_PERDIDO && c.coluna !== COL_HOT)
      .forEach(c => {
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
      .filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO && c.coluna !== COL_HOT)
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
    const colors = ["#8456e8", "#009351", "#d33a3c", "#a582ff", "#c57800", "#5AC8FA"]
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
          <p className="text-[#191625] font-semibold text-sm">Nenhum dado ainda</p>
          <p className="text-[#8E8E93] text-xs mt-1">Salve orçamentos para ver o dashboard</p>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="h-full overflow-y-auto" style={{ background: isDark ? "#0b0914" : "#F2F2F7" }}>
    <div className="px-6 py-5 space-y-5">

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className={`sticky top-0 z-10 backdrop-blur-sm py-2 -mx-6 px-6 ${isDark ? "bg-[#0b0914]/95" : "bg-[#F2F2F7]/95"}`}>
        <div className="flex items-center gap-2">

          {/* Period dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(m => !m)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium transition-all ${
                periodo !== "custom"
                  ? "bg-[#8456e8] text-white shadow-sm"
                  : isDark
                    ? "bg-[#161421] border border-[rgba(255,255,255,0.1)] text-white hover:bg-[rgba(255,255,255,0.08)]"
                    : "bg-white border border-[rgba(0,0,0,0.12)] text-[#191625] hover:bg-[rgba(0,0,0,0.04)]"
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
              <div className={`absolute top-full left-0 mt-1.5 w-52 rounded-xl border shadow-[0_4px_16px_rgba(0,0,0,0.12)] py-1.5 z-50 ${isDark ? "bg-[#161421] border-[rgba(255,255,255,0.1)]" : "bg-white border-[rgba(0,0,0,0.12)]"}`}>
                {GRUPOS_PERIODO.map((grupo, gi) => (
                  <div key={gi}>
                    {gi > 0 && <div className={`h-px my-1 ${isDark ? "bg-[rgba(255,255,255,0.08)]" : "bg-[rgba(60,60,67,0.12)]"}`} />}
                    <p className="px-3 pt-1.5 pb-0.5 text-[9px] uppercase tracking-wide font-bold text-[#8E8E93]">
                      {grupo.label}
                    </p>
                    {grupo.items.map(({ id, label }) => (
                      <button key={id}
                        onClick={() => { setPeriodo(id); setShowMenu(false) }}
                        className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 transition-colors ${
                          periodo === id
                            ? "text-[#8456e8] font-semibold bg-[#8456e8]/10"
                            : isDark ? "text-white hover:bg-[rgba(255,255,255,0.06)]" : "text-[#191625] hover:bg-[rgba(0,0,0,0.04)]"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${periodo === id ? "bg-[#8456e8]" : "bg-transparent"}`} />
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
              className={`h-8 border rounded-lg px-2 text-[11.5px] focus:outline-none focus:ring-2 focus:ring-[#8456e8]/25 focus:border-[#8456e8] ${isDark ? "border-[rgba(255,255,255,0.1)] bg-[#161421] text-white" : "border-[rgba(0,0,0,0.12)] bg-white text-[#191625]"}`} />
            <span className="text-[#8E8E93] text-xs">→</span>
            <input type="date" value={dataFim}
              onChange={e => { setDataFim(e.target.value); setPeriodo("custom") }}
              className={`h-8 border rounded-lg px-2 text-[11.5px] focus:outline-none focus:ring-2 focus:ring-[#8456e8]/25 focus:border-[#8456e8] ${isDark ? "border-[rgba(255,255,255,0.1)] bg-[#161421] text-white" : "border-[rgba(0,0,0,0.12)] bg-white text-[#191625]"}`} />
          </div>

          <button
            onClick={abrirRelatorio}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium border transition-colors shrink-0 ${isDark ? "bg-[#161421] border-[rgba(255,255,255,0.1)] text-white hover:bg-[rgba(255,255,255,0.08)]" : "bg-white border-[rgba(0,0,0,0.12)] text-[#191625] hover:bg-[rgba(0,0,0,0.04)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"}`}
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
              const cor = alertas.vencidos.length > 0 ? "#d33a3c" : "#c57800"
              const hj  = new Date().toISOString().split("T")[0]
              return (
                <div className="relative" ref={alertasRef}>
                  <button
                    onClick={() => setShowAlertas(v => !v)}
                    className={`relative w-8 h-8 flex items-center justify-center border rounded-full transition-colors ${isDark ? "bg-[#161421] border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.08)]" : "bg-white border-[rgba(0,0,0,0.12)] hover:bg-[rgba(0,0,0,0.03)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"}`}
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
                          <p className="font-semibold text-[13px] text-[#191625]">Alertas</p>
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
                              <div className="w-1.5 h-1.5 rounded-full bg-[#d33a3c] shrink-0" />
                              <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#d33a3c] flex-1">Vencidos</p>
                              <p className="text-[9.5px] font-semibold text-[#d33a3c] tabular-nums">
                                {brl(alertas.vencidos.reduce((s, l) => s + l.valor, 0))}
                              </p>
                            </div>
                            {alertas.vencidos.slice(0, 5).map(l => (
                              <div key={l.id} className="px-4 py-2 flex items-start gap-3 hover:bg-[rgba(0,0,0,0.02)] transition-colors">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11.5px] font-medium text-[#191625] truncate">{l.descricao}</p>
                                  <p className="text-[10px] text-[#8E8E93]">{l.nomeCliente ?? "—"} · venceu {l.dataVencimento}</p>
                                </div>
                                <p className="text-[11px] font-bold text-[#d33a3c] tabular-nums shrink-0">{brl(l.valor)}</p>
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
                              <div className="w-1.5 h-1.5 rounded-full bg-[#c57800] shrink-0" />
                              <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#c57800] flex-1">Vencem hoje ou amanhã</p>
                              <p className="text-[9.5px] font-semibold text-[#c57800] tabular-nums">
                                {brl(alertas.vencendoHoje.reduce((s, l) => s + l.valor, 0))}
                              </p>
                            </div>
                            {alertas.vencendoHoje.slice(0, 5).map(l => (
                              <div key={l.id} className="px-4 py-2 flex items-start gap-3 hover:bg-[rgba(0,0,0,0.02)] transition-colors">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11.5px] font-medium text-[#191625] truncate">{l.descricao}</p>
                                  <p className="text-[10px] text-[#8E8E93]">
                                    {l.nomeCliente ?? "—"} · {l.dataVencimento === hj ? "vence hoje" : "vence amanhã"}
                                  </p>
                                </div>
                                <p className="text-[11px] font-bold text-[#c57800] tabular-nums shrink-0">{brl(l.valor)}</p>
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
                              <div className="w-1.5 h-1.5 rounded-full bg-[#c57800] shrink-0" />
                              <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#c57800] flex-1">Parados em produção</p>
                            </div>
                            {alertas.parados.slice(0, 5).map(c => {
                              const dias = Math.floor((Date.now() - new Date(c.dataFechamento! + "T00:00:00").getTime()) / 86_400_000)
                              return (
                                <div key={c.id} className="px-4 py-2 flex items-start gap-3 hover:bg-[rgba(0,0,0,0.02)] transition-colors">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11.5px] font-medium text-[#191625] truncate">
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
                                  <p className="text-[11.5px] font-medium text-[#191625] truncate">
                                    {c.numero ? `#${c.numero} · ` : ""}{c.nomeCliente}
                                  </p>
                                  <p className="text-[10px] text-[#8E8E93]">Venda {c.dataFechamento} · {COLUNAS_KANBAN[c.coluna]}</p>
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

            <div className={`text-[11px] text-[#8E8E93] font-medium tabular-nums border rounded-full px-3 py-1.5 ${isDark ? "bg-[#161421] border-[rgba(255,255,255,0.1)]" : "bg-white border-[rgba(0,0,0,0.12)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"}`}>
              {kpis.total} orçamento{kpis.total !== 1 ? "s" : ""} no período
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 1: North-star — 4 grandes ─────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3.5">
        {(() => {
          const { liquido, entrou, saiu } = geracaoCaixa
          const cor = liquido >= 0 ? "#009351" : "#d33a3c"
          const semDados = entrou === 0 && saiu === 0
          return (
            <KpiCard
              icon={<DollarSign className="w-4 h-4" />}
              iconBg={semDados ? "rgba(116,116,128,0.10)" : liquido >= 0 ? "rgba(0,147,81,0.12)" : "rgba(211,58,60,0.10)"}
              iconColor={semDados ? "#8E8E93" : cor}
              label="Geração de Caixa"
              value={semDados ? "—" : brl(liquido)}
              sub={semDados ? "sem lançamentos pagos" : `${brl(entrou)} in · ${brl(saiu)} out`}
              valueColor={semDados ? "var(--text-faint)" : cor}
              subColor={semDados ? undefined : cor}
              highlight
            />
          )
        })()}
        {(() => {
          const ll = lucroLiquidoData.lucroLiquido
          const pct = lucroLiquidoData.margemLiquidaPct
          const semDados = lucroLiquidoData.custoDireto === 0 && lucroLiquidoData.custoFixo === 0
          const cor = ll >= 0 ? "#009351" : "#d33a3c"
          const iconBg = semDados ? "rgba(116,116,128,0.10)" : ll >= 0 ? "rgba(0,147,81,0.12)" : "rgba(211,58,60,0.10)"
          const iconColor = semDados ? "#8E8E93" : cor
          return (
            <KpiCard
              icon={<DollarSign className="w-4 h-4" />}
              iconBg={iconBg} iconColor={iconColor}
              label="Lucro líquido"
              value={semDados ? "—" : brl(ll)}
              sub={semDados ? "vincule despesas a pedidos" : `${num(pct, 1)}% · após custos fixos`}
              valueColor={semDados ? "var(--text-faint)" : cor}
              subColor={semDados ? undefined : iconColor}
            />
          )
        })()}
        <KpiCard
          icon={<TrendingUp className="w-4 h-4" />}
          iconBg="rgba(0,147,81,0.10)" iconColor="#009351"
          label="Receita do período"
          value={brl(kpis.receita)}
          sub="por data de fechamento"
          subColor="#009351"
        />
        <KpiCard
          icon={<BarChart2 className="w-4 h-4" />}
          iconBg="rgba(132,86,232,0.10)" iconColor="#8456e8"
          label="Pipeline"
          value={brl(kpis.pipelineGlobal)}
          sub="aguardando confirmação"
        />
      </div>

      {/* ── Row 2: Operacional — 2 cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Lead Quente */}
        <div className="rounded-2xl px-5 py-4" style={{
          background: hotKpi.count > 0 ? (isDark ? "rgba(197,120,0,0.15)" : "rgba(197,120,0,0.06)") : "var(--bg-surface)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        }}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(197,120,0,0.14)", color: "#c57800" }}>
              <AlertTriangle className="w-4 h-4" />
            </div>
            <p className="text-[10.5px] uppercase tracking-wider font-semibold leading-tight" style={{ color: "#c57800" }}>Lead Quente</p>
          </div>
          <p className="text-[22px] font-bold tabular-nums tracking-tight leading-none" style={{ color: "var(--text-main)" }}>
            {hotKpi.total > 0 ? brl(hotKpi.total) : "—"}
          </p>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
              {hotKpi.count > 0 ? `${hotKpi.count} orçamento${hotKpi.count !== 1 ? "s" : ""}` : "nenhum lead"}
            </p>
            {hotKpi.count > 0 && (
              <button className="text-[11px] font-bold text-white rounded-full px-2.5 py-0.5 shrink-0"
                style={{ background: "#c57800" }}>Agir agora</button>
            )}
          </div>
        </div>

        <KpiCard
          icon={<ShoppingCart className="w-4 h-4" />}
          iconBg="rgba(0,147,81,0.10)" iconColor="#009351"
          label="Vendas"
          value={String(num(kpis.vendas))}
          sub={`${kpis.entregues} entregues no período`}
        />
      </div>

      {/* ── Row 3: Analítico — 3 cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3.5">
        <KpiCard
          icon={<DollarSign className="w-4 h-4" />}
          iconBg="rgba(14,165,233,0.10)" iconColor="#0ea5e9"
          label="Ticket médio"
          value={brl(kpis.ticket)}
          sub="por venda"
        />
        <KpiCard
          icon={<BarChart2 className="w-4 h-4" />}
          iconBg="rgba(132,86,232,0.10)" iconColor="#8456e8"
          label="Orçamentos"
          value={String(num(kpis.total))}
          sub="realizados no período"
        />
        <KpiCard
          icon={<Target className="w-4 h-4" />}
          iconBg="rgba(132,86,232,0.10)"
          iconColor="#8456e8"
          label="Conversão"
          value={`${num(kpis.conversao, 1)}%`}
          sub="dos orçamentos do período"
        />
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-4">

        {/* Receita mensal */}
        <div className="col-span-3 rounded-[18px] p-[22px]" style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[15px] font-bold" style={{ color: "var(--text-main)" }}>Receita mensal</p>
            <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>últimos 12 meses</p>
          </div>
          <MonthlyChart data={monthlyData} onSelectMonth={setModalMesIdx} />
        </div>

        {/* Funil de vendas */}
        <div className="col-span-2 rounded-[18px] p-[22px]" style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
          <p className="text-[15px] font-bold mb-[20px]" style={{ color: "var(--text-main)" }}>Funil de marketing e vendas</p>
          <FunilVendas
            leads={leadsCount}
            alcance={alcanceCount}
            cliques={cliquesCount}
            leadsQualificados={kpis.clientesUnicos}
            orcamentos={funilVendas.orcamentos}
            vendas={funilVendas.vendas}
            loading={leadsLoading}
            isDark={isDark}
          />
        </div>

        {/* Funil de produção */}
        <div className="col-span-2 rounded-[18px] p-[22px]" style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
          <p className="text-[15px] font-bold mb-[18px]" style={{ color: "var(--text-main)" }}>Funil de produção</p>
          {funil.stages.length === 0 ? (
            <p className="text-[12px] text-center py-8" style={{ color: "var(--text-faint)" }}>Sem dados no período</p>
          ) : (
            <div className="space-y-4">
              {funil.stages.map(s => (
                <div key={s.col}>
                  <div className="flex items-center justify-between text-[13px] mb-1.5">
                    <span style={{ color: "var(--text-main)" }}>{s.colNome}</span>
                    <span className="tabular-nums font-medium" style={{ color: "var(--text-sub)" }}>
                      {s.count} · {brl(s.value)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-alt)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(6, (s.count / funil.maxCount) * 100)}%`,
                        backgroundColor: colBg(s.col),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Analysis row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Top clientes */}
        <div className="rounded-[18px] p-5" style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
          <p className="text-[14px] font-bold mb-3.5" style={{ color: "var(--text-main)" }}>Top clientes</p>
          {topClientes.clientes.length === 0 ? (
            <p className="text-[12px] text-[#8E8E93] text-center py-6">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {topClientes.clientes.map((c, i) => (
                <div key={c.nome} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ background: "#8456e8" }}>
                      {c.nome[0]?.toUpperCase() ?? "?"}
                    </div>
                    <p className="text-[12px] font-medium text-[#191625] truncate flex-1">{c.nome}</p>
                    <p className="text-[11px] font-bold text-[#191625] tabular-nums">{brl(c.total)}</p>
                    <p className="text-[10px] text-[#8E8E93] tabular-nums shrink-0">{c.count}×</p>
                  </div>
                  <div className="ml-8 h-1.5 bg-[rgba(116,116,128,0.08)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${(c.total / topClientes.maxTotal) * 100}%`, background: "#8456e8" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Materiais mais usados */}
        <div className="rounded-[18px] p-5" style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
          <p className="text-[14px] font-bold mb-3.5" style={{ color: "var(--text-main)" }}>Materiais mais usados</p>
          {materiais.materiais.length === 0 ? (
            <p className="text-[12px] text-[#8E8E93] text-center py-6">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {materiais.materiais.map(m => (
                <div key={m.nome} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                    <p className="text-[12px] font-medium text-[#191625] truncate flex-1">{m.nome}</p>
                    <p className="text-[11px] font-bold text-[#191625] tabular-nums">{num(m.count)}</p>
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
        <div className="rounded-[18px] p-5" style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
          <p className="text-[14px] font-bold mb-3.5" style={{ color: "var(--text-main)" }}>Motivos de perda</p>
          {motivosPerda.motivos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 gap-2">
              <p className="text-[13px] font-semibold text-center text-[#009351]">Nenhuma perda</p>
              <p className="text-[11px] text-center text-[#8E8E93]">Excelente taxa de conversão!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {motivosPerda.motivos.map(m => (
                <div key={m.motivo} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] font-medium text-[#191625] truncate flex-1">{m.motivo}</p>
                    <p className="text-[11px] font-bold tabular-nums" style={{ color: "#d33a3c" }}>{m.count}×</p>
                  </div>
                  <div className="h-1.5 bg-[rgba(116,116,128,0.08)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${(m.count / motivosPerda.maxCount) * 100}%`, background: "#d33a3c" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Últimos negócios ───────────────────────────────────────────────── */}
      <div className="rounded-[18px] overflow-hidden" style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
          <p className="text-[15px] font-bold" style={{ color: "var(--text-main)" }}>Últimos negócios</p>
          <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>10 mais recentes no período</p>
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
                          style={{ background: "#8456e8" }}>
                          {card.nomeCliente[0]?.toUpperCase() ?? "?"}
                        </div>
                        <span className="font-medium text-[#191625] max-w-[120px] truncate">{card.nomeCliente}</span>
                      </div>
                    </td>
                    {/* Material */}
                    <td className="px-4 py-2.5 text-[#8E8E93] max-w-[120px]">
                      <span className="truncate block">{card.materialNome || "—"}</span>
                    </td>
                    {/* Valor */}
                    <td className="px-4 py-2.5 text-right font-bold text-[#191625] tabular-nums">
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

      {/* ── Análise de margem ───────────────────────────────────────────────── */}
      {margemData.cards.length > 0 && (
        <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.06)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-3 mb-4">
            <p className="text-[11px] font-semibold text-[#8E8E93]">Análise de margem</p>
            <div className="flex-1 h-px bg-[rgba(60,60,67,0.12)]" />
            <div className="flex items-center gap-3 text-[10.5px]">
              <span className="text-[#8E8E93]">{margemData.cards.length} pedido{margemData.cards.length !== 1 ? "s" : ""} com custo registrado</span>
              <span className="font-bold tabular-nums" style={{ color: margemColor(margemData.avgPct!) }}>
                {num(margemData.avgPct!, 1)}% média
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {margemData.cards.map(c => (
              <div key={c.id} className="flex items-center gap-4 py-1.5 border-b border-[rgba(60,60,67,0.06)] last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {c.numero && <span className="text-[10px] text-[#8E8E93] font-medium shrink-0">#{c.numero}</span>}
                    <p className="text-[12px] font-medium text-[#191625] truncate">{c.nomeCliente}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="h-1 flex-1 bg-[rgba(0,0,0,0.06)] rounded-full overflow-hidden" style={{ maxWidth: 120 }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(2, Math.min(100, c.pct))}%`, backgroundColor: margemColor(c.pct) }} />
                    </div>
                    <span className="text-[10px] text-[#8E8E93] tabular-nums">
                      {brl(c.custo)} custo · {brl(c.preco)} venda
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[14px] font-bold tabular-nums leading-none" style={{ color: margemColor(c.pct) }}>
                    {num(c.pct, 1)}%
                  </p>
                  <p className="text-[10px] text-[#8E8E93] mt-0.5 tabular-nums">{brl(c.margem)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
    </div>
    {mesSelecionado && (
      <MesDetalheModal mes={mesSelecionado} onClose={() => setModalMesIdx(null)} />
    )}
    </>
  )
}
