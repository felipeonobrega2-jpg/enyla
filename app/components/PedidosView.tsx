"use client"

import { useState, useMemo } from "react"
import { Flame, Factory, Package, User, Home, Building2, Megaphone, Wrench, ClipboardList } from "lucide-react"
import { KanbanCard, LancamentoFinanceiro, FormData, Calculo, COLUNAS_KANBAN, COL_FECHADO, COL_ENTREGUE, COL_PERDIDO, COL_HOT } from "../types"
import { brl, num } from "../utils"
import { custoFixoPeriodo, rateioPorPedido } from "../lib/metrics"

type HistItem = { form: FormData; calculo: Calculo; data: string; numero?: string }
type FiltroStatus = "todos" | "andamento" | "entregue"
type OrdemPedidos = "cronologico" | "recente" | "valor" | "resultado" | "entrega"

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
function statusBadge(status: string) {
  if (status === "pago")     return { label: "Pago",     color: "#30D158", bg: "rgba(48,209,88,0.12)" }
  if (status === "atrasado") return { label: "Atrasado", color: "#d33a3c", bg: "rgba(255,59,48,0.1)" }
  return { label: "Pendente", color: "#c57800", bg: "rgba(255,149,0,0.1)" }
}
function formaPagLabel(f?: string) {
  const m: Record<string, string> = {
    pix: "Pix", boleto: "Boleto", cartao_credito: "Cartão crédito",
    cartao_debito: "Cartão débito", dinheiro: "Dinheiro",
    transferencia: "Transferência", outro: "Outro",
  }
  return f ? (m[f] ?? f) : ""
}

type OrderEntry = {
  key: string
  tipo: "lote" | "card"
  numero: string
  nomeCliente: string
  cards: KanbanCard[]
  coluna: number
  dataPedido: string
  dataFechamento?: string
  dataEntregaPrevista?: string
  dataEntregaReal?: string
  receitas: LancamentoFinanceiro[]
  despesas: LancamentoFinanceiro[]
  precoTotal: number
  totalPago: number
  totalDespesa: number
  specs: string
  qtdTotal: number
}

export function PedidosView({
  kanban,
  historico,
  lancamentos,
  onDetalhes,
  onNovoLancamento,
  onSalvarData,
  isDark,
}: {
  kanban: KanbanCard[]
  historico: HistItem[]
  lancamentos: LancamentoFinanceiro[]
  onDetalhes?: (card: KanbanCard) => void
  onNovoLancamento?: (prefill: Partial<LancamentoFinanceiro>) => void
  onSalvarData?: (cardId: string, data: string) => void
  isDark?: boolean
}) {
  const [filtro, setFiltro] = useState<FiltroStatus>("todos")
  const [ordem, setOrdem]   = useState<OrdemPedidos>("cronologico")
  const [busca, setBusca]   = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [concluidos, setConcluidos] = useState<Set<string>>(() => {
    try {
      const s = typeof window !== "undefined" ? localStorage.getItem("pedidos-concluidos") : null
      return s ? new Set<string>(JSON.parse(s)) : new Set<string>()
    } catch { return new Set<string>() }
  })

  function toggle(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function toggleConcluido(key: string) {
    setConcluidos(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      if (typeof window !== "undefined")
        localStorage.setItem("pedidos-concluidos", JSON.stringify([...next]))
      return next
    })
  }

  const histMap = useMemo(() => new Map(historico.map(h => [h.numero ?? "", h])), [historico])

  const entries = useMemo<OrderEntry[]>(() => {
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
      const card = cards[0]
      const hist = histMap.get(card.numero ?? "")
      const form = hist?.form
      const parts: string[] = []
      if (form && form.frente > 0)          parts.push(`${form.frente}×${form.lateral}×${form.alturaBox} cm`)
      else if (card.dimensoes)              parts.push(`${card.dimensoes} cm`)
      if (form?.materialNome || card.materialNome) parts.push(form?.materialNome || card.materialNome)
      if (cards.length > 1)                 parts.push(`${cards.length} itens`)
      if (form?.incluirVerniz)              parts.push("Verniz UV")
      if (form?.comFaca)                    parts.push("Faca")
      return parts.join(" · ")
    }

    function buildEntry(
      key: string, tipo: "lote" | "card", numero: string,
      cards: KanbanCard[], recs: LancamentoFinanceiro[], desps: LancamentoFinanceiro[]
    ): OrderEntry {
      const coluna   = cards.reduce((mx, c) => Math.max(mx, c.coluna), 0)
      const pago     = recs.filter(l => l.status === "pago").reduce((s, l) => s + l.valor, 0)
      const despPago = desps.filter(l => l.status === "pago" || l.formaPagamento === "conta").reduce((s, l) => s + l.valor, 0)
      return {
        key, tipo, numero, nomeCliente: cards[0].nomeCliente, cards, coluna,
        dataPedido:          cards.reduce((earliest, c) => {
          const d = c.dataFechamento ?? ""
          return (d && (!earliest || d < earliest)) ? d : earliest
        }, cards.find(c => c.dataFechamento)?.dataFechamento ?? ""),
        dataFechamento:      cards.find(c => c.dataFechamento)?.dataFechamento,
        dataEntregaPrevista: cards.find(c => c.dataEntregaPrevista)?.dataEntregaPrevista,
        dataEntregaReal:     cards.find(c => c.dataEntregaReal)?.dataEntregaReal,
        receitas: recs, despesas: desps,
        precoTotal: cards.reduce((s, c) => s + c.preco, 0),
        qtdTotal:   cards.reduce((s, c) => s + c.quantidade, 0),
        totalPago: pago, totalDespesa: despPago,
        specs: buildSpecs(cards),
      }
    }

    const result: OrderEntry[] = []

    for (const [loteId, cards] of loteGroups) {
      const cardIds = new Set(cards.map(c => c.id))
      const recs  = lancamentos.filter(l => l.tipo === "receita" && (l.loteId === loteId || (l.cardId && cardIds.has(l.cardId))))
      const desps = lancamentos.filter(l => l.tipo === "despesa" && (l.loteId === loteId || (l.cardId && cardIds.has(l.cardId))))
      result.push(buildEntry(`lote-${loteId}`, "lote", cards[0].loteNumero ?? "Lote", cards, recs, desps))
    }

    for (const card of soloCards) {
      const recs  = lancamentos.filter(l => l.tipo === "receita" && l.cardId === card.id)
      const desps = lancamentos.filter(l => l.tipo === "despesa" && l.cardId === card.id)
      result.push(buildEntry(`card-${card.id}`, "card", card.numero ?? "—", [card], recs, desps))
    }

    return result
  }, [kanban, lancamentos, histMap])

  const kpiConcluidos = useMemo(() => {
    const c = entries.filter(e => concluidos.has(e.key))
    const cnt   = c.length
    const fat   = c.reduce((s, e) => s + e.precoTotal, 0)
    const rec   = c.reduce((s, e) => s + e.totalPago, 0)
    const custo = c.reduce((s, e) => s + e.totalDespesa, 0)
    const result = rec - custo
    const mks   = c.filter(e => e.totalDespesa > 0).map(e => e.precoTotal / e.totalDespesa)
    const mkAvg = mks.length ? mks.reduce((s, m) => s + m, 0) / mks.length : null
    const mgs   = c.filter(e => e.precoTotal > 0).map(e => (e.precoTotal - e.totalDespesa) / e.precoTotal * 100)
    const mgAvg = mgs.length ? mgs.reduce((s, m) => s + m, 0) / mgs.length : null
    return { cnt, fat, rec, custo, result, mkAvg, mgAvg }
  }, [entries, concluidos])

  // Rateio de custo fixo all-time para lucro líquido por pedido
  const { custoFixoTotal, receitaTotal } = useMemo(() => ({
    custoFixoTotal: custoFixoPeriodo(lancamentos, null, null),
    receitaTotal:   entries.reduce((s, e) => s + e.precoTotal, 0),
  }), [lancamentos, entries])

  const hoje = new Date()

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return entries
      .filter(e => {
        if (filtro === "andamento") return e.coluna !== COL_ENTREGUE
        if (filtro === "entregue")  return e.coluna === COL_ENTREGUE
        return true
      })
      .filter(e => !q ||
        e.nomeCliente.toLowerCase().includes(q) ||
        e.numero.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        if (ordem === "cronologico") return b.dataPedido.localeCompare(a.dataPedido)
        if (ordem === "recente")     return (b.dataFechamento ?? "").localeCompare(a.dataFechamento ?? "")
        if (ordem === "valor")       return b.precoTotal - a.precoTotal
        if (ordem === "resultado")   return (b.totalPago - b.totalDespesa) - (a.totalPago - a.totalDespesa)
        if (ordem === "entrega") {
          const da = a.dataEntregaPrevista ?? "9999"
          const db = b.dataEntregaPrevista ?? "9999"
          return da.localeCompare(db)
        }
        return 0
      })
  }, [entries, filtro, busca, ordem])

  const pageBg  = isDark ? "#0C0C0E" : "#F2F2F7"
  const cardBg  = isDark ? "#1C1C1E" : "#fff"
  const border  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"
  const txt     = isDark ? "rgba(255,255,255,0.85)" : "#1C1C1E"
  const sub     = isDark ? "rgba(255,255,255,0.4)"  : "rgba(60,60,67,0.5)"
  const divider = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"
  const innerBg = isDark ? "rgba(255,255,255,0.03)" : "rgba(116,116,128,0.03)"

  const cntAnd = entries.filter(e => e.coluna !== COL_ENTREGUE).length
  const cntEnt = entries.filter(e => e.coluna === COL_ENTREGUE).length

  if (entries.length === 0) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6" style={{ background: pageBg }}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-1" style={{ background: "rgba(80,9,196,0.08)" }}>
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#8456e8" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
        </svg>
      </div>
      <p className="text-[15px] font-semibold" style={{ color: txt }}>Nenhum pedido ainda</p>
      <p className="text-[12px] leading-relaxed max-w-[260px]" style={{ color: sub }}>Feche um orçamento no Kanban para ele aparecer aqui.</p>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: pageBg }}>

      {/* ── Toolbar sticky ── */}
      <div
        className="shrink-0 border-b px-5 py-3 flex items-center gap-2 flex-wrap"
        style={{
          borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(60,60,67,0.10)",
          background: isDark ? "rgba(12,12,14,0.97)" : "rgba(242,242,247,0.97)",
          backdropFilter: "blur(12px)",
        }}
      >

          {/* Status pills */}
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: border, background: cardBg }}>
            {([
              ["todos",     `Todos (${entries.length})`],
              ["andamento", `Em andamento (${cntAnd})`],
              ["entregue",  `Entregues (${cntEnt})`],
            ] as [FiltroStatus, string][]).map(([v, label]) => (
              <button key={v} onClick={() => setFiltro(v)}
                className="px-3 py-1.5 text-[11px] font-semibold transition-colors"
                style={{ background: filtro === v ? "#8456e8" : "transparent", color: filtro === v ? "#fff" : sub }}>
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[160px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "#8E8E93" }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar cliente ou número…"
              className="w-full h-8 pl-9 pr-7 rounded-xl text-[12px] border outline-none transition-all"
              style={{ background: cardBg, borderColor: border, color: txt }} />
            {busca && (
              <button onClick={() => setBusca("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-lg leading-none" style={{ color: sub }}>×</button>
            )}
          </div>

          {/* Sort */}
          <select value={ordem} onChange={e => setOrdem(e.target.value as OrdemPedidos)}
            className="h-8 px-2.5 rounded-xl text-[11.5px] border outline-none cursor-pointer"
            style={{ background: cardBg, borderColor: border, color: txt }}>
            <option value="cronologico">Cronológico</option>
            <option value="recente">Mais recentes</option>
            <option value="valor">Maior valor</option>
            <option value="resultado">Maior resultado</option>
            <option value="entrega">Entrega próxima</option>
          </select>
      </div>

      {/* ── KPIs de concluídos ── */}
      {kpiConcluidos.cnt > 0 && (
        <div className="shrink-0 px-5 pt-4 pb-3 border-b" style={{
          borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
          background: isDark ? "rgba(48,209,88,0.04)" : "rgba(48,209,88,0.03)",
        }}>
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="#30D158" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <p className="text-[11px] font-bold tracking-wide" style={{ color: "#30D158" }}>
              {kpiConcluidos.cnt} {kpiConcluidos.cnt === 1 ? "pedido concluído" : "pedidos concluídos"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Kpi label="Faturamento" value={brl(kpiConcluidos.fat)} color={txt} />
            <Kpi label="Recebido"
              value={brl(kpiConcluidos.rec)}
              color="#30D158"
              sub={kpiConcluidos.fat > 0 ? `${num(kpiConcluidos.rec / kpiConcluidos.fat * 100, 0)}%` : undefined} />
            <Kpi label="Custos"
              value={brl(kpiConcluidos.custo)}
              color={kpiConcluidos.custo > 0 ? "#d33a3c" : "#8E8E93"} />
            <Kpi label="M. Contribuição"
              value={brl(kpiConcluidos.result)}
              color={kpiConcluidos.result > 0 ? "#8456e8" : "#d33a3c"}
              sub={kpiConcluidos.result > 0 ? "Positiva" : "Negativa"} />
            <Kpi label="Markup médio"
              value={kpiConcluidos.mkAvg != null ? `${num(kpiConcluidos.mkAvg, 2)}x` : "—"}
              color={kpiConcluidos.mkAvg == null ? "#8E8E93" : kpiConcluidos.mkAvg >= 2 ? "#30D158" : kpiConcluidos.mkAvg >= 1.5 ? "#c57800" : "#d33a3c"} />
            <Kpi label="Margem média"
              value={kpiConcluidos.mgAvg != null ? `${num(kpiConcluidos.mgAvg, 1)}%` : "—"}
              color={kpiConcluidos.mgAvg == null ? "#8E8E93" : kpiConcluidos.mgAvg >= 40 ? "#30D158" : kpiConcluidos.mgAvg >= 20 ? "#c57800" : "#d33a3c"} />
          </div>
        </div>
      )}

      {/* ── Scrollable list ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {lista.length === 0 ? (
          <p className="text-center py-16 text-[13px]" style={{ color: sub }}>
            Nenhum resultado{busca ? ` para "${busca}"` : ""}.
          </p>
        ) : (
          <div className="space-y-2">
            {lista.map(entry => {
              const stage      = STAGE[entry.coluna] ?? { color: "#8E8E93", bg: "rgba(142,142,147,0.1)", label: COLUNAS_KANBAN[entry.coluna] ?? "—" }
              const resultado  = entry.totalPago - entry.totalDespesa
              const margemPct  = entry.precoTotal > 0 ? ((entry.precoTotal - entry.totalDespesa) / entry.precoTotal) * 100 : null
              const rateioFixo = rateioPorPedido(entry.precoTotal, receitaTotal, custoFixoTotal)
              const lucroLiq   = resultado - rateioFixo
              const margemLiqPct = entry.precoTotal > 0 ? (lucroLiq / entry.precoTotal) * 100 : null
              const percPago   = entry.precoTotal > 0 ? Math.min(100, (entry.totalPago / entry.precoTotal) * 100) : 0
              const isOpen     = expanded.has(entry.key)
              const temLanc    = entry.receitas.length > 0 || entry.despesas.length > 0

              const entregaDate = entry.dataEntregaPrevista
              const diasEnt = entregaDate && entry.coluna !== COL_ENTREGUE
                ? Math.round((new Date(entregaDate + "T12:00:00").getTime() - hoje.getTime()) / 86_400_000)
                : null
              const emAtraso  = diasEnt !== null && diasEnt < 0
              const quaseVenc = diasEnt !== null && diasEnt >= 0 && diasEnt <= 3

              return (
                <div key={entry.key}
                  className="rounded-2xl overflow-hidden"
                  style={{ background: cardBg, border: `1px solid ${border}` }}>

                  {/* ── Collapsed row — click anywhere to open ── */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                    onClick={() => toggle(entry.key)}
                  >
                    {/* Stage dot */}
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.color }} />

                    {/* Name + badges */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-semibold leading-snug truncate" style={{ color: txt }}>
                          {entry.nomeCliente}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-[2px] rounded-md tabular-nums"
                          style={{ background: "rgba(80,9,196,0.1)", color: "#8456e8" }}>
                          {entry.numero}
                        </span>
                        {entry.tipo === "lote" && (
                          <span className="text-[9px] font-semibold px-1.5 py-[2px] rounded-md"
                            style={{ background: "rgba(90,200,250,0.15)", color: "#0099cc" }}>
                            Lote
                          </span>
                        )}
                        <span className="text-[9px] font-semibold px-1.5 py-[2px] rounded-md"
                          style={{ background: stage.bg, color: stage.color }}>
                          {stage.label}
                        </span>
                      </div>
                      <p className="text-[10px] mt-0.5 truncate" style={{ color: sub }}>
                        {entry.dataPedido ? fmt(entry.dataPedido) : "Sem data"}{entry.specs ? ` · ${entry.specs}` : ""}{entry.qtdTotal > 0 ? ` · ${num(entry.qtdTotal)} un` : ""}
                      </p>
                    </div>

                    {/* Delivery / price */}
                    <div className="text-right shrink-0 space-y-0.5">
                      <p className="text-[13px] font-bold tabular-nums" style={{ color: txt }}>{brl(entry.precoTotal)}</p>
                      {entry.coluna === COL_ENTREGUE ? (
                        <p className="text-[9.5px] font-semibold" style={{ color: "#30D158" }}>
                          Entregue {entry.dataEntregaReal ? fmt(entry.dataEntregaReal) : ""}
                        </p>
                      ) : entregaDate ? (
                        <p className="text-[9.5px] font-semibold tabular-nums"
                          style={{ color: emAtraso ? "#d33a3c" : quaseVenc ? "#c57800" : sub }}>
                          {emAtraso ? `${Math.abs(diasEnt!)}d atraso` : diasEnt === 0 ? "Hoje" : `${diasEnt}d`}
                        </p>
                      ) : null}
                    </div>

                    {/* Concluir toggle (apenas entregues) */}
                    {entry.coluna === COL_ENTREGUE && (() => {
                      const done = concluidos.has(entry.key)
                      return (
                        <button
                          onClick={e => { e.stopPropagation(); toggleConcluido(entry.key) }}
                          className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-semibold transition-all"
                          style={{
                            background: done ? "rgba(48,209,88,0.12)" : "rgba(116,116,128,0.08)",
                            color: done ? "#30D158" : sub,
                            border: `1px solid ${done ? "rgba(48,209,88,0.25)" : "transparent"}`,
                          }}>
                          {done ? (
                            <>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                              </svg>
                              Concluído
                            </>
                          ) : "Concluir"}
                        </button>
                      )
                    })()}

                    {/* Chevron */}
                    <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      style={{ color: sub }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>

                  {/* ── Expanded content ── */}
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${divider}` }}>

                      {/* KPI strip */}
                      <div className="px-4 pt-3 pb-3">
                        {(() => {
                          const markup  = entry.totalDespesa > 0 ? entry.precoTotal / entry.totalDespesa : null
                          return (
                            <div className="grid grid-cols-3 gap-2">
                              <Kpi label="Valor" value={brl(entry.precoTotal)} color={txt} sub={sub} />
                              <Kpi label="Recebido" value={brl(entry.totalPago)} color="#30D158"
                                sub={`${num(percPago, 0)}% pago`} />
                              <Kpi label="Custos" value={brl(entry.totalDespesa)}
                                color={entry.totalDespesa > 0 ? "#d33a3c" : sub}
                                sub={entry.despesas.filter(l => l.status === "pago" || l.formaPagamento === "conta").length > 0 ? `${entry.despesas.filter(l => l.status === "pago" || l.formaPagamento === "conta").length} lanç.` : "Sem despesas"} />
                              <Kpi
                                label="Margem"
                                value={margemPct != null ? `${num(margemPct, 1)}%` : "—"}
                                color={margemPct == null ? sub : margemPct >= 40 ? "#30D158" : margemPct >= 20 ? "#c57800" : "#d33a3c"}
                                sub={margemPct != null ? (margemPct >= 40 ? "Boa" : margemPct >= 20 ? "Razoável" : "Baixa") : "Sem dados"}
                              />
                              <Kpi
                                label="Markup"
                                value={markup != null ? `${num(markup, 2)}x` : "—"}
                                color={markup == null ? sub : markup >= 2 ? "#30D158" : markup >= 1.5 ? "#c57800" : "#d33a3c"}
                                sub={markup != null ? (markup >= 2 ? "Bom" : markup >= 1.5 ? "Razoável" : "Baixo") : "Sem custos"}
                              />
                              <Kpi
                                label="M. Contrib."
                                value={brl(resultado)}
                                color={resultado > 0 ? "#8456e8" : resultado < 0 ? "#d33a3c" : sub}
                                sub={resultado > 0 ? "Positiva" : resultado < 0 ? "Negativa" : "Zero"}
                              />
                              {custoFixoTotal > 0 && (
                                <Kpi
                                  label="Lucro líquido"
                                  value={margemLiqPct != null ? `${num(margemLiqPct, 1)}%` : "—"}
                                  color={lucroLiq >= 0 ? "#009351" : "#d33a3c"}
                                  sub={brl(lucroLiq)}
                                />
                              )}
                            </div>
                          )
                        })()}

                        {/* Progress bar */}
                        <div className="mt-2.5 w-full h-1 rounded-full overflow-hidden" style={{ background: divider }}>
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${percPago}%`, background: percPago >= 100 ? "#30D158" : percPago >= 50 ? "#8456e8" : "#c57800" }} />
                        </div>

                        {/* Meta row */}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className="text-[10px]" style={{ color: sub }}>Fechado</span>
                          {onSalvarData ? (
                            <input
                              type="date"
                              defaultValue={entry.dataFechamento ?? ""}
                              onClick={e => e.stopPropagation()}
                              onChange={e => {
                                const v = e.target.value
                                if (v) entry.cards.forEach(c => onSalvarData(c.id, v))
                              }}
                              className="text-[10px] border-0 border-b outline-none cursor-pointer"
                              style={{ color: sub, borderColor: divider, background: "transparent" }}
                            />
                          ) : (
                            <span className="text-[10px]" style={{ color: sub }}>{fmtFull(entry.dataFechamento)}</span>
                          )}
                          {entregaDate && (
                            <span className="text-[10px]" style={{ color: emAtraso ? "#d33a3c" : sub }}>
                              Entrega prevista {fmtFull(entregaDate)}
                            </span>
                          )}
                          <div className="flex-1" />
                          {onNovoLancamento && (
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                const card = entry.cards[0]
                                onNovoLancamento({
                                  nomeCliente: card.nomeCliente,
                                  loteId: card.loteId ?? undefined,
                                  loteNumero: card.loteNumero ?? undefined,
                                  cardId: card.loteId ? undefined : card.id,
                                  cardNumero: card.loteId ? undefined : card.numero,
                                })
                              }}
                              className="text-[10.5px] font-semibold px-3 py-1.5 rounded-xl transition-colors"
                              style={{ background: "rgba(60,60,67,0.07)", color: txt }}>
                              + Lançamento
                            </button>
                          )}
                          {onDetalhes && (
                            <button
                              onClick={e => { e.stopPropagation(); onDetalhes(entry.cards[0]) }}
                              className="text-[10.5px] font-semibold px-3 py-1.5 rounded-xl transition-colors"
                              style={{ background: "rgba(80,9,196,0.08)", color: "#8456e8" }}>
                              Ver pedido
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Lote items */}
                      {entry.cards.length > 1 && (
                        <div className="px-4 pt-2 pb-3" style={{ borderTop: `1px solid ${divider}`, background: innerBg }}>
                          <p className="text-[9px] font-bold uppercase tracking-wider mb-2" style={{ color: sub }}>
                            Itens do lote ({entry.cards.length})
                          </p>
                          <div className="space-y-1">
                            {entry.cards.map(card => {
                              const s = STAGE[card.coluna] ?? STAGE[1]
                              return (
                                <div key={card.id} className="flex items-center justify-between text-[11px] py-1">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="truncate" style={{ color: txt }}>{card.numero || card.nomeCliente}</span>
                                    <span className="text-[9px] font-semibold px-1.5 py-[2px] rounded-md shrink-0"
                                      style={{ background: s.bg, color: s.color }}>{s.label}</span>
                                  </div>
                                  <span className="font-semibold tabular-nums shrink-0 ml-3" style={{ color: txt }}>
                                    {brl(card.preco)} · {num(card.quantidade)} un
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Receitas — apenas pagas */}
                      {entry.receitas.filter(l => l.status === "pago").length > 0 && (
                        <div className="px-4 pt-3 pb-2" style={{ borderTop: `1px solid ${divider}`, background: innerBg }}>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#30D158" }}>Entradas</p>
                            <p className="text-[10px] font-semibold tabular-nums" style={{ color: "#30D158" }}>
                              {brl(entry.receitas.filter(l => l.status === "pago").reduce((s, l) => s + l.valor, 0))} recebido
                            </p>
                          </div>
                          <div className="space-y-0.5">
                            {entry.receitas.filter(l => l.status === "pago").map(l => (
                              <div key={l.id} className="flex items-center gap-2.5 py-1.5">
                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#30D158" }} />
                                <span className="flex-1 text-[11.5px] truncate" style={{ color: txt }}>{l.descricao || "Recebimento"}</span>
                                <span className="text-[11.5px] font-bold tabular-nums shrink-0" style={{ color: "#30D158" }}>{brl(l.valor)}</span>
                                {l.dataPagamento && <span className="text-[10px] shrink-0" style={{ color: sub }}>{fmt(l.dataPagamento)}</span>}
                                {l.formaPagamento && <span className="text-[10px] shrink-0" style={{ color: sub }}>{formaPagLabel(l.formaPagamento)}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Despesas — pagas ou na conta do fornecedor */}
                      {entry.despesas.filter(l => l.status === "pago" || l.formaPagamento === "conta").length > 0 && (
                        <div className="px-4 pt-3 pb-4" style={{ borderTop: `1px solid ${divider}`, background: innerBg }}>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#d33a3c" }}>Saídas / Custos</p>
                            <p className="text-[10px] font-semibold tabular-nums" style={{ color: "#d33a3c" }}>
                              {brl(entry.despesas.filter(l => l.status === "pago" || l.formaPagamento === "conta").reduce((s, l) => s + l.valor, 0))} pago
                            </p>
                          </div>
                          <div className="space-y-0.5">
                            {entry.despesas.filter(l => l.status === "pago" || l.formaPagamento === "conta").map(l => (
                              <div key={l.id} className="flex items-center gap-2.5 py-1.5">
                                <CatIcon cat={l.categoria} className="w-3 h-3 shrink-0 text-[#9ca3af]" />
                                <span className="flex-1 text-[11.5px] truncate" style={{ color: txt }}>{l.descricao || "Despesa"}</span>
                                <span className="text-[11.5px] font-bold tabular-nums shrink-0" style={{ color: "#d33a3c" }}>−{brl(l.valor)}</span>
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
                        <p className="px-4 py-3 text-[11.5px]" style={{ color: sub, borderTop: `1px solid ${divider}`, background: innerBg }}>
                          Nenhum lançamento registrado para este pedido.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="rounded-xl p-2.5" style={{ background: "rgba(116,116,128,0.05)", border: "1px solid rgba(116,116,128,0.08)" }}>
      <p className="text-[8.5px] uppercase tracking-wide font-semibold mb-1" style={{ color: "rgba(142,142,147,0.8)" }}>{label}</p>
      <p className="text-[14px] font-bold tabular-nums leading-none" style={{ color }}>{value}</p>
      {sub && <p className="text-[9.5px] mt-0.5" style={{ color: "rgba(142,142,147,0.7)" }}>{sub}</p>}
    </div>
  )
}
