"use client"

import { useState, useRef } from "react"
import { KanbanCard, KanbanOpcao, Lote, NegocioParceiro, StatusLoteParceiro, COLUNAS_KANBAN, COL_FECHADO, COL_ENTREGUE, COL_PERDIDO } from "../types"
import { brl, num } from "../utils"
import { COL_COLORS } from "./kanban-colors"

const PARTNER_STEPS_K: { id: StatusLoteParceiro; short: string }[] = [
  { id: "aguardando",  short: "Aguard." },
  { id: "em_producao", short: "Prod." },
  { id: "pronto",      short: "Pronto" },
  { id: "entregue",    short: "Entregue" },
]

type ModalFechamento = { card: KanbanCard; opcaoIdx: number }

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
}: {
  cards: KanbanCard[]
  onMove: (id: string, coluna: number) => void
  onDelete: (id: string) => void
  onSetMotivo: (id: string, motivo: string) => void
  onFechamento: (id: string, opcao: KanbanOpcao) => void
  onDetalhes?: (card: KanbanCard) => void
  lotes?: Lote[]
  onLoteCreate?: (nomeCliente: string) => Promise<{ id: string; numero: string }>
  onLoteAssign?: (cardId: string, loteId: string, loteNumero: string) => void
  onLoteRemove?: (cardId: string) => void
  onLoteMerge?: (sourceLoteId: string, targetLoteId: string, targetLoteNumero: string) => Promise<void>
  onLoteRename?: (loteId: string, newNumero: string) => Promise<{ ok: boolean; error?: string }>
  negocios?: NegocioParceiro[]
  onUpdateNegocio?: (n: NegocioParceiro) => void
}) {
  const [dragId, setDragId]       = useState<string | null>(null)
  const [overCol, setOverCol]     = useState<number | null>(null)
  const [modal, setModal]         = useState<ModalFechamento | null>(null)

  function tentarMover(id: string, destCol: number) {
    const card = cards.find(c => c.id === id)
    if (!card) return
    // Intercept: col 0 → col 1 (Fechado) e o card tem opcoes
    if (card.coluna === 0 && destCol === COL_FECHADO && card.opcoes?.length) {
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
  const fechados    = cards.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO).length
  const perdidos    = cards.filter(c => c.coluna === COL_PERDIDO).length
  const entregues   = cards.filter(c => c.coluna === COL_ENTREGUE).length
  const emProd      = cards.filter(c => c.coluna >= 5 && c.coluna <= 8).length
  const aguardAprov = cards.filter(c => c.coluna === 3).length
  const decididos   = fechados + perdidos
  const conversao   = decididos > 0 ? (fechados / decididos) * 100 : 0
  const pipeline    = cards.filter(c => c.coluna >= COL_FECHADO && c.coluna < COL_ENTREGUE && c.coluna !== COL_PERDIDO).reduce((s, c) => s + c.preco, 0)
  const faturado    = cards.filter(c => c.coluna === COL_ENTREGUE).reduce((s, c) => s + c.preco, 0)
  const ticketMed   = fechados > 0 ? cards.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO).reduce((s, c) => s + c.preco, 0) / fechados : 0

  void entregues // referenced indirectly via COL_ENTREGUE filter above

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Dashboard ── */}
      <div className="shrink-0 border-b border-slate-100 dark:border-[#21262d] bg-white dark:bg-[#0d1117] px-5 pt-4 pb-4 space-y-3">
        <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-slate-400">Visão geral</p>
        <div className="grid grid-cols-4 gap-3">

          {/* Orçamentos */}
          <div className="bg-slate-50 rounded-2xl p-3.5">
            <p className="text-[9.5px] uppercase tracking-[0.07em] text-slate-400 font-semibold mb-2.5">Orçamentos</p>
            <div className="flex gap-3">
              <div>
                <p className="text-[26px] font-black text-slate-800 leading-none tabular-nums">{total}</p>
                <p className="text-[10px] text-slate-400 mt-1">realizados</p>
              </div>
              <div className="border-l border-slate-200 pl-3">
                <p className="text-[26px] font-black text-green-600 leading-none tabular-nums">{fechados}</p>
                <p className="text-[10px] text-slate-400 mt-1">fechados</p>
              </div>
              <div className="border-l border-slate-200 pl-3">
                <p className="text-[26px] font-black text-rose-500 leading-none tabular-nums">{perdidos}</p>
                <p className="text-[10px] text-slate-400 mt-1">perdidos</p>
              </div>
            </div>
          </div>

          {/* Conversão */}
          <div className="bg-slate-50 rounded-2xl p-3.5">
            <p className="text-[9.5px] uppercase tracking-[0.07em] text-slate-400 font-semibold mb-2">Taxa de conversão</p>
            <p className="text-[26px] font-black leading-none tabular-nums" style={{
              color: conversao >= 60 ? "#16a34a" : conversao >= 35 ? "#d97706" : decididos === 0 ? "#cbd5e1" : "#dc2626"
            }}>
              {decididos === 0 ? "—" : `${num(conversao, 1)}%`}
            </p>
            <div className="w-full h-1 bg-slate-200 dark:bg-[#2a3548] rounded-full overflow-hidden mt-2">
              <div className="h-full rounded-full transition-all duration-500" style={{
                width: `${Math.min(conversao, 100)}%`,
                background: conversao >= 60 ? "#16a34a" : conversao >= 35 ? "#d97706" : "#dc2626"
              }} />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              {decididos === 0 ? "Sem resultados ainda" : `${fechados} de ${decididos} com resultado`}
            </p>
          </div>

          {/* Em andamento */}
          <div className="bg-slate-50 rounded-2xl p-3.5">
            <p className="text-[9.5px] uppercase tracking-[0.07em] text-slate-400 font-semibold mb-2.5">Em andamento</p>
            <div className="flex gap-3">
              <div>
                <p className="text-[26px] font-black text-orange-500 leading-none tabular-nums">{emProd}</p>
                <p className="text-[10px] text-slate-400 mt-1">produção</p>
              </div>
              <div className="border-l border-slate-200 pl-3">
                <p className="text-[26px] font-black text-violet-500 leading-none tabular-nums">{aguardAprov}</p>
                <p className="text-[10px] text-slate-400 mt-1">aprovação</p>
              </div>
            </div>
          </div>

          {/* Financeiro */}
          <div className="bg-slate-900 rounded-2xl p-3.5">
            <p className="text-[9.5px] uppercase tracking-[0.07em] text-slate-400 font-semibold mb-2">Financeiro</p>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] text-slate-500">Pipeline</p>
                <p className="text-[13px] font-bold text-white tabular-nums">{brl(pipeline)}</p>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] text-slate-500">Faturado</p>
                <p className="text-[13px] font-bold text-emerald-400 tabular-nums">{brl(faturado)}</p>
              </div>
              <div className="flex items-baseline justify-between gap-2 pt-1.5 border-t border-slate-800">
                <p className="text-[10px] text-slate-500">Ticket médio</p>
                <p className="text-[12px] font-semibold text-slate-400 tabular-nums">{brl(ticketMed)}</p>
              </div>
            </div>
          </div>

        </div>

        {/* Barra de progresso por coluna */}
        {total > 0 && (
          <div className="space-y-1">
            <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
              {COLUNAS_KANBAN.map((_, i) => {
                const count = cards.filter(c => c.coluna === i).length
                if (!count) return null
                return (
                  <div key={i} title={`${COLUNAS_KANBAN[i]}: ${count}`}
                    className={`h-full transition-all ${COL_COLORS[i].dot}`}
                    style={{ width: `${(count / total) * 100}%` }} />
                )
              })}
            </div>
            <div className="flex gap-3 flex-wrap">
              {COLUNAS_KANBAN.map((nome, i) => {
                const count = cards.filter(c => c.coluna === i).length
                if (!count) return null
                return (
                  <span key={i} className="flex items-center gap-1 text-[9px] text-slate-400">
                    <span className={`w-1.5 h-1.5 rounded-full ${COL_COLORS[i].dot}`} />
                    {nome} ({count})
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-slate-100/40 dark:bg-[#0d1117]">
        <div className="flex gap-3 h-full px-5 py-4" style={{ minWidth: `${COLUNAS_KANBAN.length * 252}px` }}>
          {COLUNAS_KANBAN.map((colNome, colIdx) => {
            const colCards = cards.filter(c => c.coluna === colIdx)
            const isOver   = overCol === colIdx
            const colors   = COL_COLORS[colIdx]

            return (
              <div
                key={colIdx}
                className={`flex flex-col w-60 shrink-0 rounded-2xl transition-all ${
                  isOver
                    ? `border-2 ${colors.border} ${colors.bg}`
                    : "border border-slate-200/70 bg-slate-50/80 dark:bg-[#161b22] dark:border-[#30363d]"
                }`}
                onDragOver={e => handleDragOver(e, colIdx)}
                onDrop={e => handleDrop(e, colIdx)}
                onDragLeave={() => setOverCol(null)}
              >
                {/* Cabeçalho da coluna */}
                <div className="flex items-center gap-2 px-3 pt-3 pb-2.5 border-b border-slate-200/50 dark:border-[#21262d] shrink-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex-1 leading-tight">{colNome}</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                    colCards.length > 0 ? colors.badge : "bg-slate-100 text-slate-300 dark:bg-[#1e2535] dark:text-slate-500"
                  }`}>
                    {colCards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto px-2 pb-3 pt-2 space-y-2 min-h-[60px]">
                  {colCards.length === 0 && (
                    <div className={`border-2 border-dashed rounded-lg h-12 flex items-center justify-center transition-colors ${
                      isOver ? colors.border : "border-slate-200/60 dark:border-[#30363d]/60"
                    }`}>
                      <p className="text-[10px] text-slate-300 dark:text-slate-600 select-none">Arraste aqui</p>
                    </div>
                  )}
                  {colCards.map(card => (
                    <KanbanCardItem
                      key={card.id}
                      card={card}
                      colIdx={colIdx}
                      isDragging={dragId === card.id}
                      colors={colors}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDelete={onDelete}
                      onMove={tentarMover}
                      onSetMotivo={onSetMotivo}
                      onDetalhes={onDetalhes}
                      totalCols={COLUNAS_KANBAN.length}
                      lotes={lotes}
                      onLoteCreate={onLoteCreate}
                      onLoteAssign={onLoteAssign}
                      onLoteRemove={onLoteRemove}
                      onLoteMerge={onLoteMerge}
                      onLoteRename={onLoteRename}
                      negocios={negocios}
                      onUpdateNegocio={onUpdateNegocio}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">

            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-semibold mb-1">Fechar pedido</p>
                  <p className="font-bold text-slate-800 text-[15px] leading-snug truncate">{modal.card.nomeCliente}</p>
                  {modal.card.numero && (
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full mt-1.5 inline-block tabular-nums">
                      {modal.card.numero}
                    </span>
                  )}
                </div>
                <button onClick={() => setModal(null)}
                  className="text-slate-300 hover:text-slate-500 transition-colors text-xl leading-none mt-0.5 shrink-0">×</button>
              </div>
              <p className="text-[12px] text-slate-400 mt-2.5">Qual quantidade foi fechada?</p>
            </div>

            {/* Opções */}
            <div className="px-4 py-3 space-y-1.5 max-h-72 overflow-y-auto">
              {modal.card.opcoes!.map((op, i) => {
                const selected = i === modal.opcaoIdx
                return (
                  <button key={i} onClick={() => setModal(m => m ? { ...m, opcaoIdx: i } : m)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                      selected
                        ? "border-blue-400 bg-blue-50/60"
                        : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                    }`}>
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                      selected ? "border-blue-500" : "border-slate-300"
                    }`}>
                      {selected && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-sm leading-none ${selected ? "text-blue-900" : "text-slate-800"}`}>
                        {num(op.quantidade)} unidades
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{brl(op.unitario)}/un</p>
                    </div>
                    <p className={`font-black text-[15px] tabular-nums shrink-0 ${selected ? "text-blue-700" : "text-slate-700"}`}>
                      {brl(op.preco)}
                    </p>
                  </button>
                )
              })}
            </div>

            {/* Ações */}
            <div className="flex gap-2 px-4 pb-4 pt-2 border-t border-slate-50">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 text-[13px] text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-colors font-medium">
                Cancelar
              </button>
              <button onClick={confirmarFechamento}
                className="flex-1 py-2.5 text-[13px] font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-colors">
                Confirmar →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KanbanCardItem({
  card, colIdx, isDragging, colors, onDragStart, onDragEnd, onDelete, onMove, onSetMotivo, onDetalhes, totalCols,
  lotes, onLoteCreate, onLoteAssign, onLoteRemove, onLoteMerge, onLoteRename, negocios, onUpdateNegocio,
}: {
  card: KanbanCard
  colIdx: number
  isDragging: boolean
  colors: typeof COL_COLORS[0]
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  onDelete: (id: string) => void
  onMove: (id: string, col: number) => void
  onSetMotivo: (id: string, motivo: string) => void
  onDetalhes?: (card: KanbanCard) => void
  totalCols: number
  lotes?: Lote[]
  onLoteCreate?: (nomeCliente: string) => Promise<{ id: string; numero: string }>
  onLoteAssign?: (cardId: string, loteId: string, loteNumero: string) => void
  onLoteRemove?: (cardId: string) => void
  onLoteMerge?: (sourceLoteId: string, targetLoteId: string, targetLoteNumero: string) => Promise<void>
  onLoteRename?: (loteId: string, newNumero: string) => Promise<{ ok: boolean; error?: string }>
  negocios?: NegocioParceiro[]
  onUpdateNegocio?: (n: NegocioParceiro) => void
}) {
  const isPerdido = colIdx === COL_PERDIDO
  const [confirmando, setConfirmando] = useState(false)
  const [motivoRascunho, setMotivoRascunho] = useState("")
  const [copiedId, setCopiedId] = useState(false)
  const [showLotePanel, setShowLotePanel] = useState(false)
  const [copiedLote, setCopiedLote] = useState(false)
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

  function copyLoteLink() {
    const url = `${window.location.origin}/track/lote/${encodeURIComponent(card.loteNumero ?? "")}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLote(true)
      setTimeout(() => setCopiedLote(false), 2000)
    })
  }

  void totalCols

  function iniciarPerda() {
    setConfirmando(true)
    setMotivoRascunho("")
    setTimeout(() => motivoRef.current?.focus(), 50)
  }

  function confirmarPerda() {
    onMove(card.id, COL_PERDIDO)
    if (motivoRascunho.trim()) onSetMotivo(card.id, motivoRascunho.trim())
    setConfirmando(false)
  }

  return (
    <div
      draggable={!confirmando}
      onDragStart={e => !confirmando && onDragStart(e, card.id)}
      onDragEnd={onDragEnd}
      onClick={() => onDetalhes?.(card)}
      className={`flex rounded-xl border overflow-hidden transition-all duration-150 select-none ${
        isPerdido ? "bg-rose-50/40 border-rose-200/70 dark:bg-rose-950/20 dark:border-rose-900/40" : "bg-white border-slate-200/60 dark:bg-[#1c2333] dark:border-[#30363d]"
      } ${isDragging ? "opacity-40 scale-95 shadow-none" : "shadow-sm hover:shadow-md hover:-translate-y-px cursor-grab active:cursor-grabbing"}`}
    >
      {/* Accent bar */}
      <div className={`w-0.5 shrink-0 ${isPerdido ? "bg-rose-400" : colors.dot}`} />

      <div className="flex-1 px-2.5 py-2.5 min-w-0">

        {/* Name + close */}
        <div className="flex items-center gap-1.5">
          <p className={`flex-1 font-bold text-[12px] leading-snug truncate ${
            isPerdido ? "line-through text-rose-600/70" : "text-slate-800"
          }`}>{card.nomeCliente}</p>
          <button
            onClick={e => { e.stopPropagation(); if (confirm(`Remover "${card.nomeCliente}" do kanban?`)) onDelete(card.id) }}
            className="w-4 h-4 flex items-center justify-center text-slate-200 hover:text-rose-400 hover:bg-rose-50 rounded transition-colors text-sm leading-none shrink-0"
          >×</button>
        </div>

        {/* Badges */}
        {(card.numero || card.loteNumero) && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {card.numero && (
              <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded-full border tabular-nums leading-tight ${
                isPerdido ? "text-rose-400 bg-rose-50 border-rose-200" : "text-blue-600 bg-blue-50 border-blue-200"
              }`}>{card.numero}</span>
            )}
            {card.loteNumero && (
              <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full border text-violet-600 bg-violet-50 border-violet-200 tabular-nums leading-tight">
                {card.loteNumero}
              </span>
            )}
          </div>
        )}

        {/* Specs */}
        <p className="text-[10px] text-slate-400 mt-1.5 leading-tight truncate">
          {card.dimensoes} cm · {card.materialNome}
        </p>

        {/* Loss motivo */}
        {isPerdido && (
          <div className="mt-2" onClick={e => e.stopPropagation()}>
            <input
              type="text"
              value={card.motivoPerdido ?? ""}
              onChange={e => onSetMotivo(card.id, e.target.value)}
              placeholder="Motivo da perda…"
              className="w-full text-[10px] text-rose-700 bg-rose-100/70 border border-rose-200 rounded-lg px-2 py-1 placeholder:text-rose-300/80 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </div>
        )}

        {/* Price row */}
        <div className="flex items-baseline gap-2 mt-2.5">
          <span className={`font-black text-[15px] leading-none tabular-nums ${
            isPerdido ? "text-rose-400 line-through" : "text-slate-900"
          }`}>{brl(card.preco)}</span>
          <span className="text-[10px] text-slate-400 tabular-nums">{num(card.quantidade)} un</span>
          <span className="text-[9px] text-slate-300 ml-auto tabular-nums">{card.data.split(",")[0]}</span>
        </div>

        {/* Action bar */}
        {!isPerdido && !confirmando && (
          <div className="flex items-center gap-0.5 mt-2 pt-1.5 border-t border-slate-100/80 dark:border-[#21262d]" onClick={e => e.stopPropagation()}>

            {/* Back */}
            <button
              disabled={colIdx === 0}
              onClick={() => onMove(card.id, colIdx - 1)}
              className="w-6 h-6 flex items-center justify-center text-[11px] text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-md disabled:opacity-0 transition-all"
            >←</button>

            {/* Copy link */}
            <button
              onClick={e => {
                e.stopPropagation()
                navigator.clipboard.writeText(`${window.location.origin}/track/${encodeURIComponent(card.numero)}`).then(() => {
                  setCopiedId(true); setTimeout(() => setCopiedId(false), 2000)
                })
              }}
              title="Copiar link de rastreamento"
              className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${
                copiedId ? "text-emerald-500 bg-emerald-50" : "text-slate-300 hover:text-blue-500 hover:bg-blue-50"
              }`}
            >
              {copiedId
                ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
              }
            </button>

            {/* Lote */}
            <button
              onClick={e => { e.stopPropagation(); setShowLotePanel(v => !v) }}
              title={card.loteNumero ? `Lote: ${card.loteNumero}` : "Agrupar em lote"}
              className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${
                card.loteNumero ? "text-violet-500 bg-violet-50/80 hover:bg-violet-100" : "text-slate-300 hover:text-violet-500 hover:bg-violet-50"
              }`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z" />
              </svg>
            </button>

            <div className="flex-1" />

            {/* Mark lost */}
            {colIdx < COL_ENTREGUE && (
              <button onClick={iniciarPerda} title="Marcar como perdido"
                className="w-6 h-6 flex items-center justify-center text-[10px] text-slate-200 hover:text-rose-400 hover:bg-rose-50 rounded-md transition-all">
                ✕
              </button>
            )}

            {/* Advance */}
            {colIdx < COL_ENTREGUE && (
              <button onClick={() => onMove(card.id, colIdx + 1)}
                className="h-6 px-2 text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-md transition-all ml-0.5">
                →
              </button>
            )}
          </div>
        )}

        {/* Lote panel */}
        {showLotePanel && !isPerdido && (
          <div className="mt-2 pt-2 border-t border-violet-100/80 space-y-1.5" onClick={e => e.stopPropagation()}>
            {card.loteNumero ? (
              <>
                {/* Header: lote number with inline rename */}
                {editingLote ? (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      <input
                        autoFocus
                        value={loteNumeroEdit}
                        onChange={e => { setLoteNumeroEdit(e.target.value.toUpperCase()); setLoteRenameError("") }}
                        onKeyDown={e => { if (e.key === "Enter") handleRenomear(); if (e.key === "Escape") { setEditingLote(false); setLoteRenameError("") } }}
                        className="flex-1 text-[9.5px] font-bold text-violet-700 bg-white border border-violet-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-400 min-w-0"
                      />
                      <button onClick={handleRenomear} disabled={savingRename}
                        className="text-[9.5px] font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-2 py-0.5 rounded transition-colors shrink-0">
                        {savingRename ? "…" : "OK"}
                      </button>
                      <button onClick={() => { setEditingLote(false); setLoteRenameError("") }}
                        className="text-[9.5px] text-slate-400 hover:text-slate-600 px-1 transition-colors shrink-0">✕</button>
                    </div>
                    {loteRenameError && <p className="text-[9px] text-rose-500">{loteRenameError}</p>}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9.5px] font-black text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full font-mono">
                      {card.loteNumero}
                    </span>
                    <button onClick={() => { setLoteNumeroEdit(card.loteNumero ?? ""); setLoteRenameError(""); setEditingLote(true) }}
                      title="Renomear lote"
                      className="text-[9px] text-violet-300 hover:text-violet-600 transition-colors px-0.5">✏</button>
                    <button onClick={copyLoteLink}
                      className={`text-[9.5px] font-semibold px-2 py-0.5 rounded-full transition-colors ${copiedLote ? "text-emerald-600 bg-emerald-50" : "text-violet-600 bg-violet-50 hover:bg-violet-100"}`}>
                      {copiedLote ? "Copiado ✓" : "🔗 Copiar link"}
                    </button>
                    <button onClick={handleRemoveLote}
                      className="ml-auto text-[9.5px] text-slate-300 hover:text-rose-400 transition-colors">
                      Remover
                    </button>
                  </div>
                )}

                {/* Merge section */}
                {clientLotes.length > 0 && !editingLote && (
                  <div className="pt-1">
                    <p className="text-[9px] uppercase tracking-[0.12em] font-bold text-slate-400 mb-1">Mesclar pedidos</p>
                    <div className="space-y-0.5">
                      {clientLotes.map(l => (
                        <button key={l.id} onClick={() => handleMerge(l.id, l.numero)}
                          disabled={merging}
                          className="w-full flex items-center gap-1.5 py-1.5 px-2 text-[10px] text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 rounded-md transition-colors text-left">
                          <svg className="w-3 h-3 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                          </svg>
                          <span className="font-bold">{l.numero}</span>
                          <span className="text-violet-300">·</span>
                          <span className="text-violet-500 truncate">{l.nomeCliente}</span>
                          {merging && <span className="ml-auto text-[9px] text-violet-400">…</span>}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-300 mt-1">Todos os pedidos do lote selecionado serão reunidos aqui.</p>
                  </div>
                )}

                {/* Partner products section */}
                {!editingLote && (() => {
                  const vinculados = (negocios ?? []).filter(n => n.loteId === card.loteId)
                  const disponiveis = (negocios ?? []).filter(n => !n.loteId)
                  return (
                    <div className="pt-1 border-t border-amber-100/60">
                      <p className="text-[9px] uppercase tracking-[0.12em] font-bold text-amber-500 mb-1">Produtos via parceiros</p>
                      {vinculados.length > 0 && (
                        <div className="space-y-1 mb-1.5">
                          {vinculados.map(n => {
                            const curIdx = PARTNER_STEPS_K.findIndex(s => s.id === (n.statusLote ?? "aguardando"))
                            return (
                              <div key={n.id} className="bg-amber-50 rounded-md px-2 py-1.5">
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-bold text-amber-800 truncate flex-1">{n.descricao}</span>
                                  <span className="text-[8px] text-amber-500 shrink-0">{n.parceiroNome}</span>
                                  <button onClick={() => onUpdateNegocio?.({ ...n, loteId: undefined, loteNumero: undefined, statusLote: undefined })}
                                    className="text-amber-200 hover:text-rose-400 text-[10px] ml-1 transition-colors shrink-0">×</button>
                                </div>
                                <div className="flex gap-0.5 mt-1">
                                  {PARTNER_STEPS_K.map((step, i) => (
                                    <button key={step.id}
                                      onClick={() => onUpdateNegocio?.({ ...n, statusLote: step.id })}
                                      className={`flex-1 h-4 rounded text-[7px] font-bold transition-colors ${
                                        i <= curIdx ? "bg-amber-400 text-white" : "bg-amber-100 text-amber-400 hover:bg-amber-200"
                                      }`}>
                                      {step.short}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {showAddNegocio ? (
                        <div>
                          {disponiveis.length > 0 ? (
                            <div className="space-y-0.5 max-h-24 overflow-y-auto mb-1">
                              {disponiveis.map(n => (
                                <button key={n.id}
                                  onClick={() => { onUpdateNegocio?.({ ...n, loteId: card.loteId, loteNumero: card.loteNumero, statusLote: "aguardando" }); setShowAddNegocio(false) }}
                                  className="w-full flex items-center gap-1.5 py-1 px-2 text-[9.5px] text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors text-left">
                                  <span className="font-semibold truncate flex-1">{n.descricao}</span>
                                  <span className="text-amber-400 text-[8.5px] shrink-0">{n.parceiroNome}</span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[9px] text-slate-400 py-1">Nenhum produto disponível.</p>
                          )}
                          <button onClick={() => setShowAddNegocio(false)}
                            className="w-full py-1 text-[9px] text-slate-300 hover:text-slate-500 transition-colors">Cancelar</button>
                        </div>
                      ) : (
                        <button onClick={() => setShowAddNegocio(true)}
                          className="w-full py-1 text-[9.5px] font-semibold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors">
                          + Produto de parceiro
                        </button>
                      )}
                    </div>
                  )
                })()}
              </>
            ) : (
              <>
                <p className="text-[10px] text-slate-500 font-semibold">Agrupar em lote</p>
                {clientLotes.length > 0 && (
                  <div className="space-y-0.5">
                    {clientLotes.map(l => (
                      <button key={l.id} onClick={() => handleAssignLote(l.id, l.numero)}
                        className="w-full flex items-center gap-1.5 py-1.5 px-2 text-[10px] text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-md transition-colors text-left">
                        <span className="font-bold">{l.numero}</span>
                        <span className="text-violet-300">·</span>
                        <span className="text-violet-500 truncate">{l.nomeCliente}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={handleCriarLote} disabled={criandoLote}
                  className="w-full py-1.5 text-[10px] font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-md transition-colors">
                  {criandoLote ? "Criando…" : "+ Criar novo lote"}
                </button>
                <button onClick={() => setShowLotePanel(false)}
                  className="w-full py-1 text-[10px] text-slate-300 hover:text-slate-500 transition-colors">
                  Cancelar
                </button>
              </>
            )}
          </div>
        )}

        {/* Loss confirmation */}
        {confirmando && (
          <div className="mt-2 pt-2 border-t border-rose-100 space-y-1.5" onClick={e => e.stopPropagation()}>
            <p className="text-[10px] text-rose-600 font-semibold">Confirmar perda?</p>
            <input
              ref={motivoRef}
              type="text"
              value={motivoRascunho}
              onChange={e => setMotivoRascunho(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") confirmarPerda(); if (e.key === "Escape") setConfirmando(false) }}
              placeholder="Motivo (opcional)…"
              className="w-full text-[10px] text-slate-700 bg-white border border-rose-200 rounded-lg px-2 py-1.5 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-rose-400 cursor-text select-text"
            />
            <div className="flex gap-1">
              <button onClick={() => setConfirmando(false)}
                className="flex-1 py-1.5 text-[10px] text-slate-400 hover:bg-slate-50 rounded-md transition-colors">
                Cancelar
              </button>
              <button onClick={confirmarPerda}
                className="flex-1 py-1.5 text-[10px] font-semibold text-white bg-rose-500 hover:bg-rose-600 rounded-md transition-colors">
                Confirmar
              </button>
            </div>
          </div>
        )}

        {/* Reopen lost */}
        {isPerdido && (
          <div className="mt-2 pt-2 border-t border-rose-100" onClick={e => e.stopPropagation()}>
            <button onClick={() => onMove(card.id, 0)}
              className="w-full py-1.5 text-[10px] font-medium text-rose-500 hover:text-rose-700 hover:bg-rose-100 rounded-md transition-colors">
              ↺ Reabrir orçamento
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
