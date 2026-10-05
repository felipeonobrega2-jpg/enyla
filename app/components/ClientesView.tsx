"use client"

import { useState, useMemo, useEffect } from "react"
import {
  Users, TrendingUp, DollarSign, Target, Star,
  CheckCircle2, XCircle, BarChart3, UserCheck, UserPlus,
} from "lucide-react"
import { KanbanCard, COLUNAS_KANBAN, COL_FECHADO, COL_PERDIDO, PropostaCustom, Cliente, LancamentoFinanceiro } from "../types"
import { brl, num } from "../utils"
import { HistItem } from "./HistoricoView"
import { COL_COLORS } from "./kanban-colors"
import { ClientePerfilModal } from "./ClientePerfilModal"

type Tab = "dashboard" | "clientes" | "leads"
type Ordem = "ltv" | "valor" | "nome" | "orcamentos" | "recente"

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10.5px] uppercase tracking-wider font-bold text-[#8E8E93]">{children}</p>
}

function KpiCard({ icon, iconColor, iconBg, label, value, sub, subColor, highlight }: {
  icon: React.ReactNode; iconColor: string; iconBg: string
  label: string; value: string; sub?: string; subColor?: string; highlight?: boolean
}) {
  return (
    <div className={`bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl px-5 py-4 ${highlight ? "ring-1 ring-[rgba(124,58,237,0.1)]" : ""}`}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: iconBg, color: iconColor }}>{icon}</div>
        <p className="text-[10.5px] uppercase tracking-wider font-semibold text-[#8E8E93] leading-tight">{label}</p>
      </div>
      <p className="text-[22px] font-bold tabular-nums text-[#1C1C1E] tracking-tight leading-none">{value}</p>
      {sub && <p className="text-[11px] mt-1.5" style={{ color: subColor ?? "#8E8E93" }}>{sub}</p>}
    </div>
  )
}

export function ClientesView({
  historico, kanban, propostasCustom, lancamentos, cadastro,
  onReplicar, onWhatsApp, onSaveCliente, initialPerfil,
}: {
  historico: HistItem[]
  kanban: KanbanCard[]
  propostasCustom: PropostaCustom[]
  lancamentos: LancamentoFinanceiro[]
  cadastro: Cliente[]
  onReplicar: (item: HistItem) => void
  onWhatsApp: (item: HistItem) => void
  onSaveCliente?: (id: string, updates: Partial<Cliente>) => void
  initialPerfil?: string | null
}) {
  const [tab, setTab]         = useState<Tab>("dashboard")
  const [busca, setBusca]     = useState("")
  const [ordem, setOrdem]     = useState<Ordem>("ltv")
  const [expandido, setExpandido] = useState<string | null>(null)
  const [perfilAberto, setPerfilAberto] = useState<string | null>(initialPerfil ?? null)

  useEffect(() => {
    if (initialPerfil) setPerfilAberto(initialPerfil)
  }, [initialPerfil])

  const precoIdeal = (item: HistItem) => {
    const ideal = item.calculo.tabela.find(l => l.quantidade === item.calculo.sweetSpotIdealQtd) ?? item.calculo.tabela[0]
    return item.form.comFaca ? (ideal?.precoComFaca ?? 0) : (ideal?.precoSemFaca ?? 0)
  }
  const precoPropostaIdeal = (p: PropostaCustom) => {
    const ativas = p.linhas.filter(l => l.ativa && l.quantidade > 0)
    const ideal = ativas.find(l => l.isIdeal) ?? ativas[ativas.length - 1]
    return ideal ? ideal.unitario * ideal.quantidade : 0
  }

  const { clientes, listaClientes, listaLeads } = useMemo(() => {
    const porCliente: Record<string, { itens: HistItem[]; propostas: PropostaCustom[]; firstIdx: number }> = {}
    historico.forEach((item, idx) => {
      const nome = item.form.nomeCliente?.trim() || "Sem nome"
      if (!porCliente[nome]) porCliente[nome] = { itens: [], propostas: [], firstIdx: idx }
      porCliente[nome].itens.push(item)
    })
    propostasCustom.forEach(p => {
      const nome = p.nomeCliente?.trim() || "Sem nome"
      if (!porCliente[nome]) porCliente[nome] = { itens: [], propostas: [], firstIdx: historico.length }
      porCliente[nome].propostas.push(p)
    })

    const all = Object.entries(porCliente).map(([nome, { itens, propostas, firstIdx }]) => {
      const cardsCliente = kanban.filter(c =>
        itens.some(i => i.numero && i.numero === c.numero) ||
        propostas.some(p => p.cardId && p.cardId === c.id)
      )
      const cardsAtivos = cardsCliente.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO)
      // lote-deduped: cada lote conta como 1 pedido, independente do número de cards
      const loteIdsAtivos = new Set(cardsAtivos.filter(c => c.loteId).map(c => c.loteId!))
      const fechados   = loteIdsAtivos.size + cardsAtivos.filter(c => !c.loteId).length
      const perdidos   = cardsCliente.filter(c => c.coluna === COL_PERDIDO).length
      const decididos  = fechados + perdidos
      const valorFechado = cardsAtivos.reduce((s, c) => s + c.preco, 0)
      // LTV = valor total dos pedidos fechados (preço contratado, mesma fonte do modal)
      const ltv        = valorFechado
      const totalValor = itens.reduce((s, i) => s + precoIdeal(i), 0) + propostas.reduce((s, p) => s + precoPropostaIdeal(p), 0)
      const datas      = [...itens.map(i => i.data), ...propostas.map(p => p.data)].filter(Boolean)
      const ultimaData = datas[0] ?? ""
      return { nome, itens, propostas, firstIdx, fechados, perdidos, decididos, totalValor, valorFechado, ultimaData, ltv }
    })

    return {
      clientes: all,
      listaClientes: all.filter(c => c.fechados > 0),
      listaLeads: all.filter(c => c.fechados === 0),
    }
  }, [historico, propostasCustom, kanban, lancamentos])

  const metrics = useMemo(() => {
    const totalLtv       = listaClientes.reduce((s, c) => s + c.ltv, 0)
    const ltvMedio       = listaClientes.length > 0 ? totalLtv / listaClientes.length : 0
    const totalFechados  = listaClientes.reduce((s, c) => s + c.fechados, 0)
    const totalPerdidos  = listaClientes.reduce((s, c) => s + c.perdidos, 0) +
                           listaLeads.reduce((s, c) => s + c.perdidos, 0)
    const decididos      = totalFechados + totalPerdidos
    const taxaConv       = decididos > 0 ? (totalFechados / decididos) * 100 : 0
    const ticketMedio    = totalFechados > 0 ? listaClientes.reduce((s, c) => s + c.valorFechado, 0) / totalFechados : 0
    const topClientes    = [...listaClientes].sort((a, b) => b.ltv - a.ltv).slice(0, 5)
    const totalOrcamentos = clientes.reduce((s, c) => s + c.itens.length + c.propostas.length, 0)
    const leadParaCliente = clientes.length > 0 ? (listaClientes.length / clientes.length) * 100 : 0
    const concentracao = topClientes[0] && totalLtv > 0
      ? { topNome: topClientes[0].nome, pct: (topClientes[0].ltv / totalLtv) * 100 }
      : null
    return { totalLtv, ltvMedio, totalFechados, totalPerdidos, taxaConv, ticketMedio, topClientes, totalOrcamentos, leadParaCliente, concentracao }
  }, [clientes, listaClientes, listaLeads])

  const sortList = (list: typeof clientes) =>
    [...list]
      .filter(c => !busca.trim() || c.nome.toLowerCase().includes(busca.toLowerCase()))
      .sort((a, b) => {
        if (ordem === "ltv")        return b.ltv - a.ltv
        if (ordem === "valor")      return b.totalValor - a.totalValor
        if (ordem === "orcamentos") return (b.itens.length + b.propostas.length) - (a.itens.length + a.propostas.length)
        if (ordem === "nome")       return a.nome.localeCompare(b.nome, "pt-BR")
        if (ordem === "recente")    return a.firstIdx - b.firstIdx
        return 0
      })

  const listaAtiva = sortList(tab === "clientes" ? listaClientes : listaLeads)

  const TAB = (active: boolean) =>
    `px-4 py-2 text-[12.5px] font-semibold rounded-lg transition-colors ${active ? "bg-white text-[#191625] shadow-sm" : "text-[#8E8E93] hover:text-[#5e5c68]"}`

  const showFilter = tab !== "dashboard"

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-7 pb-5 shrink-0">
        <div>
          <h1 className="text-[20px] font-bold text-[#1C1C1E] tracking-tight">Clientes</h1>
          <p className="text-[12px] text-[#8E8E93] mt-0.5">
            {listaClientes.length} clientes · {listaLeads.length} leads · {metrics.totalOrcamentos} orçamentos
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-8 pb-4 shrink-0">
        <div className="inline-flex bg-[#F2F2F7] rounded-xl p-1 gap-0.5">
          <button className={TAB(tab === "dashboard")} onClick={() => setTab("dashboard")}>Dashboard</button>
          <button className={TAB(tab === "clientes")} onClick={() => { setTab("clientes"); setBusca("") }}>
            Clientes
            {listaClientes.length > 0 && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(116,116,128,0.12)] text-[#8E8E93] font-semibold">
                {listaClientes.length}
              </span>
            )}
          </button>
          <button className={TAB(tab === "leads")} onClick={() => { setTab("leads"); setBusca("") }}>
            Leads
            {listaLeads.length > 0 && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(116,116,128,0.12)] text-[#8E8E93] font-semibold">
                {listaLeads.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilter && (
        <div className="px-8 pb-4 shrink-0 flex items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93] pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder={tab === "clientes" ? "Buscar cliente…" : "Buscar lead…"}
              className="w-full border border-[rgba(0,0,0,0.12)] rounded-xl pl-9 pr-8 py-2 text-[12.5px] text-[#191625] placeholder:text-[rgba(60,60,67,0.36)] focus:outline-none focus:ring-2 focus:ring-[#8456e8]/25 focus:border-[#8456e8] bg-white transition-all" />
            {busca && (
              <button onClick={() => setBusca("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-lg leading-none text-[rgba(60,60,67,0.36)] hover:text-[#191625]">×</button>
            )}
          </div>
          <select value={ordem} onChange={e => setOrdem(e.target.value as Ordem)}
            className="border border-[rgba(0,0,0,0.12)] rounded-xl px-3 py-2 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/25 cursor-pointer transition-all">
            <option value="ltv">Maior LTV</option>
            <option value="valor">Maior valor</option>
            <option value="orcamentos">Mais registros</option>
            <option value="nome">Nome A–Z</option>
            <option value="recente">Mais recentes</option>
          </select>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "dashboard" ? (
          <DashboardTab metrics={metrics} listaClientes={listaClientes} />
        ) : (
          <ListaTab
            lista={listaAtiva}
            busca={busca}
            isLeads={tab === "leads"}
            expandido={expandido}
            setExpandido={setExpandido}
            setPerfilAberto={setPerfilAberto}
            kanban={kanban}
            cadastro={cadastro}
            onReplicar={onReplicar}
            onWhatsApp={onWhatsApp}
          />
        )}
      </div>

      {perfilAberto && (() => {
        const c = clientes.find(c => c.nome === perfilAberto)
        if (!c) return null
        return (
          <ClientePerfilModal
            nome={c.nome}
            cadastro={cadastro.find(cl => cl.nome.trim().toLowerCase() === c.nome.toLowerCase()) ?? null}
            itens={c.itens}
            propostas={c.propostas}
            kanban={kanban}
            lancamentos={lancamentos}
            onClose={() => setPerfilAberto(null)}
            onReplicar={onReplicar}
            onWhatsApp={onWhatsApp}
            onSave={onSaveCliente
              ? updates => {
                  const cad = cadastro.find(cl => cl.nome.trim().toLowerCase() === c.nome.toLowerCase())
                  if (cad) onSaveCliente(cad.id, updates)
                }
              : undefined}
          />
        )
      })()}
    </div>
  )
}

// ── Dashboard Tab ──────────────────────────────────────────────────────────────

type ClienteItem = {
  nome: string; itens: unknown[]; propostas: unknown[]
  fechados: number; perdidos: number; decididos: number
  totalValor: number; valorFechado: number; ultimaData: string; ltv: number
}

function DashboardTab({ metrics, listaClientes }: {
  metrics: {
    totalLtv: number; ltvMedio: number; totalFechados: number; totalPerdidos: number
    taxaConv: number; ticketMedio: number; topClientes: ClienteItem[]; totalOrcamentos: number; leadParaCliente: number
    concentracao: { topNome: string; pct: number } | null
  }
  listaClientes: ClienteItem[]
}) {
  const { totalLtv, ltvMedio, totalFechados, totalPerdidos, taxaConv, ticketMedio, topClientes, totalOrcamentos, leadParaCliente, concentracao } = metrics
  const convColor = "#8456e8"
  const convBg    = "rgba(132,86,232,0.08)"

  return (
    <div className="px-8 pb-10 space-y-6">

      {/* KPIs principais */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard icon={<Users className="w-4 h-4" />} iconColor="#7c3aed" iconBg="rgba(124,58,237,0.08)"
          label="Total de clientes" value={String(listaClientes.length)} sub="já compraram" />
        <KpiCard icon={<Star className="w-4 h-4" />} iconColor="#f59e0b" iconBg="rgba(245,158,11,0.08)"
          label="LTV médio" value={ltvMedio > 0 ? brl(ltvMedio) : "—"} sub="receita média por cliente"
          subColor="#f59e0b" highlight />
        <KpiCard icon={<DollarSign className="w-4 h-4" />} iconColor="#15803d" iconBg="rgba(22,163,74,0.08)"
          label="LTV total" value={totalLtv > 0 ? brl(totalLtv) : "—"} sub="total recebido de clientes" subColor="#15803d" />
        <KpiCard icon={<Target className="w-4 h-4" />} iconColor={convColor} iconBg={convBg}
          label="Taxa de conversão" value={`${num(taxaConv, 1)}%`}
          sub="fechados ÷ decididos" subColor={convColor} />
        {(() => {
          const cor = concentracao
            ? concentracao.pct >= 60 ? "#d33a3c" : concentracao.pct >= 40 ? "#c57800" : "#009351"
            : undefined
          return (
            <KpiCard icon={<UserCheck className="w-4 h-4" />}
              iconBg={cor ? `${cor}18` : "rgba(116,116,128,0.10)"}
              iconColor={cor ?? "#8E8E93"}
              label="Concentração"
              value={concentracao ? `${num(concentracao.pct, 0)}%` : "—"}
              sub={concentracao ? `top: ${concentracao.topNome.split(" ")[0]}` : "sem dados de LTV"}
              subColor={cor} />
          )
        })()}
      </div>

      {/* KPIs secundários */}
      <div>
        <SectionLabel>Vendas</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <KpiCard icon={<CheckCircle2 className="w-4 h-4" />} iconColor="#15803d" iconBg="rgba(22,163,74,0.08)"
            label="Pedidos fechados" value={String(totalFechados)} sub="de clientes ativos" />
          <KpiCard icon={<TrendingUp className="w-4 h-4" />} iconColor="#0ea5e9" iconBg="rgba(14,165,233,0.08)"
            label="Ticket médio" value={ticketMedio > 0 ? brl(ticketMedio) : "—"} sub="por pedido fechado" />
          <KpiCard icon={<BarChart3 className="w-4 h-4" />} iconColor="#7c3aed" iconBg="rgba(124,58,237,0.08)"
            label="Orçamentos emitidos" value={String(totalOrcamentos)} sub="total histórico" />
          <KpiCard icon={<UserCheck className="w-4 h-4" />}
            iconColor="#8456e8"
            iconBg="rgba(132,86,232,0.08)"
            label="Lead → Cliente"
            value={`${num(leadParaCliente, 1)}%`}
            sub="dos contatos convertidos"
            subColor="#8456e8" />
        </div>
      </div>

      {/* Conversão visual */}
      {(totalFechados + totalPerdidos) > 0 && (
        <div>
          <SectionLabel>Conversão</SectionLabel>
          <div className="mt-3 bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-semibold text-[#5e5c68]">Fechados vs. Perdidos</span>
              <span className="text-[12px] font-bold" style={{ color: convColor }}>{num(taxaConv, 1)}% conversão</span>
            </div>
            <div className="h-2.5 rounded-full bg-[rgba(185,28,28,0.12)] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${taxaConv}%`, background: convColor }} />
            </div>
            <div className="flex justify-between mt-2.5 text-[11px] text-[#8E8E93]">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />{totalFechados} fechados
              </span>
              <span className="flex items-center gap-1">
                <XCircle className="w-3 h-3 text-red-500" />{totalPerdidos} perdidos
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Ranking top clientes */}
      {topClientes.length > 0 && (
        <div>
          <SectionLabel>Top clientes por LTV</SectionLabel>
          <div className="mt-3 rounded-2xl p-5 space-y-3" style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
            {topClientes.map((c, i) => {
              const maxLtv = topClientes[0].ltv || 1
              const pct = (c.ltv / maxLtv) * 100
              return (
                <div key={c.nome} className="flex items-center gap-3">
                  <span className="w-5 text-[11px] font-bold tabular-nums shrink-0"
                    style={{ color: i === 0 ? "#f59e0b" : "var(--text-faint)" }}>#{i + 1}</span>
                  <span className="w-[140px] text-[11.5px] font-medium truncate shrink-0" style={{ color: "var(--text-main)" }}>{c.nome}</span>
                  <div className="flex-1 h-2 rounded-full bg-[rgba(0,0,0,0.05)] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: i === 0 ? "#f59e0b" : "#8456e8" }} />
                  </div>
                  <span className="w-20 text-right text-[12px] font-bold tabular-nums shrink-0"
                    style={{ color: i === 0 ? "#f59e0b" : "#8456e8" }}>{brl(c.ltv)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {listaClientes.length === 0 && (
        <div className="py-20 text-center">
          <div className="flex justify-center mb-3"><UserCheck className="w-10 h-10 text-[#c7c7cc]" /></div>
          <p className="text-[14px] font-semibold text-[#5e5c68]">Nenhum cliente ainda</p>
          <p className="text-[12px] text-[#8E8E93] mt-1">Feche orçamentos para construir sua base</p>
        </div>
      )}
    </div>
  )
}

// ── Lista Tab ──────────────────────────────────────────────────────────────────

function ListaTab({ lista, busca, isLeads, expandido, setExpandido, setPerfilAberto, kanban, cadastro, onReplicar, onWhatsApp }: {
  lista: ClienteItem[]
  busca: string
  isLeads: boolean
  expandido: string | null
  setExpandido: (n: string | null) => void
  setPerfilAberto: (n: string | null) => void
  kanban: KanbanCard[]
  cadastro: Cliente[]
  onReplicar: (item: HistItem) => void
  onWhatsApp: (item: HistItem) => void
}) {
  if (lista.length === 0) return (
    <div className="py-16 text-center">
      <div className="flex justify-center mb-3">
        {isLeads ? <UserPlus className="w-8 h-8 text-[#c7c7cc]" /> : <UserCheck className="w-8 h-8 text-[#c7c7cc]" />}
      </div>
      <p className="text-[13px] text-[#8E8E93]">
        {busca ? `Nenhum resultado para "${busca}"` : isLeads ? "Nenhum lead ainda" : "Nenhum cliente ainda"}
      </p>
    </div>
  )

  return (
    <div className="px-8 pb-8 space-y-2">
      <p className="text-[10px] uppercase tracking-wide font-semibold text-[#8E8E93] mb-1">
        {lista.length} {isLeads ? "lead" : "cliente"}{lista.length !== 1 ? "s" : ""}
      </p>

      {lista.map(({ nome, itens, propostas, fechados, perdidos, decididos, totalValor, valorFechado, ultimaData, ltv }) => {
        const conversao  = decididos > 0 ? Math.round(fechados / decididos * 100) : null
        const aberto     = expandido === nome
        const totalItens = itens.length + propostas.length
        const cad        = cadastro.find(cl => cl.nome.trim().toLowerCase() === nome.toLowerCase())

        return (
          <div key={nome}
            className="rounded-2xl overflow-hidden bg-white border border-[rgba(0,0,0,0.07)] hover:border-[rgba(0,0,0,0.10)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-200">

            {/* Row */}
            <div className="flex items-center gap-3 px-5 py-3.5">
              <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => setExpandido(aberto ? null : nome)}>
                <div className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: fechados > 0 ? "#30D158" : "#f59e0b" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-semibold text-[#1C1C1E] leading-snug">{nome}</span>
                    {fechados > 0
                      ? <span className="text-[9px] font-bold px-1.5 py-[2px] rounded-md bg-emerald-50 text-emerald-700">CLIENTE</span>
                      : <span className="text-[9px] font-bold px-1.5 py-[2px] rounded-md bg-amber-50 text-amber-700">LEAD</span>
                    }
                    {cad?.origemCampanhaNome && (
                      <span className="text-[9px] font-semibold px-1.5 py-[2px] rounded-md"
                        style={{ background: "rgba(132,86,232,0.10)", color: "#8456e8" }}>
                        {cad.origemCampanhaNome.length > 28 ? cad.origemCampanhaNome.slice(0, 28) + "…" : cad.origemCampanhaNome}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#8E8E93] mt-0.5">
                    {totalItens} registro{totalItens !== 1 ? "s" : ""}
                    {ultimaData ? ` · ${ultimaData}` : ""}
                  </p>
                </div>
              </button>

              {/* Métricas */}
              <div className="flex items-center gap-4 shrink-0">
                <div className="hidden sm:flex items-center gap-1.5 text-[10.5px]">
                  {totalItens > 0 && <span className="text-[#8E8E93]">{totalItens} orç.</span>}
                  {fechados > 0 && (
                    <><span className="text-[#c7c7cc]">·</span>
                    <span className="text-[#30D158] font-semibold">{fechados} fechado{fechados !== 1 ? "s" : ""}</span></>
                  )}
                  {perdidos > 0 && (
                    <><span className="text-[#c7c7cc]">·</span>
                    <span className="text-[#d33a3c]">{perdidos} perdido{perdidos !== 1 ? "s" : ""}</span></>
                  )}
                </div>

                {conversao !== null && (
                  <div className="text-center min-w-[44px]">
                    <p className="text-[12px] font-bold leading-none"
                      style={{ color: conversao >= 60 ? "#30D158" : conversao >= 35 ? "#c57800" : "#d33a3c" }}>
                      {conversao}%
                    </p>
                    <p className="text-[9px] text-[#8E8E93] mt-0.5">conv.</p>
                  </div>
                )}

                <div className="text-right min-w-[80px]">
                  {ltv > 0 ? (
                    <>
                      <p className="text-[13px] font-bold tabular-nums" style={{ color: "#8456e8" }}>{brl(ltv)}</p>
                      <p className="text-[9.5px] font-semibold" style={{ color: "#8456e8", opacity: 0.6 }}>LTV</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[13px] font-bold tabular-nums text-[#1C1C1E]">{brl(totalValor)}</p>
                      {valorFechado > 0 && valorFechado !== totalValor && (
                        <p className="text-[9.5px] font-semibold text-[#30D158]">{brl(valorFechado)} fech.</p>
                      )}
                    </>
                  )}
                </div>

                <button onClick={() => setPerfilAberto(nome)}
                  className="text-[10.5px] font-semibold px-3 py-1.5 rounded-xl transition-colors shrink-0"
                  style={{ background: "rgba(132,86,232,0.08)", color: "#8456e8" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(132,86,232,0.14)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "rgba(132,86,232,0.08)")}>
                  Perfil
                </button>

                <button onClick={() => setExpandido(aberto ? null : nome)}>
                  <svg className={`w-3.5 h-3.5 text-[#8E8E93] transition-transform duration-200 ${aberto ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Expanded */}
            {aberto && (
              <div className="border-t border-[rgba(0,0,0,0.05)] divide-y divide-[rgba(0,0,0,0.04)]"
                style={{ background: "rgba(116,116,128,0.03)" }}>
                {(itens as HistItem[]).map((item, i) => {
                  const ideal = item.calculo.tabela.find(l => l.quantidade === item.calculo.sweetSpotIdealQtd) ?? item.calculo.tabela[0]
                  const preco = item.form.comFaca ? (ideal?.precoComFaca ?? 0) : (ideal?.precoSemFaca ?? 0)
                  const card  = kanban.find(c => item.numero && c.numero === item.numero)
                  const colIdx = card?.coluna ?? null
                  const statusLabel  = colIdx !== null ? COLUNAS_KANBAN[colIdx] : null
                  const statusColors = colIdx !== null ? COL_COLORS[colIdx] : null
                  return (
                    <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-[rgba(0,0,0,0.02)] transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.numero && (
                            <span className="text-[10px] font-bold px-1.5 py-[2px] rounded-md tabular-nums"
                              style={{ background: "rgba(132,86,232,0.1)", color: "#8456e8" }}>{item.numero}</span>
                          )}
                          <span className="text-[11px] text-[#8E8E93]">
                            {item.form.frente}×{item.form.alturaBox}×{item.form.lateral} cm · {item.form.materialNome}
                          </span>
                          {statusLabel && statusColors && (
                            <span className={`text-[9px] font-semibold px-1.5 py-[2px] rounded-md ${statusColors.badge}`}>
                              {statusLabel}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#8E8E93] mt-0.5">{item.data}</p>
                        {card?.motivoPerdido && (
                          <p className="text-[10px] text-[#d33a3c] mt-0.5 italic">"{card.motivoPerdido}"</p>
                        )}
                      </div>
                      <p className="text-[12px] font-bold text-[#5e5c68] tabular-nums shrink-0">{brl(preco)}</p>
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => onWhatsApp(item)}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-white transition-colors"
                          style={{ background: "#009351" }}>WhatsApp</button>
                        <button onClick={() => onReplicar(item)}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-white transition-colors"
                          style={{ background: "#161421" }}>Replicar</button>
                      </div>
                    </div>
                  )
                })}
                {(propostas as PropostaCustom[]).map(p => {
                  const ativas = p.linhas.filter(l => l.ativa && l.quantidade > 0)
                  const ideal  = ativas.find(l => l.isIdeal) ?? ativas[ativas.length - 1]
                  const preco  = ideal ? ideal.unitario * ideal.quantidade : 0
                  const card   = p.cardId ? kanban.find(c => c.id === p.cardId) : null
                  const colIdx = card?.coluna ?? null
                  const statusLabel  = colIdx !== null ? COLUNAS_KANBAN[colIdx] : null
                  const statusColors = colIdx !== null ? COL_COLORS[colIdx] : null
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[rgba(0,0,0,0.02)] transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold px-1.5 py-[2px] rounded-md"
                            style={{ background: "rgba(175,82,222,0.1)", color: "#a582ff" }}>{p.numero}</span>
                          <span className="text-[9px] font-semibold px-1.5 py-[2px] rounded-md uppercase tracking-wide"
                            style={{ background: "rgba(175,82,222,0.06)", color: "#a582ff" }}>Personalizada</span>
                          <span className="text-[11px] text-[#8E8E93]">
                            {[p.descricao, p.dimensoes, p.material].filter(Boolean).join(" · ") || "—"}
                          </span>
                          {statusLabel && statusColors && (
                            <span className={`text-[9px] font-semibold px-1.5 py-[2px] rounded-md ${statusColors.badge}`}>
                              {statusLabel}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#8E8E93] mt-0.5">{p.data}</p>
                      </div>
                      <p className="text-[12px] font-bold text-[#5e5c68] tabular-nums shrink-0">{preco > 0 ? brl(preco) : "—"}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
