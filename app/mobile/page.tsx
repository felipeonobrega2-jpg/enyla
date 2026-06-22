"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { KanbanCard, LancamentoFinanceiro, COL_FECHADO, COL_PERDIDO, COL_ENTREGUE } from "../types"
import { brl } from "../utils"

type Periodo = "mes" | "total"

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white border border-[rgba(0,0,0,0.06)] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] p-4">
      <p className="text-[10.5px] font-medium text-[#8E8E93] mb-3">{label}</p>
      <p className={`text-[22px] font-semibold tabular-nums leading-none tracking-[-0.01em] ${accent ?? "text-[#1C1C1E]"}`}>{value}</p>
      {sub && <p className="text-[10px] text-[#8E8E93] mt-2">{sub}</p>}
    </div>
  )
}

export default function MobilePage() {
  const [kanban, setKanban] = useState<KanbanCard[]>([])
  const [lancamentos, setLancamentos] = useState<LancamentoFinanceiro[]>([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<Periodo>("mes")

  useEffect(() => {
    fetch("/api/data")
      .then(r => r.json())
      .then(d => {
        if (d.kanban) setKanban(d.kanban)
        if (d.lancamentos) setLancamentos(d.lancamentos)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const kpis = useMemo(() => {
    const now = new Date()
    const inMes = (iso: string) => {
      const d = new Date(iso + "T12:00:00")
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    }
    const passaPeriodo = (iso?: string) => periodo === "total" || (iso ? inMes(iso) : false)

    const confirmados = kanban.filter(c => c.coluna !== 0 && c.coluna !== COL_PERDIDO && passaPeriodo(c.dataFechamento ?? c.data))
    const receita = confirmados.reduce((s, c) => s + c.preco, 0)
    const fechamentos = confirmados.length
    const ticket = fechamentos > 0 ? receita / fechamentos : 0
    const entregues = confirmados.filter(c => c.coluna === COL_ENTREGUE).length

    const recebido = lancamentos
      .filter(l => l.tipo === "receita" && l.status === "pago" && passaPeriodo(l.dataPagamento))
      .reduce((s, l) => s + l.valor, 0)

    const pendentes = lancamentos.filter(l => l.tipo === "receita" && l.status !== "pago" && l.categoria !== "sobra")
    const aReceber = pendentes.reduce((s, l) => s + l.valor, 0)
    const hj = now.toISOString().split("T")[0]
    const vencidos = pendentes.filter(l => l.dataVencimento < hj)
    const valorVencido = vencidos.reduce((s, l) => s + l.valor, 0)

    const prodCards = kanban.filter(c => c.coluna >= 2 && c.coluna <= 8)
    const pipeline = kanban.filter(c => c.coluna === 0)

    return {
      receita, fechamentos, ticket, entregues,
      recebido, aReceber, aReceberCount: pendentes.length,
      valorVencido, vencidosCount: vencidos.length,
      emProducaoCount: prodCards.length, emProducaoValor: prodCards.reduce((s, c) => s + c.preco, 0),
      pipelineCount: pipeline.length, pipelineValor: pipeline.reduce((s, c) => s + c.preco, 0),
    }
  }, [kanban, lancamentos, periodo])

  return (
    <div className="min-h-screen bg-[#F2F2F7] pb-10">
      <header className="bg-white border-b border-[rgba(60,60,67,0.08)] px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-[18px] font-semibold text-[#1C1C1E]">ENYLA</h1>
          <Link href="/" className="text-[11px] font-medium text-[#007AFF]">Versão completa</Link>
        </div>
        <div className="flex gap-1.5 mt-3">
          {(["mes", "total"] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`text-[11.5px] font-medium px-3 py-1.5 rounded-lg transition-colors ${
                periodo === p ? "bg-[#007AFF] text-white" : "bg-[rgba(0,0,0,0.04)] text-[#8E8E93]"
              }`}
            >
              {p === "mes" ? "Mês atual" : "Total"}
            </button>
          ))}
        </div>
      </header>

      <main className="px-4 pt-4">
        {loading ? (
          <p className="text-center text-[#8E8E93] text-[12px] py-12">Carregando…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <section>
              <p className="text-[10.5px] uppercase tracking-wide font-bold text-[#8E8E93] mb-2">Faturamento</p>
              <div className="grid grid-cols-2 gap-3">
                <Kpi label="Faturamento" value={brl(kpis.receita)} sub={`${kpis.fechamentos} negócio(s) fechado(s)`} />
                <Kpi label="Ticket médio" value={brl(kpis.ticket)} sub="por negócio" />
                <Kpi label="Recebido" value={brl(kpis.recebido)} accent="text-[#34C759]" />
                <Kpi label="Entregues" value={String(kpis.entregues)} sub="no período" />
              </div>
            </section>

            <section>
              <p className="text-[10.5px] uppercase tracking-wide font-bold text-[#8E8E93] mb-2">Financeiro</p>
              <div className="grid grid-cols-2 gap-3">
                <Kpi label="A receber" value={brl(kpis.aReceber)} sub={`${kpis.aReceberCount} lançamento(s)`} />
                <Kpi
                  label="Vencidos"
                  value={brl(kpis.valorVencido)}
                  sub={`${kpis.vencidosCount} lançamento(s)`}
                  accent={kpis.vencidosCount > 0 ? "text-[#FF3B30]" : undefined}
                />
              </div>
            </section>

            <section>
              <p className="text-[10.5px] uppercase tracking-wide font-bold text-[#8E8E93] mb-2">Operação</p>
              <div className="grid grid-cols-2 gap-3">
                <Kpi label="Em produção" value={String(kpis.emProducaoCount)} sub={brl(kpis.emProducaoValor)} />
                <Kpi label="Pipeline aberto" value={String(kpis.pipelineCount)} sub={brl(kpis.pipelineValor)} />
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
