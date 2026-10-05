"use client"

import { useEffect, useState } from "react"
import { Cliente, KanbanCard, LancamentoFinanceiro, PropostaCustom, COLUNAS_KANBAN, COL_FECHADO, COL_PERDIDO } from "../types"
import { brl, num } from "../utils"
import { HistItem } from "./HistoricoView"
import { COL_COLORS } from "./kanban-colors"
import { hoje, isReceitaPendenteValida, isAtrasada, calcularPedidosFechados, pedidosAbertos } from "../lib/financeiro"

interface MetaCampanha { id: string; nome: string }

function parseDataBR(dataBR: string): Date | null {
  const [d, m, a] = dataBR.split(",")[0].split("/")
  if (!d || !m || !a) return null
  return new Date(Number(a), Number(m) - 1, Number(d))
}

function diasDesde(dataBR: string) {
  const dt = parseDataBR(dataBR)
  if (!dt) return null
  return Math.floor((Date.now() - dt.getTime()) / 86_400_000)
}

function dataPedido(c: KanbanCard): Date | null {
  if (c.dataFechamento) return new Date(`${c.dataFechamento}T00:00:00`)
  return parseDataBR(c.data)
}

function isFechado(card: KanbanCard) {
  return card.coluna >= COL_FECHADO && card.coluna !== COL_PERDIDO
}

export function ClientePerfilModal({
  nome, cadastro, itens, propostas, kanban, lancamentos,
  onClose, onReplicar, onWhatsApp, onSave,
}: {
  nome: string
  cadastro?: Cliente | null
  itens: HistItem[]
  propostas: PropostaCustom[]
  kanban: KanbanCard[]
  lancamentos: LancamentoFinanceiro[]
  onClose: () => void
  onReplicar: (item: HistItem) => void
  onWhatsApp: (item: HistItem) => void
  onSave?: (updates: Partial<Cliente>) => void
}) {
  const [campanhas, setCampanhas]     = useState<MetaCampanha[]>([])
  const [loadingCamp, setLoadingCamp] = useState(false)
  const [savingOrigem, setSavingOrigem] = useState(false)

  useEffect(() => {
    let hiddenIds: Set<string> = new Set()
    try {
      const stored = localStorage.getItem("meta_hidden_campaigns")
      if (stored) hiddenIds = new Set(JSON.parse(stored) as string[])
    } catch { /* ignore */ }

    setLoadingCamp(true)
    fetch("/api/meta?preset=maximum")
      .then(r => r.json())
      .then(d => {
        if (d.campaigns) {
          setCampanhas(
            (d.campaigns as { campaign_id: string; campaign_name: string; info?: { status: string } | null }[])
              .filter(c => !!c.campaign_name && !hiddenIds.has(c.campaign_id))
              .map(c => ({ id: c.campaign_id, nome: c.campaign_name }))
          )
        }
      })
      .catch(() => {})
      .finally(() => setLoadingCamp(false))
  }, [])

  const precoIdeal = (item: HistItem) => {
    const ideal = item.calculo.tabela.find(l => l.quantidade === item.calculo.sweetSpotIdealQtd) ?? item.calculo.tabela[0]
    return item.form.comFaca ? (ideal?.precoComFaca ?? 0) : (ideal?.precoSemFaca ?? 0)
  }

  // Inclui cards vinculados por historico/proposta E cards com o mesmo nomeCliente
  const cardsCliente = kanban.filter(c =>
    c.nomeCliente.trim().toLowerCase() === nome.toLowerCase() ||
    itens.some(i => i.numero && i.numero === c.numero) ||
    propostas.some(p => p.cardId && p.cardId === c.id)
  )
  const cardsFechados = cardsCliente.filter(isFechado)

  // Lote-deduped: cada lote = 1 pedido (terceirizados incluídos — são vendas reais)
  const vendas = (() => {
    const loteIds = new Set(cardsFechados.filter(c => c.loteId).map(c => c.loteId!))
    return loteIds.size + cardsFechados.filter(c => !c.loteId).length
  })()
  const perdidos  = cardsCliente.filter(c => c.coluna === COL_PERDIDO).length
  const decididos = vendas + perdidos
  const conversao = decididos > 0 ? Math.round((vendas / decididos) * 100) : null

  // Frequência: eventos de pedido únicos (lote = 1 evento, não múltiplos cards)
  const orderEventDates: Date[] = []
  const seenLotesFreq = new Set<string>()
  for (const c of [...cardsFechados].sort((a, b) => (dataPedido(a)?.getTime() ?? 0) - (dataPedido(b)?.getTime() ?? 0))) {
    if (c.loteId) {
      if (!seenLotesFreq.has(c.loteId)) {
        seenLotesFreq.add(c.loteId)
        const d = dataPedido(c)
        if (d) orderEventDates.push(d)
      }
    } else {
      const d = dataPedido(c)
      if (d) orderEventDates.push(d)
    }
  }
  orderEventDates.sort((a, b) => a.getTime() - b.getTime())
  const frequenciaDias = orderEventDates.length >= 2
    ? Math.round((orderEventDates[orderEventDates.length - 1].getTime() - orderEventDates[0].getTime()) / 86_400_000 / (orderEventDates.length - 1))
    : null

  const lancCliente = lancamentos.filter(l => (l.nomeCliente ?? "").trim().toLowerCase() === nome.toLowerCase())
  const pendentes = lancCliente.filter(isReceitaPendenteValida)
  const emAtraso  = lancCliente.filter(isAtrasada).reduce((s, l) => s + l.valor, 0)

  const aReceber = pedidosAbertos(calcularPedidosFechados(kanban, lancamentos))
    .filter(p => p.cliente.trim().toLowerCase() === nome.toLowerCase())
    .reduce((s, p) => s + p.restante, 0)

  const ltv         = cardsFechados.reduce((s, c) => s + c.preco, 0)
  const ticketMedio = vendas > 0 ? ltv / vendas : 0

  // Pedidos fechados agrupados por lote (ou card individual)
  type PedidoGroup = {
    key: string
    label: string          // lote numero ou ORC numero
    itens: HistItem[]
    cards: KanbanCard[]
    pago: number
    restante: number
    total: number
  }

  const allPedFechados = calcularPedidosFechados(kanban, lancamentos)
  const pedidoGroupsMap = new Map<string, PedidoGroup>()

  for (const item of itens) {
    const card = kanban.find(c => item.numero && c.numero === item.numero)
    if (!card || !isFechado(card)) continue
    const key = card.loteId ? `lote-${card.loteId}` : `card-${card.id}`
    if (!pedidoGroupsMap.has(key)) {
      pedidoGroupsMap.set(key, {
        key,
        label: card.loteNumero ?? card.numero ?? item.numero ?? "—",
        itens: [],
        cards: [],
        pago: 0,
        restante: 0,
        total: 0,
      })
    }
    const g = pedidoGroupsMap.get(key)!
    g.itens.push(item)
    if (!g.cards.some(c => c.id === card.id)) g.cards.push(card)
  }

  for (const g of pedidoGroupsMap.values()) {
    const pf = allPedFechados.find(p => p.key === g.key)
    if (pf) { g.pago = pf.pago; g.restante = pf.restante; g.total = pf.total }
  }

  const pedidoGroups = Array.from(pedidoGroupsMap.values())

  const itensOrcamento = itens.filter(item => {
    const card = kanban.find(c => item.numero && c.numero === item.numero)
    return !card || !isFechado(card)
  })
  const propostasOrcamento = propostas.filter(p => {
    const card = p.cardId ? kanban.find(c => c.id === p.cardId) : null
    return !card || !isFechado(card)
  })
  const propostasFechadas = propostas.filter(p => {
    const card = p.cardId ? kanban.find(c => c.id === p.cardId) : null
    return card && isFechado(card)
  })

  const datas = [...itens.map(i => i.data), ...propostas.map(p => p.data)].filter(Boolean)
  const ultimaData = datas[0] ?? null
  const dias = ultimaData ? diasDesde(ultimaData) : null
  const inicial = nome[0]?.toUpperCase() ?? "#"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col overflow-hidden"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", maxHeight: "90vh" }}
      >

        {/* Header */}
        <div className="px-6 pt-5 pb-4 shrink-0 flex items-start gap-4"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold"
            style={{ background: "#8456e8" }}>
            {inicial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] leading-snug truncate" style={{ color: "var(--text-main)" }}>{nome}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[11px]" style={{ color: "var(--text-faint)" }}>
              {cadastro?.telefone && <span>{cadastro.telefone}</span>}
              {cadastro?.email && <span>· {cadastro.email}</span>}
              {!cadastro && <span className="italic">Sem cadastro</span>}
            </div>
            {dias !== null && (
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                Última atividade {dias === 0 ? "hoje" : `há ${dias} dia${dias !== 1 ? "s" : ""}`}
              </p>
            )}
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-lg leading-none transition-colors shrink-0"
            style={{ background: "var(--bg-alt)", color: "var(--text-faint)" }}>
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 pb-5">

          {/* KPIs — 3 colunas × 2 linhas */}
          <div className="grid grid-cols-3 gap-2 px-6 pt-5">
            <Kpi label="Em aberto" value={brl(aReceber)} color={aReceber > 0 ? "amber" : undefined} />
            <Kpi label="Em atraso" value={brl(emAtraso)} color={emAtraso > 0 ? "rose" : undefined} />
            <Kpi label="Total LTV" value={brl(ltv)} />
            <Kpi label="Ticket médio" value={brl(ticketMedio)} />
            <Kpi label="Conversão" value={conversao !== null ? `${conversao}%` : "—"}
              color={conversao !== null ? (conversao >= 60 ? "green" : conversao >= 35 ? "amber" : "rose") : undefined} />
            <Kpi label="Frequência" value={frequenciaDias !== null ? `${frequenciaDias}d` : "—"}
              sub={frequenciaDias !== null ? "entre pedidos" : vendas > 0 ? "1º pedido" : undefined} />
          </div>

          {/* Origem (campanha Meta Ads) */}
          {onSave && cadastro && (
            <div className="px-6 pt-4">
              <SectionLabel>Origem</SectionLabel>
              <div className="relative flex-1 mt-2">
                <select
                  value={cadastro.origemCampanhaId ?? ""}
                  disabled={loadingCamp || savingOrigem}
                  onChange={async e => {
                    const id = e.target.value || null
                    const campanha = campanhas.find(c => c.id === id)
                    setSavingOrigem(true)
                    await onSave({
                      origemCampanhaId:   id,
                      origemCampanhaNome: campanha?.nome ?? null,
                    })
                    setSavingOrigem(false)
                  }}
                  className="w-full appearance-none rounded-xl pl-3 pr-8 py-2.5 text-[12.5px] focus:outline-none focus:ring-2 disabled:opacity-50 transition-colors"
                  style={{
                    background: "var(--bg-alt)",
                    border: "1px solid var(--border)",
                    color: "var(--text-main)",
                  }}>
                  <option value="">Sem origem definida</option>
                  {campanhas.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none w-3 h-3"
                  style={{ color: "var(--text-faint)" }} viewBox="0 0 12 12" fill="none">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          )}

          {/* Notas */}
          {cadastro?.notas && (
            <div className="px-6 pt-4">
              <SectionLabel>Notas</SectionLabel>
              <p className="text-[12px] leading-relaxed mt-2" style={{ color: "var(--text-sub)" }}>{cadastro.notas}</p>
            </div>
          )}

          {/* Pendências financeiras */}
          {pendentes.length > 0 && (
            <div className="px-6 pt-5">
              <SectionLabel>Pendências financeiras</SectionLabel>
              <div className="mt-2 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                {pendentes.slice(0, 6).map(l => {
                  const atrasado = l.dataVencimento < hoje()
                  return (
                    <div key={l.id} className="px-4 py-2.5 flex items-center gap-3"
                      style={{ borderBottom: "1px solid var(--border)" }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate" style={{ color: "var(--text-main)" }}>{l.descricao}</p>
                        <p className="text-[10.5px] mt-0.5" style={{ color: "var(--text-faint)" }}>Vence {l.dataVencimento}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                        atrasado ? "border-rose-500/30 bg-rose-500/10 text-rose-400" : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                      }`}>
                        {atrasado ? "Atrasado" : "Pendente"}
                      </span>
                      <p className="font-bold text-[12.5px] tabular-nums shrink-0" style={{ color: "var(--text-main)" }}>{brl(l.valor)}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Pedidos fechados (agrupados por lote) ── */}
          {(pedidoGroups.length > 0 || propostasFechadas.length > 0) && (
            <div className="px-6 pt-5">
              <SectionLabel>Pedidos ({pedidoGroups.length + propostasFechadas.length})</SectionLabel>
              <div className="mt-2 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                {pedidoGroups.map(g => {
                  const repCard = [...g.cards].sort((a, b) => b.coluna - a.coluna)[0]
                  const colIdx = repCard.coluna
                  const statusLabel  = COLUNAS_KANBAN[colIdx] as string
                  const statusColors = COL_COLORS[colIdx]
                  const totalOrcamentos = g.cards.reduce((s, c) => s + c.preco, 0)
                  return (
                    <div key={g.key} className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                      {/* Cabeçalho: lote + status + total */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(132,86,232,0.12)", color: "#8456e8", border: "1px solid rgba(132,86,232,0.2)" }}>
                          {g.label}
                        </span>
                        {statusColors && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${statusColors.badge}`}>
                            {statusLabel}
                          </span>
                        )}
                        <div className="flex-1" />
                        <p className="text-[13px] font-bold tabular-nums" style={{ color: "var(--text-main)" }}>
                          {brl(totalOrcamentos > 0 ? totalOrcamentos : g.total)}
                        </p>
                      </div>

                      {/* Orçamentos dentro do lote */}
                      <div className="mt-1.5 space-y-0.5 pl-1">
                        {g.itens.map((item, i) => {
                          const card = g.cards.find(c => c.numero === item.numero)
                          const qtd = card?.quantidade ?? item.calculo.sweetSpotIdealQtd ?? item.calculo.tabela[0]?.quantidade
                          return (
                            <p key={i} className="text-[11px]" style={{ color: "var(--text-sub)" }}>
                              <span style={{ color: "var(--text-faint)" }}>{item.numero}</span>
                              {" · "}{item.form.frente}×{item.form.alturaBox}×{item.form.lateral} cm · {item.form.materialNome}
                              {qtd ? <span style={{ color: "var(--text-faint)" }}> · {num(qtd)} un</span> : null}
                            </p>
                          )
                        })}
                      </div>

                      {/* Pago / Restante + ações */}
                      <div className="flex items-center gap-4 mt-2.5">
                        <span className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                          Pago: <span className="font-semibold" style={{ color: "#34d399" }}>{brl(g.pago)}</span>
                        </span>
                        {g.restante > 0.01 && (
                          <span className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                            Restante: <span className="font-semibold" style={{ color: "#fbbf24" }}>{brl(g.restante)}</span>
                          </span>
                        )}
                        {g.restante <= 0.01 && g.pago > 0 && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }}>
                            Quitado
                          </span>
                        )}
                        <div className="flex-1" />
                        <div className="flex gap-1.5">
                          <button onClick={() => g.itens[0] && onWhatsApp(g.itens[0])}
                            className="px-2.5 py-1.5 text-white text-[10px] font-medium rounded-lg transition-colors"
                            style={{ background: "#009351" }}>
                            WhatsApp
                          </button>
                          <button onClick={() => g.itens[0] && onReplicar(g.itens[0])}
                            className="px-2.5 py-1.5 text-[10px] font-medium rounded-lg transition-colors"
                            style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", color: "var(--text-main)" }}>
                            Replicar
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {propostasFechadas.map(p => {
                  const card = kanban.find(c => c.id === p.cardId)!
                  const colIdx = card.coluna
                  const statusLabel  = COLUNAS_KANBAN[colIdx]
                  const statusColors = COL_COLORS[colIdx]
                  const ativas = p.linhas.filter(l => l.ativa && l.quantidade > 0)
                  const ideal  = ativas.find(l => l.isIdeal) ?? ativas[ativas.length - 1]
                  const preco  = card.preco > 0 ? card.preco : (ideal ? ideal.unitario * ideal.quantidade : 0)
                  const pf = allPedFechados.find(f => f.key === `card-${card.id}`)
                  return (
                    <div key={p.id} className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(132,86,232,0.12)", color: "#8456e8", border: "1px solid rgba(132,86,232,0.2)" }}>
                          {card.loteNumero ?? p.numero}
                        </span>
                        {statusColors && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${statusColors.badge}`}>
                            {statusLabel as string}
                          </span>
                        )}
                        <div className="flex-1" />
                        <p className="text-[13px] font-bold tabular-nums" style={{ color: "var(--text-main)" }}>
                          {preco > 0 ? brl(preco) : "—"}
                        </p>
                      </div>
                      <p className="text-[11px] mt-1.5 pl-1" style={{ color: "var(--text-sub)" }}>
                        {[p.descricao, p.dimensoes, p.material].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {pf && (
                        <div className="flex items-center gap-4 mt-2.5">
                          <span className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                            Pago: <span className="font-semibold" style={{ color: "#34d399" }}>{brl(pf.pago)}</span>
                          </span>
                          {pf.restante > 0.01 && (
                            <span className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                              Restante: <span className="font-semibold" style={{ color: "#fbbf24" }}>{brl(pf.restante)}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Orçamentos ── */}
          {(itensOrcamento.length > 0 || propostasOrcamento.length > 0) && (
            <div className="px-6 pt-5">
              <SectionLabel>Orçamentos ({itensOrcamento.length + propostasOrcamento.length})</SectionLabel>
              <div className="mt-2 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                {itensOrcamento.map((item, i) => {
                  const card = kanban.find(c => item.numero && c.numero === item.numero)
                  const colIdx = card?.coluna ?? null
                  const statusLabel  = colIdx !== null ? COLUNAS_KANBAN[colIdx] : null
                  const statusColors = colIdx !== null ? COL_COLORS[colIdx] : null
                  return (
                    <ItemRow
                      key={i}
                      numero={item.numero}
                      descricao={`${item.form.frente}×${item.form.alturaBox}×${item.form.lateral} cm · ${item.form.materialNome}`}
                      data={item.data}
                      preco={brl(precoIdeal(item))}
                      statusLabel={statusLabel as string | null}
                      statusColors={statusColors}
                      onWhatsApp={() => onWhatsApp(item)}
                      onReplicar={() => onReplicar(item)}
                      faded
                    />
                  )
                })}
                {propostasOrcamento.map(p => {
                  const card = p.cardId ? kanban.find(c => c.id === p.cardId) : null
                  const colIdx = card?.coluna ?? null
                  const statusLabel  = colIdx !== null ? COLUNAS_KANBAN[colIdx] : null
                  const statusColors = colIdx !== null ? COL_COLORS[colIdx] : null
                  const ativas = p.linhas.filter(l => l.ativa && l.quantidade > 0)
                  const ideal  = ativas.find(l => l.isIdeal) ?? ativas[ativas.length - 1]
                  const preco  = ideal ? ideal.unitario * ideal.quantidade : 0
                  return (
                    <ItemRow
                      key={p.id}
                      numero={p.numero}
                      descricao={[p.descricao, p.dimensoes, p.material].filter(Boolean).join(" · ") || "—"}
                      data={p.data}
                      preco={preco > 0 ? brl(preco) : "—"}
                      statusLabel={statusLabel as string | null}
                      statusColors={statusColors}
                      faded
                    />
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 shrink-0 flex justify-end"
          style={{ borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose}
            className="px-5 h-9 text-[12.5px] font-medium rounded-xl transition-colors"
            style={{ color: "var(--text-faint)" }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-faint)" }}>
      {children}
    </p>
  )
}

function ItemRow({
  numero, descricao, data, preco, statusLabel, statusColors, onWhatsApp, onReplicar, faded,
}: {
  numero?: string
  descricao: string
  data: string
  preco: string
  statusLabel?: string | null
  statusColors?: { badge: string } | null
  onWhatsApp?: () => void
  onReplicar?: () => void
  faded?: boolean
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 transition-colors"
      style={{
        borderBottom: "1px solid var(--border)",
        opacity: faded ? 0.75 : 1,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {numero && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(132,86,232,0.12)", color: "#8456e8", border: "1px solid rgba(132,86,232,0.2)" }}>
              {numero}
            </span>
          )}
          {statusLabel && statusColors && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${statusColors.badge}`}>
              {statusLabel}
            </span>
          )}
        </div>
        <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-sub)" }}>{descricao}</p>
        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-faint)" }}>{data}</p>
      </div>
      <p className="font-semibold text-[13px] tabular-nums shrink-0" style={{ color: "var(--text-main)" }}>{preco}</p>
      {(onWhatsApp || onReplicar) && (
        <div className="flex gap-1.5 shrink-0">
          {onWhatsApp && (
            <button onClick={onWhatsApp}
              className="px-2.5 py-1.5 text-white text-[10px] font-medium rounded-lg transition-colors"
              style={{ background: "#009351" }}>
              WhatsApp
            </button>
          )}
          {onReplicar && (
            <button onClick={onReplicar}
              className="px-2.5 py-1.5 text-white text-[10px] font-medium rounded-lg transition-colors"
              style={{ background: "var(--bg-alt)", border: "1px solid var(--border)" }}>
              Replicar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, color, sub }: { label: string; value: string; color?: "green" | "rose" | "amber"; sub?: string }) {
  const textColor = color === "green" ? "#34d399" : color === "rose" ? "#f87171" : color === "amber" ? "#fbbf24" : "var(--text-main)"
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--bg-alt)", border: "1px solid var(--border)" }}>
      <p className="text-[9px] uppercase tracking-wider font-semibold leading-tight" style={{ color: "var(--text-faint)" }}>{label}</p>
      <p className="font-semibold text-[15px] tabular-nums mt-1" style={{ color: textColor }}>{value}</p>
      {sub && <p className="text-[9.5px] mt-0.5 leading-tight" style={{ color: "var(--text-faint)" }}>{sub}</p>}
    </div>
  )
}
