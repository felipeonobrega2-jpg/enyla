"use client"

import { KanbanCard } from "../types"
import { brl, num } from "../utils"

const CARD = "bg-white border border-[rgba(0,0,0,0.06)] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]"

const STATUS = {
  aguardando: { label: "Aguardando fornecedor", short: "Aguardando", color: "#FF9500", bg: "rgba(255,149,0,0.1)",  nextCol: 8 },
  recebido:   { label: "Recebido do fornecedor", short: "Recebido",   color: "#007AFF", bg: "rgba(0,122,255,0.1)", nextCol: 9 },
  entregue:   { label: "Entregue ao cliente",    short: "Entregue",   color: "#34C759", bg: "rgba(52,199,89,0.1)", nextCol: null },
} as const

function colunaToStatus(coluna: number): keyof typeof STATUS {
  if (coluna === 9) return "entregue"
  if (coluna === 8) return "recebido"
  return "aguardando"
}

export function TerceirizadosView({
  kanban,
  onMove,
}: {
  kanban: KanbanCard[]
  onMove: (id: string, coluna: number) => void
}) {
  const tercs = kanban.filter(c => c.materialNome === "Terceirizado" && c.coluna !== 10)

  // Group by lote
  const byLote = new Map<string, { loteNumero: string; nomeCliente: string; cards: KanbanCard[] }>()
  for (const c of tercs) {
    const key = c.loteId ?? `__sem_lote__${c.nomeCliente}`
    if (!byLote.has(key)) {
      byLote.set(key, { loteNumero: c.loteNumero ?? "—", nomeCliente: c.nomeCliente, cards: [] })
    }
    byLote.get(key)!.cards.push(c)
  }
  const groups = Array.from(byLote.values()).sort((a, b) => a.loteNumero.localeCompare(b.loteNumero))

  const totalPendente  = tercs.filter(c => colunaToStatus(c.coluna) === "aguardando").length
  const totalRecebido  = tercs.filter(c => colunaToStatus(c.coluna) === "recebido").length
  const totalEntregue  = tercs.filter(c => colunaToStatus(c.coluna) === "entregue").length
  const valorPendente  = tercs.filter(c => colunaToStatus(c.coluna) === "aguardando").reduce((s, c) => s + c.preco, 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header strip */}
      <div className="shrink-0 border-b border-[rgba(60,60,67,0.12)] bg-white px-5 pt-4 pb-4 space-y-3">
        <p className="text-[9.5px] uppercase tracking-wide font-semibold text-[#8E8E93]">Pedidos terceirizados</p>
        <div className="grid grid-cols-4 gap-3">

          {/* Pendentes */}
          <div className={`${CARD} p-3.5`}>
            <p className="text-[9px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-3">Aguardando</p>
            <p className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: "#FF9500" }}>{totalPendente}</p>
            <p className="text-[10px] text-[#8E8E93] mt-1">pedido{totalPendente !== 1 ? "s" : ""}</p>
          </div>

          {/* Recebidos */}
          <div className={`${CARD} p-3.5`}>
            <p className="text-[9px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-3">Recebido</p>
            <p className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: "#007AFF" }}>{totalRecebido}</p>
            <p className="text-[10px] text-[#8E8E93] mt-1">do fornecedor</p>
          </div>

          {/* Entregues */}
          <div className={`${CARD} p-3.5`}>
            <p className="text-[9px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-3">Entregues</p>
            <p className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: "#34C759" }}>{totalEntregue}</p>
            <p className="text-[10px] text-[#8E8E93] mt-1">ao cliente</p>
          </div>

          {/* Valor pendente */}
          <div className="rounded-xl p-3.5" style={{ background: "#1C1C1E" }}>
            <p className="text-[9px] uppercase tracking-wide font-semibold mb-2.5" style={{ color: "rgba(255,255,255,0.4)" }}>Em aberto</p>
            <p className="text-[14px] font-bold text-white tabular-nums leading-tight">{brl(valorPendente)}</p>
            <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>aguardando fornecedor</p>
          </div>

        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {tercs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className={`${CARD} w-14 h-14 rounded-2xl flex items-center justify-center`}>
              <svg className="w-7 h-7 text-[#8E8E93]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
            </div>
            <p className="font-semibold text-[#1C1C1E]">Nenhum pedido terceirizado</p>
            <p className="text-sm text-[#8E8E93] text-center max-w-[240px]">
              Pedidos terceirizados aparecem aqui quando criados via proposta.
            </p>
          </div>
        )}

        {groups.map(group => (
          <div key={group.loteNumero} className="space-y-2">

            {/* Lote header */}
            <div className="flex items-center gap-2 px-0.5">
              <span className="text-[10.5px] uppercase tracking-wide font-bold text-[#8E8E93]">
                {group.loteNumero}
              </span>
              <span className="text-[10.5px] text-[#8E8E93]">·</span>
              <span className="text-[10.5px] font-semibold text-[#1C1C1E]">{group.nomeCliente}</span>
              <div className="flex-1 h-px bg-[rgba(60,60,67,0.08)]" />
              <span className="text-[9.5px] text-[#8E8E93]">{group.cards.length} item{group.cards.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Cards */}
            {group.cards.map(card => {
              const status = colunaToStatus(card.coluna)
              const s = STATUS[status]
              return (
                <div key={card.id} className={`${CARD} overflow-hidden`}>
                  <div className="px-4 py-3.5 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#1C1C1E] text-sm leading-snug">{card.dimensoes || card.numero}</p>
                      {card.quantidade > 0 && (
                        <p className="text-[#8E8E93] text-xs mt-0.5">{num(card.quantidade)} un</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[#1C1C1E] tabular-nums">{brl(card.preco)}</p>
                      <span className="text-[9.5px] font-semibold px-2 py-0.5 rounded-full mt-1 inline-block"
                        style={{ background: s.bg, color: s.color }}>
                        {s.short}
                      </span>
                    </div>
                  </div>

                  {/* Status progress */}
                  <div className="border-t border-[rgba(60,60,67,0.06)] px-4 py-3 flex items-center gap-2">
                    {(["aguardando", "recebido", "entregue"] as const).map((key, i) => {
                      const st = STATUS[key]
                      const done = (status === "recebido" && i <= 1) || status === "entregue"
                      const current = key === status
                      const isFirst = i === 0
                      return (
                        <div key={key} className="flex items-center gap-2 flex-1">
                          {!isFirst && (
                            <div className="h-px flex-1 rounded-full transition-colors"
                              style={{ background: done || (status === "recebido" && i === 2) ? "rgba(0,0,0,0.06)" : current ? st.color + "40" : "rgba(0,0,0,0.06)" }} />
                          )}
                          <button
                            disabled={current || (key === "entregue" && status === "aguardando")}
                            onClick={() => {
                              const col = key === "aguardando" ? 1 : key === "recebido" ? 8 : 9
                              onMove(card.id, col)
                            }}
                            className="flex flex-col items-center gap-1 group disabled:cursor-default"
                          >
                            <div className="w-6 h-6 rounded-full flex items-center justify-center transition-all"
                              style={{
                                background: current ? st.color : (status === "entregue" || (status === "recebido" && key === "aguardando")) ? st.bg : "rgba(0,0,0,0.04)",
                                border: current ? `2px solid ${st.color}` : "2px solid transparent",
                              }}>
                              {(current || status === "entregue" || (status === "recebido" && key === "aguardando")) ? (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                                  style={{ color: current ? "white" : st.color }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              ) : (
                                <div className="w-1.5 h-1.5 rounded-full bg-[rgba(0,0,0,0.15)]" />
                              )}
                            </div>
                            <span className="text-[8.5px] font-medium text-center leading-tight whitespace-nowrap"
                              style={{ color: current ? st.color : "rgba(60,60,67,0.4)" }}>
                              {key === "aguardando" ? "Pedido" : key === "recebido" ? "Recebido" : "Entregue"}
                            </span>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
