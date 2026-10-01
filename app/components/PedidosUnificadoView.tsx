"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import {
  Package, TrendingUp, CheckCircle2, Clock, AlertTriangle,
  DollarSign, BarChart3, Factory, User, Users, Home, Building2, Megaphone, Wrench, ClipboardList,
  CalendarDays,
} from "lucide-react"
import {
  KanbanCard, KanbanOpcao, Lote, LancamentoFinanceiro,
  NegocioParceiro, FormData, Calculo, PrazoEtapas,
  COLUNAS_KANBAN, COL_FECHADO, COL_ENTREGUE, COL_PERDIDO, COL_HOT,
} from "../types"
import { brl, num } from "../utils"
import { custoFixoPeriodo, rateioPorPedido } from "../lib/metrics"
import { KanbanView } from "./KanbanView"

type Tab = "dashboard" | "lista" | "kanban"
type FiltroStatus = "todos" | "andamento" | "entregue"
type OrdemPedidos = "cronologico" | "recente" | "valor" | "resultado" | "entrega"
type HistItem = { form: FormData; calculo: Calculo; data: string; numero?: string }

const STAGE: Record<number, { color: string; bg: string; label: string }> = {
  1:  { color: "#009351", bg: "rgba(52,199,89,0.12)",    label: "Fechado" },
  2:  { color: "#3a84ca", bg: "rgba(0,122,255,0.1)",     label: "Arte / Dieline" },
  3:  { color: "#c57800", bg: "rgba(255,149,0,0.12)",    label: "Aprovação" },
  4:  { color: "#FF6200", bg: "rgba(255,98,0,0.12)",     label: "Fila de impressão" },
  5:  { color: "#8456e8", bg: "rgba(80,9,196,0.1)",      label: "Impressão" },
  6:  { color: "#a582ff", bg: "rgba(175,82,222,0.12)",   label: "Verniz" },
  7:  { color: "#FF2D55", bg: "rgba(255,45,85,0.1)",     label: "Acabamento" },
  8:  { color: "#5AC8FA", bg: "rgba(90,200,250,0.15)",   label: "Expedição" },
  9:  { color: "#30D158", bg: "rgba(48,209,88,0.12)",    label: "Entregue" },
  11: { color: "#FF6200", bg: "rgba(255,98,0,0.15)",     label: "Hot" },
}

function CatIcon({ cat, className }: { cat?: string; className?: string }) {
  const icons: Record<string, React.ElementType> = {
    fornecedor: Factory, materiais: Package, salarios: User,
    aluguel: Home, impostos: Building2, marketing: Megaphone,
    servicos: Wrench, outros: ClipboardList,
  }
  const I = icons[cat ?? ""] ?? ClipboardList
  return <I className={className ?? "w-3 h-3"} />
}

function fmt(iso?: string) {
  if (!iso) return "—"
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}
function fmtFull(iso?: string) {
  if (!iso) return "—"
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}
function formaPagLabel(f?: string) {
  const m: Record<string, string> = {
    pix: "Pix", boleto: "Boleto", cartao_credito: "Cartão crédito",
    cartao_debito: "Cartão débito", dinheiro: "Dinheiro",
    transferencia: "Transferência", outro: "Outro",
  }
  return f ? (m[f] ?? f) : ""
}

export type OrderEntry = {
  key: string; tipo: "lote" | "card"; numero: string; nomeCliente: string
  cards: KanbanCard[]; coluna: number; dataPedido: string
  dataFechamento?: string; dataEntregaPrevista?: string; dataEntregaReal?: string; prazoRecebimentoInterno?: string
  receitas: LancamentoFinanceiro[]; despesas: LancamentoFinanceiro[]
  precoTotal: number; totalPago: number; totalDespesa: number
  specs: string; qtdTotal: number
}

type Props = {
  kanban: KanbanCard[]
  historico: HistItem[]
  lancamentos: LancamentoFinanceiro[]
  isDark?: boolean
  onDetalhes?: (card: KanbanCard) => void
  onNovoLancamento?: (prefill: Partial<LancamentoFinanceiro>) => void
  onSalvarData?: (cardId: string, data: string) => void
  onSavePrazos?: (cardId: string, prazos: PrazoEtapas) => void
  onSalvarPrazoRecebimentoInterno?: (cardId: string, date: string | null) => void
  onBulkUpdate?: (cardIds: string[], updates: { dataEntregaPrevista?: string; dataFechamento?: string; coluna?: number }) => void
  onCopiarPedido?: (entry: OrderEntry) => void
  // kanban passthrough
  onMove: (id: string, coluna: number) => void
  onDelete: (id: string) => void
  onSetMotivo: (id: string, motivo: string) => void
  onFechamento: (id: string, opcao: KanbanOpcao) => void
  onHotOpcao?: (id: string, opcao: KanbanOpcao) => void
  onKanbanDetalhes?: (card: KanbanCard) => void
  lotes?: Lote[]
  onLoteCreate?: (nomeCliente: string) => Promise<{ id: string; numero: string }>
  onLoteAssign?: (cardId: string, loteId: string, loteNumero: string) => void
  onLoteRemove?: (cardId: string) => void
  onLoteMerge?: (sourceLoteId: string, targetLoteId: string, targetLoteNumero: string) => Promise<void>
  onLoteRename?: (loteId: string, newNumero: string) => Promise<{ ok: boolean; error?: string }>
  negocios?: NegocioParceiro[]
  onUpdateNegocio?: (n: NegocioParceiro) => void
  onAddLancamento?: (l: LancamentoFinanceiro) => void
}

export function PedidosUnificadoView(props: Props) {
  const {
    kanban, historico, lancamentos, isDark,
    onDetalhes, onNovoLancamento, onSalvarData, onSavePrazos, onSalvarPrazoRecebimentoInterno,
    onMove, onDelete, onSetMotivo, onFechamento, onHotOpcao, onKanbanDetalhes,
    lotes, onLoteCreate, onLoteAssign, onLoteRemove, onLoteMerge, onLoteRename,
    negocios, onUpdateNegocio, onAddLancamento, onBulkUpdate, onCopiarPedido,
  } = props

  const [tab, setTab]     = useState<Tab>("dashboard")
  const [busca, setBusca] = useState("")
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set())

  function toggleSelectCard(cardId: string) {
    setSelectedCardIds(prev => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  function clearSelection() {
    setSelectedCardIds(new Set())
  }
  const [filtro, setFiltro] = useState<FiltroStatus>("todos")
  const [ordem, setOrdem] = useState<OrdemPedidos>("cronologico")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [concluidos, setConcluidos] = useState<Set<string>>(() => {
    try {
      const s = typeof window !== "undefined" ? localStorage.getItem("pedidos-concluidos") : null
      return s ? new Set<string>(JSON.parse(s)) : new Set<string>()
    } catch { return new Set<string>() }
  })

  function toggle(key: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleConcluido(key: string) {
    setConcluidos(prev => {
      const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key)
      if (typeof window !== "undefined") localStorage.setItem("pedidos-concluidos", JSON.stringify([...n]))
      return n
    })
  }

  const histMap = useMemo(() => new Map(historico.map(h => [h.numero ?? "", h])), [historico])

  const allEntries = useMemo<OrderEntry[]>(() => {
    const eligible = kanban.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO && c.coluna !== COL_HOT)
    const loteGroups = new Map<string, KanbanCard[]>()
    const soloCards: KanbanCard[] = []
    for (const card of eligible) {
      if (card.loteId) {
        if (!loteGroups.has(card.loteId)) loteGroups.set(card.loteId, [])
        loteGroups.get(card.loteId)!.push(card)
      } else {
        soloCards.push(card)
      }
    }

    function buildSpecs(cards: KanbanCard[]) {
      const card = cards[0]; const hist = histMap.get(card.numero ?? ""); const form = hist?.form
      const parts: string[] = []
      if (form && form.frente > 0)                      parts.push(`${form.frente}×${form.lateral}×${form.alturaBox} cm`)
      else if (card.dimensoes)                          parts.push(`${card.dimensoes} cm`)
      if (form?.materialNome || card.materialNome)      parts.push(form?.materialNome || card.materialNome)
      if (cards.length > 1)                             parts.push(`${cards.length} itens`)
      if (form?.incluirVerniz)                          parts.push("Verniz UV")
      if (form?.comFaca)                                parts.push("Faca")
      return parts.join(" · ")
    }

    function buildEntry(key: string, tipo: "lote"|"card", numero: string, cards: KanbanCard[], recs: LancamentoFinanceiro[], desps: LancamentoFinanceiro[]): OrderEntry {
      const coluna   = cards.reduce((mx, c) => Math.max(mx, c.coluna), 0)
      const pago     = recs.filter(l => l.status === "pago").reduce((s, l) => s + l.valor, 0)
      const despPago = desps.filter(l => l.status === "pago" || l.formaPagamento === "conta").reduce((s, l) => s + l.valor, 0)
      return {
        key, tipo, numero, nomeCliente: cards[0].nomeCliente, cards, coluna,
        dataPedido: cards.reduce((earliest, c) => {
          const d = c.dataFechamento ?? ""; return (d && (!earliest || d < earliest)) ? d : earliest
        }, cards.find(c => c.dataFechamento)?.dataFechamento ?? ""),
        dataFechamento: cards.find(c => c.dataFechamento)?.dataFechamento,
        dataEntregaPrevista: cards.find(c => c.dataEntregaPrevista)?.dataEntregaPrevista,
        dataEntregaReal: cards.find(c => c.dataEntregaReal)?.dataEntregaReal,
        prazoRecebimentoInterno: cards.find(c => c.prazoRecebimentoInterno)?.prazoRecebimentoInterno,
        receitas: recs, despesas: desps,
        precoTotal: cards.reduce((s, c) => s + c.preco, 0),
        qtdTotal:   cards.reduce((s, c) => s + c.quantidade, 0),
        totalPago: pago, totalDespesa: despPago,
        specs: buildSpecs(cards),
      }
    }

    const result: OrderEntry[] = []
    for (const [loteId, cards] of loteGroups) {
      const ids = new Set(cards.map(c => c.id))
      const recs  = lancamentos.filter(l => l.tipo === "receita" && (l.loteId === loteId || (l.cardId && ids.has(l.cardId))))
      const desps = lancamentos.filter(l => l.tipo === "despesa" && (l.loteId === loteId || (l.cardId && ids.has(l.cardId))))
      result.push(buildEntry(`lote-${loteId}`, "lote", cards[0].loteNumero ?? "Lote", cards, recs, desps))
    }
    for (const card of soloCards) {
      const recs  = lancamentos.filter(l => l.tipo === "receita" && l.cardId === card.id)
      const desps = lancamentos.filter(l => l.tipo === "despesa" && l.cardId === card.id)
      result.push(buildEntry(`card-${card.id}`, "card", card.numero ?? "—", [card], recs, desps))
    }
    return result
  }, [kanban, lancamentos, histMap])

  const { custoFixoTotal, receitaTotal } = useMemo(() => ({
    custoFixoTotal: custoFixoPeriodo(lancamentos, null, null),
    receitaTotal:   allEntries.reduce((s, e) => s + e.precoTotal, 0),
  }), [lancamentos, allEntries])

  const hoje = new Date()

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return allEntries
      .filter(e => {
        if (filtro === "andamento") return e.coluna !== COL_ENTREGUE
        if (filtro === "entregue")  return e.coluna === COL_ENTREGUE
        return true
      })
      .filter(e => !q || e.nomeCliente.toLowerCase().includes(q) || e.numero.toLowerCase().includes(q))
      .sort((a, b) => {
        if (ordem === "cronologico") return b.dataPedido.localeCompare(a.dataPedido)
        if (ordem === "recente")     return (b.dataFechamento ?? "").localeCompare(a.dataFechamento ?? "")
        if (ordem === "valor")       return b.precoTotal - a.precoTotal
        if (ordem === "resultado")   return (b.totalPago - b.totalDespesa) - (a.totalPago - a.totalDespesa)
        if (ordem === "entrega") {
          const da = a.dataEntregaPrevista ?? "9999"; const db = b.dataEntregaPrevista ?? "9999"
          return da.localeCompare(db)
        }
        return 0
      })
  }, [allEntries, filtro, busca, ordem])

  const kanbanFiltrado = useMemo(() => {
    let r = kanban
    const q = busca.trim().toLowerCase()
    if (q) r = r.filter(c => c.nomeCliente.toLowerCase().includes(q) || (c.numero ?? "").toLowerCase().includes(q))
    if (filtro === "andamento") r = r.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_ENTREGUE && c.coluna !== COL_PERDIDO)
    if (filtro === "entregue")  r = r.filter(c => c.coluna === COL_ENTREGUE)
    return r
  }, [kanban, busca, filtro])

  const kpiConcluidos = useMemo(() => {
    const c = allEntries.filter(e => concluidos.has(e.key))
    const cnt = c.length; const fat = c.reduce((s,e) => s + e.precoTotal, 0)
    const rec = c.reduce((s,e) => s + e.totalPago, 0); const custo = c.reduce((s,e) => s + e.totalDespesa, 0)
    const result = rec - custo
    const mks = c.filter(e => e.totalDespesa > 0).map(e => e.precoTotal / e.totalDespesa)
    const mkAvg = mks.length ? mks.reduce((s,m) => s + m, 0) / mks.length : null
    const mgs = c.filter(e => e.precoTotal > 0).map(e => (e.precoTotal - e.totalDespesa) / e.precoTotal * 100)
    const mgAvg = mgs.length ? mgs.reduce((s,m) => s + m, 0) / mgs.length : null
    return { cnt, fat, rec, custo, result, mkAvg, mgAvg }
  }, [allEntries, concluidos])

  const cntAnd = allEntries.filter(e => e.coluna !== COL_ENTREGUE).length
  const cntEnt = allEntries.filter(e => e.coluna === COL_ENTREGUE).length

  const TAB = (active: boolean) =>
    `px-4 py-2 text-[12.5px] font-semibold rounded-lg transition-colors ${
      active ? "bg-white text-[#191625] shadow-sm" : "text-[#8E8E93] hover:text-[#5e5c68]"
    }`

  const showFilterBar = tab !== "dashboard"

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-7 pb-5 shrink-0">
        <div>
          <h1 className="text-[20px] font-bold text-[#1C1C1E] tracking-tight">Pedidos</h1>
          <p className="text-[12px] text-[#8E8E93] mt-0.5">
            {allEntries.length} total · {cntAnd} em andamento · {cntEnt} entregues
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-8 pb-4 shrink-0">
        <div className="inline-flex bg-[#F2F2F7] rounded-xl p-1 gap-0.5">
          <button className={TAB(tab === "dashboard")} onClick={() => setTab("dashboard")}>Dashboard</button>
          <button className={TAB(tab === "lista")} onClick={() => setTab("lista")}>Lista</button>
          <button className={TAB(tab === "kanban")} onClick={() => setTab("kanban")}>Kanban</button>
        </div>
      </div>

      {/* Filter bar — Lista e Kanban */}
      {showFilterBar && (
        <div className="px-8 pb-4 shrink-0 flex items-center gap-2 flex-wrap">
          {/* Status pills */}
          <div className="flex rounded-xl overflow-hidden border border-[rgba(0,0,0,0.1)] bg-white">
            {([
              ["todos",     `Todos (${allEntries.length})`],
              ["andamento", `Em andamento (${cntAnd})`],
              ["entregue",  `Entregues (${cntEnt})`],
            ] as [FiltroStatus, string][]).map(([v, label]) => (
              <button key={v} onClick={() => setFiltro(v)}
                className="px-3 py-1.5 text-[11px] font-semibold transition-colors"
                style={{ background: filtro === v ? "#161421" : "transparent", color: filtro === v ? "#fff" : "#8E8E93" }}>
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93] pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar cliente, número…"
              className="w-full border border-[rgba(0,0,0,0.12)] rounded-xl pl-9 pr-8 py-2 text-[12.5px] text-[#191625] placeholder:text-[rgba(60,60,67,0.36)] focus:outline-none focus:ring-2 focus:ring-[#8456e8]/25 focus:border-[#8456e8] bg-white transition-all" />
            {busca && (
              <button onClick={() => setBusca("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-lg leading-none text-[rgba(60,60,67,0.36)] hover:text-[#191625]">×</button>
            )}
          </div>

          {/* Sort (only lista) */}
          {tab === "lista" && (
            <select value={ordem} onChange={e => setOrdem(e.target.value as OrdemPedidos)}
              className="border border-[rgba(0,0,0,0.12)] rounded-xl px-3 py-2 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/25 cursor-pointer transition-all">
              <option value="cronologico">Cronológico</option>
              <option value="recente">Mais recentes</option>
              <option value="valor">Maior valor</option>
              <option value="resultado">Maior resultado</option>
              <option value="entrega">Entrega próxima</option>
            </select>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "dashboard" ? (
          <DashboardTab entries={allEntries} lancamentos={lancamentos} kanban={kanban} />
        ) : tab === "lista" ? (
          <ListaTab
            lista={lista} busca={busca} expanded={expanded} concluidos={concluidos}
            hoje={hoje} receitaTotal={receitaTotal} custoFixoTotal={custoFixoTotal}
            kpiConcluidos={kpiConcluidos}
            toggle={toggle} toggleConcluido={toggleConcluido}
            onDetalhes={onDetalhes} onNovoLancamento={onNovoLancamento} onSalvarData={onSalvarData}
            onSavePrazos={onSavePrazos} onSalvarPrazoRecebimentoInterno={onSalvarPrazoRecebimentoInterno}
            selectedCardIds={selectedCardIds} onSelectCard={toggleSelectCard}
            onCopiarPedido={onCopiarPedido}
          />
        ) : (
          <div className="h-full">
            <KanbanView
              hideDashboard
              isDark={isDark}
              cards={kanbanFiltrado}
              onMove={onMove}
              onDelete={onDelete}
              onSetMotivo={onSetMotivo}
              onFechamento={onFechamento}
              onHotOpcao={onHotOpcao}
              onDetalhes={onKanbanDetalhes}
              lotes={lotes}
              onLoteCreate={onLoteCreate}
              onLoteAssign={onLoteAssign}
              onLoteRemove={onLoteRemove}
              onLoteMerge={onLoteMerge}
              onLoteRename={onLoteRename}
              negocios={negocios}
              onUpdateNegocio={onUpdateNegocio}
              lancamentos={lancamentos}
              onAddLancamento={onAddLancamento}
              selectedCardIds={selectedCardIds}
              onSelectCard={toggleSelectCard}
            />
          </div>
        )}
      </div>
      {selectedCardIds.size > 0 && (
        <BulkBar
          count={selectedCardIds.size}
          kanban={kanban}
          selectedCardIds={selectedCardIds}
          onClear={clearSelection}
          onApply={(updates) => {
            onBulkUpdate?.(Array.from(selectedCardIds), updates)
            clearSelection()
          }}
        />
      )}
    </div>
  )
}

// ── BulkBar ───────────────────────────────────────────────────────────────────

function BulkBar({
  count, kanban, selectedCardIds, onClear, onApply,
}: {
  count: number
  kanban: KanbanCard[]
  selectedCardIds: Set<string>
  onClear: () => void
  onApply: (updates: { dataEntregaPrevista?: string; dataFechamento?: string; coluna?: number }) => void
}) {
  const [dataEntrega, setDataEntrega]   = useState("")
  const [dataPedido,  setDataPedido]    = useState("")
  const [coluna,      setColuna]        = useState("")

  function handleApply() {
    const updates: { dataEntregaPrevista?: string; dataFechamento?: string; coluna?: number } = {}
    if (dataEntrega) updates.dataEntregaPrevista = dataEntrega
    if (dataPedido)  updates.dataFechamento      = dataPedido
    if (coluna !== "") updates.coluna = Number(coluna)
    if (Object.keys(updates).length === 0) return
    onApply(updates)
    setDataEntrega("")
    setDataPedido("")
    setColuna("")
  }

  const hasChanges = dataEntrega !== "" || dataPedido !== "" || coluna !== ""

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl"
      style={{ background: "#161421", border: "1px solid #312e3e", minWidth: 480, maxWidth: "90vw" }}>
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
          style={{ background: "#8456e8" }}>{count}</div>
        <span className="text-[12px] font-semibold text-white">selecionado{count > 1 ? "s" : ""}</span>
      </div>
      <div className="w-px h-6 shrink-0" style={{ background: "#312e3e" }} />
      <div className="flex items-center gap-2 flex-1 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>Data de entrega</label>
          <input type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)}
            className="text-[11px] rounded-lg px-2 py-1 outline-none"
            style={{ background: "#272434", border: "1px solid #312e3e", color: "#fff", width: 130 }} />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>Data do pedido</label>
          <input type="date" value={dataPedido} onChange={e => setDataPedido(e.target.value)}
            className="text-[11px] rounded-lg px-2 py-1 outline-none"
            style={{ background: "#272434", border: "1px solid #312e3e", color: "#fff", width: 130 }} />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>Mover para etapa</label>
          <select value={coluna} onChange={e => setColuna(e.target.value)}
            className="text-[11px] rounded-lg px-2 py-1 outline-none"
            style={{ background: "#272434", border: "1px solid #312e3e", color: "#fff", width: 150 }}>
            <option value="">— Selecionar —</option>
            {COLUNAS_KANBAN.map((label, i) => (
              <option key={i} value={i}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={handleApply} disabled={!hasChanges}
          className="text-[12px] font-semibold px-3 py-1.5 rounded-xl transition-opacity"
          style={{ background: hasChanges ? "#8456e8" : "#272434", color: hasChanges ? "#fff" : "rgba(255,255,255,0.3)", opacity: hasChanges ? 1 : 0.7 }}>
          Aplicar
        </button>
        <button onClick={onClear}
          className="text-[12px] font-semibold px-3 py-1.5 rounded-xl"
          style={{ background: "#272434", color: "rgba(255,255,255,0.6)" }}>
          Limpar
        </button>
      </div>
    </div>
  )
}

// ── Controle de Prazos ────────────────────────────────────────────────────────

const ETAPAS_PRAZOS: { key: keyof PrazoEtapas; label: string }[] = [
  { key: "pedido_enviado",    label: "Enviado à gráfica" },
  { key: "inicio_arte",       label: "Início arte" },
  { key: "arte_enviada",      label: "Arte p/ aprovação" },
  { key: "arte_aprovada",     label: "Arte aprovada" },
  { key: "inicio_impressao",  label: "Início impressão" },
  { key: "fim_impressao",     label: "Fim impressão" },
  { key: "inicio_verniz",     label: "Início verniz" },
  { key: "fim_verniz",        label: "Fim verniz" },
  { key: "inicio_acabamento", label: "Início acabamento" },
  { key: "fim_acabamento",    label: "Fim acabamento" },
  { key: "expedicao",         label: "Expedição" },
]

function PrazosTimeline({
  cardId, dataFechamento, prazos: initialPrazos, onSave,
}: {
  cardId: string
  dataFechamento?: string
  prazos?: PrazoEtapas
  onSave?: (cardId: string, prazos: PrazoEtapas) => void
}) {
  const [prazos, setPrazos] = useState<PrazoEtapas>(initialPrazos ?? {})

  useEffect(() => {
    setPrazos(initialPrazos ?? {})
  }, [cardId])

  function setEtapa(key: keyof PrazoEtapas, value: string) {
    const next = { ...prazos }
    if (value) next[key] = value
    else delete next[key]
    setPrazos(next)
    onSave?.(cardId, next)
  }

  const allStages = [
    { key: null, label: "Pedido realizado", value: dataFechamento, readOnly: true },
    ...ETAPAS_PRAZOS.map(e => ({ key: e.key, label: e.label, value: prazos[e.key], readOnly: false })),
  ]

  const doneCnt = allStages.filter(s => s.value).length
  const total = allStages.length
  const progPct = Math.round((doneCnt / total) * 100)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-[#8456e8]" />
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#8456e8]">Controle de Prazos</p>
        </div>
        <span className="text-[9.5px] tabular-nums text-[#8E8E93]">{doneCnt}/{total} etapas</span>
      </div>

      {/* Progress bar */}
      <div className="h-[3px] bg-[rgba(0,0,0,0.06)] rounded-full mb-4 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progPct}%`, background: progPct === 100 ? "#30D158" : "#8456e8" }} />
      </div>

      {/* Stages grid 2 cols */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-2">
        {allStages.map((stage, idx) => {
          const isDone = !!stage.value
          return (
            <div key={idx} className="flex items-start gap-2 min-w-0">
              {/* status dot */}
              <div className={`w-[14px] h-[14px] rounded-full shrink-0 mt-[1px] flex items-center justify-center transition-colors ${
                isDone ? "bg-[rgba(132,86,232,0.15)]" : "border border-[rgba(0,0,0,0.18)] bg-white"
              }`}>
                {isDone && (
                  <svg className="w-2 h-2 text-[#8456e8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9.5px] text-[#8E8E93] leading-none mb-0.5 truncate">{stage.label}</p>
                {stage.readOnly ? (
                  <p className="text-[11px] font-semibold" style={{ color: isDone ? "var(--text-main)" : "var(--text-faint)" }}>
                    {isDone ? fmtFull(stage.value) : "—"}
                  </p>
                ) : (
                  <input
                    type="date"
                    value={stage.value ?? ""}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setEtapa(stage.key as keyof PrazoEtapas, e.target.value)}
                    className="text-[11px] font-medium border-0 outline-none bg-transparent w-full cursor-pointer"
                    style={{
                      color: isDone ? "#8456e8" : "#8E8E93",
                      fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif",
                    }}
                  />
                )}
              </div>
              {!stage.readOnly && isDone && (
                <button
                  onClick={e => { e.stopPropagation(); setEtapa(stage.key as keyof PrazoEtapas, "") }}
                  className="shrink-0 text-[12px] leading-none text-[rgba(60,60,67,0.3)] hover:text-[#d33a3c] transition-colors mt-0.5"
                  title="Limpar data"
                >×</button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────

function DashboardTab({ entries, lancamentos, kanban }: {
  entries: OrderEntry[]
  lancamentos: LancamentoFinanceiro[]
  kanban: KanbanCard[]
}) {
  const hoje = new Date()
  const [modalMes, setModalMes] = useState<{ key: string; label: string; items: OrderEntry[] } | null>(null)

  const emAndamento    = entries.filter(e => e.coluna !== COL_ENTREGUE)
  const entregues      = entries.filter(e => e.coluna === COL_ENTREGUE)
  const pipeline       = emAndamento.reduce((s, e) => s + e.precoTotal, 0)
  const faturado       = entregues.reduce((s, e) => s + e.precoTotal, 0)
  const totalRecebido  = lancamentos.filter(l => l.tipo === "receita" && l.status === "pago").reduce((s, l) => s + l.valor, 0)
  const ticketMedio    = entries.length > 0 ? entries.reduce((s, e) => s + e.precoTotal, 0) / entries.length : 0

  const emAtraso = emAndamento.filter(e => {
    if (!e.dataEntregaPrevista) return false
    const d = new Date(e.dataEntregaPrevista + "T12:00:00")
    return d < hoje
  }).length

  const vencendoEm3 = emAndamento.filter(e => {
    if (!e.dataEntregaPrevista) return false
    const d = new Date(e.dataEntregaPrevista + "T12:00:00")
    const diff = Math.round((d.getTime() - hoje.getTime()) / 86_400_000)
    return diff >= 0 && diff <= 3
  }).length

  const semData = emAndamento.filter(e => !e.dataEntregaPrevista).length

  const margens = entries.filter(e => e.precoTotal > 0 && e.totalDespesa > 0).map(e => (e.precoTotal - e.totalDespesa) / e.precoTotal * 100)
  const margemMedia = margens.length ? margens.reduce((s, m) => s + m, 0) / margens.length : null

  const mesesSet = new Set<string>()
  entries.forEach(e => { if (e.dataFechamento) mesesSet.add(e.dataFechamento.slice(0, 7)) })
  const mesesAtivos = mesesSet.size || 1
  const pedidosPorMes = entries.length / mesesAtivos

  const clientesUnicos = new Set(entries.map(e => e.nomeCliente.trim().toLowerCase())).size
  const pedidosPorCliente = clientesUnicos > 0 ? entries.length / clientesUnicos : 0

  // Distribuição por etapa
  const etapaCount: Record<number, number> = {}
  kanban.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO && c.coluna !== COL_HOT).forEach(c => {
    etapaCount[c.coluna] = (etapaCount[c.coluna] ?? 0) + 1
  })
  const etapas = Object.entries(etapaCount)
    .map(([col, cnt]) => ({ col: Number(col), cnt, ...STAGE[Number(col)] ?? { color: "#8E8E93", bg: "rgba(142,142,147,0.1)", label: COLUNAS_KANBAN[Number(col)] ?? "—" } }))
    .sort((a, b) => a.col - b.col)

  const convColor = (margemMedia ?? 0) >= 40 ? "#15803d" : (margemMedia ?? 0) >= 20 ? "#c57800" : "#b91c1c"

  return (
    <div className="px-8 pb-10 space-y-6">

      {/* Modal: pedidos do mês clicado */}
      {modalMes && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
          onClick={() => setModalMes(null)}
        >
          <div
            className="w-full max-w-lg rounded-3xl overflow-hidden"
            style={{ background: "var(--bg-surface)", boxShadow: "0 24px 64px rgba(0,0,0,0.22)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[rgba(60,60,67,0.08)]">
              <div>
                <p className="text-[10.5px] uppercase tracking-wider font-bold text-[#8E8E93]">Pedidos de</p>
                <p className="text-[22px] font-bold text-[#1C1C1E] leading-tight">{modalMes.label}</p>
                <p className="text-[12px] text-[#8E8E93] mt-0.5">{modalMes.items.length} pedido{modalMes.items.length !== 1 ? "s" : ""}</p>
              </div>
              <button
                onClick={() => setModalMes(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#8E8E93] hover:text-[#1C1C1E] transition-colors"
                style={{ background: "rgba(142,142,147,0.1)" }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            {/* Lista */}
            <div className="overflow-y-auto max-h-[55vh] divide-y divide-[rgba(60,60,67,0.06)]">
              {modalMes.items.length === 0 ? (
                <p className="px-6 py-8 text-center text-[13px] text-[#8E8E93]">Nenhum pedido neste período</p>
              ) : modalMes.items.map(item => (
                <div key={item.key} className="px-6 py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#1C1C1E] truncate">{item.numero || item.key}</p>
                    <p className="text-[12px] text-[#8E8E93] truncate">{item.nomeCliente}</p>
                  </div>
                  <p className="text-[13px] font-bold text-[#1C1C1E] tabular-nums shrink-0">{brl(item.precoTotal ?? 0)}</p>
                </div>
              ))}
            </div>
            {/* Footer total */}
            {modalMes.items.length > 0 && (
              <div className="px-6 py-4 border-t border-[rgba(60,60,67,0.08)] flex items-center justify-between">
                <p className="text-[12px] font-semibold text-[#8E8E93]">Total do mês</p>
                <p className="text-[15px] font-bold text-[#8456e8] tabular-nums">
                  {brl(modalMes.items.reduce((acc, i) => acc + (i.precoTotal ?? 0), 0))}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Gráfico de linha — topo */}
      {entries.length >= 2 && (
        <PedidosLineChart
          entries={entries}
          onClickMes={ym => {
            const items = entries.filter(e => e.dataFechamento?.startsWith(ym))
            setModalMes({ key: ym, label: fmtMesAbbr(ym), items })
          }}
        />
      )}

      {/* KPIs principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={<Package className="w-4 h-4" />} iconColor="#7c3aed" iconBg="rgba(124,58,237,0.08)"
          label="Em andamento" value={String(emAndamento.length)} sub="pedidos ativos" />
        <KpiCard icon={<CheckCircle2 className="w-4 h-4" />} iconColor="#15803d" iconBg="rgba(22,163,74,0.08)"
          label="Entregues" value={String(entregues.length)} sub={faturado > 0 ? brl(faturado) : "pedidos concluídos"} subColor="#15803d" />
        <KpiCard icon={<DollarSign className="w-4 h-4" />} iconColor="#0ea5e9" iconBg="rgba(14,165,233,0.08)"
          label="Pipeline" value={brl(pipeline)} sub="em produção" />
        <KpiCard icon={<TrendingUp className="w-4 h-4" />} iconColor="#15803d" iconBg="rgba(22,163,74,0.08)"
          label="Faturado total" value={faturado > 0 ? brl(faturado) : "—"} sub={totalRecebido > 0 ? `${brl(totalRecebido)} recebido` : "pedidos entregues"} subColor="#15803d" highlight />
      </div>

      {/* Alertas de prazo */}
      <div>
        <SectionLabel>Prazo de entrega</SectionLabel>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <KpiCard icon={<AlertTriangle className="w-4 h-4" />} iconColor="#b91c1c" iconBg="rgba(185,28,28,0.08)"
            label="Em atraso" value={String(emAtraso)} sub="prazo vencido" subColor={emAtraso > 0 ? "#b91c1c" : undefined} />
          <KpiCard icon={<Clock className="w-4 h-4" />} iconColor="#c57800" iconBg="rgba(197,120,0,0.08)"
            label="Vencendo em 3 dias" value={String(vencendoEm3)} sub="atenção urgente" subColor={vencendoEm3 > 0 ? "#c57800" : undefined} />
          <KpiCard icon={<Clock className="w-4 h-4" />} iconColor="#8E8E93" iconBg="rgba(142,142,147,0.08)"
            label="Sem data definida" value={String(semData)} sub="sem prazo registrado" />
        </div>
      </div>

      {/* KPIs financeiros */}
      <div>
        <SectionLabel>Financeiro</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          <KpiCard icon={<TrendingUp className="w-4 h-4" />} iconColor="#0ea5e9" iconBg="rgba(14,165,233,0.08)"
            label="Ticket médio" value={ticketMedio > 0 ? brl(ticketMedio) : "—"} sub="por pedido" />
          <KpiCard icon={<TrendingUp className="w-4 h-4" />} iconColor={convColor} iconBg={`${convColor}15`}
            label="Margem média" value={margemMedia != null ? `${num(margemMedia, 1)}%` : "—"}
            sub={margemMedia != null ? (margemMedia >= 40 ? "Boa" : margemMedia >= 20 ? "Razoável" : "Baixa") : "Sem custos lançados"}
            subColor={margemMedia != null ? convColor : undefined} />
          <KpiCard icon={<CheckCircle2 className="w-4 h-4" />} iconColor="#15803d" iconBg="rgba(22,163,74,0.08)"
            label="Total recebido" value={totalRecebido > 0 ? brl(totalRecebido) : "—"} sub="lançamentos pagos" subColor="#15803d" />
          <KpiCard icon={<BarChart3 className="w-4 h-4" />} iconColor="#7c3aed" iconBg="rgba(124,58,237,0.08)"
            label="Pedidos por mês" value={num(pedidosPorMes, 1)} sub="média histórica" />
          <KpiCard icon={<Users className="w-4 h-4" />} iconColor="#0ea5e9" iconBg="rgba(14,165,233,0.08)"
            label="Pedidos por cliente" value={num(pedidosPorCliente, 1)} sub="média por cliente" />
        </div>
      </div>

      {/* Distribuição por etapa */}
      {etapas.length > 0 && (
        <div>
          <SectionLabel>Distribuição por etapa</SectionLabel>
          <div className="mt-3 bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl p-5 space-y-2.5">
            {etapas.map(e => (
              <div key={e.col} className="flex items-center gap-3">
                <span className="w-[130px] text-[11.5px] font-medium text-[#5e5c68] shrink-0">{e.label}</span>
                <div className="flex-1 h-2 rounded-full bg-[rgba(0,0,0,0.05)] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(e.cnt / entries.length) * 100}%`, background: e.color }} />
                </div>
                <span className="w-6 text-right text-[12px] font-bold tabular-nums shrink-0" style={{ color: e.color }}>{e.cnt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div className="py-20 text-center">
          <div className="flex justify-center mb-3"><Package className="w-10 h-10 text-[#c7c7cc]" /></div>
          <p className="text-[14px] font-semibold text-[#5e5c68]">Nenhum pedido ainda</p>
          <p className="text-[12px] text-[#8E8E93] mt-1">Feche um orçamento no Kanban para ele aparecer aqui</p>
        </div>
      )}
    </div>
  )
}

// ── Lista Tab ─────────────────────────────────────────────────────────────────

function ListaTab({ lista, busca, expanded, concluidos, hoje, receitaTotal, custoFixoTotal, kpiConcluidos, toggle, toggleConcluido, onDetalhes, onNovoLancamento, onSalvarData, onSavePrazos, onSalvarPrazoRecebimentoInterno, selectedCardIds, onSelectCard, onCopiarPedido }: {
  lista: OrderEntry[]
  busca: string
  expanded: Set<string>
  concluidos: Set<string>
  hoje: Date
  receitaTotal: number
  custoFixoTotal: number
  kpiConcluidos: { cnt: number; fat: number; rec: number; custo: number; result: number; mkAvg: number | null; mgAvg: number | null }
  toggle: (key: string) => void
  toggleConcluido: (key: string) => void
  onDetalhes?: (card: KanbanCard) => void
  onNovoLancamento?: (prefill: Partial<LancamentoFinanceiro>) => void
  onSalvarData?: (cardId: string, data: string) => void
  onSavePrazos?: (cardId: string, prazos: PrazoEtapas) => void
  onSalvarPrazoRecebimentoInterno?: (cardId: string, date: string | null) => void
  selectedCardIds?: Set<string>
  onSelectCard?: (cardId: string) => void
  onCopiarPedido?: (entry: OrderEntry) => void
}) {
  const cardBg = "#fff"
  const border  = "rgba(0,0,0,0.07)"
  const txt     = "var(--text-main)"
  const sub     = "var(--text-faint)"
  const divider = "rgba(0,0,0,0.05)"
  const innerBg = "rgba(116,116,128,0.03)"

  if (lista.length === 0) return (
    <div className="py-16 text-center">
      <p className="text-[13px] text-[#8E8E93]">
        {busca ? `Nenhum resultado para "${busca}"` : "Nenhum pedido neste filtro"}
      </p>
    </div>
  )

  return (
    <div className="px-8 pb-8 space-y-3">
      {/* KPIs de concluídos */}
      {kpiConcluidos.cnt > 0 && (
        <div className="rounded-2xl px-5 pt-4 pb-3 mb-1" style={{ background: "rgba(48,209,88,0.04)", border: "1px solid rgba(48,209,88,0.12)" }}>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#30D158]" />
            <p className="text-[11px] font-bold text-[#30D158]">
              {kpiConcluidos.cnt} {kpiConcluidos.cnt === 1 ? "pedido concluído" : "pedidos concluídos"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <SmallKpi label="Faturamento" value={brl(kpiConcluidos.fat)} color={txt} />
            <SmallKpi label="Recebido" value={brl(kpiConcluidos.rec)} color="#30D158"
              sub={kpiConcluidos.fat > 0 ? `${num(kpiConcluidos.rec / kpiConcluidos.fat * 100, 0)}%` : undefined} />
            <SmallKpi label="Custos" value={brl(kpiConcluidos.custo)} color={kpiConcluidos.custo > 0 ? "#d33a3c" : "#8E8E93"} />
            <SmallKpi label="M. Contribuição" value={brl(kpiConcluidos.result)} color={kpiConcluidos.result > 0 ? "#8456e8" : "#d33a3c"} sub={kpiConcluidos.result > 0 ? "Positiva" : "Negativa"} />
            <SmallKpi label="Markup médio" value={kpiConcluidos.mkAvg != null ? `${num(kpiConcluidos.mkAvg, 2)}x` : "—"} color={kpiConcluidos.mkAvg == null ? "#8E8E93" : kpiConcluidos.mkAvg >= 2 ? "#30D158" : kpiConcluidos.mkAvg >= 1.5 ? "#c57800" : "#d33a3c"} />
            <SmallKpi label="Margem média" value={kpiConcluidos.mgAvg != null ? `${num(kpiConcluidos.mgAvg, 1)}%` : "—"} color={kpiConcluidos.mgAvg == null ? "#8E8E93" : kpiConcluidos.mgAvg >= 40 ? "#30D158" : kpiConcluidos.mgAvg >= 20 ? "#c57800" : "#d33a3c"} />
          </div>
        </div>
      )}

      <p className="text-[10px] uppercase tracking-wide font-semibold text-[#8E8E93] mb-1">
        {lista.length} pedido{lista.length !== 1 ? "s" : ""}
      </p>

      {lista.map(entry => {
        const stage = STAGE[entry.coluna] ?? { color: "#8E8E93", bg: "rgba(142,142,147,0.1)", label: COLUNAS_KANBAN[entry.coluna] ?? "—" }
        const resultado = entry.totalPago - entry.totalDespesa
        const margemPct = entry.precoTotal > 0 ? ((entry.precoTotal - entry.totalDespesa) / entry.precoTotal) * 100 : null
        const rateioFixo = rateioPorPedido(entry.precoTotal, receitaTotal, custoFixoTotal)
        const lucroLiq = resultado - rateioFixo
        const margemLiqPct = entry.precoTotal > 0 ? (lucroLiq / entry.precoTotal) * 100 : null
        const percPago = entry.precoTotal > 0 ? Math.min(100, (entry.totalPago / entry.precoTotal) * 100) : 0
        const isOpen = expanded.has(entry.key)
        const temLanc = entry.receitas.length > 0 || entry.despesas.length > 0
        const entregaDate = entry.dataEntregaPrevista
        const diasEnt = entregaDate && entry.coluna !== COL_ENTREGUE
          ? Math.round((new Date(entregaDate + "T12:00:00").getTime() - hoje.getTime()) / 86_400_000)
          : null
        const emAtraso  = diasEnt !== null && diasEnt < 0
        const quaseVenc = diasEnt !== null && diasEnt >= 0 && diasEnt <= 3

        return (
          <div key={entry.key} className="rounded-2xl overflow-hidden hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-200"
            style={{ background: entry.cards.some(c => selectedCardIds?.has(c.id)) ? "rgba(132,86,232,0.06)" : "white", border: `1px solid ${entry.cards.some(c => selectedCardIds?.has(c.id)) ? "#8456e8" : "var(--border)"}` }}>
            <div className="group/row flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none" onClick={e => {
              if (e.metaKey || e.ctrlKey) { e.preventDefault(); entry.cards.forEach(c => onSelectCard?.(c.id)) }
              else toggle(entry.key)
            }}>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[13px] font-semibold leading-snug truncate" style={{ color: txt }}>{entry.nomeCliente}</span>
                  <span className="text-[9px] font-bold px-1.5 py-[2px] rounded-md tabular-nums bg-[rgba(80,9,196,0.1)] text-[#8456e8]">{entry.numero}</span>
                  {entry.tipo === "lote" && (
                    <span className="text-[9px] font-semibold px-1.5 py-[2px] rounded-md bg-[rgba(90,200,250,0.15)] text-[#0099cc]">Lote</span>
                  )}
                  <span className="text-[9px] font-semibold px-1.5 py-[2px] rounded-md" style={{ background: stage.bg, color: stage.color }}>{stage.label}</span>
                </div>
                <p className="text-[10px] mt-0.5 truncate" style={{ color: sub }}>
                  {entry.dataPedido ? fmt(entry.dataPedido) : "Sem data"}{entry.specs ? ` · ${entry.specs}` : ""}{entry.qtdTotal > 0 ? ` · ${num(entry.qtdTotal)} un` : ""}
                </p>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <p className="text-[13px] font-bold tabular-nums" style={{ color: txt }}>{brl(entry.precoTotal)}</p>
                {entry.coluna === COL_ENTREGUE ? (
                  <p className="text-[9.5px] font-semibold text-[#30D158]">Entregue {entry.dataEntregaReal ? fmt(entry.dataEntregaReal) : ""}</p>
                ) : entregaDate ? (
                  <p className="text-[9.5px] font-semibold tabular-nums" style={{ color: emAtraso ? "#d33a3c" : quaseVenc ? "#c57800" : sub }}>
                    {emAtraso ? `${Math.abs(diasEnt!)}d atraso` : diasEnt === 0 ? "Hoje" : `${diasEnt}d`}
                  </p>
                ) : null}
              </div>
              {entry.coluna === COL_ENTREGUE && (() => {
                const done = concluidos.has(entry.key)
                return (
                  <button onClick={e => { e.stopPropagation(); toggleConcluido(entry.key) }}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-semibold transition-all"
                    style={{
                      background: done ? "rgba(48,209,88,0.12)" : "rgba(116,116,128,0.08)",
                      color: done ? "#30D158" : sub,
                      border: `1px solid ${done ? "rgba(48,209,88,0.25)" : "transparent"}`,
                    }}>
                    {done ? <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Concluído</> : "Concluir"}
                  </button>
                )
              })()}
              {onCopiarPedido && (
                <button
                  onClick={e => { e.stopPropagation(); onCopiarPedido(entry) }}
                  title="Duplicar pedido"
                  className="shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity duration-150 p-1.5 rounded-lg hover:bg-[rgba(132,86,232,0.12)]"
                  style={{ color: "#8456e8" }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              )}
              <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                style={{ color: sub }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </div>

            {isOpen && (
              <div style={{ borderTop: `1px solid ${divider}` }}>
                <div className="px-5 pt-3 pb-3">
                  {(() => {
                    const markup = entry.totalDespesa > 0 ? entry.precoTotal / entry.totalDespesa : null
                    return (
                      <div className="grid grid-cols-3 gap-2">
                        <SmallKpi label="Valor" value={brl(entry.precoTotal)} color={txt} />
                        <SmallKpi label="Recebido" value={brl(entry.totalPago)} color="#30D158" sub={`${num(percPago, 0)}% pago`} />
                        <SmallKpi label="Custos" value={brl(entry.totalDespesa)} color={entry.totalDespesa > 0 ? "#d33a3c" : sub}
                          sub={entry.despesas.filter(l => l.status === "pago" || l.formaPagamento === "conta").length > 0 ? `${entry.despesas.filter(l => l.status === "pago" || l.formaPagamento === "conta").length} lanç.` : "Sem despesas"} />
                        <SmallKpi label="Margem" value={margemPct != null ? `${num(margemPct, 1)}%` : "—"}
                          color={margemPct == null ? sub : margemPct >= 40 ? "#30D158" : margemPct >= 20 ? "#c57800" : "#d33a3c"}
                          sub={margemPct != null ? (margemPct >= 40 ? "Boa" : margemPct >= 20 ? "Razoável" : "Baixa") : "Sem dados"} />
                        <SmallKpi label="Markup" value={markup != null ? `${num(markup, 2)}x` : "—"}
                          color={markup == null ? sub : markup >= 2 ? "#30D158" : markup >= 1.5 ? "#c57800" : "#d33a3c"}
                          sub={markup != null ? (markup >= 2 ? "Bom" : markup >= 1.5 ? "Razoável" : "Baixo") : "Sem custos"} />
                        <SmallKpi label="M. Contrib." value={brl(resultado)} color={resultado > 0 ? "#8456e8" : resultado < 0 ? "#d33a3c" : sub}
                          sub={resultado > 0 ? "Positiva" : resultado < 0 ? "Negativa" : "Zero"} />
                        {custoFixoTotal > 0 && (
                          <SmallKpi label="Lucro líquido" value={margemLiqPct != null ? `${num(margemLiqPct, 1)}%` : "—"}
                            color={lucroLiq >= 0 ? "#009351" : "#d33a3c"} sub={brl(lucroLiq)} />
                        )}
                      </div>
                    )
                  })()}
                  <div className="mt-2.5 w-full h-1 rounded-full overflow-hidden" style={{ background: divider }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${percPago}%`, background: percPago >= 100 ? "#30D158" : percPago >= 50 ? "#8456e8" : "#c57800" }} />
                  </div>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="text-[10px]" style={{ color: sub }}>Fechado</span>
                    {onSalvarData ? (
                      <input type="date" defaultValue={entry.dataFechamento ?? ""} onClick={e => e.stopPropagation()}
                        onChange={e => { const v = e.target.value; if (v) entry.cards.forEach(c => onSalvarData(c.id, v)) }}
                        className="text-[10px] border-0 border-b outline-none cursor-pointer bg-transparent"
                        style={{ color: sub, borderColor: divider }} />
                    ) : (
                      <span className="text-[10px]" style={{ color: sub }}>{fmtFull(entry.dataFechamento)}</span>
                    )}
                    {entregaDate && (
                      <span className="text-[10px]" style={{ color: emAtraso ? "#d33a3c" : sub }}>
                        Entrega prevista {fmtFull(entregaDate)}
                      </span>
                    )}
                    {onSalvarPrazoRecebimentoInterno && (
                      <span className="flex items-center gap-1.5 ml-1">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#8456e8", flexShrink: 0 }}>
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        <span className="text-[10px] font-medium" style={{ color: "#8456e8" }}>Recebimento interno</span>
                        <input type="date"
                          defaultValue={entry.prazoRecebimentoInterno ?? ""}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            const v = e.target.value || null
                            entry.cards.forEach(c => onSalvarPrazoRecebimentoInterno!(c.id, v))
                          }}
                          className="text-[10px] border-0 border-b outline-none cursor-pointer bg-transparent font-medium"
                          style={{ color: "#8456e8", borderColor: "rgba(132,86,232,0.3)" }} />
                      </span>
                    )}
                    <div className="flex-1" />
                    {onNovoLancamento && (
                      <button onClick={e => {
                        e.stopPropagation()
                        const card = entry.cards[0]
                        onNovoLancamento({ nomeCliente: card.nomeCliente, loteId: card.loteId ?? undefined, loteNumero: card.loteNumero ?? undefined, cardId: card.loteId ? undefined : card.id, cardNumero: card.loteId ? undefined : card.numero })
                      }} className="text-[10.5px] font-semibold px-3 py-1.5 rounded-xl transition-colors bg-[rgba(60,60,67,0.07)] hover:bg-[rgba(60,60,67,0.12)]" style={{ color: txt }}>
                        + Lançamento
                      </button>
                    )}
                    {onDetalhes && (
                      <button onClick={e => { e.stopPropagation(); onDetalhes(entry.cards[0]) }}
                        className="text-[10.5px] font-semibold px-3 py-1.5 rounded-xl transition-colors bg-[rgba(80,9,196,0.08)] hover:bg-[rgba(80,9,196,0.14)] text-[#8456e8]">
                        Ver pedido
                      </button>
                    )}
                  </div>
                </div>

                {entry.cards.length > 1 && (
                  <div className="px-5 pt-2 pb-3" style={{ borderTop: `1px solid ${divider}`, background: innerBg }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider mb-2" style={{ color: sub }}>Itens do lote ({entry.cards.length})</p>
                    <div className="space-y-1">
                      {entry.cards.map(card => {
                        const s = STAGE[card.coluna] ?? STAGE[1]
                        return (
                          <div key={card.id} className="flex items-center justify-between text-[11px] py-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="truncate" style={{ color: txt }}>{card.numero || card.nomeCliente}</span>
                              <span className="text-[9px] font-semibold px-1.5 py-[2px] rounded-md shrink-0" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                            </div>
                            <span className="font-semibold tabular-nums shrink-0 ml-3" style={{ color: txt }}>{brl(card.preco)} · {num(card.quantidade)} un</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {entry.receitas.filter(l => l.status === "pago").length > 0 && (
                  <div className="px-5 pt-3 pb-2" style={{ borderTop: `1px solid ${divider}`, background: innerBg }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#30D158]">Entradas</p>
                      <p className="text-[10px] font-semibold tabular-nums text-[#30D158]">{brl(entry.receitas.filter(l => l.status === "pago").reduce((s,l) => s + l.valor, 0))} recebido</p>
                    </div>
                    <div className="space-y-0.5">
                      {entry.receitas.filter(l => l.status === "pago").map(l => (
                        <div key={l.id} className="flex items-center gap-2.5 py-1.5">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#30D158]" />
                          <span className="flex-1 text-[11.5px] truncate" style={{ color: txt }}>{l.descricao || "Recebimento"}</span>
                          <span className="text-[11.5px] font-bold tabular-nums shrink-0 text-[#30D158]">{brl(l.valor)}</span>
                          {l.dataPagamento && <span className="text-[10px] shrink-0" style={{ color: sub }}>{fmt(l.dataPagamento)}</span>}
                          {l.formaPagamento && <span className="text-[10px] shrink-0" style={{ color: sub }}>{formaPagLabel(l.formaPagamento)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {entry.despesas.filter(l => l.status === "pago" || l.formaPagamento === "conta").length > 0 && (
                  <div className="px-5 pt-3 pb-4" style={{ borderTop: `1px solid ${divider}`, background: innerBg }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#d33a3c]">Saídas / Custos</p>
                      <p className="text-[10px] font-semibold tabular-nums text-[#d33a3c]">{brl(entry.despesas.filter(l => l.status === "pago" || l.formaPagamento === "conta").reduce((s,l) => s + l.valor, 0))} pago</p>
                    </div>
                    <div className="space-y-0.5">
                      {entry.despesas.filter(l => l.status === "pago" || l.formaPagamento === "conta").map(l => (
                        <div key={l.id} className="flex items-center gap-2.5 py-1.5">
                          <CatIcon cat={l.categoria} className="w-3 h-3 shrink-0 text-[#9ca3af]" />
                          <span className="flex-1 text-[11.5px] truncate" style={{ color: txt }}>{l.descricao || "Despesa"}</span>
                          <span className="text-[11.5px] font-bold tabular-nums shrink-0 text-[#d33a3c]">−{brl(l.valor)}</span>
                          {l.formaPagamento === "conta"
                            ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 shrink-0">conta</span>
                            : l.dataPagamento && <span className="text-[10px] shrink-0" style={{ color: sub }}>{fmt(l.dataPagamento)}</span>
                          }
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!temLanc && (
                  <p className="px-5 py-3 text-[11.5px]" style={{ color: sub, borderTop: `1px solid ${divider}`, background: innerBg }}>
                    Nenhum lançamento registrado para este pedido.
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Gráfico de linha — pedidos por mês ───────────────────────────────────────

const MES_ABBR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
function fmtMesAbbr(ym: string) {
  const [y, m] = ym.split("-")
  return `${MES_ABBR[parseInt(m) - 1]}/${y.slice(2)}`
}

function PedidosLineChart({ entries, onClickMes }: { entries: OrderEntry[]; onClickMes?: (ym: string) => void }) {
  const [hovIdx, setHovIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const meses = useMemo(() => {
    const map = new Map<string, number>()
    entries.forEach(e => {
      if (!e.dataFechamento) return
      const key = e.dataFechamento.slice(0, 7)
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-18)
  }, [entries])

  if (meses.length < 2) return null

  const VW = 800, VH = 180
  const PL = 28, PR = 16, PT = 20, PB = 32
  const CW = VW - PL - PR
  const CH = VH - PT - PB

  const maxVal = Math.max(...meses.map(([, v]) => v), 1)
  const currentMesKey = new Date().toISOString().slice(0, 7)
  const currentIdx = meses.findIndex(([ym]) => ym === currentMesKey)
  const totalMeses = meses.length

  const pts = meses.map(([ym, v], i) => ({
    x: PL + (totalMeses > 1 ? (i / (totalMeses - 1)) : 0.5) * CW,
    y: PT + CH - (v / maxVal) * CH,
    v, ym,
  }))

  // Smooth cubic bezier (catmull-rom style)
  function smoothLinePath(points: { x: number; y: number }[]) {
    if (points.length < 2) return ""
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
    for (let i = 0; i < points.length - 1; i++) {
      const tension = 0.35
      const dx = points[i + 1].x - points[i].x
      const cp1x = points[i].x + dx * tension
      const cp1y = points[i].y
      const cp2x = points[i + 1].x - dx * tension
      const cp2y = points[i + 1].y
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${points[i + 1].x.toFixed(1)} ${points[i + 1].y.toFixed(1)}`
    }
    return d
  }

  const linePath = smoothLinePath(pts)
  const areaPath = pts.length > 0
    ? linePath + ` L ${pts[pts.length - 1].x.toFixed(1)} ${(PT + CH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(PT + CH).toFixed(1)} Z`
    : ""

  function getClosestIdx(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return null
    const svgX = ((e.clientX - rect.left) / rect.width) * VW
    let closest = 0, minDist = Infinity
    pts.forEach((p, i) => { const d = Math.abs(p.x - svgX); if (d < minDist) { minDist = d; closest = i } })
    return closest
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const idx = getClosestIdx(e)
    if (idx !== null) setHovIdx(idx)
  }

  function onClickSvg(e: React.MouseEvent<SVGSVGElement>) {
    const idx = getClosestIdx(e)
    if (idx !== null && onClickMes) onClickMes(meses[idx][0])
  }

  const hov = hovIdx !== null ? pts[hovIdx] : null
  const gridVals = Array.from({ length: 4 }, (_, i) => Math.round((maxVal / 3) * i))
  const stepLabel = Math.ceil(totalMeses / 7)

  const mesAtual = currentIdx >= 0 ? meses[currentIdx][1] : 0
  const mediaVal = entries.length / totalMeses

  return (
    <div>
      <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl overflow-hidden">
        {/* Header com números */}
        <div className="px-6 pt-5 pb-4 flex items-start gap-10 border-b border-[rgba(0,0,0,0.04)]">
          <div>
            <p className="text-[10.5px] uppercase tracking-wider font-bold text-[#8E8E93] mb-1">Este mês</p>
            <p className="text-[32px] font-bold text-[#1C1C1E] tabular-nums leading-none">{mesAtual}</p>
            <p className="text-[11px] text-[#8E8E93] mt-1">pedidos fechados</p>
          </div>
          <div>
            <p className="text-[10.5px] uppercase tracking-wider font-bold text-[#8E8E93] mb-1">Média mensal</p>
            <p className="text-[32px] font-bold text-[#8456e8] tabular-nums leading-none">{num(mediaVal, 1)}</p>
            <p className="text-[11px] text-[#8E8E93] mt-1">nos últimos {totalMeses} meses</p>
          </div>
          {hovIdx !== null && hovIdx !== currentIdx && (
            <div className="transition-all">
              <p className="text-[10.5px] uppercase tracking-wider font-bold text-[#8E8E93] mb-1">{fmtMesAbbr(meses[hovIdx][0])}</p>
              <p className="text-[32px] font-bold text-[#1C1C1E] tabular-nums leading-none">{meses[hovIdx][1]}</p>
              <p className="text-[11px] text-[#8E8E93] mt-1">pedidos</p>
            </div>
          )}
        </div>

        {/* SVG */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          style={{ width: "100%", display: "block", cursor: onClickMes ? "pointer" : "crosshair" }}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHovIdx(null)}
          onClick={onClickSvg}
        >
          <defs>
            <linearGradient id="pg-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8456e8" stopOpacity="0.14" />
              <stop offset="85%" stopColor="#8456e8" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Grid horizontal */}
          {gridVals.map(v => {
            const gy = PT + CH - (v / maxVal) * CH
            return (
              <g key={v}>
                <line x1={PL} y1={gy} x2={VW - PR} y2={gy}
                  stroke={v === 0 ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.05)"}
                  strokeWidth={1} strokeDasharray={v === 0 ? "" : "4 4"} />
                {v > 0 && (
                  <text x={PL - 5} y={gy + 3.5} textAnchor="end" fontSize={9} fill="#c7c7cc"
                    fontFamily="-apple-system,sans-serif">{v}</text>
                )}
              </g>
            )
          })}

          {/* Área */}
          <path d={areaPath} fill="url(#pg-grad)" />

          {/* Linha */}
          <path d={linePath} fill="none" stroke="#8456e8" strokeWidth={2.5}
            strokeLinecap="round" strokeLinejoin="round" />

          {/* Ponto do mês atual */}
          {currentIdx >= 0 && hovIdx !== currentIdx && (
            <circle cx={pts[currentIdx].x} cy={pts[currentIdx].y} r={4.5}
              fill="#8456e8" stroke="white" strokeWidth={2} />
          )}

          {/* Labels eixo X */}
          {pts.map((p, i) => {
            if (i % stepLabel !== 0 && i !== totalMeses - 1) return null
            return (
              <text key={i} x={p.x} y={VH - 6} textAnchor="middle" fontSize={9} fill="#c7c7cc"
                fontFamily="-apple-system,sans-serif">
                {fmtMesAbbr(meses[i][0])}
              </text>
            )
          })}

          {/* Hover */}
          {hov && (
            <>
              <line x1={hov.x} y1={PT} x2={hov.x} y2={PT + CH}
                stroke="#8456e8" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.35} />
              <circle cx={hov.x} cy={hov.y} r={5.5} fill="white" stroke="#8456e8" strokeWidth={2.5} />
              {/* Tooltip */}
              {(() => {
                const TW = 84, TH = 44, TR = 8
                const tx = Math.min(Math.max(hov.x - TW / 2, PL), VW - PR - TW)
                const ty = Math.max(PT + 4, hov.y - TH - 12)
                return (
                  <g>
                    <rect x={tx} y={ty} width={TW} height={TH} rx={TR} fill="#1C1C1E" />
                    <text x={tx + TW / 2} y={ty + 15} textAnchor="middle" fontSize={9.5}
                      fill="rgba(255,255,255,0.55)" fontFamily="-apple-system,sans-serif">
                      {fmtMesAbbr(hov.ym)}
                    </text>
                    <text x={tx + TW / 2} y={ty + 32} textAnchor="middle" fontSize={14}
                      fontWeight="700" fill="white" fontFamily="-apple-system,sans-serif">
                      {hov.v} pedido{hov.v !== 1 ? "s" : ""}
                    </text>
                  </g>
                )
              })()}
            </>
          )}
        </svg>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10.5px] uppercase tracking-wider font-bold text-[#8E8E93]">{children}</p>
}

function KpiCard({ icon, iconColor, iconBg, label, value, sub, subColor, highlight }: {
  icon: React.ReactNode; iconColor: string; iconBg: string
  label: string; value: string; sub?: string; subColor?: string; highlight?: boolean
}) {
  return (
    <div className={`rounded-2xl px-5 py-4 ${highlight ? "ring-1 ring-[rgba(124,58,237,0.1)]" : ""}`} style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: iconBg, color: iconColor }}>{icon}</div>
        <p className="text-[10.5px] uppercase tracking-wider font-semibold text-[#8E8E93] leading-tight">{label}</p>
      </div>
      <p className="text-[22px] font-bold tabular-nums text-[#1C1C1E] tracking-tight leading-none">{value}</p>
      {sub && <p className="text-[11px] mt-1.5" style={{ color: subColor ?? "var(--text-faint)" }}>{sub}</p>}
    </div>
  )
}

function SmallKpi({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="rounded-xl p-2.5" style={{ background: "rgba(116,116,128,0.05)", border: "1px solid rgba(116,116,128,0.08)" }}>
      <p className="text-[8.5px] uppercase tracking-wide font-semibold mb-1 text-[rgba(142,142,147,0.8)]">{label}</p>
      <p className="text-[14px] font-bold tabular-nums leading-none" style={{ color }}>{value}</p>
      {sub && <p className="text-[9.5px] mt-0.5 text-[rgba(142,142,147,0.7)]">{sub}</p>}
    </div>
  )
}
