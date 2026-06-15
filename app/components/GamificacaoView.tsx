"use client"
import { useState, useMemo } from "react"
import { KanbanCard, COL_FECHADO, COL_PERDIDO } from "../types"
import { brl } from "../utils"

const CARD = "bg-white border border-[rgba(0,0,0,0.06)] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]"

const MARCOS = [
  { threshold: 10_000,     label: "Primeiro Salto",    sub: "R$10 mil"     },
  { threshold: 50_000,     label: "Tração Real",        sub: "R$50 mil"     },
  { threshold: 100_000,    label: "6 Dígitos",          sub: "R$100 mil"    },
  { threshold: 500_000,    label: "Meio Milhão",        sub: "R$500 mil"    },
  { threshold: 1_000_000,  label: "Primeiro Milhão",    sub: "R$1 milhão"   },
  { threshold: 10_000_000, label: "Empresa de Verdade", sub: "R$10 milhões" },
]

function calcularStreak(kanban: KanbanCard[]): number {
  const dias = new Set(
    kanban
      .filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO && c.dataFechamento)
      .map(c => c.dataFechamento!)
  )
  const hoje = new Date()
  const hojeStr = hoje.toISOString().slice(0, 10)
  let streak = 0
  const cur = new Date(hoje)
  if (!dias.has(hojeStr)) cur.setDate(cur.getDate() - 1)
  while (dias.has(cur.toISOString().slice(0, 10))) {
    streak++
    cur.setDate(cur.getDate() - 1)
  }
  return streak
}

export function GamificacaoView({
  kanban,
  metaMensal,
  baselineFaturamento,
  onSaveConfig,
}: {
  kanban: KanbanCard[]
  metaMensal: number
  baselineFaturamento: number
  onSaveConfig: (updates: { metaMensal?: number; baselineFaturamento?: number }) => void
}) {
  const [editandoMeta, setEditandoMeta] = useState(false)
  const [draftMeta, setDraftMeta] = useState("")
  const [editandoBaseline, setEditandoBaseline] = useState(false)
  const [draftBaseline, setDraftBaseline] = useState("")

  const fechados = useMemo(
    () => kanban.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO),
    [kanban]
  )

  const totalFaturado = useMemo(
    () => baselineFaturamento + fechados.reduce((s, c) => s + c.preco, 0),
    [fechados, baselineFaturamento]
  )

  const faturadoMes = useMemo(() => {
    const hoje = new Date()
    const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`
    return fechados
      .filter(c => (c.dataFechamento ?? "").startsWith(mes))
      .reduce((s, c) => s + c.preco, 0)
  }, [fechados])

  const streak = useMemo(() => calcularStreak(kanban), [kanban])

  const mesNome = new Date().toLocaleDateString("pt-BR", { month: "long" })
  const pctMes = metaMensal > 0 ? Math.min(faturadoMes / metaMensal, 1) : 0

  const proximoMarco = MARCOS.find(m => m.threshold > totalFaturado) ?? null
  const pctProximo = proximoMarco
    ? Math.min(totalFaturado / proximoMarco.threshold, 1)
    : 1

  return (
    <div className="max-w-4xl mx-auto px-6 py-5 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-semibold text-[#1C1C1E]">Conquistas</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`${CARD} p-5`}>
          <p className="text-[10.5px] font-medium text-[#8E8E93] mb-3">Faturamento total</p>
          <p className="text-[22px] font-semibold tabular-nums leading-none text-[#1C1C1E] tracking-[-0.01em]">{brl(totalFaturado)}</p>
          {proximoMarco ? (
            <>
              <div className="flex items-center justify-between mt-3 mb-1">
                <p className="text-[10px] text-[#8E8E93]">Próximo: {proximoMarco.sub}</p>
                <p className="text-[10px] text-[#8E8E93] tabular-nums">{Math.round(pctProximo * 100)}%</p>
              </div>
              <div className="h-1 rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
                <div className="h-full rounded-full bg-[#007AFF] transition-all duration-500"
                  style={{ width: `${pctProximo * 100}%` }} />
              </div>
            </>
          ) : (
            <p className="text-[10px] mt-2" style={{ color: "#34C759" }}>Todos os marcos desbloqueados</p>
          )}
          <button
            onClick={() => { setEditandoBaseline(true); setDraftBaseline(String(baselineFaturamento)) }}
            className="mt-3 text-[9.5px] text-[#007AFF] hover:underline">
            {baselineFaturamento > 0 ? `Inclui ${brl(baselineFaturamento)} anterior ao sistema` : "+ Adicionar faturamento anterior"}
          </button>
        </div>

        <div className={`${CARD} p-5`}>
          <p className="text-[10.5px] font-medium text-[#8E8E93] mb-3">Meta de {mesNome}</p>
          <p className="text-[22px] font-semibold tabular-nums leading-none text-[#1C1C1E] tracking-[-0.01em]">
            {Math.round(pctMes * 100)}%
          </p>
          <p className="text-[10px] text-[#8E8E93] mt-1.5 tabular-nums">
            {brl(faturadoMes)} de {brl(metaMensal)}
          </p>
          <div className="mt-3 h-1 rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pctMes * 100}%`,
                background: pctMes >= 1 ? "#34C759" : pctMes >= 0.7 ? "#FF9500" : "#007AFF",
              }} />
          </div>
          {pctMes < 1 && faturadoMes > 0 && (
            <p className="text-[10px] text-[#8E8E93] mt-1.5 tabular-nums">
              Faltam {brl(metaMensal - faturadoMes)}
            </p>
          )}
          {pctMes >= 1 && (
            <p className="text-[10px] mt-1.5 font-medium" style={{ color: "#34C759" }}>Meta batida!</p>
          )}
          <button
            onClick={() => { setEditandoMeta(true); setDraftMeta(String(metaMensal)) }}
            className="mt-2 text-[9.5px] text-[#007AFF] hover:underline">
            Alterar meta
          </button>
        </div>

        <div className={`${CARD} p-5`}>
          <p className="text-[10.5px] font-medium text-[#8E8E93] mb-3">Streak</p>
          <p className="text-[22px] font-semibold tabular-nums leading-none text-[#1C1C1E] tracking-[-0.01em]">
            {streak}
            <span className="text-[14px] font-medium text-[#8E8E93] ml-1">{streak === 1 ? "dia" : "dias"}</span>
          </p>
          <p className="text-[10px] text-[#8E8E93] mt-1.5">fechamentos consecutivos</p>
          {streak >= 3 && (
            <p className="text-[10px] mt-2 font-medium" style={{ color: "#FF9500" }}>
              {streak >= 7 ? "Sequência incrível!" : "Boa sequência!"}
            </p>
          )}
          {streak === 0 && (
            <p className="text-[10px] text-[#8E8E93] mt-2">Feche um pedido hoje para começar</p>
          )}
        </div>
      </div>

      {/* Marcos */}
      <div>
        <p className="text-[10.5px] uppercase tracking-wide font-bold text-[#8E8E93] mb-3">Marcos de faturamento</p>
        <div className="grid grid-cols-3 gap-3">
          {MARCOS.map(marco => {
            const desbloqueado = totalFaturado >= marco.threshold
            const pct = desbloqueado ? 1 : Math.min(totalFaturado / marco.threshold, 1)
            return (
              <div key={marco.threshold} className={`${CARD} p-4`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#1C1C1E] leading-snug">{marco.label}</p>
                    <p className="text-[10.5px] tabular-nums font-medium mt-0.5"
                      style={{ color: desbloqueado ? "#FF9500" : "#8E8E93" }}>
                      {marco.sub}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={desbloqueado
                      ? { background: "rgba(52,199,89,0.1)", color: "#34C759" }
                      : { background: "rgba(0,0,0,0.04)", color: "#8E8E93" }}>
                    {desbloqueado ? "Conquistado" : `${Math.round(pct * 100)}%`}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct * 100}%`,
                      background: desbloqueado ? "#34C759" : "#007AFF",
                    }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal meta */}
      {editandoMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setEditandoMeta(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4">
            <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] flex items-center justify-between">
              <p className="font-bold text-[#1C1C1E] text-[15px]">Meta mensal</p>
              <button onClick={() => setEditandoMeta(false)} className="text-[#8E8E93] hover:text-[#1C1C1E] text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-[12px] text-[#8E8E93]">Faturamento alvo para {mesNome}</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E93] text-sm">R$</span>
                <input autoFocus type="number" min={0} value={draftMeta}
                  onChange={e => setDraftMeta(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { onSaveConfig({ metaMensal: Number(draftMeta) || metaMensal }); setEditandoMeta(false) }
                    if (e.key === "Escape") setEditandoMeta(false)
                  }}
                  className="w-full border border-[rgba(0,0,0,0.12)] rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 focus:border-[#007AFF]"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditandoMeta(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[#8E8E93] hover:bg-[#F2F2F7] transition-colors border border-[rgba(0,0,0,0.08)]">
                  Cancelar
                </button>
                <button onClick={() => { onSaveConfig({ metaMensal: Number(draftMeta) || metaMensal }); setEditandoMeta(false) }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#007AFF] hover:bg-[#0062CC] transition-colors">
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal baseline */}
      {editandoBaseline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setEditandoBaseline(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4">
            <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] flex items-center justify-between">
              <p className="font-bold text-[#1C1C1E] text-[15px]">Faturamento anterior</p>
              <button onClick={() => setEditandoBaseline(false)} className="text-[#8E8E93] hover:text-[#1C1C1E] text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-[12px] text-[#8E8E93]">Faturamento total antes de usar o sistema Enyla</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E93] text-sm">R$</span>
                <input autoFocus type="number" min={0} value={draftBaseline}
                  onChange={e => setDraftBaseline(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { onSaveConfig({ baselineFaturamento: Number(draftBaseline) || 0 }); setEditandoBaseline(false) }
                    if (e.key === "Escape") setEditandoBaseline(false)
                  }}
                  className="w-full border border-[rgba(0,0,0,0.12)] rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 focus:border-[#007AFF]"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditandoBaseline(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[#8E8E93] hover:bg-[#F2F2F7] transition-colors border border-[rgba(0,0,0,0.08)]">
                  Cancelar
                </button>
                <button onClick={() => { onSaveConfig({ baselineFaturamento: Number(draftBaseline) || 0 }); setEditandoBaseline(false) }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#007AFF] hover:bg-[#0062CC] transition-colors">
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sidebar widget ───────────────────────────────────────────────────────────

export function SidebarGamificacao({
  kanban,
  metaMensal,
  onClick,
}: {
  kanban: KanbanCard[]
  metaMensal: number
  baselineFaturamento: number
  onClick: () => void
}) {
  const fechados = kanban.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO)

  const faturadoMes = useMemo(() => {
    const hoje = new Date()
    const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`
    return fechados
      .filter(c => (c.dataFechamento ?? "").startsWith(mes))
      .reduce((s, c) => s + c.preco, 0)
  }, [fechados])

  const streak = useMemo(() => calcularStreak(kanban), [kanban])

  const pct = metaMensal > 0 ? Math.min(faturadoMes / metaMensal, 1) : 0
  const mesNome = new Date().toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")

  return (
    <button onClick={onClick}
      className="w-full px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] rounded-xl"
      style={{ margin: "0 8px", width: "calc(100% - 16px)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold">Streak</span>
        <span className={`text-[10.5px] font-bold tabular-nums ${streak > 0 ? "text-[#FF9500]" : "text-zinc-600"}`}>
          {streak}d
        </span>
      </div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-zinc-500 capitalize">{mesNome}</span>
        <span className="text-[10px] font-medium tabular-nums text-zinc-500">
          {Math.round(pct * 100)}%
        </span>
      </div>
      <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct * 100}%`,
            background: pct >= 1 ? "#34C759" : pct >= 0.7 ? "#FF9500" : "#007AFF",
          }} />
      </div>
    </button>
  )
}
