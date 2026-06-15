"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { KanbanCard } from "../types"
import { brl, num } from "../utils"

const CARD = "bg-white border border-[rgba(0,0,0,0.06)] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]"

const S = {
  aguardando: { label: "Aguardando",  full: "Aguardando fornecedor",  color: "#FF9500", bg: "rgba(255,149,0,0.1)",  coluna: 1 },
  recebido:   { label: "Recebido",    full: "Recebido do fornecedor", color: "#007AFF", bg: "rgba(0,122,255,0.1)", coluna: 8 },
  entregue:   { label: "Entregue",    full: "Entregue ao cliente",    color: "#34C759", bg: "rgba(52,199,89,0.1)", coluna: 9 },
} as const
type SK = keyof typeof S
const STEPS: SK[] = ["aguardando", "recebido", "entregue"]

function toStatus(col: number): SK {
  if (col === 9) return "entregue"
  if (col === 8) return "recebido"
  return "aguardando"
}

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({
  card,
  onSave,
  onClose,
}: {
  card: KanbanCard
  onSave: (fields: Partial<KanbanCard>) => void
  onClose: () => void
}) {
  const [desc,       setDesc]       = useState(card.dimensoes)
  const [qtd,        setQtd]        = useState(String(card.quantidade || ""))
  const [preco,      setPreco]      = useState(String(card.preco || ""))
  const [fornecedor, setFornecedor] = useState(card.fornecedor ?? "")
  const [entrega,    setEntrega]    = useState(card.dataEntregaPrevista ?? "")
  const [visible,    setVisible]    = useState(false)
  const descRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true))
    descRef.current?.focus()
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  function dismiss() {
    setVisible(false)
    setTimeout(onClose, 180)
  }

  function save() {
    const fields: Partial<KanbanCard> = {}
    const d = desc.trim()
    if (d && d !== card.dimensoes)                          fields.dimensoes = d
    const q = Math.max(1, parseInt(qtd) || 0)
    if (q !== card.quantidade)                              fields.quantidade = q
    const p = Math.max(0, parseFloat(preco.replace(",", ".")) || 0)
    if (p !== card.preco)                                   fields.preco = p
    const f = fornecedor.trim()
    if (f !== (card.fornecedor ?? ""))                      fields.fornecedor = f || undefined
    if (entrega !== (card.dataEntregaPrevista ?? ""))        fields.dataEntregaPrevista = entrega || undefined
    if (Object.keys(fields).length) onSave(fields)
    dismiss()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center transition-all duration-180"
      style={{
        background: visible ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(4px)" : "none",
      }}
      onClick={e => { if (e.target === e.currentTarget) dismiss() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden transition-all duration-200"
        style={{
          transform: visible ? "scale(1) translateY(0)" : "scale(0.94) translateY(12px)",
          opacity: visible ? 1 : 0,
        }}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-[#1C1C1E] text-[15px] leading-snug">Editar item</p>
            <p className="text-[11px] text-[#8E8E93] mt-0.5 font-mono">{card.numero}</p>
          </div>
          <button onClick={dismiss}
            className="w-7 h-7 rounded-full bg-[rgba(116,116,128,0.1)] flex items-center justify-center text-[#8E8E93] hover:bg-[rgba(116,116,128,0.18)] transition-colors shrink-0 text-lg leading-none mt-0.5">
            ×
          </button>
        </div>

        {/* Fields */}
        <div className="px-6 py-5 space-y-4">

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-[#8E8E93] block mb-1.5">Descrição</label>
            <input
              ref={descRef}
              value={desc}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={e => e.key === "Enter" && save()}
              placeholder="Ex: Rótulo Adesivo 20×45mm"
              className="w-full border border-[rgba(0,0,0,0.12)] rounded-xl px-3.5 py-2.5 text-[13px] text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-colors placeholder:text-[rgba(60,60,67,0.3)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-[#8E8E93] block mb-1.5">Quantidade</label>
              <input
                type="number" min={1} value={qtd}
                onChange={e => setQtd(e.target.value)}
                onKeyDown={e => e.key === "Enter" && save()}
                placeholder="0"
                className="w-full border border-[rgba(0,0,0,0.12)] rounded-xl px-3.5 py-2.5 text-[13px] text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-colors tabular-nums"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-[#8E8E93] block mb-1.5">Valor (R$)</label>
              <input
                type="number" min={0} step={0.01} value={preco}
                onChange={e => setPreco(e.target.value)}
                onKeyDown={e => e.key === "Enter" && save()}
                placeholder="0,00"
                className="w-full border border-[rgba(0,0,0,0.12)] rounded-xl px-3.5 py-2.5 text-[13px] text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-colors tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-[#8E8E93] block mb-1.5">Fornecedor</label>
            <input
              value={fornecedor}
              onChange={e => setFornecedor(e.target.value)}
              onKeyDown={e => e.key === "Enter" && save()}
              placeholder="Nome do fornecedor"
              className="w-full border border-[rgba(0,0,0,0.12)] rounded-xl px-3.5 py-2.5 text-[13px] text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-colors placeholder:text-[rgba(60,60,67,0.3)]"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-[#8E8E93] block mb-1.5">Previsão de entrega</label>
            <input
              type="date" value={entrega}
              onChange={e => setEntrega(e.target.value)}
              className="w-full border border-[rgba(0,0,0,0.12)] rounded-xl px-3.5 py-2.5 text-[13px] text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-colors"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-2">
          <button onClick={dismiss}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-medium text-[#8E8E93] hover:bg-[#F2F2F7] transition-colors border border-[rgba(0,0,0,0.08)]">
            Cancelar
          </button>
          <button onClick={save}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-[#007AFF] hover:bg-[#0062CC] active:bg-[#004EA8] transition-colors">
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Stepper ───────────────────────────────────────────────────────────────────
function StatusStepper({ status, onStep }: { status: SK; onStep: (s: SK) => void }) {
  const curIdx = STEPS.indexOf(status)

  return (
    <div className="flex items-center gap-0">
      {STEPS.map((key, i) => {
        const cfg     = S[key]
        const done    = i < curIdx
        const current = i === curIdx
        const next    = i === curIdx + 1
        const future  = i > curIdx
        const isLast  = i === STEPS.length - 1

        return (
          <div key={key} className="flex items-center" style={{ flex: isLast ? "0 0 auto" : 1 }}>
            {/* Step node */}
            <button
              disabled={current}
              onClick={() => onStep(key)}
              title={cfg.full}
              className={`flex flex-col items-center gap-1 transition-opacity ${
                future && !next ? "opacity-40" : ""
              } ${current ? "cursor-default" : "hover:opacity-80"}`}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300"
                style={{
                  background: current ? cfg.color : done ? cfg.bg : "rgba(0,0,0,0.04)",
                  border: current ? `2px solid ${cfg.color}` : done ? `2px solid ${cfg.bg}` : "2px solid rgba(0,0,0,0.08)",
                  boxShadow: current ? `0 0 0 3px ${cfg.color}20` : "none",
                }}
              >
                {done ? (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                    style={{ color: cfg.color }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : current ? (
                  <div className="w-2 h-2 rounded-full bg-white" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.15)" }} />
                )}
              </div>
              <span
                className="text-[8.5px] font-semibold leading-none whitespace-nowrap transition-colors duration-300"
                style={{ color: current ? cfg.color : done ? cfg.color : "rgba(60,60,67,0.36)" }}
              >
                {cfg.label}
              </span>
            </button>

            {/* Connector */}
            {!isLast && (
              <div className="flex-1 mx-1.5 mb-3.5 h-px rounded-full transition-all duration-300"
                style={{ background: done ? S[STEPS[i]].color + "40" : "rgba(0,0,0,0.08)" }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────
function TercCard({
  card,
  onMove,
  onEdit,
  onDelete,
}: {
  card: KanbanCard
  onMove: (id: string, coluna: number) => void
  onEdit: (id: string, fields: Partial<KanbanCard>) => void
  onDelete: (id: string) => void
}) {
  const [editing,    setEditing]    = useState(false)
  const [confirming, setConfirming] = useState(false)
  const status = toStatus(card.coluna)
  const cfg    = S[status]

  const unitPrice = card.quantidade > 0 ? card.preco / card.quantidade : 0

  const isLate = card.dataEntregaPrevista
    && card.coluna !== 9
    && card.dataEntregaPrevista < new Date().toISOString().slice(0, 10)

  return (
    <>
      <div
        className={`${CARD} overflow-hidden transition-all duration-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-px`}
        style={{ borderColor: status === "entregue" ? "rgba(52,199,89,0.2)" : isLate ? "rgba(255,59,48,0.25)" : undefined }}
      >
        {/* Main row */}
        <div className="px-4 pt-3.5 pb-3 flex items-start gap-3">
          {/* Status dot */}
          <div className="shrink-0 mt-0.5">
            <div className="w-2 h-2 rounded-full transition-colors duration-300 mt-1"
              style={{ background: cfg.color }} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#1C1C1E] text-[13px] leading-snug">
              {card.dimensoes || card.numero}
            </p>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {card.quantidade > 0 && (
                <span className="text-[11px] text-[#8E8E93] tabular-nums">{num(card.quantidade)} un</span>
              )}
              {card.fornecedor && (
                <span className="text-[11px] text-[#8E8E93]">· via {card.fornecedor}</span>
              )}
              {card.dataEntregaPrevista && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md tabular-nums ${
                  isLate ? "bg-[#FF3B30]/10 text-[#FF3B30]" : "bg-[rgba(0,0,0,0.04)] text-[#8E8E93]"
                }`}>
                  {isLate ? "Atrasado · " : ""}{fmtDate(card.dataEntregaPrevista)}
                </span>
              )}
            </div>
          </div>

          {/* Right: value + status + actions */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <p className="text-[15px] font-bold text-[#1C1C1E] tabular-nums leading-none">{brl(card.preco)}</p>
            <span
              className="text-[9.5px] font-semibold px-2 py-0.5 rounded-full transition-all duration-300"
              style={{ background: cfg.bg, color: cfg.color }}
            >
              {cfg.label}
            </span>
            {card.quantidade > 0 && unitPrice > 0 && (
              <p className="text-[10px] text-[#8E8E93] tabular-nums">
                {brl(unitPrice)}/un
              </p>
            )}
          </div>
        </div>

        {/* Stepper + actions row */}
        <div className="border-t border-[rgba(60,60,67,0.06)] px-4 py-3 flex items-center gap-4">
          <div className="flex-1">
            <StatusStepper
              status={status}
              onStep={key => onMove(card.id, S[key].coluna)}
            />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#8E8E93] hover:text-[#007AFF] hover:bg-[#007AFF]/[0.08] transition-all"
              title="Editar"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
              </svg>
            </button>
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#8E8E93] hover:text-[#FF3B30] hover:bg-[#FF3B30]/[0.08] transition-all"
                title="Excluir"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setConfirming(false)}
                  className="text-[10px] font-medium text-[#8E8E93] hover:text-[#1C1C1E] px-2 py-1 rounded-lg hover:bg-[rgba(0,0,0,0.04)] transition-colors"
                >
                  não
                </button>
                <button
                  onClick={() => onDelete(card.id)}
                  className="text-[10px] font-semibold text-white bg-[#FF3B30] hover:bg-[#D70015] px-2.5 py-1 rounded-lg transition-colors"
                >
                  excluir
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <EditModal
          card={card}
          onSave={fields => onEdit(card.id, fields)}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────
export function TerceirizadosView({
  kanban,
  onMove,
  onEdit,
  onDelete,
}: {
  kanban: KanbanCard[]
  onMove: (id: string, coluna: number) => void
  onEdit: (id: string, fields: Partial<KanbanCard>) => void
  onDelete: (id: string) => void
}) {
  const tercs = useMemo(
    () => kanban.filter(c => c.materialNome === "Terceirizado" && c.coluna !== 10),
    [kanban]
  )

  const groups = useMemo(() => {
    const map = new Map<string, { loteNumero: string; nomeCliente: string; cards: KanbanCard[] }>()
    for (const c of tercs) {
      const key = c.loteId ?? `__${c.nomeCliente}`
      if (!map.has(key)) map.set(key, { loteNumero: c.loteNumero ?? "—", nomeCliente: c.nomeCliente, cards: [] })
      map.get(key)!.cards.push(c)
    }
    return Array.from(map.values()).sort((a, b) => a.loteNumero.localeCompare(b.loteNumero))
  }, [tercs])

  const kpis = useMemo(() => {
    const aguardando = tercs.filter(c => toStatus(c.coluna) === "aguardando")
    const recebido   = tercs.filter(c => toStatus(c.coluna) === "recebido")
    const entregue   = tercs.filter(c => toStatus(c.coluna) === "entregue")
    return {
      nAguardando: aguardando.length,
      nRecebido:   recebido.length,
      nEntregue:   entregue.length,
      vAguardando: aguardando.reduce((s, c) => s + c.preco, 0),
      vRecebido:   recebido.reduce((s, c) => s + c.preco, 0),
      vTotal:      tercs.reduce((s, c) => s + c.preco, 0),
      late: tercs.filter(c =>
        c.dataEntregaPrevista &&
        c.coluna !== 9 &&
        c.dataEntregaPrevista < new Date().toISOString().slice(0, 10)
      ).length,
    }
  }, [tercs])

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── KPI Header ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[rgba(60,60,67,0.12)] bg-white px-5 pt-4 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <p className="text-[9.5px] uppercase tracking-wide font-semibold text-[#8E8E93]">Pedidos terceirizados</p>
          {kpis.late > 0 && (
            <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-[#FF3B30]/10 text-[#FF3B30]">
              {kpis.late} atrasado{kpis.late > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-3">

          <div className={`${CARD} p-3.5`}>
            <p className="text-[9px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-2.5">Aguardando</p>
            <p className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: kpis.nAguardando > 0 ? "#FF9500" : "#8E8E93" }}>
              {kpis.nAguardando}
            </p>
            <p className="text-[10px] text-[#8E8E93] mt-1 tabular-nums">{brl(kpis.vAguardando)}</p>
          </div>

          <div className={`${CARD} p-3.5`}>
            <p className="text-[9px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-2.5">Recebido</p>
            <p className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: kpis.nRecebido > 0 ? "#007AFF" : "#8E8E93" }}>
              {kpis.nRecebido}
            </p>
            <p className="text-[10px] text-[#8E8E93] mt-1 tabular-nums">{brl(kpis.vRecebido)}</p>
          </div>

          <div className={`${CARD} p-3.5`}>
            <p className="text-[9px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-2.5">Entregue ao cliente</p>
            <p className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: kpis.nEntregue > 0 ? "#34C759" : "#8E8E93" }}>
              {kpis.nEntregue}
            </p>
            <p className="text-[10px] text-[#8E8E93] mt-1 tabular-nums">{tercs.length} item{tercs.length !== 1 ? "s" : ""} no total</p>
          </div>

          <div className="rounded-xl p-3.5" style={{ background: "#1C1C1E" }}>
            <p className="text-[9px] uppercase tracking-wide font-semibold mb-2.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              Valor total
            </p>
            <p className="text-[16px] font-bold text-white tabular-nums leading-none">{brl(kpis.vTotal)}</p>
            <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{
                  width: kpis.vTotal > 0 ? `${Math.min((kpis.vRecebido + kpis.vTotal * 0.01) / kpis.vTotal * 100, 100)}%` : "0%",
                  background: "#34C759",
                }} />
            </div>
            <p className="text-[9px] mt-1.5 tabular-nums" style={{ color: "rgba(255,255,255,0.3)" }}>
              {brl(kpis.vAguardando)} em aberto
            </p>
          </div>

        </div>
      </div>

      {/* ── List ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

        {tercs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className={`${CARD} w-16 h-16 rounded-2xl flex items-center justify-center`}>
              <svg className="w-8 h-8 text-[#8E8E93]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-semibold text-[#1C1C1E]">Nenhum pedido terceirizado</p>
              <p className="text-sm text-[#8E8E93] mt-1 max-w-[220px] leading-relaxed">
                Itens adicionais criados via proposta aparecerão aqui.
              </p>
            </div>
          </div>
        )}

        {groups.map(group => {
          const groupTotal   = group.cards.reduce((s, c) => s + c.preco, 0)
          const groupEntregues = group.cards.filter(c => c.coluna === 9).length

          return (
            <div key={group.loteNumero} className="space-y-2.5">

              {/* Group header */}
              <div className="flex items-center gap-2.5 px-0.5">
                <span className="text-[10px] font-bold font-mono text-[#007AFF] bg-[#007AFF]/10 px-2 py-0.5 rounded-md">
                  {group.loteNumero}
                </span>
                <span className="text-[12px] font-semibold text-[#1C1C1E]">{group.nomeCliente}</span>
                <div className="flex-1 h-px bg-[rgba(60,60,67,0.08)]" />
                <span className="text-[10px] font-semibold tabular-nums text-[#8E8E93]">
                  {groupEntregues}/{group.cards.length} entregue{group.cards.length !== 1 ? "s" : ""}
                </span>
                <span className="text-[11px] font-bold tabular-nums text-[#1C1C1E]">
                  {brl(groupTotal)}
                </span>
              </div>

              {/* Cards */}
              {group.cards.map(card => (
                <TercCard
                  key={card.id}
                  card={card}
                  onMove={onMove}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )
        })}

      </div>
    </div>
  )
}
