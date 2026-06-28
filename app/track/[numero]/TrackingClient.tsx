"use client"

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import type { TrackingEntry, TrackingEtapa } from '../../utils/tracking-store'

const ETAPAS = [
  { coluna: 1, label: "Pedido confirmado",    desc: "Seu pedido foi aprovado e entrou em nossa agenda.",    icon: "confirmed"  },
  { coluna: 2, label: "Arte em preparação",   desc: "Nossa equipe está criando o projeto gráfico da sua embalagem.", icon: "design" },
  { coluna: 3, label: "Arte para aprovação",  desc: "O arquivo será enviado para sua revisão e aprovação.", icon: "review"    },
  { coluna: 4, label: "Fila de produção",     desc: "Arte aprovada! Aguardando início da impressão.",       icon: "queue"     },
  { coluna: 5, label: "Em impressão",         desc: "Suas embalagens estão sendo impressas agora.",         icon: "print"     },
  { coluna: 6, label: "Acabamento UV",        desc: "Aplicando verniz UV para maior durabilidade e brilho.", icon: "uv"       },
  { coluna: 7, label: "Corte e colagem",      desc: "Corte, dobra e colagem das embalagens.",               icon: "cut"       },
  { coluna: 8, label: "Pedido pronto",         desc: "Seu pedido está pronto e aguardando retirada ou envio.", icon: "truck"     },
  { coluna: 9, label: "Entregue!",            desc: "Pedido entregue com sucesso. Obrigado pela confiança!", icon: "delivered" },
]

// Parse "dd/mm/yyyy, hh:mm:ss" → Date
function parseBRDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]))
}

function formatDateLong(d: Date) {
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
}

function calcDelivery(etapas: TrackingEtapa[], colunaAtual: number, override?: string | null) {
  // Manual override from internal system (YYYY-MM-DD)
  if (override) {
    const d = new Date(override + "T12:00:00")
    if (!isNaN(d.getTime())) {
      const isDeliveredNow = colunaAtual === 9
      return {
        text: formatDateLong(d),
        isEstimate: !isDeliveredNow,
        delivered: isDeliveredNow,
        isOverride: true,
      }
    }
  }
  // Delivered: show real delivery date
  const entregueEtapa = etapas.find(e => e.coluna === 9)
  if (entregueEtapa) {
    const d = parseBRDate(entregueEtapa.dataHora)
    if (d) return { text: formatDateLong(d), isEstimate: false, delivered: true, isOverride: false }
  }
  // Art approved: production queue entry (col 4) — usa a etapa de produção mais
  // antiga registrada (>= 4), pois o pedido pode ter saltado direto pra uma coluna
  // mais avançada sem nunca logar exatamente a coluna 4
  const producaoEtapa = etapas.filter(e => e.coluna >= 4).sort((a, b) => a.coluna - b.coluna)[0]
  if (producaoEtapa) {
    const d = parseBRDate(producaoEtapa.dataHora)
    if (d) {
      d.setDate(d.getDate() + 15)
      return { text: formatDateLong(d), isEstimate: true, delivered: false, isOverride: false }
    }
  }
  return null
}

function StepIcon({ icon, large, active }: { icon: string; large?: boolean; active?: boolean }) {
  const sz = large ? "w-7 h-7" : "w-4 h-4"
  const col = active ? "text-white" : "text-current"
  const icons: Record<string, React.ReactElement> = {
    confirmed: <svg className={`${sz} ${col}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>,
    design:    <svg className={`${sz} ${col}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"/></svg>,
    review:    <svg className={`${sz} ${col}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>,
    queue:     <svg className={`${sz} ${col}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"/></svg>,
    print:     <svg className={`${sz} ${col}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z"/></svg>,
    uv:        <svg className={`${sz} ${col}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/></svg>,
    cut:       <svg className={`${sz} ${col}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m7.848 8.25 1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 1 1-5.196 3 3 3 0 0 1 5.196-3Zm1.536-.887a2.165 2.165 0 0 0 1.083-1.838c.005-.352.054-.695.14-1.025m-1.223 2.863 2.077-1.199m0-3.328a4.323 4.323 0 0 1 2.068-1.379l5.325-1.628a4.5 4.5 0 0 1 2.363-.257L19.5 7.5"/></svg>,
    truck:     <svg className={`${sz} ${col}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"/></svg>,
    delivered: <svg className={`${sz} ${col}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>,
  }
  return <>{icons[icon] ?? icons.confirmed}</>
}

type Pagamento = {
  id: string
  valor: number
  status: "pendente" | "pago" | "atrasado"
  formaPagamento?: string
  dataVencimento: string
  dataPagamento?: string
}

interface Props {
  initialData: TrackingEntry | null
  numero: string
}

export default function TrackingClient({ initialData, numero }: Props) {
  const [data, setData]             = useState<TrackingEntry | null>(initialData)
  const [pagamentos, setPagamentos] = useState<Pagamento[]>((initialData as (TrackingEntry & { pagamentos?: Pagamento[] }) | null)?.pagamentos ?? [])
  const [lastUpdate, setLastUpdate] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  async function fetchData() {
    try {
      setRefreshing(true)
      const res = await fetch(`/api/track/${encodeURIComponent(numero)}`, { cache: 'no-store' })
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setPagamentos(json.pagamentos ?? [])
      }
      setLastUpdate(0)
    } catch { /* silent */ } finally { setRefreshing(false) }
  }

  useEffect(() => {
    const interval = setInterval(fetchData, 15000)
    const counter  = setInterval(() => setLastUpdate(s => s + 1), 1000)
    return () => { clearInterval(interval); clearInterval(counter) }
  }, [numero])

  if (!data) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "#F2F2F7" }}>
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-white border border-[rgba(0,0,0,0.06)] flex items-center justify-center mx-auto shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <svg className="w-8 h-8 text-[rgba(60,60,67,0.36)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
        </div>
        <p className="font-bold text-[#1C1C1E] text-lg">Pedido não encontrado</p>
        <p className="text-[#8E8E93] text-sm">Verifique o link enviado pela gráfica.</p>
        <p className="text-xs text-[rgba(60,60,67,0.36)] font-mono bg-[rgba(116,116,128,0.08)] px-3 py-1.5 rounded-lg inline-block">{numero}</p>
      </div>
    </div>
  )

  const currentIndex  = ETAPAS.findIndex(e => e.coluna === data.colunaAtual)
  const isCancelled   = data.colunaAtual === 10
  const isPending     = data.colunaAtual < 1
  const isDelivered   = data.colunaAtual === 9
  const totalSteps    = ETAPAS.length

  // Filter out etapas that were recorded after a backward move in the kanban
  const activeEtapas  = data.etapas.filter(e => e.coluna <= data.colunaAtual)
  const completedSteps = activeEtapas.length
  const progressPct   = Math.round((completedSteps / totalSteps) * 100)

  const delivery = calcDelivery(activeEtapas, data.colunaAtual, (data as TrackingEntry & { dataEntregaPrevista?: string }).dataEntregaPrevista)
  const artApproved = activeEtapas.some(e => e.coluna >= 4)

  const currentEtapa = currentIndex >= 0 ? ETAPAS[currentIndex] : null

  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  const num = (v: number) => v.toLocaleString("pt-BR")

  // Financial — use actual order price as reference total
  const totalPago     = pagamentos.filter(p => p.status === "pago").reduce((s, p) => s + p.valor, 0)
  const saldo         = Math.max(data.preco - totalPago, 0)
  const pagoPct       = data.preco > 0 ? Math.min((totalPago / data.preco) * 100, 100) : 0
  const hasPagamentos = pagamentos.length > 0

  function isCompleted(col: number) { return activeEtapas.some(e => e.coluna === col) }
  function getTS(col: number) { return activeEtapas.find(e => e.coluna === col)?.dataHora?.split(",")[0] ?? null }

  return (
    <div className="min-h-screen" style={{ background: "#F2F2F7" }}>

      {/* ── Sticky header ──────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[rgba(60,60,67,0.12)] sticky top-0 z-10">
        <div className="max-w-md mx-auto px-5 h-14 flex items-center gap-3">
          <div>
            <Image src="/brand/enyla-wordmark-dark.png" alt="Enyla" width={1335} height={328}
              className="h-4 w-auto" priority />
          </div>
          <div className="ml-auto">
            <span className="text-[10px] font-bold text-[#007AFF] bg-[#007AFF]/10 border border-[#007AFF]/20 px-2.5 py-1 rounded-full font-mono">{numero}</span>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-5 pb-10 space-y-4">

        {/* ── Greeting ───────────────────────────────────────────────── */}
        <div className="pt-1">
          <p className="text-[22px] font-bold text-[#1C1C1E] leading-snug tracking-[-0.01em]">
            Olá, {data.nomeCliente.split(" ")[0]}!
          </p>
          <p className="text-sm text-[#8E8E93] mt-0.5">Acompanhe o andamento do seu pedido abaixo.</p>
        </div>

        {/* ── Order summary card ─────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden flex">
          {/* Accent bar */}
          <div className="w-1 shrink-0" style={{ background: "#007AFF" }} />
          <div className="flex-1 min-w-0">
            <div className="px-4 pt-4 pb-3">
              <p className="font-bold text-[#1C1C1E] text-[15px] leading-snug">{data.descricao || "Embalagem personalizada"}</p>
              <p className="text-[#8E8E93] text-[12px] mt-0.5">{data.materialNome || "Material não especificado"}</p>
            </div>
            <div className="grid grid-cols-2 border-t border-[rgba(60,60,67,0.06)] divide-x divide-[rgba(60,60,67,0.06)]">
              <div className="px-4 py-3">
                <p className="text-[9px] uppercase tracking-wide text-[#8E8E93] font-semibold">Quantidade</p>
                <p className="text-[15px] font-semibold text-[#1C1C1E] tabular-nums mt-1">{num(data.quantidade)} un</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[9px] uppercase tracking-wide text-[#8E8E93] font-semibold">Valor</p>
                <p className="text-[15px] font-semibold text-[#1C1C1E] tabular-nums mt-1">{brl(data.preco)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Cancelled ──────────────────────────────────────────────── */}
        {isCancelled && (
          <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] p-5 text-center space-y-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="w-12 h-12 rounded-2xl bg-[rgba(116,116,128,0.08)] flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-[#8E8E93]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="font-bold text-[#1C1C1E]">Pedido encerrado</p>
            <p className="text-sm text-[#8E8E93]">Entre em contato com a gráfica para mais informações.</p>
          </div>
        )}

        {/* ── Pending (col 0) — Orçamento realizado ──────────────────── */}
        {isPending && !isCancelled && (
          <div className="rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]" style={{ background: "#007AFF" }}>
            {/* Top bar */}
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/70">Orçamento recebido</p>
                <p className="text-[11px] font-bold text-white/60 tabular-nums">0/{ETAPAS.length} etapas</p>
              </div>
              <div className="w-full h-1.5 bg-white/20 rounded-full" />
            </div>

            {/* Content */}
            <div className="px-5 py-5 flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-white/15">
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </div>
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-white/30 animate-ping" />
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-white/70" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-[17px] leading-snug">Aguardando confirmação</p>
                <p className="text-white/75 text-[12.5px] mt-1 leading-relaxed">
                  Seu orçamento foi recebido! A gráfica irá confirmar e iniciar a produção em breve.
                </p>
              </div>
            </div>

            {/* Info bar */}
            <div className="mx-4 mb-4 rounded-xl px-4 py-3 bg-white/10">
              <div className="flex items-start gap-2.5">
                <svg className="w-4 h-4 text-white/60 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <p className="text-white/70 text-[12.5px] leading-relaxed">
                  Após a aprovação da arte, a data prevista de entrega será calculada automaticamente.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Active / Delivered ─────────────────────────────────────── */}
        {!isCancelled && !isPending && currentEtapa && (
          <>
            {/* Status hero card */}
            <div className="rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              style={{ background: isDelivered ? "#34C759" : "#007AFF" }}>

              {/* Progress bar + label */}
              <div className="px-5 pt-4 pb-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-white/70">
                    {isDelivered ? "Concluído" : "Em andamento"}
                  </p>
                  <p className="text-[11px] font-bold text-white/80 tabular-nums">
                    {completedSteps}/{totalSteps} etapas
                  </p>
                </div>
                <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-700"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Current step */}
              <div className="px-5 py-5 flex items-center gap-4">
                {/* Icon with animated ring */}
                <div className="relative shrink-0">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-white/20">
                    <StepIcon icon={currentEtapa.icon} large active />
                  </div>
                  {!isDelivered && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-white/30 animate-ping" />
                  )}
                  {!isDelivered && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-white/70" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-[17px] leading-snug">{currentEtapa.label}</p>
                  <p className="text-white/75 text-[12.5px] mt-1 leading-relaxed">{currentEtapa.desc}</p>
                </div>
              </div>

              {/* Delivery date */}
              <div className={`mx-4 rounded-xl px-4 py-3 ${isDelivered ? "bg-white/20" : "bg-white/10"}`}
                style={{ marginBottom: hasPagamentos ? 10 : 16 }}>
                {delivery ? (
                  <div className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-white/80 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                    </svg>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-white/60">
                        {delivery.delivered ? "Data de entrega" : "Previsão de entrega"}
                      </p>
                      <p className="text-white font-semibold text-[13.5px] mt-0.5 capitalize">{delivery.text}</p>
                      {delivery.isEstimate && (
                        <p className="text-white/50 text-[10px] mt-0.5">Estimativa · pode variar conforme produção</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-white/50 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-white/50">Previsão de entrega</p>
                      <p className="text-white/70 text-[12.5px] mt-0.5 leading-relaxed">
                        {artApproved
                          ? "Calculando prazo…"
                          : "Após a aprovação da arte, a data prevista será calculada automaticamente."
                        }
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment progress */}
              {hasPagamentos && (
                <div className="mx-4 mb-4 bg-white/10 rounded-xl px-4 py-3">
                  <div className="flex items-baseline justify-between mb-2">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wide text-white/50 mb-0.5">Pago</p>
                      <p className="text-[16px] font-semibold text-emerald-300 tabular-nums leading-none">{brl(totalPago)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-white/50 mb-0.5">Restante</p>
                      <p className={`text-[16px] font-semibold tabular-nums leading-none ${saldo <= 0 ? "text-emerald-300" : "text-white/80"}`}>{brl(saldo)}</p>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pagoPct}%`, background: "#34C759" }} />
                  </div>
                  <p className="text-[9px] text-white/40 mt-1.5 text-center">
                    {saldo <= 0 ? "Pagamento completo ✓" : `${Math.round(pagoPct)}% quitado`}
                  </p>
                </div>
              )}
            </div>

            {/* ── Timeline ───────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[rgba(60,60,67,0.06)]">
                <p className="text-[10.5px] uppercase tracking-wide font-bold text-[#8E8E93]">
                  Detalhes do progresso
                </p>
              </div>
              <div className="px-5 py-4">
                <div className="space-y-0">
                  {ETAPAS.map((etapa, i) => {
                    const completed = isCompleted(etapa.coluna)
                    const current   = etapa.coluna === data.colunaAtual && !isCancelled
                    const ts        = getTS(etapa.coluna)
                    const isLast    = i === ETAPAS.length - 1
                    const isFuture  = !completed && !current
                    const isNext    = isFuture && currentIndex >= 0 && i === currentIndex + 1
                    const isNextNext = isFuture && currentIndex >= 0 && i === currentIndex + 2

                    return (
                      <div key={etapa.coluna} className="flex gap-3.5">
                        {/* Left: dot + connector */}
                        <div className="flex flex-col items-center">
                          {/* Dot */}
                          <div className={`relative flex items-center justify-center shrink-0 ${
                            current ? "w-8 h-8 -mx-1" : "w-6 h-6"
                          }`}>
                            {completed ? (
                              <div className="w-6 h-6 rounded-full flex items-center justify-center shadow-sm" style={{ background: "#34C759" }}>
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              </div>
                            ) : current ? (
                              <div className="relative w-8 h-8">
                                {/* Outer pulse ring */}
                                <div className="absolute inset-0 rounded-full animate-ping" style={{ background: isDelivered ? "rgba(52,199,89,0.3)" : "rgba(0,122,255,0.3)" }} />
                                <div className="relative w-8 h-8 rounded-full flex items-center justify-center shadow-md" style={{ background: isDelivered ? "#34C759" : "#007AFF" }}>
                                  <StepIcon icon={etapa.icon} active />
                                </div>
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
                              style={{ borderColor: isNext ? "rgba(60,60,67,0.36)" : "rgba(0,0,0,0.08)", background: "white" }}>
                                <div className="w-2 h-2 rounded-full" style={{ background: isNext ? "rgba(60,60,67,0.36)" : "rgba(0,0,0,0.08)" }} />
                              </div>
                            )}
                          </div>
                          {/* Connector line */}
                          {!isLast && (
                            <div className="w-0.5 flex-1 my-1 min-h-[16px] transition-colors rounded-full"
                              style={{ background: completed ? "rgba(52,199,89,0.5)" : current ? "rgba(0,122,255,0.2)" : "rgba(0,0,0,0.08)" }} />
                          )}
                        </div>

                        {/* Right: text */}
                        <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-3.5"} ${
                          current ? "pt-1" : ""
                        }`}>
                          <div className="flex items-center justify-between gap-2 min-h-[24px]">
                            <p className="text-[13px] font-semibold leading-tight" style={{
                              color: completed ? "#34C759" : current ? (isDelivered ? "#34C759" : "#1C1C1E") : isNext ? "#8E8E93" : "rgba(60,60,67,0.36)"
                            }}>
                              {etapa.label}
                            </p>
                            {ts && (
                              <span className="text-[10px] text-[#8E8E93] tabular-nums shrink-0">{ts}</span>
                            )}
                            {current && !ts && (
                              <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full shrink-0"
                                style={{ background: isDelivered ? "rgba(52,199,89,0.12)" : "rgba(0,122,255,0.12)", color: isDelivered ? "#34C759" : "#007AFF" }}>
                                {isDelivered ? "Concluído" : "Agora"}
                              </span>
                            )}
                          </div>
                          {/* Next step preview */}
                          {isNext && (
                            <p className="text-[11px] text-[#8E8E93] mt-0.5">Próxima etapa</p>
                          )}
                          {isNextNext && (
                            <p className="text-[11px] mt-0.5" style={{ color: "rgba(60,60,67,0.36)" }}>Em seguida</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Refresh bar ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-1 pt-1">
          <p className="text-[11px] text-[#8E8E93]">
            {refreshing ? "Atualizando…" : `Atualizado há ${lastUpdate}s`}
          </p>
          <button
            onClick={fetchData}
            className="text-[11px] font-medium flex items-center gap-1.5 transition-colors hover:opacity-80"
            style={{ color: "#007AFF" }}
          >
            <svg className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Atualizar agora
          </button>
        </div>

        <p className="text-center text-[10px] pb-2" style={{ color: "rgba(60,60,67,0.36)" }}>ENYLA · {numero}</p>

      </div>
    </div>
  )
}
