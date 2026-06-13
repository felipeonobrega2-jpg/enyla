"use client"

import { useState } from "react"
import { FormData, Calculo, PropostaCustom, KanbanCard, COLUNAS_KANBAN } from "../types"
import { brl, num } from "../utils"

type HistItem = { form: FormData; calculo: Calculo; data: string; numero?: string }

export type DetalheData =
  | { tipo: "historico"; item: HistItem;         card?: KanbanCard }
  | { tipo: "proposta";  proposta: PropostaCustom; card?: KanbanCard }
  | { tipo: "kanban";    card: KanbanCard }

export function ModalDetalhe({ data, parcFator, onClose, onEditar, onSaveDelivery }: {
  data: DetalheData
  parcFator: number
  onClose: () => void
  onEditar?: (p: PropostaCustom) => void
  onSaveDelivery?: (cardId: string, date: string | null) => void
}) {
  const isH = data.tipo === "historico"
  const isP = data.tipo === "proposta"
  const isK = data.tipo === "kanban"

  // card is always present for kanban type, and optionally passed for historico/proposta
  const card = isK ? data.card : data.card

  const [deliveryDate, setDeliveryDate] = useState(card?.dataEntregaPrevista ?? "")
  const [savingDelivery, setSavingDelivery] = useState(false)

  const numero  = isH ? (data.item.numero ?? "")      : isP ? data.proposta.numero    : data.card.numero
  const nome    = isH ? data.item.form.nomeCliente     : isP ? data.proposta.nomeCliente : data.card.nomeCliente
  const dataStr = isH ? data.item.data                 : isP ? data.proposta.data      : data.card.data
  const isCustom = isP

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden"
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#1C1C1E] text-[15px] leading-snug truncate">
                {nome || "Sem nome"}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {numero && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border tabular-nums shrink-0 ${
                    isCustom
                      ? "text-[#AF52DE] bg-violet-50 border-violet-200"
                      : "text-blue-700 bg-blue-50 border-blue-200"
                  }`}>{numero}</span>
                )}
                <span className="text-[11px] text-[#8E8E93]">{dataStr}</span>
                {isK && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(116,116,128,0.08)] text-[rgba(60,60,67,0.6)]">
                    {COLUNAS_KANBAN[data.card.coluna]}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[rgba(60,60,67,0.3)] hover:text-[#8E8E93] transition-colors text-xl leading-none mt-0.5 shrink-0"
            >×</button>
          </div>

          {/* Pills */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {isH && (
              <>
                {data.item.form.frente > 0 && (
                  <Pill>{data.item.form.frente}×{data.item.form.alturaBox}×{data.item.form.lateral} cm</Pill>
                )}
                {data.item.form.materialNome && <Pill>{data.item.form.materialNome}</Pill>}
                <Pill>{data.item.form.comFaca ? "Com faca" : "Sem faca"}</Pill>
                {data.item.form.incluirVerniz && <Pill blue>Verniz UV</Pill>}
                {data.item.form.validadeDias > 0 && (
                  <Pill>Válido {data.item.form.validadeDias} dias</Pill>
                )}
              </>
            )}
            {isP && (
              <>
                {data.proposta.descricao && <Pill>{data.proposta.descricao}</Pill>}
                {data.proposta.dimensoes  && <Pill>{data.proposta.dimensoes}</Pill>}
                {data.proposta.material   && <Pill>{data.proposta.material}</Pill>}
                {data.proposta.incluirVerniz && <Pill blue>Verniz UV</Pill>}
                {data.proposta.comFaca    && <Pill>Com faca</Pill>}
                {data.proposta.validadeDias > 0 && (
                  <Pill>Válido {data.proposta.validadeDias} dias</Pill>
                )}
              </>
            )}
            {isK && (
              <>
                {data.card.dimensoes   && <Pill>{data.card.dimensoes} cm</Pill>}
                {data.card.materialNome && <Pill>{data.card.materialNome}</Pill>}
                {data.card.motivoPerdido && (
                  <Pill red>"{data.card.motivoPerdido}"</Pill>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-y-auto flex-1">
          <table className="w-full">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-[rgba(60,60,67,0.08)]">
                <th className="py-3 px-5 text-left text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">
                  Qtd
                </th>
                <th className="py-3 px-4 text-right text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">
                  Unitário
                </th>
                <th className="py-3 px-4 text-right text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">
                  Total
                </th>
                {!isK && (
                  <th className="py-3 px-5 text-right text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">
                    12×/mês
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">

              {isH && data.item.calculo.tabela.map(l => {
                const cf       = data.item.form.comFaca
                const unit     = cf ? l.unitarioComFaca  : l.unitarioSemFaca
                const total    = cf ? l.precoComFaca     : l.precoSemFaca
                const parc     = cf ? l.parcela12xComFaca : l.parcela12xSemFaca
                const isIdeal  = l.quantidade === data.item.calculo.sweetSpotIdealQtd
                const isMin    = l.quantidade === data.item.calculo.sweetSpotMinimoQtd
                return (
                  <tr key={l.quantidade}
                    className={isIdeal ? "bg-blue-50/50" : isMin ? "bg-amber-50/40" : "hover:bg-[rgba(116,116,128,0.04)]"}>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[13px] text-[#1C1C1E] tabular-nums">{num(l.quantidade)}</span>
                        {isIdeal && <Badge color="blue">IDEAL</Badge>}
                        {isMin && !isIdeal && <Badge color="amber">MÍN</Badge>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-[12.5px] text-[rgba(60,60,67,0.6)] tabular-nums">{brl(unit)}</td>
                    <td className="py-3 px-4 text-right font-bold text-[13px] text-blue-700 tabular-nums">{brl(total)}</td>
                    <td className="py-3 px-5 text-right text-[11.5px] text-[#8E8E93] tabular-nums">{brl(parc)}</td>
                  </tr>
                )
              })}

              {isP && data.proposta.linhas.filter(l => l.ativa && l.quantidade > 0).map((l, i) => {
                const total = l.unitario * l.quantidade
                const parc  = (total * parcFator) / 12
                return (
                  <tr key={i} className={l.isIdeal ? "bg-blue-50/50" : "hover:bg-[rgba(116,116,128,0.04)]"}>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[13px] text-[#1C1C1E] tabular-nums">{num(l.quantidade)}</span>
                        {l.isIdeal && <Badge color="blue">IDEAL</Badge>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-[12.5px] text-[rgba(60,60,67,0.6)] tabular-nums">{brl(l.unitario)}</td>
                    <td className="py-3 px-4 text-right font-bold text-[13px] text-[#AF52DE] tabular-nums">{brl(total)}</td>
                    <td className="py-3 px-5 text-right text-[11.5px] text-[#8E8E93] tabular-nums">{brl(parc)}</td>
                  </tr>
                )
              })}

              {isK && (data.card.opcoes?.length ? data.card.opcoes : null)?.map((op, i) => {
                const isCurrent = op.quantidade === data.card.quantidade
                return (
                  <tr key={i} className={isCurrent ? "bg-green-50/60" : "hover:bg-[rgba(116,116,128,0.04)]"}>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[13px] text-[#1C1C1E] tabular-nums">{num(op.quantidade)}</span>
                        {isCurrent && <Badge color="green">FECHADO</Badge>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-[12.5px] text-[rgba(60,60,67,0.6)] tabular-nums">{brl(op.unitario)}</td>
                    <td className="py-3 px-4 text-right font-bold text-[13px] text-blue-700 tabular-nums">{brl(op.preco)}</td>
                  </tr>
                )
              })}

              {isK && !data.card.opcoes?.length && (
                <tr>
                  <td colSpan={3} className="py-8 text-center">
                    <p className="font-semibold text-[22px] text-[#1C1C1E] tabular-nums">{brl(data.card.preco)}</p>
                    <p className="text-[12px] text-[#8E8E93] mt-1">{num(data.card.quantidade)} unidades</p>
                  </td>
                </tr>
              )}

            </tbody>
          </table>
        </div>

        {/* Observações */}
        {isH && (data.item.form.obsCliente || data.item.form.obsInterna) && (
          <div className="px-5 py-3.5 border-t border-[rgba(60,60,67,0.08)] shrink-0 space-y-2.5">
            {data.item.form.obsCliente && (
              <div>
                <p className="text-[9.5px] uppercase  text-[#8E8E93] font-semibold">Para o cliente</p>
                <p className="text-[12px] text-[rgba(60,60,67,0.6)] mt-0.5 leading-relaxed">{data.item.form.obsCliente}</p>
              </div>
            )}
            {data.item.form.obsInterna && (
              <div>
                <p className="text-[9.5px] uppercase  text-[#8E8E93] font-semibold">Interna</p>
                <p className="text-[12px] text-[#8E8E93] mt-0.5 italic leading-relaxed">{data.item.form.obsInterna}</p>
              </div>
            )}
          </div>
        )}
        {isP && data.proposta.obsCliente && (
          <div className="px-5 py-3.5 border-t border-[rgba(60,60,67,0.08)] shrink-0">
            <p className="text-[9.5px] uppercase  text-[#8E8E93] font-semibold">Para o cliente</p>
            <p className="text-[12px] text-[rgba(60,60,67,0.6)] mt-0.5 leading-relaxed">{data.proposta.obsCliente}</p>
          </div>
        )}

        {/* Data de entrega prevista — aparece sempre que o modal tem um card kanban associado */}
        {card && onSaveDelivery && (
          <div className="px-5 py-3.5 border-t border-[rgba(60,60,67,0.08)] shrink-0">
            <p className="text-[9.5px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-2">
              Data prevista de entrega
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={deliveryDate}
                onChange={e => setDeliveryDate(e.target.value)}
                className="flex-1 h-8 border border-[rgba(60,60,67,0.12)] rounded-lg px-2.5 text-[12.5px] text-[rgba(60,60,67,0.75)] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
              {deliveryDate && (
                <button
                  onClick={() => setDeliveryDate("")}
                  className="text-[#8E8E93] hover:text-[rgba(60,60,67,0.6)] transition-colors text-sm px-1"
                  title="Limpar data"
                >×</button>
              )}
              <button
                disabled={savingDelivery}
                onClick={async () => {
                  setSavingDelivery(true)
                  await onSaveDelivery(card.id, deliveryDate || null)
                  setSavingDelivery(false)
                }}
                className="px-3 h-8 text-[12px] font-semibold text-white bg-[#2C2C2E] hover:bg-[#1C1C1E] rounded-lg transition-colors disabled:opacity-50 shrink-0"
              >
                {savingDelivery ? "…" : "Salvar"}
              </button>
            </div>
            {deliveryDate && (
              <p className="text-[11px] text-[#8E8E93] mt-1.5">
                {new Date(deliveryDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
            <p className="text-[10.5px] text-[rgba(60,60,67,0.3)] mt-1">Sobrescreve o cálculo automático de 15 dias.</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[rgba(60,60,67,0.08)] shrink-0 flex gap-2">
          {isP && onEditar && (
            <button
              onClick={() => { onEditar(data.proposta); onClose() }}
              className="flex-1 py-2 text-[12px] font-semibold text-white bg-[#AF52DE] hover:bg-violet-700 rounded-xl transition-colors"
            >
              Editar proposta
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-2 text-[12px] font-medium text-[#8E8E93] hover:text-[rgba(60,60,67,0.75)] hover:bg-[rgba(116,116,128,0.04)] rounded-xl transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

function Pill({ children, blue, red }: { children: React.ReactNode; blue?: boolean; red?: boolean }) {
  return (
    <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-medium ${
      blue ? "bg-blue-50 text-blue-700 border border-blue-100"
      : red ? "bg-rose-50 text-rose-600 border border-rose-100"
      : "bg-[rgba(116,116,128,0.08)] text-[rgba(60,60,67,0.6)]"
    }`}>{children}</span>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: "blue" | "amber" | "green" }) {
  const cls = color === "blue"  ? "bg-blue-600 text-white"
            : color === "amber" ? "bg-amber-500 text-white"
            :                     "bg-green-600 text-white"
  return (
    <span className={`text-[8.5px] px-1.5 py-0.5 rounded-full font-semibold tracking-wide ${cls}`}>
      {children}
    </span>
  )
}
