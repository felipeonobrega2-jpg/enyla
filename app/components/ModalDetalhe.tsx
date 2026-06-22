"use client"

import { useState, useMemo } from "react"
import { FormData, Calculo, PropostaCustom, KanbanCard, COLUNAS_KANBAN, COL_FECHADO, COL_EXPEDICAO, COL_PERDIDO } from "../types"
import { brl, num } from "../utils"

type HistItem = { form: FormData; calculo: Calculo; data: string; numero?: string }

export type DetalheData =
  | { tipo: "historico"; item: HistItem;         card?: KanbanCard }
  | { tipo: "proposta";  proposta: PropostaCustom; card?: KanbanCard }
  | { tipo: "kanban";    card: KanbanCard }

export function ModalDetalhe({
  data, parcFator, onClose, onEditar, onEditarHistorico, onPersonalizarHistorico,
  onSaveDelivery, onSaveDeliveryReal, onSaveCloseDate,
  onRegistrarSobra, onSaveFornecedor,
}: {
  data: DetalheData
  parcFator: number
  onClose: () => void
  onEditar?: (p: PropostaCustom) => void
  onEditarHistorico?: (item: HistItem) => void
  onPersonalizarHistorico?: (item: HistItem) => void
  onSaveDelivery?: (cardId: string, date: string | null) => void
  onSaveDeliveryReal?: (cardId: string, date: string | null) => void
  onSaveCloseDate?: (cardId: string, date: string) => void
  onRegistrarSobra?: (card: KanbanCard) => void
  onSaveFornecedor?: (cardId: string, fornecedor: string | null, custo: number | null) => void
}) {
  const isH = data.tipo === "historico"
  const isP = data.tipo === "proposta"
  const isK = data.tipo === "kanban"
  const card = isK ? data.card : data.card

  // ── Editable state ──────────────────────────────────────────────────────────
  const [closeDate,         setCloseDate]         = useState(card?.dataFechamento       ?? "")
  const [deliveryDate,      setDeliveryDate]      = useState(card?.dataEntregaPrevista  ?? "")
  const [deliveryRealDate,  setDeliveryRealDate]  = useState(card?.dataEntregaReal      ?? "")
  const [fornecedor,        setFornecedor]        = useState(card?.fornecedor            ?? "")
  const [custoTerceiro,     setCustoTerceiro]     = useState(card?.custoTerceiro?.toString() ?? "")
  const [saving, setSaving] = useState(false)
  const [pixCopied, setPixCopied] = useState(false)

  const isTerceirizado = card?.materialNome === "Terceirizado"

  // Dirty check — only relevant fields
  const isDirty = useMemo(() => {
    if (!card) return false
    if (onSaveCloseDate    && card.coluna >= COL_FECHADO && card.coluna !== COL_PERDIDO
        && closeDate        !== (card.dataFechamento      ?? "") && closeDate) return true
    if (onSaveDelivery     && deliveryDate     !== (card.dataEntregaPrevista  ?? "")) return true
    if (onSaveDeliveryReal && deliveryRealDate !== (card.dataEntregaReal      ?? "")) return true
    if (onSaveFornecedor && isTerceirizado &&
        (fornecedor    !== (card.fornecedor        ?? "") ||
         custoTerceiro !== (card.custoTerceiro?.toString() ?? ""))) return true
    return false
  }, [card, closeDate, deliveryDate, deliveryRealDate, fornecedor, custoTerceiro,
      onSaveCloseDate, onSaveDelivery, onSaveDeliveryReal, onSaveFornecedor, isTerceirizado])

  function handleSave() {
    if (!card || !isDirty) return
    setSaving(true)
    if (onSaveCloseDate && closeDate && closeDate !== (card.dataFechamento ?? ""))
      onSaveCloseDate(card.id, closeDate)
    if (onSaveDelivery && deliveryDate !== (card.dataEntregaPrevista ?? ""))
      onSaveDelivery(card.id, deliveryDate || null)
    if (onSaveDeliveryReal && deliveryRealDate !== (card.dataEntregaReal ?? ""))
      onSaveDeliveryReal(card.id, deliveryRealDate || null)
    if (onSaveFornecedor && isTerceirizado)
      onSaveFornecedor(card.id, fornecedor.trim() || null, custoTerceiro ? parseFloat(custoTerceiro) : null)
    setSaving(false)
    onClose()
  }

  const numero  = isH ? (data.item.numero ?? "")        : isP ? data.proposta.numero     : data.card.numero
  const nome    = isH ? data.item.form.nomeCliente       : isP ? data.proposta.nomeCliente : data.card.nomeCliente
  const dataStr = isH ? data.item.data                   : isP ? data.proposta.data        : data.card.data
  const isCustom = isP

  const pixPreco  = card?.preco ?? 0
  const pixNumero = numero
  const pixCliente = nome
  const showPix   = (isK || isP) && pixPreco > 0

  const showDates = card && (onSaveDelivery || onSaveDeliveryReal ||
    (onSaveCloseDate && card.coluna >= COL_FECHADO && card.coluna !== COL_PERDIDO))

  const showSobra = card && onRegistrarSobra &&
    card.coluna >= COL_EXPEDICAO && card.coluna !== COL_PERDIDO

  function fmtDate(iso: string) {
    return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden"
        style={{ maxHeight: "90vh" }}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#1C1C1E] text-[15px] leading-snug truncate">{nome || "Sem nome"}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {numero && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border tabular-nums shrink-0 ${
                    isCustom
                      ? "text-[#AF52DE] bg-[#AF52DE]/[0.08] border-[#AF52DE]/20"
                      : "text-[#007AFF] bg-[#007AFF]/[0.08] border-[#007AFF]/20"
                  }`}>{numero}</span>
                )}
                <span className="text-[11px] text-[#8E8E93]">{dataStr}</span>
                {isK && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(116,116,128,0.08)] text-[rgba(60,60,67,0.55)]">
                    {COLUNAS_KANBAN[data.card.coluna]}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose}
              className="w-7 h-7 rounded-full bg-[rgba(116,116,128,0.1)] flex items-center justify-center text-[#8E8E93] hover:bg-[rgba(116,116,128,0.18)] transition-colors text-lg leading-none shrink-0 mt-0.5">
              ×
            </button>
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
                {data.item.form.validadeDias > 0 && <Pill>Válido {data.item.form.validadeDias} dias</Pill>}
              </>
            )}
            {isP && (
              <>
                {data.proposta.descricao && <Pill>{data.proposta.descricao}</Pill>}
                {data.proposta.dimensoes  && <Pill>{data.proposta.dimensoes}</Pill>}
                {data.proposta.material   && <Pill>{data.proposta.material}</Pill>}
                {data.proposta.incluirVerniz && <Pill blue>Verniz UV</Pill>}
                {data.proposta.comFaca    && <Pill>Com faca</Pill>}
                {data.proposta.validadeDias > 0 && <Pill>Válido {data.proposta.validadeDias} dias</Pill>}
              </>
            )}
            {isK && (
              <>
                {data.card.dimensoes    && !isTerceirizado && <Pill>{data.card.dimensoes} cm</Pill>}
                {data.card.materialNome && <Pill>{data.card.materialNome}</Pill>}
                {data.card.motivoPerdido && <Pill red>"{data.card.motivoPerdido}"</Pill>}
              </>
            )}
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1">

          {/* Pricing table — regular cards */}
          {(!isK || !isTerceirizado) && (
            <table className="w-full">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-[rgba(60,60,67,0.08)]">
                  <th className="py-2.5 px-5 text-left text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">Qtd</th>
                  <th className="py-2.5 px-4 text-right text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">Unitário</th>
                  <th className="py-2.5 px-4 text-right text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">Total</th>
                  {!isK && (
                    <th className="py-2.5 px-5 text-right text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">12×/mês</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(60,60,67,0.04)]">

                {isH && data.item.calculo.tabela.map(l => {
                  const cf    = data.item.form.comFaca
                  const unit  = cf ? l.unitarioComFaca   : l.unitarioSemFaca
                  const total = cf ? l.precoComFaca      : l.precoSemFaca
                  const parc  = cf ? l.parcela12xComFaca : l.parcela12xSemFaca
                  const isIdeal = l.quantidade === data.item.calculo.sweetSpotIdealQtd
                  const isMin   = l.quantidade === data.item.calculo.sweetSpotMinimoQtd
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

                {isK && !isTerceirizado && (data.card.opcoes?.length ? data.card.opcoes : null)?.map((op, i) => {
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

                {isK && !isTerceirizado && !data.card.opcoes?.length && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center">
                      <p className="font-semibold text-[22px] text-[#1C1C1E] tabular-nums">{brl(data.card.preco)}</p>
                      <p className="text-[12px] text-[#8E8E93] mt-1">{num(data.card.quantidade)} unidades</p>
                    </td>
                  </tr>
                )}

              </tbody>
            </table>
          )}

          {/* Terceirizado summary */}
          {isK && isTerceirizado && (
            <div className="px-5 py-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[13px] text-[#8E8E93]">{num(data.card.quantidade)} unidades</p>
                <p className="text-[28px] font-bold text-[#1C1C1E] tabular-nums" style={{ letterSpacing: "-0.5px" }}>
                  {brl(data.card.preco)}
                </p>
              </div>
              {data.card.fornecedor && (
                <p className="text-[12px] text-right text-[#8E8E93]">
                  via <span className="text-[#1C1C1E] font-medium">{data.card.fornecedor}</span>
                </p>
              )}
              {data.card.custoTerceiro != null && data.card.custoTerceiro > 0 && (
                <p className="text-[11px] text-right mt-0.5"
                  style={{ color: data.card.preco - data.card.custoTerceiro >= 0 ? "#34C759" : "#FF3B30" }}>
                  Custo {brl(data.card.custoTerceiro)} · Margem {brl(data.card.preco - data.card.custoTerceiro)}
                </p>
              )}
            </div>
          )}

          {/* ── Observations ─────────────────────────────────────────────────── */}
          {isH && (data.item.form.obsCliente || data.item.form.obsInterna) && (
            <div className="px-5 py-3.5 border-t border-[rgba(60,60,67,0.08)] space-y-2.5">
              {data.item.form.obsCliente && (
                <div>
                  <p className="text-[9.5px] uppercase text-[#8E8E93] font-semibold mb-0.5">Para o cliente</p>
                  <p className="text-[12px] text-[rgba(60,60,67,0.6)] leading-relaxed">{data.item.form.obsCliente}</p>
                </div>
              )}
              {data.item.form.obsInterna && (
                <div>
                  <p className="text-[9.5px] uppercase text-[#8E8E93] font-semibold mb-0.5">Interna</p>
                  <p className="text-[12px] text-[#8E8E93] italic leading-relaxed">{data.item.form.obsInterna}</p>
                </div>
              )}
            </div>
          )}
          {isP && data.proposta.obsCliente && (
            <div className="px-5 py-3.5 border-t border-[rgba(60,60,67,0.08)]">
              <p className="text-[9.5px] uppercase text-[#8E8E93] font-semibold mb-0.5">Para o cliente</p>
              <p className="text-[12px] text-[rgba(60,60,67,0.6)] leading-relaxed">{data.proposta.obsCliente}</p>
            </div>
          )}

          {/* ── Editable fields — unified form ────────────────────────────────── */}
          {showDates && (
            <div className="px-5 py-4 border-t border-[rgba(60,60,67,0.08)] space-y-3">
              <p className="text-[9.5px] uppercase tracking-wide text-[#8E8E93] font-semibold">Datas</p>

              <div className="grid grid-cols-2 gap-3">
                {/* Fechamento */}
                {onSaveCloseDate && card && card.coluna >= COL_FECHADO && card.coluna !== COL_PERDIDO && (
                  <div>
                    <label className="text-[9.5px] text-[rgba(60,60,67,0.5)] font-medium block mb-1">Fechamento</label>
                    <input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)}
                      className="w-full h-9 border border-[rgba(0,0,0,0.1)] rounded-xl px-2.5 text-[12.5px] text-[#1C1C1E] bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-colors"
                    />
                    {closeDate && (
                      <p className="text-[9.5px] text-[#8E8E93] mt-1">{fmtDate(closeDate)}</p>
                    )}
                  </div>
                )}

                {/* Entrega prevista */}
                {onSaveDelivery && (
                  <div>
                    <label className="text-[9.5px] text-[rgba(60,60,67,0.5)] font-medium block mb-1">Entrega prevista</label>
                    <div className="relative">
                      <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                        className="w-full h-9 border border-[rgba(0,0,0,0.1)] rounded-xl px-2.5 text-[12.5px] text-[#1C1C1E] bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-colors"
                      />
                    </div>
                    {deliveryDate && (
                      <p className="text-[9.5px] text-[#8E8E93] mt-1">{fmtDate(deliveryDate)}</p>
                    )}
                  </div>
                )}

                {/* Entrega real */}
                {onSaveDeliveryReal && (
                  <div>
                    <label className="text-[9.5px] text-[rgba(60,60,67,0.5)] font-medium block mb-1">Entrega real</label>
                    <input type="date" value={deliveryRealDate} onChange={e => setDeliveryRealDate(e.target.value)}
                      className="w-full h-9 border border-[rgba(0,0,0,0.1)] rounded-xl px-2.5 text-[12.5px] text-[#1C1C1E] bg-white focus:outline-none focus:ring-2 focus:ring-[#34C759]/30 focus:border-[#34C759] transition-colors"
                    />
                    {deliveryRealDate && (
                      <p className="text-[9.5px] mt-1" style={{ color: "#34C759" }}>{fmtDate(deliveryRealDate)}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fornecedor — only for terceirizado cards */}
          {isK && isTerceirizado && onSaveFornecedor && (
            <div className="px-5 py-4 border-t border-[rgba(60,60,67,0.08)] space-y-3">
              <p className="text-[9.5px] uppercase tracking-wide text-[#8E8E93] font-semibold">Fornecedor</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9.5px] text-[rgba(60,60,67,0.5)] font-medium block mb-1">Nome</label>
                  <input type="text" value={fornecedor} onChange={e => setFornecedor(e.target.value)}
                    placeholder="Ex: Marcelino"
                    className="w-full h-9 border border-[rgba(0,0,0,0.1)] rounded-xl px-2.5 text-[12.5px] text-[#1C1C1E] bg-white focus:outline-none focus:ring-2 focus:ring-[#FF9500]/20 focus:border-[#FF9500] transition-colors placeholder:text-[rgba(60,60,67,0.25)]"
                  />
                </div>
                <div>
                  <label className="text-[9.5px] text-[rgba(60,60,67,0.5)] font-medium block mb-1">Custo (R$)</label>
                  <input type="number" value={custoTerceiro} onChange={e => setCustoTerceiro(e.target.value)}
                    placeholder="0,00" min={0} step={0.01}
                    className="w-full h-9 border border-[rgba(0,0,0,0.1)] rounded-xl px-2.5 text-[12.5px] text-[#1C1C1E] bg-white focus:outline-none focus:ring-2 focus:ring-[#FF9500]/20 focus:border-[#FF9500] transition-colors tabular-nums"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Sobras */}
          {showSobra && (
            <div className="px-5 py-3.5 border-t border-[rgba(60,60,67,0.08)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-[#1C1C1E]">Sobras de produção</p>
                  <p className="text-[10.5px] text-[rgba(60,60,67,0.4)] mt-0.5">Registre as sobras negociadas com o cliente.</p>
                </div>
                <button
                  onClick={() => { onRegistrarSobra!(card!); onClose() }}
                  className="px-3 h-8 text-[12px] font-semibold text-[#FF9500] bg-[#FF9500]/[0.08] hover:bg-[#FF9500]/[0.14] rounded-lg transition-colors shrink-0"
                >
                  Registrar
                </button>
              </div>
            </div>
          )}

        </div>

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        <div className="px-5 py-3.5 border-t border-[rgba(60,60,67,0.08)] shrink-0 flex items-center gap-2">
          {/* PIX link */}
          {showPix && (
            <button
              onClick={() => {
                const url = `${window.location.origin}/pix/${encodeURIComponent(pixNumero)}?v=${pixPreco.toFixed(2)}&c=${encodeURIComponent(pixCliente)}`
                navigator.clipboard.writeText(url).then(() => {
                  setPixCopied(true); setTimeout(() => setPixCopied(false), 2000)
                })
              }}
              className="flex items-center gap-1.5 px-3 h-9 text-[12px] font-semibold rounded-xl transition-all shrink-0"
              style={pixCopied
                ? { background: "#34C759", color: "white" }
                : { background: "rgba(52,199,89,0.1)", color: "#34C759" }}
            >
              {pixCopied ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125H18M15 10.5H9" />
                </svg>
              )}
              {pixCopied ? "Copiado!" : "Link PIX"}
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Edit proposta */}
          {isP && onEditar && (
            <button
              onClick={() => { onEditar(data.proposta); onClose() }}
              className="px-4 h-9 text-[12px] font-semibold text-white bg-[#AF52DE] hover:bg-violet-700 rounded-xl transition-colors shrink-0"
            >
              Editar proposta
            </button>
          )}

          {/* Personalizar tabela de preços (qtd/unitário/total) */}
          {isH && onPersonalizarHistorico && (
            <button
              onClick={() => onPersonalizarHistorico(data.item)}
              className="px-4 h-9 text-[12px] font-semibold text-[#007AFF] bg-[#007AFF]/[0.08] hover:bg-[#007AFF]/[0.14] rounded-xl transition-colors shrink-0"
            >
              Personalizar valores
            </button>
          )}

          {/* Edit histórico (specs: dimensões, material, faca, validade, nota interna) */}
          {isH && onEditarHistorico && (
            <button
              onClick={() => onEditarHistorico(data.item)}
              className="px-4 h-9 text-[12px] font-semibold text-white bg-[#007AFF] hover:bg-[#0062CC] rounded-xl transition-colors shrink-0"
            >
              Editar orçamento
            </button>
          )}

          {/* Primary action: Save (when dirty) or Close */}
          {isDirty ? (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 h-9 text-[12.5px] font-semibold text-white bg-[#007AFF] hover:bg-[#0062CC] rounded-xl transition-colors disabled:opacity-50 shrink-0"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-5 h-9 text-[12.5px] font-medium text-[#8E8E93] hover:bg-[rgba(116,116,128,0.06)] rounded-xl transition-colors shrink-0"
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Pill({ children, blue, red }: { children: React.ReactNode; blue?: boolean; red?: boolean }) {
  return (
    <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-medium ${
      blue ? "bg-[#007AFF]/[0.08] text-[#007AFF] border border-[#007AFF]/15"
      : red ? "bg-[#FF3B30]/[0.08] text-[#FF3B30] border border-[#FF3B30]/15"
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
