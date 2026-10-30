"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Package, TrendingUp, CheckCircle2,
  DollarSign, BarChart3, Factory, User, Users, Home, Building2, Megaphone, Wrench, ClipboardList,
  CalendarDays, Search, X, Copy, ChevronDown, Check, Lock, Plus, Wallet, CalendarX2, CalendarClock,
} from "lucide-react"
import {
  KanbanCard, KanbanOpcao, Lote, LancamentoFinanceiro,
  NegocioParceiro, FormData, Calculo, PrazoEtapas,
  COLUNAS_KANBAN, COL_FECHADO, COL_ENTREGUE, COL_PERDIDO,
} from "../types"
import { brl, num } from "../utils"
import { custoFixoPeriodo, rateioPorPedido } from "../lib/metrics"
import { montarPedidos, margemContribuicao, Pedido } from "../lib/negocio"
import { KanbanView } from "./KanbanView"
import { CabecalhoPagina, Kpi, GradeKpis, Segmentado, Selo, Cartao, TituloCartao, ListaBarras, Colunas, Gaveta, LinhaLista, Vazio } from "./ds"

type Tab = "lista" | "kanban" | "visao"
type FiltroStatus = "todos" | "andamento" | "atrasados" | "prazo" | "receber" | "entregue"
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
  aReceber: number; cobrado: number; vencido: number; semCobranca: number
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

  const [tab, setTab]     = useState<Tab>("lista")
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

    // Agrupamento, etapa e valores vêm da camada canônica (lib/negocio)
    return montarPedidos(kanban, lancamentos).map(p => ({
      key: p.key, tipo: p.tipo, numero: p.numero, nomeCliente: p.nomeCliente, cards: p.cards, coluna: p.coluna,
      dataPedido: p.dataFechamento ?? "",
      dataFechamento: p.dataFechamento,
      dataEntregaPrevista: p.dataEntregaPrevista,
      dataEntregaReal: p.dataEntregaReal,
      prazoRecebimentoInterno: p.cards.find(c => c.prazoRecebimentoInterno)?.prazoRecebimentoInterno,
      receitas: p.receitas, despesas: p.despesas,
      precoTotal: p.valor, qtdTotal: p.quantidade,
      totalPago: p.recebido, totalDespesa: p.custoDireto,
      aReceber: p.aReceber, cobrado: p.cobrado, vencido: p.vencido, semCobranca: p.semCobranca,
      specs: buildSpecs(p.cards),
    }))
  }, [kanban, lancamentos, histMap])

  const { custoFixoTotal, receitaTotal } = useMemo(() => ({
    custoFixoTotal: custoFixoPeriodo(lancamentos, null, null),
    receitaTotal:   allEntries.reduce((s, e) => s + e.precoTotal, 0),
  }), [lancamentos, allEntries])

  const hoje = useMemo(() => new Date(), [])

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return allEntries
      .filter(e => passaFiltro(e, filtro, hoje))
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
  }, [allEntries, filtro, busca, ordem, hoje])

  const kanbanFiltrado = useMemo(() => {
    let r = kanban
    const q = busca.trim().toLowerCase()
    if (q) r = r.filter(c => c.nomeCliente.toLowerCase().includes(q) || (c.numero ?? "").toLowerCase().includes(q))
    if (filtro === "andamento") r = r.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_ENTREGUE && c.coluna !== COL_PERDIDO)
    else if (filtro === "entregue") r = r.filter(c => c.coluna === COL_ENTREGUE)
    else if (filtro !== "todos") {
      // Atrasados / prazo / a receber são definidos por pedido: mostra os cards desses pedidos
      const ids = new Set(allEntries.filter(e => passaFiltro(e, filtro, new Date())).flatMap(e => e.cards.map(c => c.id)))
      r = r.filter(c => ids.has(c.id))
    }
    return r
  }, [kanban, busca, filtro, allEntries])

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

  const cnt = (f: FiltroStatus) => allEntries.filter(e => passaFiltro(e, f, hoje)).length
  const emProd = allEntries.filter(e => passaFiltro(e, "andamento", hoje))
  const atrasados = allEntries.filter(e => passaFiltro(e, "atrasados", hoje))
  const prazo3 = allEntries.filter(e => passaFiltro(e, "prazo", hoje))
  const aReceber = allEntries.reduce((s, e) => s + e.aReceber, 0)
  const vencido = allEntries.reduce((s, e) => s + e.vencido, 0)
  const semCobrancaTotal = allEntries.reduce((s, e) => s + e.semCobranca, 0)
  const entregues = allEntries.filter(e => e.coluna === COL_ENTREGUE)

  // Clicar num KPI filtra a lista (clicar de novo volta para todos)
  const filtrar = (f: FiltroStatus) => {
    setFiltro(atual => atual === f ? "todos" : f)
    if (tab === "visao") setTab("lista")
  }

  const FILTROS: { v: FiltroStatus; nome: string }[] = [
    { v: "todos", nome: `Todos ${allEntries.length}` },
    { v: "andamento", nome: `Em produção ${emProd.length}` },
    { v: "atrasados", nome: `Atrasados ${atrasados.length}` },
    { v: "receber", nome: `A receber ${cnt("receber")}` },
    { v: "entregue", nome: `Entregues ${entregues.length}` },
  ]

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-page)" }}>
      <div className="shrink-0 px-6 pt-6 pb-4 space-y-4 max-w-[1320px] w-full mx-auto">
        <CabecalhoPagina
          titulo="Pedidos"
          sub={`${allEntries.length} pedidos · ${emProd.length} em produção · ${entregues.length} entregues`}
          acoes={<Segmentado<Tab> valor={tab} onChange={setTab}
            opcoes={[{ v: "lista", nome: "Lista" }, { v: "kanban", nome: "Quadro" }, { v: "visao", nome: "Visão geral" }]} />}
        />

        <GradeKpis>
          <Kpi rotulo="Em produção" icone={<Package className="w-3.5 h-3.5" />} tom="acento" destaque={filtro === "andamento"}
            valor={emProd.length} formato={n => num(Math.round(n))} onClick={() => filtrar("andamento")}
            sub={brl(emProd.reduce((s, e) => s + e.precoTotal, 0))} />
          <Kpi rotulo="Atrasados" icone={<CalendarX2 className="w-3.5 h-3.5" />} tom={atrasados.length ? "perigo" : "sucesso"} destaque={filtro === "atrasados"}
            valor={atrasados.length} formato={n => num(Math.round(n))} onClick={() => filtrar("atrasados")}
            sub={atrasados.length ? "passaram da data de entrega" : "tudo no prazo"} />
          <Kpi rotulo="Entregam em 3 dias" icone={<CalendarClock className="w-3.5 h-3.5" />} tom={prazo3.length ? "alerta" : "neutro"} destaque={filtro === "prazo"}
            valor={prazo3.length} formato={n => num(Math.round(n))} onClick={() => filtrar("prazo")}
            sub={`${allEntries.filter(e => e.coluna !== COL_ENTREGUE && !e.dataEntregaPrevista).length} sem data de entrega`} />
          <Kpi rotulo="A receber" icone={<Wallet className="w-3.5 h-3.5" />} tom={vencido > 0 ? "perigo" : "neutro"} destaque={filtro === "receber"}
            valor={aReceber} formato={brl} onClick={() => filtrar("receber")}
            sub={vencido > 0 ? `${brl(vencido)} vencido · ${brl(semCobrancaTotal)} sem cobrança` : semCobrancaTotal > 0.5 ? `${brl(semCobrancaTotal)} ainda sem cobrança lançada` : "tudo cobrado"} />
          <Kpi rotulo="Entregues" icone={<CheckCircle2 className="w-3.5 h-3.5" />} tom="sucesso" destaque={filtro === "entregue"}
            valor={entregues.length} formato={n => num(Math.round(n))} onClick={() => filtrar("entregue")}
            sub={brl(entregues.reduce((s, e) => s + e.precoTotal, 0))} />
        </GradeKpis>

        {tab !== "visao" && (
          <div className="flex items-center gap-2 flex-wrap">
            <Segmentado<FiltroStatus> valor={filtro} onChange={setFiltro}
              opcoes={tab === "kanban" ? FILTROS : [...FILTROS.slice(0, 3), { v: "prazo", nome: `Em 3 dias ${prazo3.length}` }, ...FILTROS.slice(3)]} />
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#898892] pointer-events-none" />
              <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar cliente ou número"
                className="w-full h-9 rounded-lg pl-9 pr-8 text-[12.5px] text-[#191625] placeholder:text-[#898892] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] transition-all ds-borda" />
              {busca && (
                <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-[#898892] hover:text-[#191625]">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {tab === "lista" && (
              <select value={ordem} onChange={e => setOrdem(e.target.value as OrdemPedidos)}
                className="h-9 rounded-lg px-3 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 cursor-pointer ds-borda">
                <option value="cronologico">Mais novos primeiro</option>
                <option value="entrega">Entrega mais próxima</option>
                <option value="valor">Maior valor</option>
                <option value="resultado">Maior resultado</option>
              </select>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "visao" ? (
          <DashboardTab entries={allEntries} lancamentos={lancamentos} kanban={kanban} onDetalhes={onDetalhes} />
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

// Filtros por pedido (mesma regra para a lista, o quadro e os KPIs)
function diasPara(iso: string, hoje: Date) {
  return Math.round((new Date(iso + "T12:00:00").getTime() - new Date(hoje.toDateString()).getTime() - 12 * 3_600_000) / 86_400_000)
}
function passaFiltro(e: OrderEntry, f: FiltroStatus, hoje: Date): boolean {
  const aberto = e.coluna !== COL_ENTREGUE
  switch (f) {
    case "todos":     return true
    case "andamento": return aberto
    case "entregue":  return !aberto
    case "receber":   return e.aReceber > 0
    case "atrasados": return aberto && !!e.dataEntregaPrevista && diasPara(e.dataEntregaPrevista, hoje) < 0
    case "prazo": {
      if (!aberto || !e.dataEntregaPrevista) return false
      const d = diasPara(e.dataEntregaPrevista, hoje)
      return d >= 0 && d <= 3
    }
  }
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
        <span className="text-[9.5px] ds-num text-[#8E8E93]">{doneCnt}/{total} etapas</span>
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

function DashboardTab({ entries, onDetalhes }: {
  entries: OrderEntry[]
  lancamentos: LancamentoFinanceiro[]
  kanban: KanbanCard[]
  onDetalhes?: (card: KanbanCard) => void
}) {
  const [gaveta, setGaveta] = useState<{ titulo: string; sub: string; itens: OrderEntry[] } | null>(null)

  // Definições canônicas: pedido = lote (ou card avulso); etapa = item menos avançado
  const contratado     = entries.reduce((s, e) => s + e.precoTotal, 0)
  const totalRecebido  = entries.reduce((s, e) => s + e.totalPago, 0)
  const aReceber       = entries.reduce((s, e) => s + e.aReceber, 0)
  const semCobranca    = entries.reduce((s, e) => s + e.semCobranca, 0)
  const ticketMedio    = entries.length > 0 ? contratado / entries.length : 0

  const margem = margemContribuicao(entries.map(e => ({ valor: e.precoTotal, custoDireto: e.totalDespesa } as Pedido)))

  const mesesSet = new Set<string>()
  entries.forEach(e => { if (e.dataFechamento) mesesSet.add(e.dataFechamento.slice(0, 7)) })
  const pedidosPorMes = entries.length / (mesesSet.size || 1)
  const clientesUnicos = new Set(entries.map(e => e.nomeCliente.trim().toLowerCase())).size
  const pedidosPorCliente = clientesUnicos > 0 ? entries.length / clientesUnicos : 0

  const etapaCount = new Map<number, { cnt: number; valor: number }>()
  entries.forEach(e => {
    const v = etapaCount.get(e.coluna) ?? { cnt: 0, valor: 0 }
    etapaCount.set(e.coluna, { cnt: v.cnt + 1, valor: v.valor + e.precoTotal })
  })
  const etapas = [...etapaCount.entries()].sort((a, b) => a[0] - b[0])

  const hojeD = new Date()
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hojeD.getFullYear(), hojeD.getMonth() - 11 + i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    return { chave: ym, rotulo: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), valor: entries.filter(e => e.dataFechamento?.startsWith(ym)).length, destaque: i === 11 }
  })
  const comPedido = meses.filter(m => m.valor > 0)
  const mediaMeses = comPedido.length ? comPedido.reduce((s, m) => s + m.valor, 0) / comPedido.length : 0

  const abrir = (titulo: string, itens: OrderEntry[]) =>
    setGaveta({ titulo, sub: `${itens.length} ${itens.length === 1 ? "pedido" : "pedidos"} · ${brl(itens.reduce((s, i) => s + i.precoTotal, 0))}`, itens })

  if (entries.length === 0) return (
    <div className="px-6"><Vazio icone={<Package className="w-9 h-9" />} titulo="Nenhum pedido ainda" sub="Feche um orçamento para ele aparecer aqui." /></div>
  )

  return (
    <div className="px-6 pb-10 space-y-4 max-w-[1320px] mx-auto ds-escalonado">
      <Cartao>
        <TituloCartao titulo="Pedidos fechados por mês" icone={<BarChart3 className="w-4 h-4" />}
          sub={`${meses[meses.length - 1].valor} neste mês · média de ${num(mediaMeses, 1)} por mês · clique num mês para ver os pedidos`} />
        <Colunas itens={meses} formato={n => `${Math.round(n)} ${Math.round(n) === 1 ? "pedido" : "pedidos"}`}
          onClick={ym => abrir(fmtMesAbbr(ym), entries.filter(e => e.dataFechamento?.startsWith(ym)))} />
      </Cartao>

      <GradeKpis>
        <Kpi rotulo="Total contratado" icone={<TrendingUp className="w-3.5 h-3.5" />} tom="acento" destaque
          valor={contratado} formato={brl} sub={`${entries.length} pedidos desde o início`} onClick={() => abrir("Todos os pedidos", entries)} />
        <Kpi rotulo="Recebido" icone={<DollarSign className="w-3.5 h-3.5" />} tom="sucesso"
          valor={totalRecebido} formato={brl}
          sub={semCobranca > 0 ? `${brl(semCobranca)} ainda sem cobrança lançada` : `${num(contratado > 0 ? totalRecebido / contratado * 100 : 0, 0)}% do contratado`}
          onClick={semCobranca > 0 ? () => abrir("Sem cobrança lançada", entries.filter(e => e.semCobranca > 0.5)) : undefined} />
        <Kpi rotulo="Ticket médio" icone={<BarChart3 className="w-3.5 h-3.5" />} valor={ticketMedio} formato={brl} sub="por pedido" />
        <Kpi rotulo="Margem de contribuição" icone={<TrendingUp className="w-3.5 h-3.5" />}
          tom={margem.pct == null ? "neutro" : margem.pct < 30 ? "perigo" : margem.pct < 45 ? "alerta" : "sucesso"}
          valor={margem.pct} formato={n => `${num(n, 1)}%`}
          sub={margem.pct != null ? `${margem.comCusto} de ${margem.total} pedidos com custo` : "sem custos lançados"}
          onClick={() => abrir("Pedidos sem custo lançado", entries.filter(e => e.totalDespesa <= 0))} />
        <Kpi rotulo="Ritmo" icone={<Users className="w-3.5 h-3.5" />} valor={pedidosPorMes} formato={n => `${num(n, 1)}/mês`}
          sub={`${num(pedidosPorCliente, 1)} pedidos por cliente`} />
      </GradeKpis>

      <Cartao>
        <TituloCartao titulo="Pedidos por etapa" icone={<Factory className="w-4 h-4" />} sub="Clique numa etapa para ver os pedidos" />
        <ListaBarras formatoValor={brl} onClick={k => abrir(COLUNAS_KANBAN[Number(k)] ?? "Etapa", entries.filter(e => e.coluna === Number(k)))}
          itens={etapas.map(([col, v]) => ({ chave: col, rotulo: COLUNAS_KANBAN[col] ?? "—", qtd: v.cnt, valor: v.valor, tom: col === COL_ENTREGUE ? "sucesso" as const : "acento" as const }))} />
      </Cartao>

      <Gaveta aberta={!!gaveta} titulo={gaveta?.titulo ?? ""} sub={gaveta?.sub} onFechar={() => setGaveta(null)}>
        {gaveta?.itens.length === 0 && <Vazio icone={<Package className="w-8 h-8" />} titulo="Nenhum pedido" />}
        {gaveta?.itens.map(e => (
          <LinhaLista key={e.key} titulo={`${e.numero} · ${e.nomeCliente}`}
            sub={`${COLUNAS_KANBAN[e.coluna] ?? "—"}${e.dataFechamento ? ` · fechado ${fmt(e.dataFechamento)}` : ""}`}
            valor={brl(e.precoTotal)} valorSub={e.aReceber > 0 ? `falta ${brl(e.aReceber)}` : e.totalPago >= e.precoTotal - 0.5 ? "pago" : undefined}
            onClick={onDetalhes ? () => { setGaveta(null); onDetalhes(e.cards[0]) } : undefined} />
        ))}
      </Gaveta>
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
    <Vazio icone={<Search className="w-8 h-8" />} titulo={busca ? `Nenhum resultado para "${busca}"` : "Nenhum pedido neste filtro"}
      sub={busca ? undefined : "Clique de novo no número do topo para ver todos."} />
  )

  return (
    <div className="px-6 pb-8 space-y-2 max-w-[1320px] mx-auto">
      {/* KPIs de concluídos */}
      {kpiConcluidos.cnt > 0 && (
        <div className="rounded-xl px-5 pt-4 pb-3 mb-2 bg-white ds-cartao">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#009351]" />
            <p className="text-[12px] font-semibold text-[#191625]">
              {kpiConcluidos.cnt} {kpiConcluidos.cnt === 1 ? "pedido marcado como concluído" : "pedidos marcados como concluídos"}
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

      <p className="text-[11px] font-medium text-[#898892] px-1 pb-1">
        {lista.length} {lista.length === 1 ? "pedido" : "pedidos"}
      </p>

      <div className="space-y-2 ds-escalonado">
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
          <div key={entry.key} className={`rounded-xl overflow-hidden ds-cartao ${isOpen ? "shadow-[0_8px_24px_rgba(25,22,37,0.07)]" : "hover:shadow-[0_4px_14px_rgba(25,22,37,0.06)]"}`}
            style={{ background: entry.cards.some(c => selectedCardIds?.has(c.id)) ? "rgba(132,86,232,0.06)" : "white", borderColor: entry.cards.some(c => selectedCardIds?.has(c.id)) ? "#8456e8" : undefined }}>
            <div className="group/row flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none hover:bg-[rgba(116,116,128,0.03)] transition-colors" onClick={e => {
              if (e.metaKey || e.ctrlKey) { e.preventDefault(); entry.cards.forEach(c => onSelectCard?.(c.id)) }
              else toggle(entry.key)
            }}>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[13px] font-semibold leading-snug truncate" style={{ color: txt }}>{entry.nomeCliente}</span>
                  <Selo tom="acento">{entry.numero}</Selo>
                  {entry.tipo === "lote" && entry.cards.length > 1 && <Selo tom="info">{entry.cards.length} itens</Selo>}
                  <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10.5px] font-semibold" style={{ background: stage.bg, color: stage.color }}>{stage.label}</span>
                </div>
                <p className="text-[11px] mt-1 truncate" style={{ color: sub }}>
                  {entry.dataPedido ? fmt(entry.dataPedido) : "Sem data"}{entry.specs ? ` · ${entry.specs}` : ""}{entry.qtdTotal > 0 ? ` · ${num(entry.qtdTotal)} un` : ""}
                </p>
              </div>
              <div className="text-right shrink-0 w-[150px] hidden sm:block">
                {entry.coluna === COL_ENTREGUE ? (
                  <p className="text-[11px] font-semibold text-[#009351]">Entregue {entry.dataEntregaReal ? fmt(entry.dataEntregaReal) : ""}</p>
                ) : entregaDate ? (
                  <p className="text-[11px] font-semibold" style={{ color: emAtraso ? "#d33a3c" : quaseVenc ? "#c57800" : sub }}>
                    {emAtraso ? `${Math.abs(diasEnt!)} ${Math.abs(diasEnt!) === 1 ? "dia" : "dias"} de atraso` : diasEnt === 0 ? "Entrega hoje" : diasEnt === 1 ? "Entrega amanhã" : `Entrega em ${diasEnt} dias`}
                  </p>
                ) : <p className="text-[11px] text-[#898892]">Sem data de entrega</p>}
                <p className="text-[10.5px] text-[#898892] mt-0.5">{entregaDate && entry.coluna !== COL_ENTREGUE ? fmtFull(entregaDate) : ""}</p>
              </div>
              <div className="text-right shrink-0 w-[150px] whitespace-nowrap">
                <p className="text-[13.5px] font-semibold ds-num" style={{ color: txt }}>{brl(entry.precoTotal)}</p>
                <p className={`text-[10.5px] mt-0.5 ds-num ${entry.vencido > 0 ? "text-[#d33a3c] font-semibold" : entry.aReceber > 0 ? "text-[#c57800]" : "text-[#009351]"}`}
                  title={entry.aReceber > 0 ? `Deve ${brl(entry.aReceber)}: ${brl(entry.cobrado)} com cobrança lançada, ${brl(entry.semCobranca)} sem cobrança` : undefined}>
                  {entry.vencido > 0 ? `${brl(entry.vencido)} vencido`
                    : entry.aReceber <= 0 ? "pago"
                    : entry.semCobranca > 0.5 ? `${brl(entry.aReceber)} sem cobrança`
                    : `falta ${brl(entry.aReceber)}`}
                </p>
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
                    {done ? <><Check className="w-3 h-3" />Concluído</> : "Concluir"}
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
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}
              <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} style={{ color: sub }} />
            </div>

            {isOpen && (
              <div className="apple-slide-up" style={{ borderTop: `1px solid ${divider}` }}>
                <div className="px-5 pt-3 pb-3">
                  {(() => {
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        <SmallKpi label="Valor" value={brl(entry.precoTotal)} color={txt} sub={`${num(entry.qtdTotal)} un`} />
                        <SmallKpi label="Recebido" value={brl(entry.totalPago)} color="#009351" sub={`${num(percPago, 0)}% pago`} />
                        <SmallKpi label="Custos lançados" value={brl(entry.totalDespesa)} color={entry.totalDespesa > 0 ? "#d33a3c" : sub}
                          sub={entry.totalDespesa > 0 ? `${entry.despesas.filter(l => l.status === "pago" || l.formaPagamento === "conta").length} lançamentos` : "nenhum ainda"} />
                        <SmallKpi label="Margem de contribuição" value={margemPct != null && entry.totalDespesa > 0 ? `${num(margemPct, 1)}%` : "—"}
                          color={margemPct == null || entry.totalDespesa <= 0 ? sub : margemPct >= 45 ? "#009351" : margemPct >= 30 ? "#c57800" : "#d33a3c"}
                          sub={entry.totalDespesa > 0 ? brl(entry.precoTotal - entry.totalDespesa) : "lance os custos para ver"} />
                        {custoFixoTotal > 0 && entry.totalDespesa > 0 ? (
                          <SmallKpi label="Lucro líquido" value={margemLiqPct != null ? `${num(margemLiqPct, 1)}%` : "—"}
                            color={lucroLiq >= 0 ? "#009351" : "#d33a3c"} sub={`${brl(lucroLiq)} após custo fixo`} />
                        ) : <SmallKpi label="Resultado de caixa" value={brl(resultado)} color={resultado >= 0 ? txt : "#d33a3c"} sub="recebido − custos" />}
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
                        <Lock className="w-2.5 h-2.5 shrink-0 text-[#8456e8]" />
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
                      }} className="h-8 px-3 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors bg-white hover:bg-[rgba(116,116,128,0.06)] ds-borda" style={{ color: txt }}>
                        <Plus className="w-3.5 h-3.5" /> Lançamento
                      </button>
                    )}
                    {onDetalhes && (
                      <button onClick={e => { e.stopPropagation(); onDetalhes(entry.cards[0]) }}
                        className="h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors bg-[#8456e8] hover:bg-[#7445d4] text-white">
                        Abrir pedido
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
                            <span className="font-semibold ds-num shrink-0 ml-3" style={{ color: txt }}>{brl(card.preco)} · {num(card.quantidade)} un</span>
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
                      <p className="text-[10px] font-semibold ds-num text-[#30D158]">{brl(entry.receitas.filter(l => l.status === "pago").reduce((s,l) => s + l.valor, 0))} recebido</p>
                    </div>
                    <div className="space-y-0.5">
                      {entry.receitas.filter(l => l.status === "pago").map(l => (
                        <div key={l.id} className="flex items-center gap-2.5 py-1.5">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#30D158]" />
                          <span className="flex-1 text-[11.5px] truncate" style={{ color: txt }}>{l.descricao || "Recebimento"}</span>
                          <span className="text-[11.5px] font-bold ds-num shrink-0 text-[#30D158]">{brl(l.valor)}</span>
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
                      <p className="text-[10px] font-semibold ds-num text-[#d33a3c]">{brl(entry.despesas.filter(l => l.status === "pago" || l.formaPagamento === "conta").reduce((s,l) => s + l.valor, 0))} pago</p>
                    </div>
                    <div className="space-y-0.5">
                      {entry.despesas.filter(l => l.status === "pago" || l.formaPagamento === "conta").map(l => (
                        <div key={l.id} className="flex items-center gap-2.5 py-1.5">
                          <CatIcon cat={l.categoria} className="w-3 h-3 shrink-0 text-[#9ca3af]" />
                          <span className="flex-1 text-[11.5px] truncate" style={{ color: txt }}>{l.descricao || "Despesa"}</span>
                          <span className="text-[11.5px] font-bold ds-num shrink-0 text-[#d33a3c]">−{brl(l.valor)}</span>
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
    </div>
  )
}

// ── Gráfico de linha — pedidos por mês ───────────────────────────────────────

const MES_ABBR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
function fmtMesAbbr(ym: string) {
  const [y, m] = ym.split("-")
  return `${MES_ABBR[parseInt(m) - 1]}/${y.slice(2)}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SmallKpi({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5 bg-[rgba(116,116,128,0.05)]">
      <p className="text-[10.5px] font-medium mb-1.5 text-[#898892]">{label}</p>
      <p className="text-[15px] font-semibold ds-num leading-none" style={{ color }}>{value}</p>
      {sub && <p className="text-[10.5px] mt-1 text-[#898892]">{sub}</p>}
    </div>
  )
}
