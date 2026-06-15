"use client"
import { useState, useMemo } from "react"
import { KanbanCard, COL_FECHADO, COL_PERDIDO } from "../types"

const MARCOS = [
  { threshold: 10_000,     label: "Primeiro Salto",   sub: "R$10 mil"    },
  { threshold: 50_000,     label: "Tração Real",       sub: "R$50 mil"    },
  { threshold: 100_000,    label: "6 Dígitos",         sub: "R$100 mil"   },
  { threshold: 500_000,    label: "Meio Milhão",       sub: "R$500 mil"   },
  { threshold: 1_000_000,  label: "Primeiro Milhão",   sub: "R$1 milhão"  },
  { threshold: 10_000_000, label: "Empresa de Verdade", sub: "R$10 milhões" },
]

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}

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

function proximoMarco(total: number) {
  return MARCOS.find(m => m.threshold > total) ?? null
}

function IconTrofeu({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
    </svg>
  )
}

function IconFogo({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path fillRule="evenodd" d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176 7.547 7.547 0 0 1-1.705-1.715.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z" clipRule="evenodd" />
    </svg>
  )
}

function IconLock({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  )
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  )
}

function IconEdit({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
    </svg>
  )
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
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`
    return fechados
      .filter(c => (c.dataFechamento ?? "").startsWith(mesAtual))
      .reduce((s, c) => s + c.preco, 0)
  }, [fechados])

  const streak = useMemo(() => calcularStreak(kanban), [kanban])

  const mesNome = new Date().toLocaleDateString("pt-BR", { month: "long" })
  const pctMes = metaMensal > 0 ? Math.min(faturadoMes / metaMensal, 1) : 0

  const proximo = proximoMarco(totalFaturado)
  const ultimoDesbloqueado = [...MARCOS].reverse().find(m => m.threshold <= totalFaturado) ?? null

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, #FFD60A 0%, #FF9500 100%)" }}>
          <IconTrofeu className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1C1C1E] leading-none">Conquistas</h1>
          <p className="text-[#8E8E93] text-xs mt-0.5">Seu progresso de vendas</p>
        </div>
      </div>

      {/* KPIs de topo */}
      <div className="grid grid-cols-3 gap-3">

        {/* Total faturado */}
        <div className="col-span-2 rounded-2xl px-5 py-4 border border-[rgba(0,0,0,0.06)] shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
          style={{ background: "linear-gradient(135deg, #1C1C1E 0%, #2C2C2E 100%)" }}>
          <p className="text-[10px] uppercase tracking-wide font-semibold text-zinc-500">Faturamento total</p>
          <p className="text-3xl font-bold text-white tabular-nums mt-1.5 leading-none">{brl(totalFaturado)}</p>
          {proximo && (
            <div className="mt-3">
              <div className="flex justify-between items-center mb-1.5">
                <p className="text-[10px] text-zinc-500">Próximo marco: {proximo.sub}</p>
                <p className="text-[10px] text-zinc-400 tabular-nums">
                  {Math.round((totalFaturado / proximo.threshold) * 100)}%
                </p>
              </div>
              <div className="h-1 rounded-full bg-zinc-700 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(totalFaturado / proximo.threshold) * 100}%`, background: "linear-gradient(90deg, #FFD60A, #FF9500)" }} />
              </div>
            </div>
          )}
          {!proximo && ultimoDesbloqueado && (
            <p className="text-[11px] text-[#FFD60A] font-semibold mt-3">Todos os marcos desbloqueados!</p>
          )}
          {/* Baseline link */}
          <button onClick={() => { setEditandoBaseline(true); setDraftBaseline(String(baselineFaturamento)) }}
            className="mt-2 text-[9.5px] text-zinc-600 hover:text-zinc-400 transition-colors underline underline-offset-2">
            {baselineFaturamento > 0 ? `Inclui ${brl(baselineFaturamento)} anterior ao sistema` : "+ Adicionar faturamento anterior ao sistema"}
          </button>
        </div>

        {/* Streak */}
        <div className="rounded-2xl px-4 py-4 border border-[rgba(0,0,0,0.06)] shadow-[0_1px_4px_rgba(0,0,0,0.04)] bg-white flex flex-col items-center justify-center text-center">
          <IconFogo className={`w-8 h-8 mb-1.5 ${streak > 0 ? "text-[#FF9500]" : "text-[#C7C7CC]"}`} />
          <p className="text-3xl font-bold text-[#1C1C1E] leading-none tabular-nums">{streak}</p>
          <p className="text-[10px] text-[#8E8E93] mt-1 leading-snug">
            {streak === 1 ? "dia seguido" : "dias seguidos"}
          </p>
          <p className="text-[9px] text-[#C7C7CC] mt-2">fechamentos consecutivos</p>
        </div>
      </div>

      {/* Meta do mês */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] shadow-[0_1px_4px_rgba(0,0,0,0.04)] px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide font-semibold text-[#8E8E93]">Meta de {mesNome}</p>
            <p className="text-[13px] font-semibold text-[#1C1C1E] mt-0.5">
              <span className="tabular-nums">{brl(faturadoMes)}</span>
              <span className="text-[#8E8E93] font-normal"> / </span>
              <span className="tabular-nums">{brl(metaMensal)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tabular-nums"
              style={{ color: pctMes >= 1 ? "#34C759" : pctMes >= 0.7 ? "#FF9500" : "#1C1C1E" }}>
              {Math.round(pctMes * 100)}%
            </span>
            <button onClick={() => { setEditandoMeta(true); setDraftMeta(String(metaMensal)) }}
              className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-[#F2F2F7] transition-colors text-[#8E8E93] hover:text-[#007AFF]">
              <IconEdit className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F2F2F7" }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pctMes * 100}%`,
              background: pctMes >= 1
                ? "linear-gradient(90deg, #34C759, #30D158)"
                : pctMes >= 0.7
                ? "linear-gradient(90deg, #FF9500, #FFCC00)"
                : "linear-gradient(90deg, #007AFF, #5AC8FA)",
            }} />
        </div>
        {pctMes >= 1 && (
          <p className="text-[11px] font-semibold mt-2" style={{ color: "#34C759" }}>Meta batida! Bora dobrar?</p>
        )}
        {pctMes > 0 && pctMes < 1 && (
          <p className="text-[10px] text-[#8E8E93] mt-2">
            Faltam {brl(metaMensal - faturadoMes)} para a meta
          </p>
        )}
      </div>

      {/* Marcos */}
      <div>
        <p className="text-[10.5px] uppercase tracking-wide font-bold text-[#8E8E93] px-1 mb-3">Marcos de faturamento</p>
        <div className="grid grid-cols-3 gap-3">
          {MARCOS.map(marco => {
            const desbloqueado = totalFaturado >= marco.threshold
            const pct = desbloqueado ? 1 : Math.min(totalFaturado / marco.threshold, 1)
            return (
              <div key={marco.threshold}
                className="rounded-2xl border px-4 py-4 relative overflow-hidden transition-all"
                style={{
                  borderColor: desbloqueado ? "rgba(255,214,10,0.35)" : "rgba(0,0,0,0.06)",
                  background: desbloqueado
                    ? "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)"
                    : "#F9F9F9",
                  boxShadow: desbloqueado ? "0 2px 8px rgba(255,149,0,0.12)" : "none",
                }}>
                {/* Icon */}
                <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-2.5"
                  style={{
                    background: desbloqueado
                      ? "linear-gradient(135deg, #FFD60A 0%, #FF9500 100%)"
                      : "rgba(0,0,0,0.06)",
                  }}>
                  {desbloqueado
                    ? <IconCheck className="w-4 h-4 text-white" />
                    : <IconLock className="w-3.5 h-3.5 text-[#C7C7CC]" />
                  }
                </div>

                <p className="text-[12px] font-bold leading-snug"
                  style={{ color: desbloqueado ? "#92400E" : "#8E8E93" }}>
                  {marco.label}
                </p>
                <p className="text-[10px] font-semibold mt-0.5 tabular-nums"
                  style={{ color: desbloqueado ? "#B45309" : "#C7C7CC" }}>
                  {marco.sub}
                </p>

                {/* Progress bar quando ainda não desbloqueado */}
                {!desbloqueado && pct > 0 && (
                  <div className="mt-2.5 h-1 rounded-full overflow-hidden bg-[#E5E5EA]">
                    <div className="h-full rounded-full" style={{
                      width: `${pct * 100}%`,
                      background: "linear-gradient(90deg, #007AFF, #5AC8FA)",
                    }} />
                  </div>
                )}

                {/* Checkmark decoration nos desbloqueados */}
                {desbloqueado && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(255,149,0,0.15)" }}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="#FF9500" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal editar meta */}
      {editandoMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs">
            <p className="font-semibold text-[#1C1C1E] mb-1">Meta mensal</p>
            <p className="text-[12px] text-[#8E8E93] mb-4">Valor em reais que você quer faturar em {mesNome}</p>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E93] text-sm">R$</span>
              <input autoFocus type="number" min={0} value={draftMeta}
                onChange={e => setDraftMeta(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { onSaveConfig({ metaMensal: Number(draftMeta) || metaMensal }); setEditandoMeta(false) }
                  if (e.key === "Escape") setEditandoMeta(false)
                }}
                className="w-full border rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2"
                style={{ borderColor: "rgba(0,0,0,0.12)", focusRingColor: "#007AFF" } as React.CSSProperties}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditandoMeta(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[#8E8E93] hover:bg-[#F2F2F7] transition-colors">
                Cancelar
              </button>
              <button onClick={() => { onSaveConfig({ metaMensal: Number(draftMeta) || metaMensal }); setEditandoMeta(false) }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ background: "#007AFF" }}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar baseline */}
      {editandoBaseline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs">
            <p className="font-semibold text-[#1C1C1E] mb-1">Faturamento anterior</p>
            <p className="text-[12px] text-[#8E8E93] mb-4">Faturamento total antes de começar a usar o sistema Enyla</p>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E93] text-sm">R$</span>
              <input autoFocus type="number" min={0} value={draftBaseline}
                onChange={e => setDraftBaseline(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { onSaveConfig({ baselineFaturamento: Number(draftBaseline) || 0 }); setEditandoBaseline(false) }
                  if (e.key === "Escape") setEditandoBaseline(false)
                }}
                className="w-full border rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2"
                style={{ borderColor: "rgba(0,0,0,0.12)" }}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditandoBaseline(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[#8E8E93] hover:bg-[#F2F2F7] transition-colors">
                Cancelar
              </button>
              <button onClick={() => { onSaveConfig({ baselineFaturamento: Number(draftBaseline) || 0 }); setEditandoBaseline(false) }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ background: "#007AFF" }}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Mini widgets para o sidebar
export function SidebarGamificacao({
  kanban,
  metaMensal,
  baselineFaturamento,
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
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`
    return fechados
      .filter(c => (c.dataFechamento ?? "").startsWith(mesAtual))
      .reduce((s, c) => s + c.preco, 0)
  }, [fechados])

  const streak = useMemo(() => calcularStreak(kanban), [kanban])

  const pct = metaMensal > 0 ? Math.min(faturadoMes / metaMensal, 1) : 0
  const mesNome = new Date().toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")

  return (
    <button onClick={onClick}
      className="w-full mx-2 mb-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
      style={{ width: "calc(100% - 16px)" }}>
      {/* Streak */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <svg fill="currentColor" viewBox="0 0 24 24" className={`w-3 h-3 ${streak > 0 ? "text-[#FF9500]" : "text-zinc-600"}`}>
            <path fillRule="evenodd" d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176 7.547 7.547 0 0 1-1.705-1.715.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z" clipRule="evenodd" />
          </svg>
          <span className="text-[10.5px] font-semibold text-zinc-400">Streak</span>
        </div>
        <span className={`text-[10.5px] font-bold tabular-nums ${streak > 0 ? "text-[#FF9500]" : "text-zinc-600"}`}>
          {streak}d
        </span>
      </div>

      {/* Meta mini */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-zinc-500 capitalize">{mesNome}</span>
        <span className="text-[10px] font-semibold tabular-nums text-zinc-400">
          {Math.round(pct * 100)}%
        </span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct * 100}%`,
            background: pct >= 1 ? "#34C759" : pct >= 0.7 ? "#FF9500" : "#007AFF",
          }} />
      </div>
    </button>
  )
}
