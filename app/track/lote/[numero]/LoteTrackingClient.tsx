"use client"

import React, { useState, useEffect } from "react"

const ETAPAS = [
  { coluna: 1, label: "Pedido confirmado" },
  { coluna: 2, label: "Arte em preparação" },
  { coluna: 3, label: "Arte para aprovação" },
  { coluna: 4, label: "Fila de produção" },
  { coluna: 5, label: "Em impressão" },
  { coluna: 6, label: "Acabamento UV" },
  { coluna: 7, label: "Corte e colagem" },
  { coluna: 8, label: "Saiu para entrega" },
  { coluna: 9, label: "Entregue!" },
]

type LoteCard = {
  id: string
  numero: string
  nomeCliente: string
  dimensoes: string
  materialNome: string
  preco: number
  quantidade: number
  coluna: number
  data: string
}

type Lote = {
  id: string
  numero: string
  nomeCliente: string
  descricao?: string
  criadoEm: string
}

interface Props {
  initialLote: Lote | null
  initialCards: LoteCard[]
  loteNumero: string
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const num = (v: number) => v.toLocaleString("pt-BR")

function etapaLabel(coluna: number): string {
  if (coluna === 0) return "Aguardando confirmação"
  if (coluna === 10) return "Cancelado"
  return ETAPAS.find(e => e.coluna === coluna)?.label ?? `Etapa ${coluna}`
}

function etapaColor(coluna: number): string {
  if (coluna === 0) return "bg-violet-100 text-violet-700"
  if (coluna === 9) return "bg-emerald-100 text-emerald-700"
  if (coluna === 10) return "bg-slate-100 text-slate-500"
  return "bg-blue-100 text-blue-700"
}

function CardProgress({ card }: { card: LoteCard }) {
  const isPerdido = card.coluna === 10
  const isEntregue = card.coluna === 9
  const progressPct = card.coluna === 0
    ? 0
    : card.coluna >= 9
    ? 100
    : Math.round(((card.coluna - 1) / 8) * 100)

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
      isPerdido ? "border-slate-100 opacity-60" : isEntregue ? "border-emerald-100" : "border-slate-100"
    }`}>
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-slate-800 text-sm leading-tight truncate">{card.dimensoes} cm</p>
              {card.numero && (
                <span className="text-[9.5px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full tabular-nums">
                  {card.numero}
                </span>
              )}
            </div>
            <p className="text-slate-400 text-xs mt-0.5">{card.materialNome}</p>
          </div>
          <span className={`text-[9.5px] font-bold px-2 py-1 rounded-full shrink-0 ${etapaColor(card.coluna)}`}>
            {etapaLabel(card.coluna)}
          </span>
        </div>

        {/* Progress bar */}
        {!isPerdido && (
          <div className="mt-3">
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${isEntregue ? "bg-emerald-500" : "bg-blue-500"}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 border-t border-slate-50 divide-x divide-slate-50">
        <div className="px-4 py-2.5">
          <p className="text-[9.5px] uppercase tracking-wider text-slate-400 font-semibold">Quantidade</p>
          <p className="text-sm font-bold text-slate-800 tabular-nums mt-0.5">{num(card.quantidade)} un</p>
        </div>
        <div className="px-4 py-2.5">
          <p className="text-[9.5px] uppercase tracking-wider text-slate-400 font-semibold">Valor</p>
          <p className="text-sm font-bold text-slate-800 tabular-nums mt-0.5">{brl(card.preco)}</p>
        </div>
      </div>
    </div>
  )
}

export default function LoteTrackingClient({ initialLote, initialCards, loteNumero }: Props) {
  const [lote, setLote] = useState<Lote | null>(initialLote)
  const [cards, setCards] = useState<LoteCard[]>(initialCards)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(0)

  async function fetchData() {
    try {
      setRefreshing(true)
      const res = await fetch(`/api/track/lote/${encodeURIComponent(loteNumero)}`, { cache: "no-store" })
      if (res.ok) {
        const d = await res.json()
        if (d.lote) setLote(d.lote)
        if (d.cards) setCards(d.cards)
      }
      setLastUpdate(0)
    } catch { /* silent */ } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const interval = setInterval(fetchData, 15000)
    const counter = setInterval(() => setLastUpdate(s => s + 1), 1000)
    return () => { clearInterval(interval); clearInterval(counter) }
  }, [loteNumero])

  if (!lote) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-white border border-slate-100 flex items-center justify-center mx-auto shadow-sm">
            <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </div>
          <p className="font-bold text-slate-800 text-lg">Lote não encontrado</p>
          <p className="text-slate-400 text-sm">Verifique o link enviado pela gráfica.</p>
          <p className="text-xs text-slate-300 font-mono bg-slate-100 px-3 py-1.5 rounded-lg inline-block">{loteNumero}</p>
        </div>
      </div>
    )
  }

  const activeCards = cards.filter(c => c.coluna !== 10)
  const totalValor = activeCards.reduce((s, c) => s + c.preco, 0)
  const totalQtd = activeCards.reduce((s, c) => s + c.quantidade, 0)
  const allEntregue = activeCards.length > 0 && activeCards.every(c => c.coluna === 9)
  const minColuna = activeCards.length > 0 ? Math.min(...activeCards.map(c => c.coluna)) : 0
  const overallPct = minColuna === 0 ? 0 : minColuna >= 9 ? 100 : Math.round(((minColuna - 1) / 8) * 100)

  return (
    <div className="min-h-screen bg-[#f8fafc]">

      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-5 h-14 flex items-center gap-3">
          <div>
            <p className="font-bold text-slate-900 text-base tracking-tight leading-none">ENYLA</p>
            <p className="text-slate-400 text-[10px] mt-0.5 tracking-wide">Comunicação Visual</p>
          </div>
          <div className="ml-auto">
            <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-100 px-2.5 py-1 rounded-full font-mono">
              {loteNumero}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-5 pb-10 space-y-4">

        {/* Greeting */}
        <div className="pt-1">
          <p className="text-[22px] font-bold text-slate-900 leading-snug">
            Olá, {lote.nomeCliente.split(" ")[0]}!
          </p>
          <p className="text-sm text-slate-500 mt-0.5">Acompanhe o andamento do seu pedido abaixo.</p>
        </div>

        {/* Lote summary */}
        <div className={`rounded-2xl overflow-hidden shadow-sm ${
          allEntregue
            ? "bg-gradient-to-br from-emerald-500 to-emerald-600"
            : "bg-gradient-to-br from-violet-600 to-violet-700"
        }`}>
          <div className="px-5 pt-4 pb-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/70">
                {allEntregue ? "Concluído" : "Em andamento"}
              </p>
              <p className="text-[11px] font-bold text-white/80 tabular-nums">
                {cards.filter(c => c.coluna === 9).length}/{activeCards.length} produtos entregues
              </p>
            </div>
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-700"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-0 mx-4 mb-4 mt-3 bg-white/10 rounded-xl overflow-hidden divide-x divide-white/10">
            <div className="px-3 py-3 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/60 mb-1">Produtos</p>
              <p className="text-xl font-black text-white tabular-nums">{activeCards.length}</p>
            </div>
            <div className="px-3 py-3 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/60 mb-1">Unidades</p>
              <p className="text-xl font-black text-white tabular-nums">{num(totalQtd)}</p>
            </div>
            <div className="px-3 py-3 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/60 mb-1">Total</p>
              <p className="text-[15px] font-black text-white tabular-nums leading-tight mt-0.5">{brl(totalValor)}</p>
            </div>
          </div>
        </div>

        {/* Cards */}
        <div className="space-y-3">
          <p className="text-[10.5px] uppercase tracking-[0.12em] font-bold text-slate-400 px-1">
            Pedidos neste lote
          </p>
          {cards.map(card => (
            <CardProgress key={card.id} card={card} />
          ))}
          {cards.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">
              Nenhum produto encontrado neste lote.
            </div>
          )}
        </div>

        {/* Refresh */}
        <div className="flex items-center justify-between px-1 pt-1">
          <p className="text-[11px] text-slate-400">
            {refreshing ? "Atualizando…" : `Atualizado há ${lastUpdate}s`}
          </p>
          <button
            onClick={fetchData}
            className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1.5 transition-colors"
          >
            <svg className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Atualizar agora
          </button>
        </div>

        <p className="text-center text-[10px] text-slate-300 pb-2">ENYLA Comunicação Visual · {loteNumero}</p>
      </div>
    </div>
  )
}
