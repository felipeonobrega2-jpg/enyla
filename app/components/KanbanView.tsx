"use client"

import { useState, useRef, useEffect } from "react"
import { Flame, X, ChevronDown } from "lucide-react"
import { KanbanCard, KanbanOpcao, Lote, LancamentoFinanceiro, NegocioParceiro, StatusLoteParceiro, COLUNAS_KANBAN, COL_FECHADO, COL_ENTREGUE, COL_PERDIDO, COL_HOT } from "../types"
import { brl, num } from "../utils"
import { COL_COLORS } from "./kanban-colors"
import { MOTIVOS_PERDA, CategoriaPerda, textoMotivo } from "../lib/coleta"

// HOT é renderizado entre col 0 e col 1, mas usa índice 11 para não deslocar os existentes no DB
const BOARD_ORDER = [0, COL_HOT, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

function colLabel(idx: number): string {
  if (idx === COL_HOT) return "Hot"
  return COLUNAS_KANBAN[idx] ?? `Col ${idx}`
}

const PARTNER_STEPS_K: { id: StatusLoteParceiro; label: string }[] = [
  { id: "aguardando",  label: "Aguardando" },
  { id: "em_producao", label: "Em produção" },
  { id: "pronto",      label: "Pronto" },
  { id: "entregue",    label: "Entregue" },
]

type ModalFechamento = { card: KanbanCard; opcaoIdx: number }

// ── PIX emit modal ────────────────────────────────────────────────────────────
function PixEmitModal({ card, loteTotal, onClose, onAddLancamento }: {
  card: KanbanCard
  loteTotal: number
  onClose: () => void
  onAddLancamento?: (l: LancamentoFinanceiro) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [valor,   setValor]   = useState(loteTotal > 0 ? loteTotal.toFixed(2) : "")
  const [expDate, setExpDate] = useState(today)
  const [expTime, setExpTime] = useState("23:59")
  const [copied,  setCopied]  = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  function dismiss() { setVisible(false); setTimeout(onClose, 180) }

  function emit() {
    const v = parseFloat(valor.replace(",", "."))
    if (!v || !card.loteNumero) return
    const e = `${expDate}T${expTime}`
    const url = `${window.location.origin}/pix/${card.loteNumero}?v=${v}&e=${encodeURIComponent(e)}`

    const lanc: LancamentoFinanceiro = {
      id:             crypto.randomUUID(),
      tipo:           "receita",
      descricao:      `PIX · Lote ${card.loteNumero}`,
      valor:          v,
      dataVencimento: expDate,
      status:         "pendente",
      loteId:         card.loteId ?? undefined,
      loteNumero:     card.loteNumero,
      nomeCliente:    card.nomeCliente,
      categoria:      "pix_link",
      formaPagamento: "pix",
      criadoEm:       new Date().toISOString(),
    }

    fetch("/api/lancamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lanc),
    }).catch(() => {})
    onAddLancamento?.(lanc)

    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => { setCopied(false); dismiss() }, 2200)
    })
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center transition-all duration-180"
      style={{ background: visible ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0)", backdropFilter: visible ? "blur(4px)" : "none" }}
      onClick={e => { if (e.target === e.currentTarget) dismiss() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 overflow-hidden transition-all duration-200 apple-modal-enter"
        style={{ transform: visible ? "scale(1) translateY(0)" : "scale(0.94) translateY(12px)", opacity: visible ? 1 : 0 }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-[14px] text-[#1C1C1E]">Emitir link de pagamento</p>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">
              Lote <span className="font-semibold text-[#8456e8]">{card.loteNumero}</span>
              {" · "}{card.nomeCliente.split(" ")[0]}
            </p>
          </div>
          <button onClick={dismiss}
            className="w-7 h-7 rounded-full bg-[rgba(116,116,128,0.1)] flex items-center justify-center text-[#8E8E93] hover:bg-[rgba(116,116,128,0.18)] transition-colors text-lg leading-none shrink-0">
            ×
          </button>
        </div>

        {/* Fields */}
        <div className="px-5 py-4 space-y-4">

          {/* Valor */}
          <div>
            <label className="text-[9.5px] font-bold uppercase tracking-wide text-[#8E8E93] block mb-1.5">Valor</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] text-[#8E8E93] font-medium pointer-events-none">R$</span>
              <input
                type="number" autoFocus min={0} step={0.01}
                value={valor} onChange={e => setValor(e.target.value)}
                onKeyDown={e => e.key === "Enter" && emit()}
                placeholder="0,00"
                className="w-full pl-9 pr-20 py-2.5 border border-[rgba(0,0,0,0.12)] rounded-xl text-[15px] font-semibold text-[#1C1C1E] ds-num focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] transition-colors"
              />
              {loteTotal > 0 && (
                <button
                  onClick={() => setValor((loteTotal / 2).toFixed(2))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-[#8456e8] bg-[#8456e8]/[0.08] hover:bg-[#8456e8]/[0.14] px-2.5 py-1 rounded-lg transition-colors">
                  Metade
                </button>
              )}
            </div>
            {loteTotal > 0 && (
              <button onClick={() => setValor(loteTotal.toFixed(2))}
                className="mt-1 text-[10px] text-[#8456e8] hover:underline">
                Usar total do lote: {brl(loteTotal)}
              </button>
            )}
          </div>

          {/* Expiração */}
          <div>
            <label className="text-[9.5px] font-bold uppercase tracking-wide text-[#8E8E93] block mb-1.5">Expira em</label>
            <div className="grid grid-cols-[1fr_100px] gap-2">
              <input type="date" value={expDate} onChange={e => setExpDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-[rgba(0,0,0,0.12)] rounded-xl text-[13px] text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] transition-colors"
              />
              <input type="time" value={expTime} onChange={e => setExpTime(e.target.value)}
                className="w-full px-3 py-2.5 border border-[rgba(0,0,0,0.12)] rounded-xl text-[13px] text-[#1C1C1E] ds-num focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={dismiss}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-medium text-[#8E8E93] hover:bg-[#F2F2F7] transition-colors border border-[rgba(0,0,0,0.08)]">
            Cancelar
          </button>
          <button onClick={emit} disabled={!valor || copied}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: copied ? "#34C759" : "#1C1C1E" }}
          >
            {copied ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                Link copiado!
              </span>
            ) : "Gerar e copiar link"}
          </button>
        </div>
      </div>
    </div>
  )
}

export function KanbanView({
  cards,
  onMove,
  onDelete,
  onSetMotivo,
  onFechamento,
  onDetalhes,
  lotes,
  onLoteCreate,
  onLoteAssign,
  onLoteRemove,
  onLoteMerge,
  onLoteRename,
  negocios,
  onUpdateNegocio,
  onAddLancamento,
  onHotOpcao,
  isDark,
  hideDashboard,
  selectedCardIds,
  onSelectCard,
}: {
  cards: KanbanCard[]
  onMove: (id: string, coluna: number) => void
  onDelete: (id: string) => void
  onSetMotivo: (id: string, motivo: string) => void
  onFechamento: (id: string, opcao: KanbanOpcao) => void
  onHotOpcao?: (id: string, opcao: KanbanOpcao) => void
  onDetalhes?: (card: KanbanCard) => void
  lotes?: Lote[]
  onLoteCreate?: (nomeCliente: string) => Promise<{ id: string; numero: string }>
  onLoteAssign?: (cardId: string, loteId: string, loteNumero: string) => void
  onLoteRemove?: (cardId: string) => void
  onLoteMerge?: (sourceLoteId: string, targetLoteId: string, targetLoteNumero: string) => Promise<void>
  onLoteRename?: (loteId: string, newNumero: string) => Promise<{ ok: boolean; error?: string }>
  negocios?: NegocioParceiro[]
  onUpdateNegocio?: (n: NegocioParceiro) => void
  onAddLancamento?: (l: LancamentoFinanceiro) => void
  lancamentos?: LancamentoFinanceiro[]
  isDark?: boolean
  hideDashboard?: boolean
  selectedCardIds?: Set<string>
  onSelectCard?: (cardId: string) => void
}) {
  const [dragId, setDragId]       = useState<string | null>(null)
  const [overCol, setOverCol]     = useState<number | null>(null)
  const [modal, setModal]         = useState<ModalFechamento | null>(null)
  const [colapsarVazias, setColapsarVazias] = useState(!!hideDashboard)

  function tentarMover(id: string, destCol: number) {
    const card = cards.find(c => c.id === id)
    if (!card) return

    // Orçamento (col 0) ou Hot → Fechado com opções de quantidade
    const isPreClose = card.coluna === 0 || card.coluna === COL_HOT
    if (isPreClose && destCol === COL_FECHADO && card.opcoes?.length) {
      const idealIdx = card.opcoes.findIndex(o => o.preco === card.preco) ?? 0
      setModal({ card, opcaoIdx: Math.max(0, idealIdx) })
      return
    }

    onMove(id, destCol)
  }

  function confirmarFechamento() {
    if (!modal) return
    onFechamento(modal.card.id, modal.card.opcoes![modal.opcaoIdx])
    setModal(null)
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    setDragId(id)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("cardId", id)
  }

  function handleDragOver(e: React.DragEvent, col: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setOverCol(col)
  }

  function handleDrop(e: React.DragEvent, col: number) {
    e.preventDefault()
    const id = e.dataTransfer.getData("cardId")
    if (id) tentarMover(id, col)
    setDragId(null)
    setOverCol(null)
  }

  function handleDragEnd() {
    setDragId(null)
    setOverCol(null)
  }

  const total       = cards.length
  const isProducao  = (c: { coluna: number }) => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO && c.coluna !== COL_HOT
  const fechados    = cards.filter(isProducao).length
  const perdidos    = cards.filter(c => c.coluna === COL_PERDIDO).length
  const entregues   = cards.filter(c => c.coluna === COL_ENTREGUE).length
  const emProd      = cards.filter(c => c.coluna >= 5 && c.coluna <= 8).length
  const aguardAprov = cards.filter(c => c.coluna === 3).length
  const decididos   = fechados + perdidos
  const conversao   = decididos > 0 ? (fechados / decididos) * 100 : 0
  const pipeline    = cards.filter(c => isProducao(c) && c.coluna < COL_ENTREGUE).reduce((s, c) => s + c.preco, 0)
  const faturado    = cards.filter(c => c.coluna === COL_ENTREGUE).reduce((s, c) => s + c.preco, 0)
  const ticketMed   = fechados > 0 ? cards.filter(isProducao).reduce((s, c) => s + c.preco, 0) / fechados : 0
  const hotTotal    = cards.filter(c => c.coluna === COL_HOT).reduce((s, c) => s + c.preco, 0)

  void entregues // referenced indirectly via COL_ENTREGUE filter above

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Dashboard ── */}
      {!hideDashboard && <div className={`shrink-0 border-b px-5 pt-4 pb-4 space-y-3 ${isDark ? "bg-[#1C1C1E] border-[rgba(255,255,255,0.08)]" : "bg-white border-[rgba(60,60,67,0.12)]"}`}>
        <div className="flex items-center gap-3">
          <p className="text-[9.5px] uppercase tracking-wide font-semibold text-[#8E8E93]">Visão geral do pipeline</p>
          <div className="flex-1 h-px bg-[rgba(60,60,67,0.12)]" />
          <button
            onClick={() => setColapsarVazias(v => !v)}
            title={colapsarVazias ? "Expandir colunas vazias" : "Colapsar colunas vazias"}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-semibold transition-colors border ${
              colapsarVazias
                ? "bg-[#8456e8]/[0.08] text-[#8456e8] border-[#8456e8]/20"
                : "bg-[rgba(116,116,128,0.06)] text-[#8E8E93] border-[rgba(60,60,67,0.1)] hover:text-[#1C1C1E] hover:border-[rgba(60,60,67,0.2)]"
            }`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              {colapsarVazias
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M9 4H5a1 1 0 00-1 1v4m0 0h16M4 9v10a1 1 0 001 1h4M20 9v10a1 1 0 01-1 1h-4M9 4h6M9 4v16m6-16v16" />
              }
            </svg>
            {colapsarVazias ? "Expandir vazias" : "Ocultar vazias"}
          </button>
          <span className="text-[10px] text-[#8E8E93] ds-num">{total} orçamento{total !== 1 ? "s" : ""}</span>
        </div>
        <div className="grid grid-cols-4 gap-3">

          {/* Orçamentos */}
          <div className={`rounded-xl p-3.5 ${isDark ? "bg-[#2C2C2E] border border-[rgba(255,255,255,0.06)]" : "bg-white border border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]"}`}>
            <p className="text-[9px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-3">Orçamentos</p>
            <div className="flex gap-3">
              <div>
                <p className="text-[24px] font-semibold text-[#1C1C1E] leading-none ds-num">{total}</p>
                <p className="text-[10px] text-[#8E8E93] mt-1">realizados</p>
              </div>
              <div className="border-l border-[rgba(60,60,67,0.12)] pl-3">
                <p className="text-[24px] font-semibold leading-none ds-num" style={{ color: "#34C759" }}>{fechados}</p>
                <p className="text-[10px] text-[#8E8E93] mt-1">fechados</p>
              </div>
              <div className="border-l border-[rgba(60,60,67,0.12)] pl-3">
                <p className="text-[24px] font-semibold leading-none ds-num" style={{ color: "#FF3B30" }}>{perdidos}</p>
                <p className="text-[10px] text-[#8E8E93] mt-1">perdidos</p>
              </div>
            </div>
          </div>

          {/* Conversão */}
          <div className={`rounded-xl p-3.5 ${isDark ? "bg-[#2C2C2E] border border-[rgba(255,255,255,0.06)]" : "bg-white border border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]"}`}>
            <p className="text-[9px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-2">Taxa de conversão</p>
            <p className="text-[24px] font-semibold leading-none ds-num" style={{
              color: conversao >= 60 ? "#34C759" : conversao >= 35 ? "#FF9500" : decididos === 0 ? "#8E8E93" : "#FF3B30"
            }}>
              {decididos === 0 ? "—" : `${num(conversao, 1)}%`}
            </p>
            <div className="w-full h-1 bg-[rgba(116,116,128,0.08)] rounded-full overflow-hidden mt-2.5">
              <div className="h-full rounded-full transition-all duration-500" style={{
                width: `${Math.min(conversao, 100)}%`,
                background: conversao >= 60 ? "#34C759" : conversao >= 35 ? "#FF9500" : "#FF3B30"
              }} />
            </div>
            <p className="text-[10px] text-[#8E8E93] mt-1.5">
              {decididos === 0 ? "Sem resultados ainda" : `${fechados} de ${decididos} com resultado`}
            </p>
          </div>

          {/* Em andamento */}
          <div className={`rounded-xl p-3.5 ${isDark ? "bg-[#2C2C2E] border border-[rgba(255,255,255,0.06)]" : "bg-white border border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]"}`}>
            <p className="text-[9px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-3">Em andamento</p>
            <div className="flex gap-3">
              <div>
                <p className="text-[24px] font-semibold leading-none ds-num" style={{ color: "#FF9500" }}>{emProd}</p>
                <p className="text-[10px] text-[#8E8E93] mt-1">produção</p>
              </div>
              <div className="border-l border-[rgba(60,60,67,0.12)] pl-3">
                <p className="text-[24px] font-semibold leading-none ds-num" style={{ color: "#AF52DE" }}>{aguardAprov}</p>
                <p className="text-[10px] text-[#8E8E93] mt-1">aprovação</p>
              </div>
            </div>
          </div>

          {/* Financeiro */}
          <div className="rounded-xl p-3.5" style={{ background: "#1C1C1E" }}>
            <p className="text-[9px] uppercase tracking-wide font-semibold mb-2.5" style={{ color: "rgba(255,255,255,0.4)" }}>Financeiro</p>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Pipeline</p>
                <p className="text-[13px] font-bold text-white ds-num">{brl(pipeline)}</p>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Faturado</p>
                <p className="text-[13px] font-bold ds-num" style={{ color: "#34C759" }}>{brl(faturado)}</p>
              </div>
              {hotTotal > 0 && (
                <div className="flex items-baseline justify-between gap-2">
                  <p className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#FF6200" }}><Flame className="w-3 h-3" /> Hot</p>
                  <p className="text-[13px] font-bold ds-num" style={{ color: "#FF6200" }}>{brl(hotTotal)}</p>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Ticket médio</p>
                <p className="text-[12px] font-semibold ds-num" style={{ color: "rgba(255,255,255,0.5)" }}>{brl(ticketMed)}</p>
              </div>
            </div>
          </div>

        </div>

        {/* Barra de progresso por coluna */}
        {total > 0 && (
          <div className="space-y-1">
            <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
              {BOARD_ORDER.map((colIdx) => {
                const count = cards.filter(c => c.coluna === colIdx).length
                if (!count) return null
                return (
                  <div key={colIdx} title={`${colLabel(colIdx)}: ${count}`}
                    className={`h-full transition-all ${COL_COLORS[colIdx].dot}`}
                    style={{ width: `${(count / total) * 100}%` }} />
                )
              })}
            </div>
            <div className="flex gap-3 flex-wrap">
              {BOARD_ORDER.map((colIdx) => {
                const count = cards.filter(c => c.coluna === colIdx).length
                if (!count) return null
                return (
                  <span key={colIdx} className="flex items-center gap-1 text-[9px] text-[#8E8E93]">
                    <span className={`w-1.5 h-1.5 rounded-full ${COL_COLORS[colIdx].dot}`} />
                    {colLabel(colIdx)} ({count})
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>}

      {/* Entregas atrasadas */}
      {(() => {
        const hj = new Date().toISOString().slice(0, 10)
        const atrasados = cards.filter(c =>
          c.dataEntregaPrevista && c.dataEntregaPrevista < hj &&
          c.coluna < COL_ENTREGUE && c.coluna !== COL_PERDIDO
        )
        if (atrasados.length === 0 || hideDashboard) return null
        return (
          <div className="shrink-0 px-5 py-2.5 bg-[#FF3B30]/[0.04] border-b border-[#FF3B30]/10 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30]" />
              <span className="text-[10.5px] font-semibold text-[#FF3B30] uppercase tracking-wide">
                {atrasados.length} entrega{atrasados.length > 1 ? "s" : ""} atrasada{atrasados.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {atrasados.map(c => {
                const dias = Math.floor((Date.now() - new Date(c.dataEntregaPrevista! + "T12:00:00").getTime()) / 86_400_000)
                return (
                  <button key={c.id} onClick={() => onDetalhes?.(c)}
                    className="text-[10px] font-medium text-[#FF3B30] bg-white border border-[#FF3B30]/20 rounded-lg px-2 py-1 hover:bg-[#FF3B30]/[0.04] transition-colors">
                    {c.nomeCliente} · {dias}d
                  </button>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 h-full pt-1 pb-4"
          style={{ minWidth: `${BOARD_ORDER.length * 48}px`, paddingLeft: hideDashboard ? "max(24px, calc((100% - 1320px) / 2 + 24px))" : 24, paddingRight: 24 }}>
          {BOARD_ORDER.map((colIdx, renderPos) => {
            const colNome  = colLabel(colIdx)
            const colCards = cards.filter(c => c.coluna === colIdx && c.materialNome !== "Terceirizado")
            const isOver   = overCol === colIdx
            const colors   = COL_COLORS[colIdx]
            const vazia    = colCards.length === 0
            const colapsada = colapsarVazias && vazia
            const prevCol  = renderPos > 0 ? BOARD_ORDER[renderPos - 1] : null
            const nextCol  = renderPos < BOARD_ORDER.length - 1 ? BOARD_ORDER[renderPos + 1] : null

            if (colapsada) {
              return (
                <div
                  key={colIdx}
                  className={`flex flex-col shrink-0 self-start rounded-xl transition-all duration-200 cursor-default ${
                    isOver ? `ring-2 ${colors.border.replace("border-", "ring-")} ${colors.bg}` : "bg-[rgba(116,116,128,0.06)] hover:bg-[rgba(116,116,128,0.1)]"
                  }`}
                  style={{ width: 34, minHeight: isOver ? 260 : 190 }}
                  title={`${colNome}: nenhum pedido. Arraste um cartão para cá.`}
                  onDragOver={e => handleDragOver(e, colIdx)}
                  onDrop={e => handleDrop(e, colIdx)}
                  onDragLeave={() => setOverCol(null)}
                >
                  <div className="flex-1 flex items-center justify-center py-3 overflow-hidden">
                    <span
                      className="text-[11px] font-medium text-[#898892] select-none whitespace-nowrap"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: "0.04em" }}
                    >
                      {colNome}
                    </span>
                  </div>
                  {isOver && (
                    <div className={`mx-1 mb-1 border-2 border-dashed rounded-lg h-8 flex items-center justify-center ${colors.border}`} />
                  )}
                </div>
              )
            }

            return (
              <div
                key={colIdx}
                className={`flex flex-col w-[272px] shrink-0 rounded-xl transition-all duration-200 ds-entrada ${
                  isOver ? `ring-2 ${colors.border.replace("border-", "ring-")} ${colors.bg}` : "bg-[rgba(116,116,128,0.06)]"
                }`}
                onDragOver={e => handleDragOver(e, colIdx)}
                onDrop={e => handleDrop(e, colIdx)}
                onDragLeave={() => setOverCol(null)}
              >
                {/* Cabeçalho da coluna */}
                <div className="flex items-center gap-2 px-3.5 pt-3 pb-2 shrink-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                  <p className="text-[12.5px] font-semibold flex-1 leading-tight text-[#191625]">{colNome}</p>
                  <span className="text-[11px] font-semibold text-[#898892] ds-num">{colCards.length}</span>
                </div>
                {colCards.length > 0 && (
                  <p className="px-3.5 -mt-1 pb-2 text-[11px] text-[#898892] ds-num">{brl(colCards.reduce((s, c) => s + c.preco, 0))}</p>
                )}

                {/* Cards */}
                <div className="flex-1 overflow-y-auto px-2 pb-2.5 pt-0.5 space-y-2 min-h-[60px] ds-escalonado">
                  {colCards.length === 0 && (
                    <div className={`border border-dashed rounded-lg h-14 flex items-center justify-center transition-colors ${
                      isOver ? colors.border : "border-[rgba(60,60,67,0.14)]"
                    }`}>
                      <p className="text-[11px] text-[#898892] select-none">Solte um pedido aqui</p>
                    </div>
                  )}
                  {colCards.map(card => (
                    <KanbanCardItem
                      key={card.id}
                      card={card}
                      colIdx={colIdx}
                      prevCol={prevCol}
                      nextCol={nextCol}
                      isDragging={dragId === card.id}
                      colors={colors}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDelete={onDelete}
                      onMove={tentarMover}
                      onSetMotivo={onSetMotivo}
                      onDetalhes={onDetalhes}
                      lotes={lotes}
                      onLoteCreate={onLoteCreate}
                      onLoteAssign={onLoteAssign}
                      onLoteRemove={onLoteRemove}
                      onLoteMerge={onLoteMerge}
                      onLoteRename={onLoteRename}
                      negocios={negocios}
                      onUpdateNegocio={onUpdateNegocio}
                      allCards={cards}
                      onAddLancamento={onAddLancamento}
                      isDark={isDark}
                      isSelected={selectedCardIds?.has(card.id)}
                      onSelectCard={onSelectCard}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Modal de fechamento ───────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(25,22,37,0.38)] backdrop-blur-[6px] apple-backdrop-enter"
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] w-full max-w-sm mx-4 overflow-hidden apple-modal-enter">

            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.12)]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-1">Fechar pedido</p>
                  <p className="font-bold text-[#1C1C1E] text-[15px] leading-snug truncate">{modal.card.nomeCliente}</p>
                  {modal.card.numero && (
                    <span className="text-[10px] font-bold text-[#8456e8] bg-[#8456e8]/10 border border-[#8456e8]/20 px-1.5 py-0.5 rounded-full mt-1.5 inline-block ds-num">
                      {modal.card.numero}
                    </span>
                  )}
                </div>
                <button onClick={() => setModal(null)}
                  className="text-[#8E8E93] hover:text-[#1C1C1E] transition-colors text-xl leading-none mt-0.5 shrink-0">×</button>
              </div>
              <p className="text-[12px] text-[#8E8E93] mt-2.5">Qual quantidade foi fechada?</p>
            </div>

            {/* Opções */}
            <div className="px-4 py-3 space-y-1.5 max-h-72 overflow-y-auto">
              {modal.card.opcoes!.map((op, i) => {
                const selected = i === modal.opcaoIdx
                return (
                  <button key={i} onClick={() => setModal(m => m ? { ...m, opcaoIdx: i } : m)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                      selected
                        ? "border-[#8456e8] bg-[#8456e8]/5"
                        : "border-[rgba(0,0,0,0.12)] hover:border-[rgba(0,0,0,0.18)] hover:bg-[rgba(0,0,0,0.04)]"
                    }`}>
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                      selected ? "border-[#8456e8]" : "border-[rgba(60,60,67,0.36)]"
                    }`}>
                      {selected && <div className="w-2 h-2 rounded-full bg-[#8456e8]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-sm leading-none ${selected ? "text-[#8456e8]" : "text-[#1C1C1E]"}`}>
                        {num(op.quantidade)} unidades
                      </p>
                      <p className="text-[11px] text-[#8E8E93] mt-0.5">{brl(op.unitario)}/un</p>
                    </div>
                    <p className={`font-semibold text-[15px] ds-num shrink-0 ${selected ? "text-[#8456e8]" : "text-[#1C1C1E]"}`}>
                      {brl(op.preco)}
                    </p>
                  </button>
                )
              })}
            </div>

            {/* Ações */}
            <div className="flex gap-2 px-4 pb-4 pt-2 border-t border-[rgba(60,60,67,0.12)]">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 text-[13px] text-[#8E8E93] hover:text-[#1C1C1E] hover:bg-[rgba(0,0,0,0.04)] rounded-xl transition-colors font-medium">
                Cancelar
              </button>
              <button onClick={confirmarFechamento}
                className="flex-1 py-2.5 text-[13px] font-bold text-white bg-[#8456e8] hover:bg-[#7445d4] active:bg-[#6234bc] rounded-xl transition-colors">
                Confirmar →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const STAGE: Record<number, { color: string; bg: string; label: string }> = {
  0:  { color: "#8E8E93", bg: "rgba(142,142,147,0.1)",   label: "Orçamento" },
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

function fmt(iso?: string) {
  if (!iso) return "—"
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function KanbanCardItem({
  card, colIdx, prevCol, nextCol, isDragging, colors, onDragStart, onDragEnd, onDelete, onMove, onSetMotivo, onDetalhes,
  lotes, onLoteCreate, onLoteAssign, onLoteRemove, onLoteMerge, onLoteRename, negocios, onUpdateNegocio, allCards,
  onAddLancamento, isDark, isSelected, onSelectCard,
}: {
  card: KanbanCard
  colIdx: number
  prevCol: number | null
  nextCol: number | null
  isDragging: boolean
  colors: typeof COL_COLORS[0]
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  onDelete: (id: string) => void
  onMove: (id: string, col: number) => void
  onSetMotivo: (id: string, motivo: string) => void
  onDetalhes?: (card: KanbanCard) => void
  lotes?: Lote[]
  onLoteCreate?: (nomeCliente: string) => Promise<{ id: string; numero: string }>
  onLoteAssign?: (cardId: string, loteId: string, loteNumero: string) => void
  onLoteRemove?: (cardId: string) => void
  onLoteMerge?: (sourceLoteId: string, targetLoteId: string, targetLoteNumero: string) => Promise<void>
  onLoteRename?: (loteId: string, newNumero: string) => Promise<{ ok: boolean; error?: string }>
  negocios?: NegocioParceiro[]
  onUpdateNegocio?: (n: NegocioParceiro) => void
  allCards?: KanbanCard[]
  onAddLancamento?: (l: LancamentoFinanceiro) => void
  isDark?: boolean
  isSelected?: boolean
  onSelectCard?: (cardId: string) => void
}) {
  const isPerdido = colIdx === COL_PERDIDO
  const [isOpen,        setIsOpen]        = useState(false)
  const [confirmando,   setConfirmando]   = useState(false)
  const [motivoRascunho, setMotivoRascunho] = useState("")
  const [motivoCat, setMotivoCat] = useState<CategoriaPerda | null>(null)
  const [copiedId,       setCopiedId]       = useState(false)
  const [copiedLoteLink, setCopiedLoteLink] = useState<"track" | null>(null)
  const [showLotePanel,  setShowLotePanel]  = useState(false)
  const [showPixModal,   setShowPixModal]   = useState(false)

  const [criandoLote, setCriandoLote] = useState(false)
  const [merging, setMerging] = useState(false)
  const [editingLote, setEditingLote] = useState(false)
  const [loteNumeroEdit, setLoteNumeroEdit] = useState("")
  const [loteRenameError, setLoteRenameError] = useState("")
  const [savingRename, setSavingRename] = useState(false)
  const [showAddNegocio, setShowAddNegocio] = useState(false)
  const motivoRef = useRef<HTMLInputElement>(null)

  const clientLotes = (lotes ?? []).filter(l =>
    l.nomeCliente.toLowerCase() === card.nomeCliente.toLowerCase() && l.id !== card.loteId
  )

  // Total do lote = soma de todos os cards do mesmo lote (inclusive terceirizados)
  const loteTotal = card.loteId
    ? (allCards ?? []).filter(c => c.loteId === card.loteId).reduce((s, c) => s + c.preco, 0)
    : card.preco

  async function handleCriarLote() {
    if (!onLoteCreate || !onLoteAssign) return
    setCriandoLote(true)
    try {
      const lote = await onLoteCreate(card.nomeCliente)
      onLoteAssign(card.id, lote.id, lote.numero)
      setShowLotePanel(false)
    } finally {
      setCriandoLote(false)
    }
  }

  function handleAssignLote(loteId: string, loteNumero: string) {
    onLoteAssign?.(card.id, loteId, loteNumero)
    setShowLotePanel(false)
  }

  function handleRemoveLote() {
    onLoteRemove?.(card.id)
    setShowLotePanel(false)
  }

  async function handleMerge(targetLoteId: string, targetLoteNumero: string) {
    if (!card.loteId || !onLoteMerge) return
    setMerging(true)
    try {
      await onLoteMerge(card.loteId, targetLoteId, targetLoteNumero)
      setShowLotePanel(false)
    } finally {
      setMerging(false)
    }
  }

  async function handleRenomear() {
    if (!card.loteId || !onLoteRename || !loteNumeroEdit.trim()) return
    setSavingRename(true)
    setLoteRenameError("")
    try {
      const res = await onLoteRename(card.loteId, loteNumeroEdit.trim().toUpperCase())
      if (res.error === "duplicado") setLoteRenameError("Este número já existe")
      else if (res.ok) setEditingLote(false)
    } finally {
      setSavingRename(false)
    }
  }

  function iniciarPerda() {
    setConfirmando(true)
    setMotivoRascunho("")
    setMotivoCat(null)
  }

  function confirmarPerda() {
    if (!motivoCat) return
    if (card.coluna !== COL_PERDIDO) onMove(card.id, COL_PERDIDO)
    onSetMotivo(card.id, textoMotivo(motivoCat, motivoRascunho))
    setConfirmando(false)
  }

  // Delivery
  const entregaDate = card.dataEntregaPrevista
  const diasEnt = entregaDate && !isPerdido && colIdx < COL_ENTREGUE
    ? Math.round((new Date(entregaDate + "T12:00:00").getTime() - Date.now()) / 86_400_000)
    : null
  const emAtraso  = diasEnt !== null && diasEnt < 0
  const quaseVenc = diasEnt !== null && diasEnt >= 0 && diasEnt <= 3
  const cardBg  = isDark ? "#2C2C2E" : "#fff"
  const border  = isPerdido ? "rgba(255,59,48,0.2)" : isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"
  const txt     = isDark ? "rgba(255,255,255,0.85)" : "#1C1C1E"
  const sub     = isDark ? "rgba(255,255,255,0.4)"  : "rgba(60,60,67,0.5)"
  const divider = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"

  return (
    <>
    <div
      draggable={!confirmando}
      onDragStart={e => !confirmando && onDragStart(e, card.id)}
      onDragEnd={onDragEnd}
      className={`rounded-xl overflow-hidden transition-all duration-200 select-none ${
        isDragging ? "opacity-30 scale-95" : "shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_18px_rgba(25,22,37,0.08)]"
      }`}
      style={{ background: isSelected ? "rgba(132,86,232,0.08)" : cardBg, border: `1px solid ${isSelected ? "#8456e8" : border}` }}
    >
      {/* ── Resumo do cartão ── */}
      <div className="group/card px-3.5 pt-3 pb-3 cursor-pointer" onClick={e => {
        if (e.metaKey || e.ctrlKey) { e.preventDefault(); onSelectCard?.(card.id) }
        else onDetalhes?.(card)
      }}>
        <div className="flex items-start gap-2">
          <p className={`flex-1 min-w-0 text-[13px] font-semibold leading-snug truncate ${isPerdido ? "line-through" : ""}`}
            style={{ color: isPerdido ? "rgba(211,58,60,0.75)" : txt }}>
            {card.nomeCliente}
          </p>
          <p className={`text-[13px] font-semibold ds-num shrink-0 ${isPerdido ? "line-through" : ""}`}
            style={{ color: isPerdido ? "rgba(211,58,60,0.6)" : txt }}>{brl(card.preco)}</p>
        </div>
        <p className="text-[11px] mt-1 truncate ds-num" style={{ color: sub }}>
          {card.loteNumero ?? card.numero}{card.loteNumero && card.numero ? ` · ${card.numero}` : ""}
          {card.quantidade > 0 ? ` · ${num(card.quantidade)} un` : ""}
          {card.dimensoes && !/^0[×x]0/.test(card.dimensoes) ? ` · ${card.dimensoes} cm` : ""}
        </p>
        <div className="flex items-center gap-1.5 mt-2.5 min-h-[20px]">
          {colIdx === COL_ENTREGUE ? (
            <span className="inline-flex items-center h-5 px-2 rounded-full whitespace-nowrap text-[10.5px] font-semibold bg-[#009351]/10 text-[#009351]">
              {card.dataEntregaReal ? `Entregue ${fmt(card.dataEntregaReal)}` : "Entregue"}
            </span>
          ) : isPerdido ? (
            <span className="inline-flex items-center h-5 px-2 rounded-full whitespace-nowrap text-[10.5px] font-semibold bg-[#d33a3c]/10 text-[#d33a3c] truncate max-w-[180px]">
              {card.motivoPerdido || "Perdido"}
            </span>
          ) : diasEnt !== null ? (
            <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-semibold ${
              emAtraso ? "bg-[#d33a3c]/10 text-[#d33a3c]" : quaseVenc ? "bg-[#c57800]/10 text-[#c57800]" : "bg-[rgba(116,116,128,0.1)] text-[#5e5c68]"}`}>
              {emAtraso ? `${Math.abs(diasEnt)} ${Math.abs(diasEnt) === 1 ? "dia" : "dias"} de atraso` : diasEnt === 0 ? "Entrega hoje" : diasEnt === 1 ? "Entrega amanhã" : `Entrega ${fmt(entregaDate)}`}
            </span>
          ) : colIdx >= 1 && colIdx < COL_ENTREGUE ? (
            <span className="inline-flex items-center h-5 px-2 rounded-full whitespace-nowrap text-[10.5px] font-medium bg-[rgba(116,116,128,0.08)] text-[#898892]">Sem prazo</span>
          ) : (
            <span className="text-[10.5px]" style={{ color: sub }}>{card.data.split(",")[0]}</span>
          )}
          {(() => {
            const p = card.projecaoCustos
            if (!p || isPerdido) return null
            const tot = (p.papel ?? 0) + (p.impressao ?? 0) + (p.corte ?? 0) + (p.verniz ?? 0) +
              (p.colagem ?? 0) + (p.arte ?? 0) + (p.faca ?? 0) + (p.hotstamping ?? 0) + (p.corteVinco ?? 0) + (p.outros ?? 0)
            if (tot <= 0) return null
            const mg = card.preco > 0 ? ((card.preco - tot) / card.preco) * 100 : 0
            const cor = mg >= 45 ? "#009351" : mg >= 30 ? "#c57800" : "#d33a3c"
            return (
              <span className="inline-flex items-center h-5 px-2 rounded-full whitespace-nowrap text-[10.5px] font-semibold" style={{ background: `${cor}14`, color: cor }}
                title="Margem prevista no orçamento">
                margem {num(mg, 0)}%
              </span>
            )
          })()}
          <div className="flex-1" />
          <button onClick={e => { e.stopPropagation(); if (confirm(`Remover "${card.nomeCliente}" do quadro?`)) onDelete(card.id) }}
            title="Remover do quadro"
            className="w-6 h-6 flex items-center justify-center rounded-md text-[#c7c7cc] hover:text-[#d33a3c] hover:bg-[#d33a3c]/[0.06] transition-all opacity-0 group-hover/card:opacity-100 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
          <button onClick={e => { e.stopPropagation(); setIsOpen(v => !v) }} title="Ações"
            className={`w-6 h-6 flex items-center justify-center rounded-md hover:bg-[rgba(116,116,128,0.1)] transition-all shrink-0 ${isOpen ? "opacity-100" : "opacity-0 group-hover/card:opacity-100"}`}>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} style={{ color: sub }} />
          </button>
        </div>
      </div>

      {isOpen && (
      <div className="apple-slide-up pt-2" style={{ borderTop: `1px solid ${divider}` }}>

          {/* ── Action bar ── */}
        {!isPerdido && !confirmando && (
          <div className="flex items-center gap-0.5 px-2.5 pb-2.5 pt-0" onClick={e => e.stopPropagation()}>

            <button disabled={prevCol === null} onClick={() => prevCol !== null && onMove(card.id, prevCol)}
              className="w-7 h-7 flex items-center justify-center text-[11px] text-[rgba(60,60,67,0.36)] hover:text-[#1C1C1E] hover:bg-[rgba(0,0,0,0.04)] rounded-lg disabled:opacity-0 transition-all">
              ←
            </button>

            <button title="Copiar link de rastreamento"
              onClick={e => {
                e.stopPropagation()
                const url = card.loteNumero
                  ? `${window.location.origin}/track/lote/${encodeURIComponent(card.loteNumero)}`
                  : `${window.location.origin}/track/${encodeURIComponent(card.numero)}`
                navigator.clipboard.writeText(url).then(() => {
                  setCopiedId(true); setTimeout(() => setCopiedId(false), 2000)
                })
              }}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                copiedId ? "bg-[#34C759]/10" : "text-[rgba(60,60,67,0.36)] hover:text-[#8456e8] hover:bg-[#8456e8]/5"
              }`}
              style={copiedId ? { color: "#34C759" } : {}}>
              {copiedId
                ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
              }
            </button>

            <button title={card.loteNumero ? `Lote ${card.loteNumero}` : "Agrupar em lote"}
              onClick={e => { e.stopPropagation(); setShowLotePanel(v => !v) }}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                showLotePanel
                  ? "text-[#8456e8] bg-[#8456e8]/10"
                  : card.loteNumero
                    ? "text-[#8456e8] bg-[#8456e8]/5 hover:bg-[#8456e8]/10"
                    : "text-[rgba(60,60,67,0.36)] hover:text-[#8456e8] hover:bg-[#8456e8]/5"
              }`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z" />
              </svg>
            </button>

            <div className="flex-1" />

            {colIdx !== COL_ENTREGUE && colIdx !== COL_PERDIDO && (
              <button onClick={iniciarPerda} title="Marcar como perdido"
                className="w-7 h-7 flex items-center justify-center text-[11px] text-[rgba(60,60,67,0.36)] hover:text-[#FF3B30] hover:bg-[#FF3B30]/5 rounded-lg transition-all">
                ✕
              </button>
            )}
            {colIdx !== COL_ENTREGUE && colIdx !== COL_PERDIDO && nextCol !== null && (
              <button onClick={() => onMove(card.id, nextCol)}
                className="h-7 px-3 text-[10px] font-bold text-[#1C1C1E] bg-[rgba(116,116,128,0.08)] hover:bg-[rgba(116,116,128,0.14)] active:scale-95 rounded-lg transition-all ml-0.5">
                →
              </button>
            )}
          </div>
        )}

        {/* ── Lote panel ── */}
        {showLotePanel && !isPerdido && (
          <div className="border-t border-[rgba(60,60,67,0.12)]" onClick={e => e.stopPropagation()}>
            {card.loteNumero ? (

              /* ─ Has lote ─ */
              <div className="bg-[rgba(116,116,128,0.04)] rounded-b-2xl px-3 py-3 space-y-3">

                {/* Lote number — click to rename */}
                <div className="flex items-center justify-between gap-2">
                  {editingLote ? (
                    <div className="flex-1 flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={loteNumeroEdit}
                        onChange={e => { setLoteNumeroEdit(e.target.value.toUpperCase()); setLoteRenameError("") }}
                        onKeyDown={e => { if (e.key === "Enter") handleRenomear(); if (e.key === "Escape") { setEditingLote(false); setLoteRenameError("") } }}
                        className="flex-1 font-semibold text-[15px] text-[#8456e8] bg-white border-2 border-[#8456e8] rounded-xl px-2.5 py-1 focus:outline-none min-w-0 tracking-wide"
                      />
                      <button onClick={handleRenomear} disabled={savingRename}
                        className="w-8 h-8 flex items-center justify-center text-white bg-[#8456e8] hover:bg-[#7445d4] disabled:opacity-50 rounded-xl transition-colors shrink-0">
                        {savingRename
                          ? <span className="text-[10px]">…</span>
                          : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        }
                      </button>
                      <button onClick={() => { setEditingLote(false); setLoteRenameError("") }}
                        className="w-8 h-8 flex items-center justify-center text-[#8E8E93] hover:text-[#1C1C1E] hover:bg-[rgba(0,0,0,0.04)] rounded-xl transition-colors shrink-0 text-[14px]">
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setLoteNumeroEdit(card.loteNumero ?? ""); setLoteRenameError(""); setEditingLote(true) }}
                      title="Clique para renomear"
                      className="font-semibold text-[17px] text-[#8456e8] tracking-wide hover:text-[#7445d4] transition-colors cursor-text -mx-0.5 px-0.5 rounded-lg"
                    >
                      {card.loteNumero}
                    </button>
                  )}

                  {!editingLote && (
                    <button onClick={handleRemoveLote} title="Desvincular lote"
                      className="w-8 h-8 flex items-center justify-center text-[rgba(60,60,67,0.36)] hover:text-[#FF3B30] hover:bg-[#FF3B30]/5 rounded-xl transition-colors shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                    </button>
                  )}
                </div>
                {loteRenameError && <p className="text-[9px] text-rose-500 -mt-2">{loteRenameError}</p>}

                {/* Quick links */}
                {!editingLote && (
                  <div className="space-y-1.5">

                    {/* Rastreamento */}
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/track/lote/${encodeURIComponent(card.loteNumero!)}`
                        navigator.clipboard.writeText(url).then(() => {
                          setCopiedLoteLink("track"); setTimeout(() => setCopiedLoteLink(null), 2000)
                        })
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10.5px] font-semibold transition-all"
                      style={copiedLoteLink === "track"
                        ? { background: "rgba(52,199,89,0.12)", color: "#34C759" }
                        : { background: "rgba(80,9,196,0.08)", color: "#8456e8" }}
                    >
                      {copiedLoteLink === "track" ? (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      ) : (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
                      )}
                      {copiedLoteLink === "track" ? "Copiado!" : "Copiar link rastreamento"}
                    </button>

                    {/* Emitir link de pagamento */}
                    <button
                      onClick={() => setShowPixModal(true)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10.5px] font-semibold transition-all"
                      style={{ background: "rgba(52,199,89,0.1)", color: "#34C759" }}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125H18M15 10.5H9" />
                      </svg>
                      Emitir link de pagamento
                    </button>
                  </div>
                )}

                {/* Partner products */}
                {!editingLote && (() => {
                  const vinculados = (negocios ?? []).filter(n => n.loteId === card.loteId)
                  const disponiveis = (negocios ?? []).filter(n => !n.loteId)
                  return (
                    <div className="space-y-2">
                      {vinculados.map(n => {
                        const curIdx = PARTNER_STEPS_K.findIndex(s => s.id === (n.statusLote ?? "aguardando"))
                        return (
                          <div key={n.id} className="bg-white rounded-xl border border-[rgba(0,0,0,0.06)] px-3 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                            <div className="flex items-start justify-between gap-1.5 mb-2">
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold text-[#1C1C1E] leading-snug truncate">{n.descricao}</p>
                                <p className="text-[9px] text-[#8E8E93] mt-0.5">via {n.parceiroNome}</p>
                              </div>
                              <button onClick={() => onUpdateNegocio?.({ ...n, loteId: undefined, loteNumero: undefined, statusLote: undefined })}
                                className="w-5 h-5 flex items-center justify-center rounded-lg text-[rgba(60,60,67,0.36)] hover:text-[#FF3B30] hover:bg-[#FF3B30]/5 transition-colors shrink-0 text-[12px] mt-0.5">
                                ×
                              </button>
                            </div>
                            {/* Thin progress bar — each segment clickable */}
                            <div className="flex gap-0.5">
                              {PARTNER_STEPS_K.map((step, i) => (
                                <button key={step.id} title={step.label}
                                  onClick={() => onUpdateNegocio?.({ ...n, statusLote: step.id })}
                                  className={`flex-1 h-1.5 rounded-full transition-all hover:opacity-80 ${
                                    i <= curIdx ? "bg-[#FF9500]" : "bg-[rgba(116,116,128,0.08)] hover:bg-[#FF9500]/20"
                                  }`}
                                />
                              ))}
                            </div>
                            <p className="text-[8.5px] font-medium mt-1.5" style={{ color: "#FF9500" }}>
                              {PARTNER_STEPS_K[curIdx]?.label ?? "Aguardando"}
                            </p>
                          </div>
                        )
                      })}

                      {showAddNegocio ? (
                        <div className="space-y-1">
                          {disponiveis.length > 0 ? (
                            <div className="space-y-0.5 max-h-28 overflow-y-auto">
                              {disponiveis.map(n => (
                                <button key={n.id}
                                  onClick={() => { onUpdateNegocio?.({ ...n, loteId: card.loteId, loteNumero: card.loteNumero, statusLote: "aguardando" }); setShowAddNegocio(false) }}
                                  className="w-full flex items-center gap-2 py-2 px-2.5 rounded-xl bg-white hover:bg-[rgba(0,0,0,0.04)] border border-transparent hover:border-[rgba(0,0,0,0.06)] transition-all text-left">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10.5px] font-semibold text-[#1C1C1E] truncate">{n.descricao}</p>
                                    <p className="text-[9px] text-[#8E8E93]">via {n.parceiroNome}</p>
                                  </div>
                                  <svg className="w-3.5 h-3.5 shrink-0" style={{ color: "#FF9500" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-[#8E8E93] text-center py-2.5">Nenhum produto disponível</p>
                          )}
                          <button onClick={() => setShowAddNegocio(false)}
                            className="w-full py-1.5 text-[10px] text-[#8E8E93] hover:text-[rgba(60,60,67,0.6)] transition-colors">
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setShowAddNegocio(true)}
                          className="w-full py-2 text-[10.5px] font-semibold border border-[rgba(0,0,0,0.12)] rounded-xl hover:bg-[rgba(0,0,0,0.04)] transition-colors flex items-center justify-center gap-1.5"
                          style={{ color: "#FF9500" }}>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                          Produto de parceiro
                        </button>
                      )}
                    </div>
                  )
                })()}

                {/* Terceirizados vinculados ao lote */}
                {!editingLote && (() => {
                  const tercs = (allCards ?? []).filter(c => c.loteId === card.loteId && c.materialNome === "Terceirizado")
                  if (tercs.length === 0) return null
                  return (
                    <div className="space-y-1.5">
                      <p className="text-[8.5px] uppercase tracking-wide font-semibold" style={{ color: "#FF9500" }}>
                        Terceirizados ({tercs.length})
                      </p>
                      {tercs.map(t => (
                        <button key={t.id} onClick={() => onDetalhes?.(t)}
                          className="w-full bg-white rounded-xl border px-3 py-2.5 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:bg-[#FF9500]/5 transition-colors"
                          style={{ borderColor: "rgba(255,149,0,0.20)" }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold leading-snug truncate" style={{ color: "#1C1C1E" }}>
                                {t.dimensoes || t.numero}
                              </p>
                              {t.fornecedor && (
                                <p className="text-[9px] mt-0.5" style={{ color: "#FF9500" }}>
                                  via {t.fornecedor}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[11px] font-bold ds-num" style={{ color: "#1C1C1E" }}>
                                {brl(t.preco)}
                              </p>
                              {t.quantidade > 0 && (
                                <p className="text-[9px]" style={{ color: "#8E8E93" }}>{num(t.quantidade)} un</p>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                })()}

                {/* Merge section */}
                {clientLotes.length > 0 && !editingLote && (
                  <div>
                    <p className="text-[8.5px] uppercase tracking-wide text-[rgba(60,60,67,0.36)] font-semibold mb-1.5">Mesclar com</p>
                    <div className="space-y-0.5">
                      {clientLotes.map(l => (
                        <button key={l.id} onClick={() => handleMerge(l.id, l.numero)} disabled={merging}
                          className="w-full flex items-center gap-2 py-2 px-2.5 rounded-xl bg-white hover:bg-[#8456e8]/5 border border-transparent hover:border-[#8456e8]/20 disabled:opacity-50 transition-all text-left">
                          <span className="font-bold text-[10px] text-[#8456e8]">{l.numero}</span>
                          <span className="text-[9.5px] text-[#8E8E93] flex-1 truncate">{l.nomeCliente}</span>
                          {merging
                            ? <span className="text-[9px] text-[rgba(60,60,67,0.3)]">…</span>
                            : <svg className="w-3 h-3 text-[rgba(60,60,67,0.3)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                          }
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            ) : (

              /* ─ No lote — create/assign ─ */
              <div className="bg-[rgba(116,116,128,0.04)] rounded-b-2xl px-3 pt-3 pb-3 space-y-1.5">
                <p className="text-[10px] font-semibold text-[#8E8E93] mb-2">Agrupar em lote</p>
                {clientLotes.length > 0 && (
                  <div className="space-y-0.5">
                    {clientLotes.map(l => (
                      <button key={l.id} onClick={() => handleAssignLote(l.id, l.numero)}
                        className="w-full flex items-center gap-2 py-2 px-2.5 rounded-xl bg-white hover:bg-[#8456e8]/5 border border-transparent hover:border-[#8456e8]/20 transition-all text-left">
                        <span className="font-bold text-[10px] text-[#8456e8]">{l.numero}</span>
                        <span className="text-[9.5px] text-[#8E8E93] flex-1 truncate">{l.nomeCliente}</span>
                        <svg className="w-3 h-3 text-[rgba(60,60,67,0.36)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={handleCriarLote} disabled={criandoLote}
                  className="w-full py-2 text-[10.5px] font-semibold text-white bg-[#8456e8] hover:bg-[#7445d4] disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                  {criandoLote
                    ? <><span className="text-[9px]">●</span> Criando…</>
                    : <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg> Criar novo lote</>
                  }
                </button>
                <button onClick={() => setShowLotePanel(false)}
                  className="w-full py-1.5 text-[10px] text-[#8E8E93] hover:text-[#1C1C1E] transition-colors">
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Loss confirmation ── */}
        {confirmando && (
          <div className="border-t border-[#FF3B30]/20 px-3 pb-3 pt-2.5 space-y-2" onClick={e => e.stopPropagation()}>
            <p className="text-[10.5px] font-semibold" style={{ color: "#FF3B30" }}>Por que perdeu?</p>
            <div className="flex flex-wrap gap-1">
              {MOTIVOS_PERDA.map(m => (
                <button key={m.id} type="button" title={m.dica}
                  onClick={() => { setMotivoCat(m.id); setTimeout(() => motivoRef.current?.focus(), 30) }}
                  className="px-2 py-1 rounded-lg text-[10px] font-medium transition-colors"
                  style={motivoCat === m.id ? { background: "#FF3B30", color: "#fff" } : { background: "rgba(116,116,128,0.1)", color: "#3a3a44" }}>
                  {m.rotulo}
                </button>
              ))}
            </div>
            <input
              ref={motivoRef}
              type="text"
              value={motivoRascunho}
              onChange={e => setMotivoRascunho(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") confirmarPerda(); if (e.key === "Escape") setConfirmando(false) }}
              placeholder="Detalhe (opcional)…"
              className="w-full text-[10px] text-[#1C1C1E] bg-white border border-[rgba(0,0,0,0.12)] rounded-xl px-2.5 py-1.5 placeholder:text-[rgba(60,60,67,0.36)] focus:outline-none focus:ring-2 focus:ring-[#8456e8]/25 focus:border-[#8456e8] cursor-text select-text"
            />
            <div className="flex gap-1.5">
              <button onClick={() => setConfirmando(false)}
                className="flex-1 py-2 text-[10px] font-medium text-[#8E8E93] hover:bg-[rgba(0,0,0,0.04)] rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={confirmarPerda} disabled={!motivoCat}
                className="flex-1 py-2 text-[10px] font-bold text-white rounded-xl transition-colors disabled:opacity-40"
                style={{ background: "#FF3B30" }}>
                Confirmar
              </button>
            </div>
          </div>
        )}

        {/* ── Reopen lost ── */}
        {isPerdido && !confirmando && (
          <div className="border-t border-[#FF3B30]/20 px-2.5 pb-2.5 pt-0" onClick={e => e.stopPropagation()}>
            {!card.motivoPerdido && (
              <button onClick={iniciarPerda}
                className="w-full py-2 text-[10px] font-semibold rounded-xl transition-colors hover:bg-[#FF3B30]/5"
                style={{ color: "#FF3B30" }}>
                Por que perdeu?
              </button>
            )}
            <button onClick={() => onMove(card.id, 0)}
              className="w-full py-2 text-[10px] font-medium rounded-xl transition-colors hover:bg-[#FF3B30]/5"
              style={{ color: "#FF3B30" }}>
              ↺ Reabrir orçamento
            </button>
          </div>
        )}
      </div>
    )}
    </div>

    {showPixModal && card.loteNumero && (
      <PixEmitModal card={card} loteTotal={loteTotal} onClose={() => setShowPixModal(false)} onAddLancamento={onAddLancamento} />
    )}
    </>
  )
}
