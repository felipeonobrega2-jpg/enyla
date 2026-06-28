"use client"

import { useMemo } from "react"
import { KanbanCard, LancamentoFinanceiro, NegocioParceiro } from "../types"
import { brl } from "../utils"

// ─── Bar Chart ───────────────────────────────────────────────────────────────

function BarChart({
  data,
  height = 120,
  color = "#34C759",
  secondaryColor,
}: {
  data: { label: string; value: number; secondary?: number }[]
  height?: number
  color?: string
  secondaryColor?: string
}) {
  const max = Math.max(...data.flatMap(d => [d.value, d.secondary ?? 0]), 1)
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map(d => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1 group relative">
          <div className="w-full flex items-end gap-0.5">
            <div
              className="flex-1 rounded-t-[3px] transition-all"
              style={{ height: `${Math.max((d.value / max) * (height - 16), d.value > 0 ? 2 : 0)}px`, backgroundColor: color, opacity: 0.85 }}
            />
            {secondaryColor && d.secondary !== undefined && (
              <div
                className="flex-1 rounded-t-[3px] transition-all"
                style={{ height: `${Math.max((d.secondary / max) * (height - 16), d.secondary > 0 ? 2 : 0)}px`, backgroundColor: secondaryColor, opacity: 0.75 }}
              />
            )}
          </div>
          <span className="text-[9px] text-[#8E8E93] whitespace-nowrap leading-none">{d.label}</span>
          {/* Tooltip */}
          <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
            <div className="bg-[#1C1C1E] text-white text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
              <p className="font-semibold">{brl(d.value)}</p>
              {d.secondary !== undefined && <p className="text-[rgba(255,255,255,0.6)] text-[9.5px]">Desp: {brl(d.secondary)}</p>}
            </div>
            <div className="w-1.5 h-1.5 bg-[#1C1C1E] rotate-45 -mt-1" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MES_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7)
}

function last12MonthKeys(): { key: string; label: string }[] {
  const result = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    result.push({
      key: d.toISOString().slice(0, 7),
      label: MES_LABELS[d.getMonth()],
    })
  }
  return result
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AnalyticsView({
  lancamentos,
  kanban,
  negocios,
}: {
  lancamentos: LancamentoFinanceiro[]
  kanban: KanbanCard[]
  negocios: NegocioParceiro[]
}) {
  const months = useMemo(() => last12MonthKeys(), [])

  const monthlyData = useMemo(() => {
    return months.map(({ key, label }) => {
      const receita = lancamentos
        .filter(l => l.tipo === "receita" && l.status === "pago" && monthKey(l.dataPagamento || l.dataVencimento) === key)
        .reduce((s, l) => s + l.valor, 0)

      const parceiros = negocios
        .filter(n => n.status === "pago" && monthKey(n.dataOrcamento || n.criadoEm) === key)
        .reduce((s, n) => s + n.comissaoValor, 0)

      const despesas = lancamentos
        .filter(l => l.tipo === "despesa" && l.status === "pago" && monthKey(l.dataPagamento || l.dataVencimento) === key)
        .reduce((s, l) => s + l.valor, 0)

      const pedidos = kanban.filter(c => {
        const ref = c.dataFechamento || c.data
        return ref && monthKey(ref) === key
      }).length

      return { key, label, receita: receita + parceiros, despesas, pedidos }
    })
  }, [lancamentos, negocios, kanban, months])

  const topClientes = useMemo(() => {
    const map: Record<string, number> = {}
    for (const l of lancamentos) {
      if (l.tipo === "receita" && l.status === "pago" && l.nomeCliente && l.categoria !== "sobra") {
        map[l.nomeCliente] = (map[l.nomeCliente] ?? 0) + l.valor
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [lancamentos])

  const kpis = useMemo(() => {
    const total12m = monthlyData.reduce((s, m) => s + m.receita, 0)
    const pedidosFechados = kanban.filter(c => c.dataFechamento).length
    const ticketMedio = pedidosFechados > 0
      ? kanban.filter(c => c.dataFechamento).reduce((s, c) => s + c.preco, 0) / pedidosFechados
      : 0
    const melhorMes = monthlyData.reduce((best, m) => m.receita > best.receita ? m : best, monthlyData[0])
    const totalDespesas12m = monthlyData.reduce((s, m) => s + m.despesas, 0)
    return { total12m, ticketMedio, melhorMes, totalDespesas12m }
  }, [monthlyData, kanban])

  const clienteMax = topClientes[0]?.[1] ?? 1

  return (
    <div className="space-y-6">

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Faturamento 12m", value: brl(kpis.total12m), color: "#34C759" },
          { label: "Ticket médio", value: brl(kpis.ticketMedio), color: "#5009c4" },
          { label: "Melhor mês", value: `${kpis.melhorMes?.label ?? "—"} · ${brl(kpis.melhorMes?.receita ?? 0)}`, color: "#AF52DE" },
          { label: "Despesas 12m", value: brl(kpis.totalDespesas12m), color: "#FF3B30" },
        ].map(k => (
          <div key={k.label} className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl px-4 py-4">
            <p className="text-[10.5px] text-[#8E8E93] font-medium mb-1">{k.label}</p>
            <p className="text-[14px] font-bold tabular-nums" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Receita + Despesas por mês */}
      <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl px-5 py-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[12px] font-semibold text-[#1C1C1E]">Receita e despesas — últimos 12 meses</p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[10.5px] text-[#8E8E93]">
              <span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#34C759]/85" />Receita
            </span>
            <span className="flex items-center gap-1 text-[10.5px] text-[#8E8E93]">
              <span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#FF3B30]/75" />Despesas
            </span>
          </div>
        </div>
        <BarChart
          data={monthlyData.map(m => ({ label: m.label, value: m.receita, secondary: m.despesas }))}
          height={140}
          color="#34C759"
          secondaryColor="#FF3B30"
        />
      </div>

      {/* Top clientes + Pedidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Top clientes */}
        <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl px-5 py-4">
          <p className="text-[12px] font-semibold text-[#1C1C1E] mb-4">Top clientes</p>
          {topClientes.length === 0 ? (
            <p className="text-[12px] text-[#8E8E93]">Sem dados ainda.</p>
          ) : (
            <div className="space-y-3">
              {topClientes.map(([name, value], i) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-[#8E8E93] w-4 shrink-0">{i + 1}</span>
                  <span className="text-[11.5px] text-[#1C1C1E] w-28 truncate shrink-0">{name}</span>
                  <div className="flex-1 h-1.5 bg-[rgba(60,60,67,0.06)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#5009c4] rounded-full transition-all"
                      style={{ width: `${(value / clienteMax) * 100}%`, opacity: 0.7 + (0.3 * (1 - i / 6)) }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-[rgba(60,60,67,0.75)] tabular-nums shrink-0 w-20 text-right">{brl(value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pedidos por mês */}
        <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl px-5 py-4">
          <p className="text-[12px] font-semibold text-[#1C1C1E] mb-4">Pedidos fechados por mês</p>
          <BarChart
            data={monthlyData.map(m => ({ label: m.label, value: m.pedidos }))}
            height={140}
            color="#5009c4"
          />
        </div>
      </div>
    </div>
  )
}
