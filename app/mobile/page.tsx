"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { KanbanCard, LancamentoFinanceiro, COLUNAS_KANBAN, COL_FECHADO, COL_PERDIDO, COL_ENTREGUE } from "../types"
import { Configuracoes, CONFIG_PADRAO } from "../config"
import { brl } from "../utils"

const CARD = "bg-white border border-[rgba(0,0,0,0.06)] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]"
const MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

const MARCOS = [
  { threshold: 10_000,     label: "Primeiro Salto",    sub: "R$10 mil"     },
  { threshold: 50_000,     label: "Tração Real",        sub: "R$50 mil"     },
  { threshold: 100_000,    label: "6 Dígitos",          sub: "R$100 mil"    },
  { threshold: 500_000,    label: "Meio Milhão",        sub: "R$500 mil"    },
  { threshold: 1_000_000,  label: "Primeiro Milhão",    sub: "R$1 milhão"   },
  { threshold: 10_000_000, label: "Empresa de Verdade", sub: "R$10 milhões" },
]

type PeriodoId = "7d" | "30d" | "mes" | "ano" | "tudo"
const PERIODOS: { id: PeriodoId; label: string }[] = [
  { id: "7d",   label: "7 dias"   },
  { id: "30d",  label: "30 dias"  },
  { id: "mes",  label: "Este mês" },
  { id: "ano",  label: "Este ano" },
  { id: "tudo", label: "Tudo"     },
]

function parseIso(s: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T12:00:00")
  try {
    const [d, m, y] = s.split(",")[0].trim().split("/")
    return new Date(+y, +m - 1, +d, 12)
  } catch {
    return new Date(0)
  }
}

function dataRef(c: KanbanCard): string {
  return c.dataFechamento ?? c.data
}

function displayDate(c: KanbanCard): string {
  if (c.dataFechamento) {
    const [y, m, d] = c.dataFechamento.split("-")
    return `${d}/${m}/${y}`
  }
  return c.data.split(",")[0].trim()
}

function bounds(periodo: PeriodoId, now: Date): { from: Date | null; to: Date | null } {
  switch (periodo) {
    case "7d":  return { from: new Date(now.getTime() - 7  * 86_400_000), to: now }
    case "30d": return { from: new Date(now.getTime() - 30 * 86_400_000), to: now }
    case "mes": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
    case "ano": return { from: new Date(now.getFullYear(), 0, 1), to: now }
    case "tudo": return { from: null, to: null }
  }
}

function prevBounds(periodo: PeriodoId, now: Date): { from: Date | null; to: Date | null } | null {
  switch (periodo) {
    case "7d":  return { from: new Date(now.getTime() - 14 * 86_400_000), to: new Date(now.getTime() - 7 * 86_400_000) }
    case "30d": return { from: new Date(now.getTime() - 60 * 86_400_000), to: new Date(now.getTime() - 30 * 86_400_000) }
    case "mes": return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) }
    case "ano": return { from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear(), 0, 1) }
    case "tudo": return null
  }
}

function fmtShort(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return brl(v)
}

function colBadge(col: number): string {
  if (col === COL_PERDIDO)  return "bg-[#FF3B30]/10 text-[#FF3B30]"
  if (col === COL_ENTREGUE) return "bg-[#007AFF]/10 text-[#007AFF]"
  if (col === COL_FECHADO)  return "bg-[#34C759]/10 text-[#34C759]"
  return "bg-[#FF9500]/10 text-[#FF9500]"
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className={`${CARD} p-4`}>
      <p className="text-[10.5px] font-medium text-[#8E8E93] mb-3">{label}</p>
      <p className={`text-[20px] font-semibold tabular-nums leading-none tracking-[-0.01em] ${accent ?? "text-[#1C1C1E]"}`}>{value}</p>
      {sub && <p className="text-[10px] text-[#8E8E93] mt-2">{sub}</p>}
    </div>
  )
}

function ProgressRow({ label, value, sub, pct, color, extra }: { label: string; value: string; sub: string; pct: number; color: string; extra?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[12px] font-medium text-[#1C1C1E]">{label}</p>
        <p className="text-[15px] font-semibold tabular-nums" style={{ color }}>{value}</p>
      </div>
      <div className="h-1.5 rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
      <div className="flex items-baseline justify-between mt-1">
        <p className="text-[10px] text-[#8E8E93]">{sub}</p>
        {extra && <p className="text-[10px] text-[#8E8E93]">{extra}</p>}
      </div>
    </div>
  )
}

function MonthlyBars({ data }: { data: { label: string; receita: number }[] }) {
  const max = Math.max(...data.map(d => d.receita), 1)
  return (
    <div className="flex items-end justify-between gap-2 h-[100px]">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
          <p className="text-[8.5px] text-[#8E8E93] tabular-nums truncate">{d.receita > 0 ? fmtShort(d.receita) : ""}</p>
          <div className="w-full flex items-end h-[70px]">
            <div
              className="w-full rounded-md transition-all duration-500"
              style={{ height: `${Math.max((d.receita / max) * 100, d.receita > 0 ? 4 : 0)}%`, background: i === data.length - 1 ? "#007AFF" : "rgba(0,122,255,0.18)" }}
            />
          </div>
          <p className="text-[9px] text-[#8E8E93]">{d.label}</p>
        </div>
      ))}
    </div>
  )
}

export default function MobilePage() {
  const [kanban, setKanban] = useState<KanbanCard[]>([])
  const [lancamentos, setLancamentos] = useState<LancamentoFinanceiro[]>([])
  const [config, setConfig] = useState<Configuracoes>(CONFIG_PADRAO)
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<PeriodoId>("30d")

  useEffect(() => {
    fetch("/api/data")
      .then(r => r.json())
      .then(d => {
        if (d.kanban) setKanban(d.kanban)
        if (d.lancamentos) setLancamentos(d.lancamentos)
        if (d.config) setConfig(c => ({ ...CONFIG_PADRAO, ...c, ...d.config }))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const data = useMemo(() => {
    const now = new Date()
    const { from, to } = bounds(periodo, now)
    const inRange = (d: Date, f: Date | null, t: Date | null) => (!f || d >= f) && (!t || d <= t)

    const confirmados = kanban.filter(c => c.coluna !== 0 && c.coluna !== COL_PERDIDO)
    const noPeriodo = confirmados.filter(c => inRange(parseIso(c.dataFechamento ?? c.data), from, to))

    const receita = noPeriodo.reduce((s, c) => s + c.preco, 0)
    const fechamentos = noPeriodo.length
    const ticket = fechamentos > 0 ? receita / fechamentos : 0
    const entregues = noPeriodo.filter(c => c.coluna === COL_ENTREGUE).length

    const pb = prevBounds(periodo, now)
    const receitaAnterior = pb
      ? confirmados.filter(c => inRange(parseIso(c.dataFechamento ?? c.data), pb.from, pb.to)).reduce((s, c) => s + c.preco, 0)
      : null
    const variacao = receitaAnterior !== null && receitaAnterior > 0 ? ((receita - receitaAnterior) / receitaAnterior) * 100 : null

    const recebido = lancamentos
      .filter(l => l.tipo === "receita" && l.status === "pago" && l.dataPagamento && inRange(parseIso(l.dataPagamento), from, to))
      .reduce((s, l) => s + l.valor, 0)

    const hj = now.toISOString().split("T")[0]
    // Link PIX vencido e não pago deixa de ser receita pendente (o cliente não vai mais pagar aquele link específico)
    const pendentes = lancamentos.filter(l =>
      l.tipo === "receita" && l.status !== "pago" && l.categoria !== "sobra" &&
      !(l.categoria === "pix_link" && l.dataVencimento < hj)
    )
    const aReceber = pendentes.reduce((s, l) => s + l.valor, 0)
    const vencidos = pendentes
      .filter(l => l.dataVencimento < hj)
      .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
    const valorVencido = vencidos.reduce((s, l) => s + l.valor, 0)

    const prodCards = kanban.filter(c => c.coluna >= 2 && c.coluna <= 8)
    const pipeline = kanban.filter(c => c.coluna === 0)

    const ultimosNegocios = [...confirmados]
      .sort((a, b) => parseIso(dataRef(b)).getTime() - parseIso(dataRef(a)).getTime())
      .slice(0, 5)

    const meses: { label: string; receita: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      meses.push({ label: MESES_PT[d.getMonth()], receita: 0 })
    }
    confirmados.forEach(c => {
      const d = parseIso(c.dataFechamento ?? c.data)
      const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
      if (diff >= 0 && diff <= 5) meses[5 - diff].receita += c.preco
    })

    const totalFaturado = config.baselineFaturamento + confirmados.reduce((s, c) => s + c.preco, 0)
    const proximoMarco = MARCOS.find(m => m.threshold > totalFaturado) ?? null
    const pctMarco = proximoMarco ? Math.min(totalFaturado / proximoMarco.threshold, 1) : 1

    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    const faturadoMes = confirmados
      .filter(c => (c.dataFechamento ?? "").startsWith(mesAtual))
      .reduce((s, c) => s + c.preco, 0)
    const pctMeta = config.metaMensal > 0 ? Math.min(faturadoMes / config.metaMensal, 1) : 0

    return {
      receita, fechamentos, ticket, entregues, variacao,
      recebido, aReceber, aReceberCount: pendentes.length,
      valorVencido, vencidos,
      emProducaoCount: prodCards.length, emProducaoValor: prodCards.reduce((s, c) => s + c.preco, 0),
      pipelineCount: pipeline.length, pipelineValor: pipeline.reduce((s, c) => s + c.preco, 0),
      ultimosNegocios, meses,
      totalFaturado, proximoMarco, pctMarco,
      faturadoMes, pctMeta,
    }
  }, [kanban, lancamentos, config, periodo])

  return (
    <div className="min-h-screen bg-[#F2F2F7] pb-10">
      <header className="bg-white border-b border-[rgba(60,60,67,0.08)] px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3 sticky top-0 z-10">
        <Image src="/brand/enyla-wordmark-dark.png" alt="Enyla" width={1118} height={162}
          className="h-5 w-auto mb-3" priority />
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 [&::-webkit-scrollbar]:hidden">
          {PERIODOS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriodo(p.id)}
              className={`shrink-0 text-[11.5px] font-medium px-3 py-1.5 rounded-lg transition-colors ${
                periodo === p.id ? "bg-[#007AFF] text-white" : "bg-[rgba(0,0,0,0.04)] text-[#8E8E93]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <main className="px-4 pt-4">
        {loading ? (
          <p className="text-center text-[#8E8E93] text-[12px] py-12">Carregando…</p>
        ) : (
          <div className="flex flex-col gap-4">

            {/* Hero */}
            <div className={`${CARD} p-5`}>
              <p className="text-[10.5px] font-medium text-[#8E8E93] mb-2">Faturamento</p>
              <div className="flex items-baseline gap-2">
                <p className="text-[28px] font-semibold tabular-nums leading-none text-[#1C1C1E] tracking-[-0.01em]">{brl(data.receita)}</p>
                {data.variacao !== null && (
                  <span className={`text-[11px] font-semibold tabular-nums ${data.variacao >= 0 ? "text-[#34C759]" : "text-[#FF3B30]"}`}>
                    {data.variacao >= 0 ? "↑" : "↓"} {Math.abs(data.variacao).toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#8E8E93] mt-2">{data.fechamentos} negócio(s) fechado(s) · ticket médio {brl(data.ticket)}</p>
            </div>

            {/* Chart */}
            <div className={`${CARD} p-4`}>
              <p className="text-[10.5px] uppercase tracking-wide font-bold text-[#8E8E93] mb-3">Últimos 6 meses</p>
              <MonthlyBars data={data.meses} />
            </div>

            {/* Metas */}
            <div className={`${CARD} p-4 flex flex-col gap-4`}>
              <p className="text-[10.5px] uppercase tracking-wide font-bold text-[#8E8E93]">Metas</p>
              <ProgressRow
                label="Meta do mês"
                value={`${Math.round(data.pctMeta * 100)}%`}
                sub={`${brl(data.faturadoMes)} de ${brl(config.metaMensal)}`}
                extra={data.pctMeta >= 1 ? "Meta batida! 🎉" : data.faturadoMes > 0 ? `Faltam ${brl(config.metaMensal - data.faturadoMes)}` : undefined}
                pct={data.pctMeta}
                color={data.pctMeta >= 1 ? "#34C759" : data.pctMeta >= 0.7 ? "#FF9500" : "#007AFF"}
              />
              {data.proximoMarco && (
                <ProgressRow
                  label={`Próximo marco · ${data.proximoMarco.label}`}
                  value={`${Math.round(data.pctMarco * 100)}%`}
                  sub={`${brl(data.totalFaturado)} de ${data.proximoMarco.sub}`}
                  pct={data.pctMarco}
                  color="#FF9500"
                />
              )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3">
              <Kpi label="Recebido" value={brl(data.recebido)} accent="text-[#34C759]" sub="no período" />
              <Kpi label="Entregues" value={String(data.entregues)} sub="no período" />
              <Kpi label="Em produção" value={String(data.emProducaoCount)} sub={brl(data.emProducaoValor)} />
              <Kpi label="Pipeline aberto" value={String(data.pipelineCount)} sub={brl(data.pipelineValor)} />
            </div>

            {/* Financeiro */}
            <div className={`${CARD} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10.5px] uppercase tracking-wide font-bold text-[#8E8E93]">A receber</p>
                <p className="text-[13px] font-semibold tabular-nums text-[#1C1C1E]">{brl(data.aReceber)}</p>
              </div>
              {data.vencidos.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  <p className="text-[10px] text-[#FF3B30] font-medium">{data.vencidos.length} vencido(s) · {brl(data.valorVencido)}</p>
                  {data.vencidos.slice(0, 3).map(l => {
                    const dias = Math.floor((Date.now() - parseIso(l.dataVencimento).getTime()) / 86_400_000)
                    return (
                      <div key={l.id} className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-[12px] text-[#1C1C1E] truncate">{l.nomeCliente ?? l.descricao}</p>
                          <p className="text-[10px] text-[#FF3B30]">{dias}d atrasado</p>
                        </div>
                        <p className="text-[12px] font-medium tabular-nums shrink-0 ml-2">{brl(l.valor)}</p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-[#8E8E93]">Nenhum lançamento vencido</p>
              )}
            </div>

            {/* Últimos negócios */}
            <div className={`${CARD} p-4`}>
              <p className="text-[10.5px] uppercase tracking-wide font-bold text-[#8E8E93] mb-3">Últimos negócios</p>
              {data.ultimosNegocios.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {data.ultimosNegocios.map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[12px] text-[#1C1C1E] truncate">{c.nomeCliente}</p>
                        <p className="text-[10px] text-[#8E8E93]">{displayDate(c)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${colBadge(c.coluna)}`}>{COLUNAS_KANBAN[c.coluna]}</span>
                        <p className="text-[12px] font-medium tabular-nums">{brl(c.preco)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[#8E8E93]">Nenhum negócio ainda</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
