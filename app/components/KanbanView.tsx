"use client"

import { useState, useRef } from "react"
import { KanbanCard, KanbanOpcao, COLUNAS_KANBAN, COL_FECHADO, COL_ENTREGUE, COL_PERDIDO } from "../types"
import { brl, num } from "../utils"
import { COL_COLORS } from "./kanban-colors"

type ModalFechamento = { card: KanbanCard; opcaoIdx: number }

export function KanbanView({
  cards,
  onMove,
  onDelete,
  onSetMotivo,
  onFechamento,
  onDetalhes,
}: {
  cards: KanbanCard[]
  onMove: (id: string, coluna: number) => void
  onDelete: (id: string) => void
  onSetMotivo: (id: string, motivo: string) => void
  onFechamento: (id: string, opcao: KanbanOpcao) => void
  onDetalhes?: (card: KanbanCard) => void
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
      <div className="shrink-0 border-b border-slate-100 bg-white px-5 pt-4 pb-4 space-y-3">
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
            <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mt-2">
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
      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-slate-100/40">
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
                    : "border border-slate-200/70 bg-slate-50/80"
                }`}
                onDragOver={e => handleDragOver(e, colIdx)}
                onDrop={e => handleDrop(e, colIdx)}
                onDragLeave={() => setOverCol(null)}
              >
                {/* Cabeçalho da coluna */}
                <div className="flex items-center gap-2 px-3 pt-3 pb-2.5 border-b border-slate-200/50 shrink-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                  <p className="text-[11px] font-bold text-slate-700 flex-1 leading-tight">{colNome}</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                    colCards.length > 0 ? colors.badge : "bg-slate-100 text-slate-300"
                  }`}>
                    {colCards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto px-2 pb-3 pt-2 space-y-2 min-h-[60px]">
                  {colCards.length === 0 && (
                    <div className={`border-2 border-dashed rounded-lg h-12 flex items-center justify-center transition-colors ${
                      isOver ? colors.border : "border-slate-200/60"
                    }`}>
                      <p className="text-[10px] text-slate-300 select-none">Arraste aqui</p>
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
}) {
  const isPerdido = colIdx === COL_PERDIDO
  const [confirmando, setConfirmando] = useState(false)
  const [motivoRascunho, setMotivoRascunho] = useState("")
  const [copiedId, setCopiedId] = useState(false)
  const motivoRef = useRef<HTMLInputElement>(null)

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
        isPerdido ? "bg-rose-50/60 border-rose-200/80" : "bg-white border-slate-200/60"
      } ${isDragging ? "opacity-40 scale-[0.97] shadow-none" : "shadow-sm hover:shadow-lg hover:-translate-y-0.5 cursor-grab active:cursor-grabbing"}`}
    >
      {/* Left accent bar */}
      <div className={`w-[3px] shrink-0 ${isPerdido ? "bg-rose-400" : colors.dot}`} />

      <div className="flex-1 px-3 py-3">
        {/* Header */}
        <div className="flex items-start gap-2 mb-2">
          <div className={`w-7 h-7 rounded-lg text-[11px] font-bold flex items-center justify-center shrink-0 ${
            isPerdido ? "bg-rose-100 text-rose-500" : "bg-slate-100 text-slate-600"
          }`}>
            {card.nomeCliente[0]?.toUpperCase() ?? "#"}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-[11.5px] leading-snug truncate ${
              isPerdido ? "line-through text-rose-700/70" : "text-slate-800"
            }`}>{card.nomeCliente}</p>
            {card.numero && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-tight border inline-block mt-0.5 tabular-nums ${
                isPerdido ? "text-rose-500 bg-rose-50 border-rose-200" : "text-blue-600 bg-blue-50 border-blue-200"
              }`}>{card.numero}</span>
            )}
          </div>
          <button
            onClick={e => { e.stopPropagation(); if (confirm(`Remover "${card.nomeCliente}" do kanban?`)) onDelete(card.id) }}
            className="w-5 h-5 flex items-center justify-center text-slate-200 hover:text-rose-400 hover:bg-rose-50 rounded transition-colors text-sm leading-none shrink-0"
          >×</button>
        </div>

        <p className="text-[10px] text-slate-400 mb-2.5 leading-tight">{card.dimensoes} cm · {card.materialNome}</p>

        {/* Motivo da perda */}
        {isPerdido && (
          <div className="mb-2.5" onClick={e => e.stopPropagation()}>
            <input
              type="text"
              value={card.motivoPerdido ?? ""}
              onChange={e => onSetMotivo(card.id, e.target.value)}
              placeholder="Motivo da perda…"
              className="w-full text-[10px] text-rose-700 bg-rose-100 border border-rose-200 rounded-lg px-2 py-1 placeholder:text-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </div>
        )}

        {/* Price block */}
        <div className={`rounded-xl px-3 py-2.5 mb-2 ${isPerdido ? "bg-rose-100/30" : "bg-slate-50/80"}`}>
          <p className={`font-black text-[17px] leading-none tabular-nums ${isPerdido ? "text-rose-400 line-through" : "text-slate-900"}`}>{brl(card.preco)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{num(card.quantidade)} unidades</p>
        </div>

        <p className="text-[9px] text-slate-300 tabular-nums">{card.data}</p>

        {/* Navigation */}
        {!isPerdido && !confirmando && (
          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-100" onClick={e => e.stopPropagation()}>
            <button
              disabled={colIdx === 0}
              onClick={() => onMove(card.id, colIdx - 1)}
              className="w-7 h-7 flex items-center justify-center text-[12px] text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-100"
            >←</button>
            {/* Copy tracking link */}
            <button
              onClick={e => {
                e.stopPropagation()
                const url = `${window.location.origin}/track/${encodeURIComponent(card.numero)}`
                navigator.clipboard.writeText(url).then(() => {
                  setCopiedId(true)
                  setTimeout(() => setCopiedId(false), 2000)
                })
              }}
              title="Copiar link de rastreamento"
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-blue-600 transition-colors px-1.5 py-1 rounded-md hover:bg-blue-50"
            >
              {copiedId ? (
                <span className="text-emerald-600 font-medium">Copiado ✓</span>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                  </svg>
                  <span>Link</span>
                </>
              )}
            </button>
            <div className="flex-1" />
            {colIdx < COL_ENTREGUE && (
              <button
                onClick={iniciarPerda}
                title="Marcar como perdido"
                className="w-7 h-7 flex items-center justify-center text-[10px] text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all duration-100"
              >✕</button>
            )}
            {colIdx < COL_ENTREGUE && (
              <button
                onClick={() => onMove(card.id, colIdx + 1)}
                className="h-7 px-3 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-lg transition-all duration-100"
              >→</button>
            )}
          </div>
        )}

        {/* Confirmação de perda — inline, sem popup */}
        {confirmando && (
          <div className="mt-2 pt-2 border-t border-rose-100 space-y-1.5" onClick={e => e.stopPropagation()}>
            <p className="text-[10px] text-rose-600 font-semibold">Marcar como perdido?</p>
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

        {/* Recuperar perdido */}
        {isPerdido && (
          <div className="mt-2 pt-2 border-t border-rose-100" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onMove(card.id, 0)}
              className="w-full py-1.5 text-[10px] text-rose-500 hover:text-rose-700 hover:bg-rose-100 rounded-md transition-colors"
            >↺ Reabrir orçamento</button>
          </div>
        )}
      </div>
    </div>
  )
}
