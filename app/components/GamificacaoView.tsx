"use client"
// Barra lateral: quanto falta para o próximo marco de faturamento (offset + digital)
import { montarPedidos, vendasDoPeriodo, SEM_PERIODO } from "../lib/negocio"
import type { Marco } from "../lib/metas"
import { useMemo } from "react"
import { KanbanCard, LancamentoFinanceiro } from "../types"

export function SidebarGamificacao({
  kanban,
  lancamentos,
  baselineFaturamento,
  marcos,
  onClick,
  digitalTotal = 0,
}: {
  digitalTotal?: number
  kanban: KanbanCard[]
  lancamentos: LancamentoFinanceiro[]
  metaMensal: number
  baselineFaturamento: number
  marcos: Marco[]
  onClick: () => void
}) {
  // Mesma conta do cartão de meta do Painel: pedidos (lib/negocio) + sobras + faturamento anterior
  const totalFaturado = useMemo(() => {
    const pedidos = montarPedidos(kanban, lancamentos)
    return baselineFaturamento + pedidos.reduce((s, p) => s + p.valor, 0) + vendasDoPeriodo(pedidos, lancamentos, SEM_PERIODO).sobras + digitalTotal
  }, [kanban, baselineFaturamento, lancamentos, digitalTotal])

  const proximoMarco = marcos.find(m => m.valor > totalFaturado) ?? null
  const pct = proximoMarco ? Math.min(totalFaturado / proximoMarco.valor, 1) : 1
  const falta = proximoMarco ? proximoMarco.valor - totalFaturado : 0

  function fmtShort(v: number) {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")}M`
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`
    return `${v}`
  }

  return (
    <button onClick={onClick}
      className="w-full px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] rounded-xl"
      style={{ margin: "0 8px", width: "calc(100% - 16px)" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-zinc-500 font-semibold">Próximo marco</span>
        <span className="text-[10.5px] font-bold ds-num" style={{ color: "#c57800" }}>
          {Math.round(pct * 100)}%
        </span>
      </div>
      <p className="text-[11px] font-semibold leading-snug mb-1.5 truncate" style={{ color: proximoMarco ? "rgba(255,255,255,0.75)" : "#009351" }}>
        {proximoMarco ? `${proximoMarco.nome} · R$ ${fmtShort(proximoMarco.valor)}` : "Todos os marcos alcançados"}
      </p>
      <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct * 100}%`, background: proximoMarco ? "#c57800" : "#009351" }} />
      </div>
      {proximoMarco && falta > 0 && (
        <p className="text-[9px] mt-1 ds-num" style={{ color: "rgba(255,255,255,0.3)" }}>
          Faltam R${fmtShort(falta)}
        </p>
      )}
    </button>
  )
}
