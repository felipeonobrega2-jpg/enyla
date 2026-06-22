"use client"

import { Cliente, KanbanCard, LancamentoFinanceiro, PropostaCustom, COLUNAS_KANBAN, COL_FECHADO, COL_PERDIDO } from "../types"
import { brl } from "../utils"
import { HistItem } from "./HistoricoView"
import { COL_COLORS } from "./kanban-colors"

const hoje = () => new Date().toISOString().split("T")[0]

function diasDesde(dataBR: string) {
  // datas salvas como toLocaleString("pt-BR") → "dd/mm/aaaa, hh:mm:ss"
  const [d, m, a] = dataBR.split(",")[0].split("/")
  if (!d || !m || !a) return null
  const dt = new Date(Number(a), Number(m) - 1, Number(d))
  return Math.floor((Date.now() - dt.getTime()) / 86_400_000)
}

export function ClientePerfilModal({
  nome, cadastro, itens, propostas, kanban, lancamentos,
  onClose, onReplicar, onWhatsApp,
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
}) {
  const precoIdeal = (item: HistItem) => {
    const ideal = item.calculo.tabela.find(l => l.quantidade === item.calculo.sweetSpotIdealQtd) ?? item.calculo.tabela[0]
    return item.form.comFaca ? (ideal?.precoComFaca ?? 0) : (ideal?.precoSemFaca ?? 0)
  }
  const precoPropostaIdeal = (p: PropostaCustom) => {
    const ativas = p.linhas.filter(l => l.ativa && l.quantidade > 0)
    const ideal = ativas.find(l => l.isIdeal) ?? ativas[ativas.length - 1]
    return ideal ? ideal.unitario * ideal.quantidade : 0
  }

  const cardsCliente = kanban.filter(c =>
    itens.some(i => i.numero && i.numero === c.numero) ||
    propostas.some(p => p.cardId && p.cardId === c.id)
  )
  const fechados  = cardsCliente.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO).length
  const perdidos  = cardsCliente.filter(c => c.coluna === COL_PERDIDO).length
  const decididos = fechados + perdidos
  const conversao = decididos > 0 ? Math.round((fechados / decididos) * 100) : null

  const lancCliente = lancamentos.filter(l => (l.nomeCliente ?? "").trim().toLowerCase() === nome.toLowerCase())
  const recebido  = lancCliente.filter(l => l.tipo === "receita" && l.status === "pago").reduce((s, l) => s + l.valor, 0)
  const pendentes = lancCliente.filter(l => l.tipo === "receita" && l.status !== "pago" && l.categoria !== "sobra")
  const aReceber  = pendentes.reduce((s, l) => s + l.valor, 0)
  const atrasados = pendentes.filter(l => l.dataVencimento < hoje())
  const emAtraso  = atrasados.reduce((s, l) => s + l.valor, 0)

  const totalItens  = itens.length + propostas.length
  const ltv         = itens.reduce((s, i) => s + precoIdeal(i), 0) + propostas.reduce((s, p) => s + precoPropostaIdeal(p), 0) + recebido
  const ticketMedio = totalItens > 0 ? ltv / totalItens : 0

  const datas = [...itens.map(i => i.data), ...propostas.map(p => p.data)].filter(Boolean)
  const ultimaData = datas[0] ?? null
  const dias = ultimaData ? diasDesde(ultimaData) : null

  const inicial = nome[0]?.toUpperCase() ?? "#"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col overflow-hidden" style={{ maxHeight: "90vh" }}>

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] shrink-0 flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-[#1C1C1E] text-white text-base font-bold flex items-center justify-center shrink-0">
            {inicial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[#1C1C1E] text-[16px] leading-snug truncate">{nome}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-[#8E8E93]">
              {cadastro?.telefone && <span>{cadastro.telefone}</span>}
              {cadastro?.email && <span>· {cadastro.email}</span>}
              {!cadastro && <span className="italic">Sem cadastro de contato</span>}
            </div>
            {dias !== null && (
              <p className="text-[11px] text-[#8E8E93] mt-1">
                Última atividade há {dias === 0 ? "hoje" : `${dias} dia${dias !== 1 ? "s" : ""}`}
              </p>
            )}
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-full bg-[rgba(116,116,128,0.1)] flex items-center justify-center text-[#8E8E93] hover:bg-[rgba(116,116,128,0.18)] transition-colors text-lg leading-none shrink-0">
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">

          {/* KPIs */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 px-6 pt-5">
            <Kpi label="Total gasto (LTV)" value={brl(ltv)} />
            <Kpi label="Ticket médio" value={brl(ticketMedio)} />
            <Kpi label="A receber" value={brl(aReceber)} color={aReceber > 0 ? "amber" : undefined} />
            <Kpi label="Em atraso" value={brl(emAtraso)} color={emAtraso > 0 ? "rose" : undefined} />
            <Kpi label="Conversão" value={conversao !== null ? `${conversao}%` : "—"}
              color={conversao !== null ? (conversao >= 60 ? "green" : conversao >= 35 ? "amber" : "rose") : undefined} />
          </div>

          {cadastro?.notas && (
            <div className="px-6 pt-4">
              <p className="text-[9.5px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-1">Notas</p>
              <p className="text-[12px] text-[rgba(60,60,67,0.7)] leading-relaxed">{cadastro.notas}</p>
            </div>
          )}

          {/* Lançamentos em aberto */}
          {pendentes.length > 0 && (
            <div className="px-6 pt-5">
              <p className="text-[9.5px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-2">Pendências financeiras</p>
              <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-xl overflow-hidden">
                <div className="divide-y divide-slate-50">
                  {pendentes.slice(0, 6).map(l => {
                    const atrasado = l.dataVencimento < hoje()
                    return (
                      <div key={l.id} className="px-4 py-2.5 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-[rgba(60,60,67,0.75)] truncate">{l.descricao}</p>
                          <p className="text-[10.5px] text-[#8E8E93] mt-0.5">Vence {l.dataVencimento}</p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                          atrasado ? "border-rose-200 bg-rose-50 text-rose-600" : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}>
                          {atrasado ? "Atrasado" : "Pendente"}
                        </span>
                        <p className="font-bold text-[#1C1C1E] text-[12.5px] tabular-nums shrink-0">{brl(l.valor)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Histórico de pedidos */}
          <div className="px-6 pt-5 pb-5">
            <p className="text-[9.5px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-2">
              Pedidos ({totalItens})
            </p>
            <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-xl overflow-hidden divide-y divide-[rgba(0,0,0,0.03)]">
              {itens.map((item, i) => {
                const preco = precoIdeal(item)
                const card  = kanban.find(c => item.numero && c.numero === item.numero)
                const colIdx = card?.coluna ?? null
                const statusLabel  = colIdx !== null ? COLUNAS_KANBAN[colIdx] : null
                const statusColors = colIdx !== null ? COL_COLORS[colIdx] : null
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-[rgba(116,116,128,0.04)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.numero && (
                          <span className="text-[10px] font-bold text-[#007AFF] bg-[#007AFF]/[0.08] border border-[#007AFF]/20 px-1.5 py-0.5 rounded-full">
                            {item.numero}
                          </span>
                        )}
                        <span className="text-[11.5px] text-[#8E8E93]">
                          {item.form.frente}×{item.form.alturaBox}×{item.form.lateral} cm · {item.form.materialNome}
                        </span>
                        {statusLabel && statusColors && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${statusColors.badge}`}>
                            {statusLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-[10.5px] text-[#8E8E93] mt-0.5">{item.data}</p>
                    </div>
                    <p className="font-bold text-[rgba(60,60,67,0.75)] text-[12.5px] shrink-0">{brl(preco)}</p>
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
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[rgba(0,0,0,0.02)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-[#AF52DE] bg-[#AF52DE]/[0.08] border border-[#AF52DE]/20 px-1.5 py-0.5 rounded-full">
                          {p.numero}
                        </span>
                        <span className="text-[11.5px] text-[#8E8E93]">
                          {[p.descricao, p.dimensoes, p.material].filter(Boolean).join(" · ") || "—"}
                        </span>
                        {statusLabel && statusColors && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${statusColors.badge}`}>
                            {statusLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-[10.5px] text-[#8E8E93] mt-0.5">{p.data}</p>
                    </div>
                    <p className="font-bold text-[rgba(60,60,67,0.75)] text-[12.5px] shrink-0">{preco > 0 ? brl(preco) : "—"}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[rgba(60,60,67,0.08)] shrink-0 flex justify-end">
          <button onClick={onClose}
            className="px-5 h-9 text-[12.5px] font-medium text-[#8E8E93] hover:bg-[rgba(116,116,128,0.06)] rounded-xl transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: string; color?: "green" | "rose" | "amber" }) {
  const cls = color === "green" ? "text-emerald-700" : color === "rose" ? "text-rose-600" : color === "amber" ? "text-amber-600" : "text-[#1C1C1E]"
  return (
    <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-xl px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-wider text-[#8E8E93] font-semibold leading-tight">{label}</p>
      <p className={`font-semibold text-[14px] tabular-nums mt-1 ${cls}`}>{value}</p>
    </div>
  )
}
