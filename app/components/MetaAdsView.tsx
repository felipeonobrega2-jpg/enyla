"use client"

import { useEffect, useRef, useState } from "react"
import { DollarSign, BarChart2, MousePointer, Users, TrendingDown, Target } from "lucide-react"

interface Props {
  isDark?: boolean
  faturamentoPorCampanha?: Record<string, number>
  clientesPorCampanha?: Record<string, number>
  ltvPorCampanha?: Record<string, number>
}

interface Campaign {
  campaign_id: string
  campaign_name: string
  impressions: string
  clicks: string
  spend: string
  reach: string
  cpm: string
  cpc: string
  ctr: string
  frequency?: string
  actions?: { action_type: string; value: string }[]
  info?: { status: string; objective: string } | null
}

interface Totals { impressions: number; clicks: number; spend: number; reach: number }

const PRESETS = [
  { value: "today",               label: "Hoje"             },
  { value: "yesterday",          label: "Ontem"            },
  { value: "last_7d",            label: "Últimos 7 dias"   },
  { value: "last_14d",           label: "Últimos 14 dias"  },
  { value: "last_28d",           label: "Últimos 28 dias"  },
  { value: "last_30d",           label: "Últimos 30 dias"  },
  { value: "last_90d",           label: "Últimos 90 dias"  },
  { value: "this_week_mon_today",label: "Esta semana"      },
  { value: "last_week_mon_sun",  label: "Semana passada"   },
  { value: "this_month",         label: "Este mês"         },
  { value: "last_month",         label: "Mês passado"      },
  { value: "last_quarter",       label: "Último trimestre" },
  { value: "this_year",          label: "Este ano"         },
  { value: "last_year",          label: "Ano passado"      },
  { value: "maximum",            label: "Tudo"             },
  { value: "custom",             label: "Personalizado…"   },
]

const ALL_COLS: { key: string; label: string; default: boolean }[] = [
  { key: "status",     label: "Status",          default: true  },
  { key: "impressoes", label: "Impressões",       default: true  },
  { key: "cliques",    label: "Cliques",          default: true  },
  { key: "alcance",    label: "Alcance",          default: false },
  { key: "ctr",        label: "CTR",              default: true  },
  { key: "cpc",        label: "CPC",              default: false },
  { key: "cpm",        label: "CPM",              default: false },
  { key: "gasto",      label: "Gasto",            default: true  },
  { key: "conversas",  label: "Leads",            default: true  },
  { key: "custo_conv", label: "Custo/Lead",       default: true  },
  { key: "frequencia",  label: "Frequência",        default: false },
  { key: "conversoes",  label: "Conversões",        default: false },
  { key: "faturamento", label: "Faturamento",       default: true  },
  { key: "roas",        label: "ROAS",              default: true  },
  { key: "roi",         label: "ROI",               default: true  },
  { key: "clientes",    label: "Clientes",          default: true  },
  { key: "cac",         label: "CAC",               default: true  },
  { key: "ltv_cac",     label: "LTV/CAC",           default: true  },
]

const COLS_KEY   = "meta_visible_cols"
const HIDDEN_KEY = "meta_hidden_campaigns"

const STATUS_LABEL: Record<string, string> = {
  ACTIVE:   "Ativa",
  PAUSED:   "Pausada",
  ARCHIVED: "Arquivada",
  DELETED:  "Deletada",
}
const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  ACTIVE:   { bg: "#c9f4d7", text: "#009351" },
  PAUSED:   { bg: "#ebe9f5", text: "#5e5c68" },
  ARCHIVED: { bg: "#ffd9d4", text: "#d33a3c" },
  DELETED:  { bg: "#ffd9d4", text: "#d33a3c" },
}

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
function num(n: number, dec = 0) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function pct(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%"
}
function actions_of(c: Campaign, ...types: string[]) {
  return types.reduce(
    (sum, t) => sum + Number(c.actions?.find(a => a.action_type === t)?.value ?? 0),
    0
  )
}

// Priority order — first non-zero wins (same logic as API route totals)
const LEAD_TYPES_PRIORITY = [
  "onsite_conversion.messaging_conversation_started_7d",
  "messaging_conversation_started_7d",
  "messaging_first_reply_7d",
  "lead",
]
function leads_of(c: Campaign) {
  return LEAD_TYPES_PRIORITY.reduce(
    (found, t) => found > 0 ? found : Number(c.actions?.find(a => a.action_type === t)?.value ?? 0),
    0
  )
}
function loadSet(key: string, defaults: string[]): Set<string> {
  try {
    const s = localStorage.getItem(key)
    return s ? new Set(JSON.parse(s)) : new Set(defaults)
  } catch { return new Set(defaults) }
}
function saveSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...s])) } catch { /* ignore */ }
}

export default function MetaAdsView({ isDark = false, faturamentoPorCampanha = {}, clientesPorCampanha = {}, ltvPorCampanha = {} }: Props) {
  const [preset, setPreset]         = useState("maximum")
  const [since, setSince]           = useState("")
  const [until, setUntil]           = useState("")
  const [campaigns, setCampaigns]   = useState<Campaign[]>([])
  const [apiTotals, setApiTotals]   = useState<{ conversas: number; reach: number; clicks: number; spend: number } | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [hiddenIds, setHiddenIds]   = useState<Set<string>>(new Set())
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set())
  const [showHidden, setShowHidden] = useState(false)
  const [colPickerOpen, setColPickerOpen] = useState(false)
  const colPickerRef = useRef<HTMLDivElement>(null)
  // Token management
  const [tokenStatus, setTokenStatus] = useState<{ daysLeft: number | null; canAutoRefresh: boolean } | null>(null)
  const [newToken, setNewToken]       = useState("")
  const [savingToken, setSavingToken] = useState(false)
  const [tokenMsg, setTokenMsg]       = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/meta/token").then(r => r.json()).then(d => setTokenStatus(d)).catch(() => {})
  }, [])

  async function salvarToken() {
    if (!newToken.trim()) return
    setSavingToken(true)
    setTokenMsg(null)
    try {
      const res  = await fetch("/api/meta/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: newToken.trim() }),
      })
      const data = await res.json()
      if (data.ok) {
        const dias = data.expiresAt
          ? Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 86_400_000)
          : null
        const tipo = data.longLived ? "longa duração (60 dias)" : "curta duração"
        setTokenMsg(`✓ Token ${tipo} salvo${dias ? ` — expira em ${dias} dias` : ""}`)
        setNewToken("")
        setError(null)
        setTokenStatus(prev => ({ ...prev!, daysLeft: dias }))
        // Reload campaigns
        setPreset(p => { setTimeout(() => setPreset(p), 50); return "last_30d" })
      } else {
        setTokenMsg(`Erro: ${data.error}`)
      }
    } catch {
      setTokenMsg("Erro ao salvar token")
    } finally {
      setSavingToken(false)
    }
  }

  useEffect(() => {
    setHiddenIds(loadSet(HIDDEN_KEY, []))
    const defaults = ALL_COLS.filter(c => c.default).map(c => c.key)
    const saved = loadSet(COLS_KEY, defaults)
    // Forward-migrate: add any new default columns missing from old saved prefs
    let changed = false
    for (const col of ALL_COLS.filter(c => c.default)) {
      if (!saved.has(col.key)) { saved.add(col.key); changed = true }
    }
    if (changed) saveSet(COLS_KEY, saved)
    setVisibleCols(saved)
  }, [])

  // Close col picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setColPickerOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function toggleHide(id: string) {
    setHiddenIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      saveSet(HIDDEN_KEY, next)
      return next
    })
  }

  function toggleCol(key: string) {
    setVisibleCols(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      saveSet(COLS_KEY, next)
      return next
    })
  }

  useEffect(() => {
    if (preset === "custom") {
      if (!since || !until || since > until) return
    }
    setLoading(true)
    setError(null)
    const url = preset === "custom"
      ? `/api/meta?since=${since}&until=${until}`
      : `/api/meta?preset=${preset}`
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setCampaigns(d.campaigns ?? [])
        if (d.totals) setApiTotals(d.totals)
      })
      .catch(() => setError("Erro ao carregar dados"))
      .finally(() => setLoading(false))
  }, [preset, since, until])

  const visible = campaigns.filter(c => !hiddenIds.has(c.campaign_id))
  const hidden  = campaigns.filter(c =>  hiddenIds.has(c.campaign_id))

  const visibleSpend       = visible.reduce((s, c) => s + Number(c.spend       ?? 0), 0)
  const visibleReach       = visible.reduce((s, c) => s + Number(c.reach       ?? 0), 0)
  const visibleImpressions = visible.reduce((s, c) => s + Number(c.impressions ?? 0), 0)
  const visibleClicks      = visible.reduce((s, c) => s + Number(c.clicks      ?? 0), 0)
  const avgCtr = visible.length
    ? visible.reduce((s, c) => s + Number(c.ctr ?? 0), 0) / visible.length : 0
  const avgCpc = visible.length
    ? visible.reduce((s, c) => s + Number(c.cpc ?? 0), 0) / visible.length : 0
  const totalLeads = visible.reduce((s, c) => s + leads_of(c), 0)
  const custoLead = totalLeads > 0 ? visibleSpend / totalLeads : 0

  const totalClientesAds = visible.reduce((s, c) => s + (clientesPorCampanha[c.campaign_id] ?? 0), 0)
  const totalLtvAds      = visible.reduce((s, c) => s + (ltvPorCampanha[c.campaign_id] ?? 0), 0)
  const globalCAC        = totalClientesAds > 0 ? visibleSpend / totalClientesAds : 0
  const ltvMedioAds      = totalClientesAds > 0 ? totalLtvAds / totalClientesAds : 0
  const ltvCacGlobal     = globalCAC > 0 ? ltvMedioAds / globalCAC : null

  const kpis = [
    { label: "Gasto total",  value: brl(visibleSpend),   sub: `${num(visibleReach)} alcançados`,
      accent: "#8456e8", icon: DollarSign,    iconBg: "rgba(132,86,232,0.10)" },
    { label: "Impressões",   value: num(visibleImpressions), sub: `${num(visibleClicks)} cliques`,
      accent: null,      icon: BarChart2,     iconBg: "rgba(116,116,128,0.10)" },
    { label: "CTR médio",    value: pct(avgCtr),          sub: "cliques / impressões",
      accent: null,      icon: MousePointer,  iconBg: "rgba(116,116,128,0.10)" },
    { label: "Leads",        value: num(totalLeads),      sub: "conversas iniciadas",
      accent: "#009351", icon: Users,         iconBg: "rgba(0,147,81,0.10)" },
    { label: "CAC",          value: globalCAC > 0 ? brl(globalCAC) : "—",
      sub: `${totalClientesAds} cliente${totalClientesAds !== 1 ? "s" : ""} convertidos`,
      accent: globalCAC > 0 ? "#c57800" : null, icon: TrendingDown, iconBg: "rgba(197,120,0,0.10)" },
    { label: "LTV/CAC",      value: ltvCacGlobal != null ? `${num(ltvCacGlobal, 2)}x` : "—",
      sub: ltvCacGlobal != null ? (ltvCacGlobal >= 3 ? "Ótimo" : ltvCacGlobal >= 1 ? "Saudável" : "Atenção") : "sem dados",
      accent: ltvCacGlobal == null ? null : ltvCacGlobal >= 3 ? "#009351" : ltvCacGlobal >= 1 ? "#c57800" : "#d33a3c",
      icon: Target, iconBg: ltvCacGlobal == null ? "rgba(116,116,128,0.10)" : ltvCacGlobal >= 3 ? "rgba(0,147,81,0.10)" : ltvCacGlobal >= 1 ? "rgba(197,120,0,0.10)" : "rgba(211,58,60,0.10)" },
  ]

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-page)" }}>
    <div className="px-8 space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap pt-7 pb-2">
        <div>
          <h1 className="text-[20px] font-bold text-[#1C1C1E] tracking-tight">Meta Ads</h1>
          <p className="text-[12px] text-[#8E8E93] mt-0.5">
            {brl(visibleSpend)} gasto · {num(totalLeads)} leads · {num(visibleImpressions)} impressões
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Column picker */}
          <div className="relative" ref={colPickerRef}>
            <button
              onClick={() => setColPickerOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[13px] font-medium transition-colors"
              style={{
                background: colPickerOpen ? "var(--bg-alt)" : "var(--bg-surface)",
                borderColor: "var(--border)",
                color: "var(--text-faint)",
              }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              Colunas
            </button>

            {colPickerOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 rounded-xl border shadow-lg py-1 min-w-[180px]"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border)",
                  maxHeight: "320px",
                  overflowY: "auto",
                  overscrollBehavior: "contain",
                }}>
                {ALL_COLS.map(col => (
                  <label key={col.key}
                    className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[var(--bg-alt)] transition-colors">
                    <input
                      type="checkbox"
                      checked={visibleCols.has(col.key)}
                      onChange={() => toggleCol(col.key)}
                      className="accent-[#8456e8] w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className="text-[12.5px]" style={{ color: "var(--text-main)" }}>{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Period select */}
          <div className="relative">
            <select
              value={preset}
              onChange={e => setPreset(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border text-[13px] font-medium cursor-pointer outline-none"
              style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-main)" }}>
              {PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: "var(--text-faint)" }} />
            </svg>
          </div>

          {/* Custom date inputs */}
          {preset === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={since}
                max={until || undefined}
                onChange={e => setSince(e.target.value)}
                className="px-2.5 py-2 rounded-xl border text-[13px] outline-none cursor-pointer"
                style={{ background: "var(--bg-surface)", borderColor: since ? "var(--border)" : "#c57800", color: "var(--text-main)" }}
              />
              <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>→</span>
              <input
                type="date"
                value={until}
                min={since || undefined}
                onChange={e => setUntil(e.target.value)}
                className="px-2.5 py-2 rounded-xl border text-[13px] outline-none cursor-pointer"
                style={{ background: "var(--bg-surface)", borderColor: until ? "var(--border)" : "#c57800", color: "var(--text-main)" }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Token warning: expiring soon */}
      {tokenStatus && tokenStatus.daysLeft !== null && tokenStatus.daysLeft <= 10 && tokenStatus.daysLeft > 0 && (
        <div className="rounded-2xl border px-5 py-3 flex items-center gap-3" style={{
          background: isDark ? "rgba(197,120,0,0.12)" : "#fffbf0",
          borderColor: "#c57800",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c57800" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          <p className="text-[13px] font-medium" style={{ color: "#c57800" }}>
            Token expira em {tokenStatus.daysLeft} dia{tokenStatus.daysLeft !== 1 ? "s" : ""}
            {tokenStatus.canAutoRefresh ? " — será renovado automaticamente em breve" : " — cole um novo token abaixo"}
          </p>
        </div>
      )}

      {/* Token expired / missing — renewal panel */}
      {(error === "TOKEN_EXPIRED" || error === "TOKEN_MISSING") && (
        <div className="rounded-2xl border p-5" style={{
          background: isDark ? "rgba(211,58,60,0.08)" : "#fff5f5",
          borderColor: "#d33a3c",
        }}>
          <p className="font-bold text-[15px] text-[#d33a3c] mb-1">Token da Meta expirou</p>
          <p className="text-[12px] text-[#d33a3c] opacity-75 mb-4">
            Cole um novo token abaixo. Ele será convertido automaticamente para token de longa duração (~60 dias)
            {tokenStatus?.canAutoRefresh ? " e renovado antes de expirar." : "."}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="EAAxxxxxxxx…"
              value={newToken}
              onChange={e => setNewToken(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border text-[12.5px] outline-none"
              style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-main)" }}
            />
            <button
              onClick={salvarToken}
              disabled={savingToken || !newToken.trim()}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ background: "#8456e8" }}>
              {savingToken ? "Salvando…" : "Salvar token"}
            </button>
          </div>
          {tokenMsg && <p className="text-[12px] mt-2" style={{ color: tokenMsg.startsWith("✓") ? "#009351" : "#d33a3c" }}>{tokenMsg}</p>}
        </div>
      )}

      {error && error !== "TOKEN_EXPIRED" && error !== "TOKEN_MISSING" && (
        <div className="rounded-2xl border p-5 text-center" style={{
          background: isDark ? "rgba(211,58,60,0.1)" : "#fff0f0",
          borderColor: "#d33a3c", color: "#d33a3c",
        }}>
          <p className="font-semibold text-[14px]">Erro ao carregar dados da Meta</p>
          <p className="text-[12px] mt-1 opacity-80">{error}</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        {kpis.map((k, i) => {
          const Icon = k.icon
          return (
            <div key={i} className="rounded-2xl px-5 py-4"
              style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: k.iconBg, color: k.accent ?? "#8E8E93" }}>
                  <Icon size={15} strokeWidth={2} />
                </div>
                <p className="text-[10.5px] uppercase tracking-wider font-semibold leading-tight" style={{ color: "var(--text-faint)" }}>{k.label}</p>
              </div>
              <p className="text-[22px] font-bold tabular-nums tracking-tight leading-none"
                style={{ color: k.accent ?? "var(--text-main)" }}>
                {loading ? "—" : k.value}
              </p>
              <p className="text-[11px] mt-1.5" style={{ color: "var(--text-faint)" }}>{k.sub}</p>
            </div>
          )
        })}
      </div>

      {/* Campaign Table */}
      <div className="rounded-[18px] overflow-hidden" style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
        <div className="px-5 py-4 border-b" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
          <p className="text-[15px] font-bold" style={{ color: "var(--text-main)" }}>
            Campanhas{visible.length > 0 && (
              <span className="text-[13px] font-normal ml-2" style={{ color: "var(--text-faint)" }}>({visible.length})</span>
            )}
          </p>
        </div>

        {loading ? (
          <div className="p-10 text-center" style={{ color: "var(--text-faint)" }}>
            <p className="text-[13px]">Carregando campanhas...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center" style={{ color: "var(--text-faint)" }}>
            <p className="text-[13px]">Nenhuma campanha com dados no período</p>
          </div>
        ) : (
          <CampaignRows campaigns={visible} isDark={isDark} hiddenIds={hiddenIds}
            onToggleHide={toggleHide} visibleCols={visibleCols}
            faturamentoPorCampanha={faturamentoPorCampanha}
            clientesPorCampanha={clientesPorCampanha}
            ltvPorCampanha={ltvPorCampanha} />
        )}
      </div>

      {/* Hidden campaigns */}
      {hidden.length > 0 && (
        <div>
          <button
            onClick={() => setShowHidden(v => !v)}
            className="flex items-center gap-2 text-[12.5px] font-medium px-3 py-1.5 rounded-lg border transition-colors"
            style={{ background: "transparent", borderColor: "var(--border)", color: "var(--text-faint)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {showHidden
                ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/></>
                : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
              }
            </svg>
            {showHidden ? "Ocultar campanhas escondidas" : `Ver campanhas ocultas (${hidden.length})`}
          </button>

          {showHidden && (
            <div className="mt-3 rounded-[18px] border overflow-hidden opacity-60"
              style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
              <div className="px-5 py-3 border-b" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
                <p className="text-[13px] font-semibold" style={{ color: "var(--text-faint)" }}>
                  Campanhas ocultas ({hidden.length})
                </p>
              </div>
              <CampaignRows campaigns={hidden} isDark={isDark} hiddenIds={hiddenIds}
                onToggleHide={toggleHide} visibleCols={visibleCols}
                faturamentoPorCampanha={faturamentoPorCampanha}
                clientesPorCampanha={clientesPorCampanha}
                ltvPorCampanha={ltvPorCampanha} />
            </div>
          )}
        </div>
      )}
    </div>
    </div>
  )
}

function CampaignRows({ campaigns, isDark, hiddenIds, onToggleHide, visibleCols, faturamentoPorCampanha, clientesPorCampanha, ltvPorCampanha }: {
  campaigns: Campaign[]
  isDark: boolean
  hiddenIds: Set<string>
  onToggleHide: (id: string) => void
  visibleCols: Set<string>
  faturamentoPorCampanha: Record<string, number>
  clientesPorCampanha: Record<string, number>
  ltvPorCampanha: Record<string, number>
}) {
  const col = (key: string) => visibleCols.has(key)

  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ minWidth: 600 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.5px]"
              style={{ color: "var(--text-faint)" }}>Campanha</th>
            {col("status")     && <Th>Status</Th>}
            {col("impressoes") && <Th>Impressões</Th>}
            {col("cliques")    && <Th>Cliques</Th>}
            {col("alcance")    && <Th>Alcance</Th>}
            {col("ctr")        && <Th>CTR</Th>}
            {col("cpc")        && <Th>CPC</Th>}
            {col("cpm")        && <Th>CPM</Th>}
            {col("gasto")      && <Th>Gasto</Th>}
            {col("conversas")  && <Th>Leads</Th>}
            {col("custo_conv")  && <Th>Custo/Lead</Th>}
            {col("frequencia") && <Th>Frequência</Th>}
            {col("conversoes")  && <Th>Conversões</Th>}
            {col("faturamento") && <Th>Faturamento</Th>}
            {col("roas")        && <Th>ROAS</Th>}
            {col("roi")         && <Th>ROI</Th>}
            {col("clientes")    && <Th>Clientes</Th>}
            {col("cac")         && <Th>CAC</Th>}
            {col("ltv_cac")     && <Th>LTV/CAC</Th>}
            <th className="px-4 py-3 w-8" />
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c, i) => {
            const status    = c.info?.status ?? "UNKNOWN"
            const sc        = STATUS_COLOR[status] ?? { bg: "var(--bg-alt)", text: "var(--text-faint)" }
            const conv      = actions_of(c, "purchase", "lead", "complete_registration", "onsite_conversion.purchase")
            const leads     = leads_of(c)
            const custoPorConv = leads > 0 ? Number(c.spend) / leads : 0
            const isHidden  = hiddenIds.has(c.campaign_id)

            return (
              <tr key={c.campaign_id}
                style={{ borderBottom: i < campaigns.length - 1 ? "1px solid var(--border)" : "none" }}
                className="hover:bg-[var(--bg-alt)] transition-colors group">
                <td className="px-4 py-3 max-w-[200px]">
                  <p className="text-[12.5px] font-medium truncate" style={{ color: "var(--text-main)" }}>
                    {c.campaign_name}
                  </p>
                </td>
                {col("status") && (
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: isDark ? "rgba(255,255,255,0.06)" : sc.bg, color: sc.text }}>
                      {STATUS_LABEL[status] ?? status}
                    </span>
                  </td>
                )}
                {col("impressoes") && <Td>{num(Number(c.impressions))}</Td>}
                {col("cliques")    && <Td>{num(Number(c.clicks))}</Td>}
                {col("alcance")    && <Td>{num(Number(c.reach))}</Td>}
                {col("ctr")        && <Td>{pct(Number(c.ctr))}</Td>}
                {col("cpc")        && <Td>{Number(c.cpc) > 0 ? brl(Number(c.cpc)) : "—"}</Td>}
                {col("cpm")        && <Td>{Number(c.cpm) > 0 ? brl(Number(c.cpm)) : "—"}</Td>}
                {col("gasto")      && (
                  <td className="px-4 py-3">
                    <span className="tabular-nums text-[12.5px] font-semibold" style={{ color: "#8456e8" }}>
                      {Number(c.spend) > 0 ? brl(Number(c.spend)) : "—"}
                    </span>
                  </td>
                )}
                {col("conversas") && (
                  <td className="px-4 py-3">
                    <span className="tabular-nums text-[12.5px]" style={{ color: leads > 0 ? "#009351" : "var(--text-faint)" }}>
                      {leads > 0 ? num(leads) : "—"}
                    </span>
                  </td>
                )}
                {col("custo_conv") && (
                  <td className="px-4 py-3">
                    <span className="tabular-nums text-[12.5px]" style={{ color: custoPorConv > 0 ? "var(--text-main)" : "var(--text-faint)" }}>
                      {custoPorConv > 0 ? brl(custoPorConv) : "—"}
                    </span>
                  </td>
                )}
                {col("frequencia") && (
                  <Td>{Number(c.frequency ?? 0) > 0 ? num(Number(c.frequency), 2) : "—"}</Td>
                )}
                {col("conversoes") && (
                  <td className="px-4 py-3">
                    <span className="tabular-nums text-[12.5px]" style={{ color: conv > 0 ? "#009351" : "var(--text-faint)" }}>
                      {conv > 0 ? num(conv) : "—"}
                    </span>
                  </td>
                )}
                {col("faturamento") && (() => {
                  const fat = faturamentoPorCampanha[c.campaign_id] ?? 0
                  return (
                    <td className="px-4 py-3">
                      <span className="tabular-nums text-[12.5px] font-semibold" style={{ color: fat > 0 ? "#009351" : "var(--text-faint)" }}>
                        {fat > 0 ? brl(fat) : "—"}
                      </span>
                    </td>
                  )
                })()}
                {col("roas") && (() => {
                  const fat   = faturamentoPorCampanha[c.campaign_id] ?? 0
                  const spend = Number(c.spend ?? 0)
                  const roas  = fat > 0 && spend > 0 ? fat / spend : 0
                  return (
                    <td className="px-4 py-3">
                      <span className="tabular-nums text-[12.5px] font-semibold"
                        style={{ color: roas >= 1 ? "#009351" : roas > 0 ? "#c57800" : "var(--text-faint)" }}>
                        {roas > 0 ? `${num(roas, 2)}x` : "—"}
                      </span>
                    </td>
                  )
                })()}
                {col("roi") && (() => {
                  const fat   = faturamentoPorCampanha[c.campaign_id] ?? 0
                  const spend = Number(c.spend ?? 0)
                  const roi   = fat > 0 && spend > 0 ? ((fat - spend) / spend) * 100 : null
                  return (
                    <td className="px-4 py-3">
                      <span className="tabular-nums text-[12.5px] font-semibold"
                        style={{ color: roi == null ? "var(--text-faint)" : roi >= 0 ? "#009351" : "#d33a3c" }}>
                        {roi != null ? `${num(roi, 0)}%` : "—"}
                      </span>
                    </td>
                  )
                })()}
                {col("clientes") && (() => {
                  const cnt = clientesPorCampanha[c.campaign_id] ?? 0
                  return (
                    <td className="px-4 py-3">
                      <span className="tabular-nums text-[12.5px]"
                        style={{ color: cnt > 0 ? "#009351" : "var(--text-faint)" }}>
                        {cnt > 0 ? num(cnt) : "—"}
                      </span>
                    </td>
                  )
                })()}
                {col("cac") && (() => {
                  const cnt   = clientesPorCampanha[c.campaign_id] ?? 0
                  const spend = Number(c.spend ?? 0)
                  const cac   = cnt > 0 && spend > 0 ? spend / cnt : null
                  return (
                    <td className="px-4 py-3">
                      <span className="tabular-nums text-[12.5px] font-semibold"
                        style={{ color: cac == null ? "var(--text-faint)" : "#c57800" }}>
                        {cac != null ? brl(cac) : "—"}
                      </span>
                    </td>
                  )
                })()}
                {col("ltv_cac") && (() => {
                  const cnt   = clientesPorCampanha[c.campaign_id] ?? 0
                  const spend = Number(c.spend ?? 0)
                  const ltv   = ltvPorCampanha[c.campaign_id] ?? 0
                  const cac   = cnt > 0 && spend > 0 ? spend / cnt : 0
                  const ltvMed = cnt > 0 ? ltv / cnt : 0
                  const ratio = cac > 0 && ltvMed > 0 ? ltvMed / cac : null
                  return (
                    <td className="px-4 py-3">
                      <span className="tabular-nums text-[12.5px] font-semibold"
                        style={{ color: ratio == null ? "var(--text-faint)" : ratio >= 3 ? "#009351" : ratio >= 1 ? "#c57800" : "#d33a3c" }}>
                        {ratio != null ? `${num(ratio, 2)}x` : "—"}
                      </span>
                    </td>
                  )
                })()}
                <td className="px-4 py-3">
                  <button
                    onClick={() => onToggleHide(c.campaign_id)}
                    title={isHidden ? "Mostrar campanha" : "Ocultar campanha"}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-[var(--bg-alt)]"
                    style={{ color: "var(--text-faint)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {isHidden
                        ? <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                        : <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                            <line x1="1" y1="1" x2="23" y2="23"/></>
                      }
                    </svg>
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.5px] whitespace-nowrap"
      style={{ color: "var(--text-faint)" }}>
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-3">
      <span className="tabular-nums text-[12.5px]" style={{ color: "var(--text-main)" }}>{children}</span>
    </td>
  )
}
