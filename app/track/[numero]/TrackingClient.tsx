"use client"

import { useState, useEffect } from 'react'
import { TrackingEntry } from '../../utils/tracking-store'

// Customer-visible stages (mapped from internal kanban columns)
const ETAPAS = [
  { coluna: 1, label: "Pedido confirmado",     desc: "Seu pedido foi aprovado e está em nossa agenda.",   cor: "emerald" },
  { coluna: 2, label: "Arte sendo preparada",  desc: "Nossa equipe prepara seu projeto gráfico.",         cor: "blue"    },
  { coluna: 3, label: "Em aprovação",          desc: "Projeto aguardando aprovação final.",               cor: "blue"    },
  { coluna: 4, label: "Na fila de produção",   desc: "Aguardando início da impressão.",                   cor: "blue"    },
  { coluna: 5, label: "Em impressão",          desc: "Suas embalagens estão sendo impressas.",            cor: "blue"    },
  { coluna: 6, label: "Acabamento UV",         desc: "Aplicando verniz UV nas embalagens.",               cor: "blue"    },
  { coluna: 7, label: "Acabamento final",      desc: "Corte, dobra e colagem das embalagens.",            cor: "blue"    },
  { coluna: 8, label: "Saiu para entrega",     desc: "Seu pedido está a caminho!",                        cor: "blue"    },
  { coluna: 9, label: "Entregue! 🎉",          desc: "Pedido entregue com sucesso. Obrigado!",            cor: "emerald" },
]

interface Props {
  initialData: TrackingEntry | null
  numero: string
}

export default function TrackingClient({ initialData, numero }: Props) {
  const [data, setData] = useState<TrackingEntry | null>(initialData)
  const [lastUpdate, setLastUpdate] = useState(0) // seconds ago
  const [refreshing, setRefreshing] = useState(false)

  async function fetchData() {
    try {
      setRefreshing(true)
      const res = await fetch(`/api/track/${encodeURIComponent(numero)}`, { cache: 'no-store' })
      if (res.ok) setData(await res.json())
      setLastUpdate(0)
    } catch {
      // silent
    } finally {
      setRefreshing(false)
    }
  }

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 15000)
    const counter  = setInterval(() => setLastUpdate(s => s + 1), 1000)
    return () => { clearInterval(interval); clearInterval(counter) }
  }, [numero])

  // Not found page
  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </div>
          <div>
            <p className="font-bold text-slate-800 text-lg">Pedido não encontrado</p>
            <p className="text-slate-400 text-sm mt-1">Verifique o link enviado pela gráfica.</p>
          </div>
          <p className="text-xs text-slate-300 font-mono">{numero}</p>
        </div>
      </div>
    )
  }

  // Determine current visible stage
  const currentEtapa = ETAPAS.findIndex(e => e.coluna === data.colunaAtual)
  const isCancelled = data.colunaAtual === 10
  const isPending   = data.colunaAtual < 1  // still in "orçamento realizado"

  void currentEtapa // used implicitly via isCurrent

  // Find completed timestamp for a stage
  function getTimestamp(coluna: number): string | null {
    return data!.etapas.find(e => e.coluna === coluna)?.dataHora?.split(",")[0] ?? null
  }

  function isCompleted(etapaColuna: number): boolean {
    return data!.etapas.some(e => e.coluna === etapaColuna)
  }

  function isCurrent(index: number): boolean {
    return ETAPAS[index].coluna === data!.colunaAtual && !isCancelled
  }

  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  const num = (v: number) => v.toLocaleString("pt-BR")

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-5 py-3.5 flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm leading-none">ENYLA</p>
            <p className="text-slate-400 text-[10px] mt-0.5">Comunicação Visual</p>
          </div>
          <div className="ml-auto">
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-full font-mono">{numero}</span>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 py-6 space-y-5">

        {/* Greeting */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] font-bold text-slate-400">Acompanhamento de pedido</p>
          <p className="text-xl font-bold text-slate-900 mt-1">Olá, {data.nomeCliente.split(" ")[0]}! 👋</p>
          <p className="text-sm text-slate-500 mt-1">Veja abaixo o andamento do seu pedido.</p>
        </div>

        {/* Order summary card */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 text-sm truncate">{data.descricao || "Embalagem personalizada"}</p>
              <p className="text-slate-400 text-xs mt-0.5">{data.materialNome}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-50">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Quantidade</p>
              <p className="text-sm font-bold text-slate-800 tabular-nums mt-0.5">{num(data.quantidade)} un</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Valor</p>
              <p className="text-sm font-bold text-slate-800 tabular-nums mt-0.5">{brl(data.preco)}</p>
            </div>
          </div>
        </div>

        {/* Cancelled state */}
        {isCancelled && (
          <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5 text-center space-y-2">
            <p className="text-2xl">📋</p>
            <p className="font-bold text-slate-700">Pedido encerrado</p>
            <p className="text-sm text-slate-400">Entre em contato com a gráfica para mais informações.</p>
          </div>
        )}

        {/* Pending state (col 0) */}
        {isPending && !isCancelled && (
          <div className="bg-amber-50 rounded-2xl border border-amber-100 p-5 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
              <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <p className="font-bold text-amber-800 text-sm">Aguardando confirmação</p>
            <p className="text-xs text-amber-600">Seu orçamento foi recebido e está sendo analisado.</p>
          </div>
        )}

        {/* Timeline */}
        {!isCancelled && !isPending && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.12em] font-bold text-slate-400 mb-5">Progresso do pedido</p>
            <div className="space-y-0">
              {ETAPAS.map((etapa, i) => {
                const completed = isCompleted(etapa.coluna)
                const current   = isCurrent(i)
                const ts        = getTimestamp(etapa.coluna)
                const isLast    = i === ETAPAS.length - 1
                const nextCompleted = i < ETAPAS.length - 1 && isCompleted(ETAPAS[i + 1].coluna)

                return (
                  <div key={etapa.coluna} className="flex gap-4">
                    {/* Left: circle + line */}
                    <div className="flex flex-col items-center">
                      {/* Circle */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 ${
                        completed
                          ? "bg-emerald-500 shadow-sm shadow-emerald-200"
                          : current
                          ? "bg-blue-600 shadow-sm shadow-blue-200 ring-4 ring-blue-100"
                          : "bg-white border-2 border-slate-200"
                      }`}>
                        {completed ? (
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        ) : current ? (
                          <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-slate-300" />
                        )}
                      </div>
                      {/* Connecting line */}
                      {!isLast && (
                        <div className={`w-0.5 flex-1 my-1 min-h-[20px] ${
                          completed && nextCompleted ? "bg-emerald-300" :
                          completed ? "bg-gradient-to-b from-emerald-300 to-slate-200" :
                          "bg-slate-100"
                        }`} />
                      )}
                    </div>

                    {/* Right: content */}
                    <div className={`flex-1 pb-5 ${isLast ? "pb-0" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`text-[13.5px] font-semibold leading-tight ${
                            completed ? "text-emerald-700" :
                            current   ? "text-slate-900" :
                                        "text-slate-400"
                          }`}>
                            {etapa.label}
                          </p>
                          {current && (
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{etapa.desc}</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          {completed && ts ? (
                            <span className="text-[10.5px] text-slate-400 tabular-nums">{ts}</span>
                          ) : current ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 animate-pulse">
                              Em andamento
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Refresh bar */}
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] text-slate-400">
            {refreshing ? "Atualizando..." : `Atualizado há ${lastUpdate}s`}
          </p>
          <button onClick={fetchData}
            className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 transition-colors">
            <svg className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Atualizar agora
          </button>
        </div>

        {/* Contact */}
        <div className="pb-6">
          <a
            href="https://wa.me/"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold text-sm rounded-2xl transition-colors shadow-sm shadow-green-900/10"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.847L0 24l6.335-1.502A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.373l-.36-.214-3.724.882.897-3.63-.235-.374A9.817 9.817 0 0 1 2.182 12c0-5.42 4.398-9.818 9.818-9.818 5.42 0 9.818 4.398 9.818 9.818 0 5.42-4.398 9.818-9.818 9.818z"/>
            </svg>
            Falar com a gráfica
          </a>
          <p className="text-center text-[10px] text-slate-300 mt-3">ENYLA Comunicação Visual · {numero}</p>
        </div>
      </div>
    </div>
  )
}
