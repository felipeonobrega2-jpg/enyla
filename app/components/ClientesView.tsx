"use client"

import { useState } from "react"
import { KanbanCard, COLUNAS_KANBAN, COL_FECHADO, COL_PERDIDO, PropostaCustom, Cliente, LancamentoFinanceiro } from "../types"
import { brl } from "../utils"
import { HistItem } from "./HistoricoView"
import { COL_COLORS } from "./kanban-colors"
import { ClientePerfilModal } from "./ClientePerfilModal"

export function ClientesView({
  historico,
  kanban,
  propostasCustom,
  lancamentos,
  cadastro,
  onReplicar,
  onWhatsApp,
}: {
  historico: HistItem[]
  kanban: KanbanCard[]
  propostasCustom: PropostaCustom[]
  lancamentos: LancamentoFinanceiro[]
  cadastro: Cliente[]
  onReplicar: (item: HistItem) => void
  onWhatsApp: (item: HistItem) => void
}) {
  const [busca, setBusca] = useState("")
  const [expandido, setExpandido] = useState<string | null>(null)
  const [perfilAberto, setPerfilAberto] = useState<string | null>(null)
  const [ordem, setOrdem] = useState<"valor" | "nome" | "orcamentos" | "recente">("valor")

  const precoIdeal = (item: HistItem) => {
    const ideal = item.calculo.tabela.find(l => l.quantidade === item.calculo.sweetSpotIdealQtd) ?? item.calculo.tabela[0]
    return item.form.comFaca ? (ideal?.precoComFaca ?? 0) : (ideal?.precoSemFaca ?? 0)
  }

  const precoPropostaIdeal = (p: PropostaCustom) => {
    const ativas = p.linhas.filter(l => l.ativa && l.quantidade > 0)
    const ideal = ativas.find(l => l.isIdeal) ?? ativas[ativas.length - 1]
    return ideal ? ideal.unitario * ideal.quantidade : 0
  }

  // Agrupar historico por cliente
  const porCliente: Record<string, { itens: HistItem[]; propostas: PropostaCustom[]; firstIdx: number }> = {}

  historico.forEach((item, idx) => {
    const nome = item.form.nomeCliente?.trim() || "Sem nome"
    if (!porCliente[nome]) porCliente[nome] = { itens: [], propostas: [], firstIdx: idx }
    porCliente[nome].itens.push(item)
  })

  // Mesclar propostas no mesmo mapa por cliente
  propostasCustom.forEach(p => {
    const nome = p.nomeCliente?.trim() || "Sem nome"
    if (!porCliente[nome]) porCliente[nome] = { itens: [], propostas: [], firstIdx: historico.length }
    porCliente[nome].propostas.push(p)
  })

  const clientes = Object.entries(porCliente).map(([nome, { itens, propostas, firstIdx }]) => {
    const cardsCliente = kanban.filter(c =>
      itens.some(i => i.numero && i.numero === c.numero) ||
      propostas.some(p => p.cardId && p.cardId === c.id)
    )
    const fechados    = cardsCliente.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO).length
    const perdidos    = cardsCliente.filter(c => c.coluna === COL_PERDIDO).length
    const decididos   = fechados + perdidos
    const totalValor  = itens.reduce((s, i) => s + precoIdeal(i), 0) + propostas.reduce((s, p) => s + precoPropostaIdeal(p), 0)
    const cardsAtivos = cardsCliente.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO)
    const valorFechado = cardsAtivos.reduce((s, c) => s + c.preco, 0)
    const datas      = [...itens.map(i => i.data), ...propostas.map(p => p.data)].filter(Boolean)
    const ultimaData = datas[0] ?? ""
    return { nome, itens, propostas, firstIdx, fechados, perdidos, decididos, totalValor, valorFechado, ultimaData }
  })

  const filtrados = clientes
    .filter(c => !busca.trim() || c.nome.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => {
      if (ordem === "valor")      return b.totalValor - a.totalValor
      if (ordem === "orcamentos") return (b.itens.length + b.propostas.length) - (a.itens.length + a.propostas.length)
      if (ordem === "nome")       return a.nome.localeCompare(b.nome, "pt-BR")
      if (ordem === "recente")    return a.firstIdx - b.firstIdx
      return 0
    })

  const totalClientes  = clientes.length
  const totalRegistros = historico.length + propostasCustom.length
  const totalFaturavel = clientes.reduce((s, c) => s + c.valorFechado, 0)
  const ticketMedGlobal = totalRegistros > 0
    ? clientes.reduce((s, c) => s + c.totalValor, 0) / totalRegistros
    : 0

  if (!historico.length && !propostasCustom.length) return (
    <div className="flex flex-col items-center justify-center h-full text-[#8E8E93]">
      <p className="text-sm">Nenhum orçamento salvo ainda.</p>
      <p className="text-xs mt-1">Salve orçamentos para ver o histórico por cliente.</p>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">

      {/* KPIs globais */}
      <div className="grid grid-cols-4 gap-3">
        {[
          ["Clientes",        String(totalClientes),  "com registros"],
          ["Registros",       String(totalRegistros), "orçamentos + propostas"],
          ["Ticket médio",    brl(ticketMedGlobal),   "por registro"],
          ["Receita fechada", brl(totalFaturavel),    "orçamentos fechados"],
        ].map(([label, val, sub]) => (
          <div key={label} className="bg-white border border-[rgba(60,60,67,0.08)] rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wide text-[#8E8E93] font-semibold">{label}</p>
            <p className="text-xl font-semibold text-[#1C1C1E] mt-1 leading-none">{val}</p>
            <p className="text-[10px] text-[#8E8E93] mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar cliente…"
            className="w-full border border-[rgba(60,60,67,0.12)] rounded-lg pl-8 pr-3 py-2 text-[13px] text-[#1C1C1E] placeholder:text-[rgba(60,60,67,0.3)] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 focus:border-[#007AFF]" />
          {busca && <button onClick={() => setBusca("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(60,60,67,0.3)] hover:text-[#8E8E93] text-lg leading-none">×</button>}
        </div>
        <select value={ordem} onChange={e => setOrdem(e.target.value as typeof ordem)}
          className="border border-[rgba(60,60,67,0.12)] rounded-lg px-3 py-2 text-[13px] text-[rgba(60,60,67,0.75)] bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 focus:border-[#007AFF]">
          <option value="valor">Maior valor</option>
          <option value="orcamentos">Mais registros</option>
          <option value="nome">Nome A–Z</option>
          <option value="recente">Mais recentes</option>
        </select>
      </div>

      {/* Lista de clientes */}
      <div className="space-y-2">
        {filtrados.map(({ nome, itens, propostas, fechados, perdidos, decididos, totalValor, valorFechado, ultimaData }) => {
          const conversao  = decididos > 0 ? Math.round(fechados / decididos * 100) : null
          const aberto     = expandido === nome
          const inicial    = nome[0]?.toUpperCase() ?? "#"
          const totalItens = itens.length + propostas.length

          return (
            <div key={nome} className="bg-white border border-[rgba(60,60,67,0.08)] rounded-xl overflow-hidden hover:border-[rgba(60,60,67,0.12)] transition-colors">

              <div className="w-full flex items-center gap-4 px-5 py-4">
                <button
                  onClick={() => setExpandido(aberto ? null : nome)}
                  className="flex items-center gap-4 flex-1 min-w-0 text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-[#1C1C1E] text-white text-sm font-bold flex items-center justify-center shrink-0">
                    {inicial}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#1C1C1E]">{nome}</p>
                    <p className="text-[11px] text-[#8E8E93] mt-0.5">
                      {totalItens} registro{totalItens !== 1 ? "s" : ""} · última atividade {ultimaData}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-5 shrink-0">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-[#8E8E93]">{totalItens} realizados</span>
                    {fechados > 0 && <>
                      <span className="text-[rgba(60,60,67,0.3)]">→</span>
                      <span className="text-[#34C759] font-semibold">{fechados} fechados</span>
                    </>}
                    {perdidos > 0 && <>
                      <span className="text-[rgba(60,60,67,0.3)]">·</span>
                      <span className="text-[#FF3B30]">{perdidos} perdidos</span>
                    </>}
                  </div>

                  {conversao !== null && (
                    <div className="text-center min-w-[48px]">
                      <p className={`text-sm font-semibold leading-none ${
                        conversao >= 60 ? "text-[#34C759]" : conversao >= 35 ? "text-[#FF9500]" : "text-[#FF3B30]"
                      }`}>{conversao}%</p>
                      <p className="text-[9px] text-[#8E8E93] mt-0.5">conversão</p>
                    </div>
                  )}

                  <div className="text-right min-w-[90px]">
                    <p className="font-bold text-[#1C1C1E]">{brl(totalValor)}</p>
                    {valorFechado > 0 && valorFechado !== totalValor && (
                      <p className="text-[10px] text-[#34C759]">{brl(valorFechado)} fechado</p>
                    )}
                  </div>

                  <button onClick={() => setPerfilAberto(nome)}
                    className="px-3 h-8 text-[11px] font-semibold text-[#007AFF] bg-[#007AFF]/[0.08] hover:bg-[#007AFF]/[0.14] rounded-lg transition-colors shrink-0">
                    Perfil
                  </button>

                  <button onClick={() => setExpandido(aberto ? null : nome)} className="shrink-0">
                    <svg className={`w-4 h-4 text-[#8E8E93] transition-transform ${aberto ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>

              {aberto && (
                <div className="border-t border-[rgba(60,60,67,0.06)] divide-y divide-[rgba(0,0,0,0.03)]">
                  {itens.map((item, i) => {
                    const ideal = item.calculo.tabela.find(l => l.quantidade === item.calculo.sweetSpotIdealQtd) ?? item.calculo.tabela[0]
                    const preco = item.form.comFaca ? (ideal?.precoComFaca ?? 0) : (ideal?.precoSemFaca ?? 0)
                    const card  = kanban.find(c => item.numero && c.numero === item.numero)
                    const colIdx = card?.coluna ?? null
                    const statusLabel  = colIdx !== null ? COLUNAS_KANBAN[colIdx] : null
                    const statusColors = colIdx !== null ? COL_COLORS[colIdx] : null
                    return (
                      <div key={i} className="flex items-center gap-4 px-5 py-3 hover:bg-[rgba(116,116,128,0.04)] transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {item.numero && (
                              <span className="text-[10px] font-bold text-[#007AFF] bg-[#007AFF]/[0.08] border border-[#007AFF]/20 px-1.5 py-0.5 rounded-full">
                                {item.numero}
                              </span>
                            )}
                            <span className="text-xs text-[#8E8E93]">
                              {item.form.frente}×{item.form.alturaBox}×{item.form.lateral} cm · {item.form.materialNome}
                            </span>
                            {statusLabel && statusColors && (
                              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${statusColors.badge}`}>
                                {statusLabel}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#8E8E93] mt-0.5">{item.data}</p>
                          {card?.motivoPerdido && (
                            <p className="text-[10px] text-rose-500 mt-0.5 italic">"{card.motivoPerdido}"</p>
                          )}
                        </div>
                        <p className="font-bold text-[rgba(60,60,67,0.75)] shrink-0">{brl(preco)}</p>
                        <div className="flex gap-1.5 shrink-0">
                          <button onClick={() => onWhatsApp(item)}
                            className="px-2.5 py-1.5 bg-[#34C759] hover:bg-[#2DB74F] text-white text-[10px] font-medium rounded-lg transition-colors">
                            WhatsApp
                          </button>
                          <button onClick={() => onReplicar(item)}
                            className="px-2.5 py-1.5 bg-[#1C1C1E] hover:bg-[#2C2C2E] text-white text-[10px] font-medium rounded-lg transition-colors">
                            Replicar
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {propostas.map(p => {
                    const ativas = p.linhas.filter(l => l.ativa && l.quantidade > 0)
                    const ideal  = ativas.find(l => l.isIdeal) ?? ativas[ativas.length - 1]
                    const preco  = ideal ? ideal.unitario * ideal.quantidade : 0
                    const card   = p.cardId ? kanban.find(c => c.id === p.cardId) : null
                    const colIdx = card?.coluna ?? null
                    const statusLabel  = colIdx !== null ? COLUNAS_KANBAN[colIdx] : null
                    const statusColors = colIdx !== null ? COL_COLORS[colIdx] : null
                    return (
                      <div key={p.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[rgba(0,0,0,0.02)] transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-[#AF52DE] bg-[#AF52DE]/[0.08] border border-[#AF52DE]/20 px-1.5 py-0.5 rounded-full">
                              {p.numero}
                            </span>
                            <span className="text-[9px] font-semibold text-[#AF52DE] bg-[#AF52DE]/[0.06] border border-[#AF52DE]/15 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                              Personalizada
                            </span>
                            <span className="text-xs text-[#8E8E93]">
                              {[p.descricao, p.dimensoes, p.material].filter(Boolean).join(" · ") || "—"}
                            </span>
                            {statusLabel && statusColors && (
                              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${statusColors.badge}`}>
                                {statusLabel}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#8E8E93] mt-0.5">{p.data}</p>
                        </div>
                        <p className="font-bold text-[rgba(60,60,67,0.75)] shrink-0">{preco > 0 ? brl(preco) : "—"}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {perfilAberto && (() => {
        const c = clientes.find(c => c.nome === perfilAberto)
        if (!c) return null
        return (
          <ClientePerfilModal
            nome={c.nome}
            cadastro={cadastro.find(cl => cl.nome.trim().toLowerCase() === c.nome.toLowerCase()) ?? null}
            itens={c.itens}
            propostas={c.propostas}
            kanban={kanban}
            lancamentos={lancamentos}
            onClose={() => setPerfilAberto(null)}
            onReplicar={onReplicar}
            onWhatsApp={onWhatsApp}
          />
        )
      })()}
    </div>
  )
}
