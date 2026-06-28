"use client"

import { useState } from "react"
import type React from "react"
import { FormData, Calculo, LinhaTabela, KanbanOpcao, Lote, Cliente } from "../types"
import { Configuracoes } from "../config"
import { gerarHtmlOrcamento, gerarHtmlOrcamentoCliente } from "../pdf"
import { brl, num } from "../utils"

export function ModalPersonalizarProposta({
  data: d,
  config,
  onClose,
  onAbrirPdf,
  onWhatsApp,
  onSyncOpcoes,
  onSalvar,
  lotes,
  cardLoteNumero,
  onLoteCreate,
  onLoteAssign,
  clientes,
}: {
  data: { form: FormData; calculo: Calculo; numero: string; data: string; cardId: string }
  config: Configuracoes
  onClose: () => void
  onAbrirPdf: (html: string) => void
  onWhatsApp: (form: FormData, calculo: Calculo, numero?: string) => void
  onSyncOpcoes: (cardId: string, opcoes: KanbanOpcao[]) => void
  onSalvar?: (customCalculo: Calculo, opcoes: KanbanOpcao[]) => void
  lotes?: Lote[]
  cardLoteNumero?: string
  onLoteCreate?: (nomeCliente: string) => Promise<{ id: string; numero: string }>
  onLoteAssign?: (cardId: string, loteId: string, loteNumero: string) => void
  clientes?: Cliente[]
}) {
  const { form, calculo, numero, data, cardId } = d
  const comFaca = form.comFaca
  const telefoneCliente = (clientes ?? []).find(c => c.nome.toLowerCase() === form.nomeCliente.trim().toLowerCase())?.telefone

  // Which quantities are shown in the client PDF (initially all)
  const [ativos, setAtivos] = useState<Set<number>>(
    () => new Set(calculo.tabela.map(l => l.quantidade))
  )
  // Overridden unit price per quantity (stored as string to allow mid-typing)
  const [unitOvr, setUnitOvr] = useState<Record<number, string>>({})
  // Overridden ideal quantity (null = use calculated default)
  const [idealOvr, setIdealOvr] = useState<number | null>(null)
  const effectiveIdealQtd = idealOvr ?? calculo.sweetSpotIdealQtd

  // Lote
  const [showLoteSection, setShowLoteSection] = useState(false)
  const [criandoLote, setCriandoLote] = useState(false)
  const [loteAtribuido, setLoteAtribuido] = useState(cardLoteNumero ?? "")
  const clientLotes = (lotes ?? []).filter(l =>
    l.nomeCliente.toLowerCase() === form.nomeCliente.toLowerCase()
  )

  async function handleCriarLote() {
    if (!onLoteCreate) return
    setCriandoLote(true)
    try {
      const lote = await onLoteCreate(form.nomeCliente || "Sem nome")
      onLoteAssign?.(cardId, lote.id, lote.numero)
      setLoteAtribuido(lote.numero)
      setShowLoteSection(false)
    } finally {
      setCriandoLote(false)
    }
  }

  function handleAssignLote(loteId: string, loteNumero: string) {
    onLoteAssign?.(cardId, loteId, loteNumero)
    setLoteAtribuido(loteNumero)
    setShowLoteSection(false)
  }

  function getUnit(linha: LinhaTabela): number {
    const s = unitOvr[linha.quantidade]
    if (s !== undefined) {
      const v = parseFloat(s.replace(",", "."))
      if (!isNaN(v) && v >= 0) return v
    }
    return comFaca ? linha.unitarioComFaca : linha.unitarioSemFaca
  }

  function getTotal(linha: LinhaTabela) { return getUnit(linha) * linha.quantidade }

  // Build a modified Calculo with filtered rows and overridden prices
  function buildCustomCalculo(): Calculo {
    const parcFator = config.multiplicadores.parcelamento12x
    const customTabela = calculo.tabela
      .filter(l => ativos.has(l.quantidade))
      .map(l => {
        const unit  = getUnit(l)
        const total = unit * l.quantidade
        const parc  = (total * parcFator) / 12
        return comFaca
          ? { ...l, unitarioComFaca: unit, precoComFaca: total, parcela12xComFaca: parc }
          : { ...l, unitarioSemFaca: unit, precoSemFaca: total, parcela12xSemFaca: parc }
      })
    return { ...calculo, tabela: customTabela, sweetSpotIdealQtd: effectiveIdealQtd }
  }

  function buildOpcoes(): KanbanOpcao[] {
    return calculo.tabela
      .filter(l => ativos.has(l.quantidade))
      .map(l => ({
        quantidade: l.quantidade,
        preco:     getTotal(l),
        unitario:  getUnit(l),
      }))
  }

  function handleClose() {
    onSyncOpcoes(cardId, buildOpcoes())
    onClose()
  }

  const nenhum = [...ativos].filter(q => calculo.tabela.some(l => l.quantidade === q)).length === 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden"
        style={{ maxHeight: "92vh" }}>

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#1C1C1E] text-[15px] leading-snug truncate">
                {form.nomeCliente || "Sem nome"}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] font-bold text-[#5009c4] bg-[#5009c4]/[0.08] border border-[#5009c4]/20 px-1.5 py-0.5 rounded-full tabular-nums shrink-0">
                  {numero}
                </span>
                <span className="text-[11px] text-[#8E8E93]">{data}</span>
              </div>
            </div>
            <button onClick={handleClose}
              className="text-[rgba(60,60,67,0.3)] hover:text-[#8E8E93] transition-colors text-xl leading-none mt-0.5 shrink-0">×</button>
          </div>
          {/* Specs pills */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {form.frente > 0 && (
              <SpecPill>{form.frente}×{form.alturaBox}×{form.lateral} cm</SpecPill>
            )}
            {form.materialNome && <SpecPill>{form.materialNome}</SpecPill>}
            <SpecPill>{form.comFaca ? "Com faca" : "Sem faca"}</SpecPill>
            {form.incluirVerniz && <SpecPill blue>Verniz UV</SpecPill>}
            {form.validadeDias > 0 && <SpecPill>Válido {form.validadeDias} dias</SpecPill>}
          </div>
          <p className="text-[11px] text-[#8E8E93] mt-2.5 leading-relaxed">
            Selecione os tiers e ajuste os preços antes de enviar ao cliente.
          </p>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1 px-2">
          <table className="w-full">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-[rgba(60,60,67,0.08)]">
                <th className="py-3 px-3 w-10" />
                <th className="py-3 px-2 text-left text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">Qtd</th>
                <th className="py-3 px-2 text-right text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">Unitário</th>
                <th className="py-3 px-2 text-right text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">Total</th>
                <th className="py-3 px-2 text-right text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">12×/mês</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(0,0,0,0.04)]">
              {calculo.tabela.map(linha => {
                const ativo    = ativos.has(linha.quantidade)
                const isIdeal  = linha.quantidade === effectiveIdealQtd
                const isMin    = linha.quantidade === calculo.sweetSpotMinimoQtd
                const unit     = getUnit(linha)
                const total    = getTotal(linha)
                const parcela  = (total * config.multiplicadores.parcelamento12x) / 12
                const modified = unitOvr[linha.quantidade] !== undefined

                return (
                  <tr key={linha.quantidade}
                    className={`transition-all ${
                      !ativo ? "opacity-35" :
                      isIdeal ? "bg-[#5009c4]/[0.03]" : ""
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-3 px-3">
                      <button
                        onClick={() => {
                          const next = new Set(ativos)
                          if (next.has(linha.quantidade)) next.delete(linha.quantidade)
                          else next.add(linha.quantidade)
                          setAtivos(next)
                        }}
                        className={`w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center transition-all shrink-0 ${
                          ativo
                            ? "border-[#5009c4] bg-[#5009c4]"
                            : "border-[rgba(60,60,67,0.2)] bg-white hover:border-[rgba(60,60,67,0.35)]"
                        }`}
                      >
                        {ativo && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    </td>

                    {/* Quantidade */}
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          title={isIdeal ? "Ideal atual" : "Definir como ideal"}
                          onClick={() => setIdealOvr(isIdeal ? null : linha.quantidade)}
                          className={`transition-colors shrink-0 ${isIdeal ? "text-[#5009c4]" : "text-[rgba(60,60,67,0.15)] hover:text-[#5009c4]/60"}`}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                          </svg>
                        </button>
                        <span className="font-bold text-[13px] text-[#1C1C1E] tabular-nums">{num(linha.quantidade)}</span>
                        {isIdeal && <span className="text-[8.5px] bg-[#5009c4] text-white px-1.5 py-0.5 rounded-full font-semibold tracking-wide">IDEAL</span>}
                        {isMin && !isIdeal && <span className="text-[8.5px] bg-[#FF9500] text-white px-1.5 py-0.5 rounded-full font-semibold tracking-wide">MÍN</span>}
                      </div>
                    </td>

                    {/* Unitário (editável) */}
                    <td className="py-3 px-2">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-[#8E8E93] text-[10px]">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={!ativo}
                          value={unitOvr[linha.quantidade] ?? unit}
                          onChange={e => setUnitOvr(prev => ({ ...prev, [linha.quantidade]: e.target.value }))}
                          onFocus={e => e.target.select()}
                          className={`w-[72px] text-right text-[12.5px] font-semibold tabular-nums border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                            modified
                              ? "border-[#FF9500]/50 bg-[#FF9500]/[0.06] text-[#1C1C1E] focus:ring-[#FF9500]/20 focus:border-[#FF9500]"
                              : "border-[rgba(60,60,67,0.12)] text-[#1C1C1E] focus:ring-[#5009c4]/20 focus:border-[#5009c4]"
                          }`}
                        />
                      </div>
                    </td>

                    {/* Total */}
                    <td className="py-3 px-2 text-right">
                      <span className={`font-semibold text-[13.5px] tabular-nums ${
                        ativo ? (modified ? "text-[#FF9500]" : "text-[#5009c4]") : "text-[#8E8E93]"
                      }`}>
                        {brl(total)}
                      </span>
                      {modified && ativo && (
                        <p className="text-[9px] text-[#8E8E93] line-through tabular-nums">
                          {brl((comFaca ? linha.unitarioComFaca : linha.unitarioSemFaca) * linha.quantidade)}
                        </p>
                      )}
                    </td>

                    {/* Parcela */}
                    <td className="py-3 px-2 text-right">
                      <span className="text-[11.5px] text-[#8E8E93] tabular-nums">{brl(parcela)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Resumo + reset */}
        <div className="px-5 py-2.5 bg-[rgba(116,116,128,0.04)] border-t border-[rgba(60,60,67,0.08)] flex items-center justify-between shrink-0">
          <p className="text-[11px] text-[#8E8E93]">
            <span className="font-semibold tabular-nums">{ativos.size}</span> de{" "}
            <span className="tabular-nums">{calculo.tabela.length}</span> tiers selecionados
          </p>
          {Object.keys(unitOvr).length > 0 && (
            <button onClick={() => setUnitOvr({})}
              className="text-[10.5px] text-[#FF9500] hover:text-[#E08500] font-medium transition-colors">
              ↺ Restaurar preços
            </button>
          )}
        </div>

        {/* Lote section */}
        {(lotes !== undefined || onLoteCreate) && (
          <div className="px-4 pt-3 pb-0 border-t border-[rgba(60,60,67,0.08)] shrink-0">
            <div className={`rounded-xl p-3 ${loteAtribuido ? "bg-violet-50 border border-violet-200" : "border border-dashed border-[rgba(60,60,67,0.12)]"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <svg className={`w-3.5 h-3.5 shrink-0 ${loteAtribuido ? "text-[#AF52DE]" : "text-[#8E8E93]"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z" />
                  </svg>
                  <p className={`text-[11.5px] font-semibold ${loteAtribuido ? "text-[#AF52DE]" : "text-[#8E8E93]"}`}>
                    {loteAtribuido ? loteAtribuido : "Lote"}
                  </p>
                </div>
                {!loteAtribuido && (
                  <button onClick={() => setShowLoteSection(v => !v)}
                    className="text-[11px] font-semibold text-[#AF52DE] hover:text-violet-800 transition-colors">
                    + Agrupar
                  </button>
                )}
                {loteAtribuido && (
                  <span className="text-[10px] text-[#AF52DE]">Associado</span>
                )}
              </div>
              {showLoteSection && !loteAtribuido && (
                <div className="mt-2.5 space-y-1.5">
                  {clientLotes.length > 0 && (
                    <>
                      <p className="text-[10px] text-[#8E8E93] font-medium">Lotes de {form.nomeCliente}:</p>
                      {clientLotes.map(l => (
                        <button key={l.id} onClick={() => handleAssignLote(l.id, l.numero)}
                          className="w-full flex items-center gap-2 py-1.5 px-2.5 text-[11px] text-[#AF52DE] bg-white hover:bg-violet-50 rounded-lg border border-violet-200 transition-colors text-left">
                          <span className="font-bold">{l.numero}</span>
                          <span className="text-violet-300">·</span>
                          <span className="truncate text-[#AF52DE]">{l.nomeCliente}</span>
                        </button>
                      ))}
                    </>
                  )}
                  <button onClick={handleCriarLote} disabled={criandoLote}
                    className="w-full py-1.5 text-[11px] font-semibold text-white bg-[#AF52DE] hover:bg-violet-700 disabled:opacity-50 rounded-lg transition-colors">
                    {criandoLote ? "Criando…" : clientLotes.length > 0 ? "Criar novo lote" : "+ Criar lote para este pedido"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="px-4 pb-4 pt-3 border-t border-[rgba(60,60,67,0.08)] shrink-0 space-y-2">
          {nenhum && (
            <p className="text-[11px] text-[#FF3B30] text-center">Selecione ao menos um tier para gerar o PDF.</p>
          )}
          <div className="flex gap-2">
            <button onClick={handleClose}
              className="px-3 py-2.5 text-[11.5px] text-[#8E8E93] hover:text-[rgba(60,60,67,0.75)] hover:bg-[rgba(116,116,128,0.04)] rounded-xl transition-colors shrink-0">
              Fechar
            </button>
            <button
              onClick={() => onAbrirPdf(gerarHtmlOrcamento({ form, calculo, data, numero }))}
              className="flex-1 py-2.5 text-[11.5px] font-medium border border-[rgba(60,60,67,0.12)] hover:border-[rgba(60,60,67,0.25)] hover:bg-[rgba(116,116,128,0.04)] text-[rgba(60,60,67,0.6)] rounded-xl transition-colors">
              PDF Gráfica
            </button>
            {onSalvar && (
              <button
                disabled={nenhum}
                onClick={() => {
                  const custom = buildCustomCalculo()
                  const opcoes = buildOpcoes()
                  onSyncOpcoes(cardId, opcoes)
                  onSalvar(custom, opcoes)
                  onClose()
                }}
                className="flex-1 py-2.5 text-[11.5px] font-semibold bg-[#2C2C2E] hover:bg-[#1C1C1E] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors">
                Salvar
              </button>
            )}
            <button
              disabled={nenhum}
              onClick={() => { onSyncOpcoes(cardId, buildOpcoes()); onWhatsApp(form, buildCustomCalculo(), numero) }}
              className="flex-1 py-2.5 text-[11.5px] font-semibold bg-[#25D366] hover:bg-[#20bd5a] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center justify-center gap-1.5">
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.847L0 24l6.335-1.502A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.373l-.36-.214-3.724.882.897-3.63-.235-.374A9.817 9.817 0 0 1 2.182 12c0-5.42 4.398-9.818 9.818-9.818 5.42 0 9.818 4.398 9.818 9.818 0 5.42-4.398 9.818-9.818 9.818z"/></svg>
              WhatsApp
            </button>
            <button
              disabled={nenhum}
              onClick={() => { onSyncOpcoes(cardId, buildOpcoes()); onAbrirPdf(gerarHtmlOrcamentoCliente({ form, calculo: buildCustomCalculo(), data, numero }, telefoneCliente)) }}
              className="flex-1 py-2.5 text-[11.5px] font-semibold bg-[#5009c4] hover:bg-[#4307a6] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors">
              PDF Cliente ↓
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SpecPill({ children, blue }: { children: React.ReactNode; blue?: boolean }) {
  return (
    <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-medium ${
      blue ? "bg-[#5009c4]/[0.08] text-[#5009c4] border border-[#5009c4]/15" : "bg-[rgba(116,116,128,0.08)] text-[rgba(60,60,67,0.6)]"
    }`}>{children}</span>
  )
}
