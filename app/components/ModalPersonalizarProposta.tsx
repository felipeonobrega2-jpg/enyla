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
  const [unitOvr,   setUnitOvr]   = useState<Record<number, string>>({})
  // Overridden total per quantity — independent from unit override
  const [totalOvr,  setTotalOvr]  = useState<Record<number, number>>({})
  // Tracking which row's TOTAL is being edited inline
  const [editingTotal, setEditingTotal] = useState<number | null>(null)
  const [tempTotal, setTempTotal]       = useState("")
  // Overridden ideal quantity (null = use calculated default)
  const [idealOvr, setIdealOvr] = useState<number | null>(null)
  const effectiveIdealQtd = idealOvr ?? calculo.sweetSpotIdealQtd

  // Qualidade por quantidade
  const [localQualidades, setLocalQualidades] = useState<Record<number, "Digital" | "Offset">>(form.qualidades ?? {})
  function qualDe(q: number): "Digital" | "Offset" {
    return localQualidades[q] ?? (q < 1000 ? "Digital" : "Offset")
  }
  function toggleQual(q: number) {
    const cur = qualDe(q)
    setLocalQualidades(prev => ({ ...prev, [q]: cur === "Digital" ? "Offset" : "Digital" }))
  }

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

  function getTotal(linha: LinhaTabela): number {
    const ov = totalOvr[linha.quantidade]
    if (ov !== undefined) return ov
    return getUnit(linha) * linha.quantidade
  }

  // Build a modified Calculo with filtered rows and overridden prices
  function buildCustomCalculo(): Calculo {
    const parcFator = config.multiplicadores.parcelamento12x
    const customTabela = calculo.tabela
      .filter(l => ativos.has(l.quantidade))
      .map(l => {
        const total = getTotal(l)
        const unit  = total / l.quantidade
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

  // Aplica custo × 2 como unitário sugerido para todas as linhas ativas
  function aplicarCusto2x() {
    const novosUnit: Record<number, string> = {}
    calculo.tabela.forEach(linha => {
      const custo = comFaca ? linha.custoTotalComFaca : linha.custoTotalSemFaca
      const unitCusto = custo / linha.quantidade
      novosUnit[linha.quantidade] = (unitCusto * 2).toFixed(4)
    })
    setUnitOvr(novosUnit)
    setTotalOvr({})
  }

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
              <p className="font-bold text-[#191625] text-[15px] leading-snug truncate">
                {form.nomeCliente || "Sem nome"}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] font-bold text-[#8456e8] bg-[#8456e8]/[0.08] border border-[#8456e8]/20 px-1.5 py-0.5 rounded-full tabular-nums shrink-0">
                  {numero}
                </span>
                <span className="text-[11px] text-[#8E8E93]">{data}</span>
              </div>
            </div>
            <button onClick={handleClose}
              className="text-[#898892] hover:text-[#8E8E93] transition-colors text-xl leading-none mt-0.5 shrink-0">×</button>
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
                const modified = unitOvr[linha.quantidade] !== undefined || totalOvr[linha.quantidade] !== undefined

                return (
                  <tr key={linha.quantidade}
                    className={`transition-all ${
                      !ativo ? "opacity-35" :
                      isIdeal ? "bg-[#8456e8]/[0.03]" : ""
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
                            ? "border-[#8456e8] bg-[#8456e8]"
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
                          className={`transition-colors shrink-0 ${isIdeal ? "text-[#8456e8]" : "text-[rgba(60,60,67,0.15)] hover:text-[#8456e8]/60"}`}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                          </svg>
                        </button>
                        <span className="font-bold text-[13px] text-[#191625] tabular-nums">{num(linha.quantidade)}</span>
                        <button
                          onClick={() => toggleQual(linha.quantidade)}
                          title="Clique para alternar Digital / Offset"
                          className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full transition-colors ${
                            qualDe(linha.quantidade) === "Digital"
                              ? "bg-[rgba(116,116,128,0.12)] text-[#64748b] hover:bg-[rgba(116,116,128,0.25)]"
                              : "bg-[#8456e8]/[0.1] text-[#8456e8] hover:bg-[#8456e8]/20"
                          }`}
                        >{qualDe(linha.quantidade)}</button>
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
                              ? "border-[#c57800]/50 bg-[#c57800]/[0.06] text-[#191625] focus:ring-[#c57800]/20 focus:border-[#c57800]"
                              : "border-[rgba(60,60,67,0.12)] text-[#191625] focus:ring-[#8456e8]/20 focus:border-[#8456e8]"
                          }`}
                        />
                      </div>
                    </td>

                    {/* Total — editável */}
                    <td className="py-3 px-2 text-right">
                      {editingTotal === linha.quantidade ? (
                        <input
                          autoFocus
                          type="number"
                          step="0.01"
                          min="0"
                          value={tempTotal}
                          onChange={e => setTempTotal(e.target.value)}
                          onFocus={e => e.target.select()}
                          onBlur={() => {
                            const v = parseFloat(tempTotal.replace(",", "."))
                            if (!isNaN(v) && v > 0)
                              setTotalOvr(prev => ({ ...prev, [linha.quantidade]: v }))
                            setEditingTotal(null)
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              const v = parseFloat(tempTotal.replace(",", "."))
                              if (!isNaN(v) && v > 0)
                                setTotalOvr(prev => ({ ...prev, [linha.quantidade]: v }))
                              setEditingTotal(null)
                            }
                            if (e.key === "Escape") setEditingTotal(null)
                          }}
                          className={`w-[100px] text-right text-[12.5px] font-semibold tabular-nums border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 transition-all ${
                            modified
                              ? "border-[#c57800]/50 bg-[#c57800]/[0.06] focus:ring-[#c57800]/20 focus:border-[#c57800]"
                              : "border-[#8456e8]/40 bg-[#8456e8]/[0.04] focus:ring-[#8456e8]/20 focus:border-[#8456e8]"
                          }`}
                        />
                      ) : (
                        <button
                          disabled={!ativo}
                          onClick={() => { setTempTotal(total.toFixed(2)); setEditingTotal(linha.quantidade) }}
                          className={`font-semibold text-[13.5px] tabular-nums text-right w-full transition-colors disabled:cursor-not-allowed ${
                            ativo ? (modified ? "text-[#c57800] hover:opacity-70" : "text-[#8456e8] hover:opacity-70") : "text-[#8E8E93]"
                          }`}
                          title="Clique para editar o total"
                        >
                          {brl(total)}
                        </button>
                      )}
                      {totalOvr[linha.quantidade] !== undefined && ativo && editingTotal !== linha.quantidade && (
                        <p className="text-[9px] text-[#8E8E93] line-through tabular-nums text-right">
                          {brl(getUnit(linha) * linha.quantidade)}
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

        {/* Resumo + ações rápidas */}
        <div className="px-5 py-2.5 bg-[rgba(116,116,128,0.04)] border-t border-[rgba(60,60,67,0.08)] flex items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] text-[#8E8E93]">
            <span className="font-semibold tabular-nums">{ativos.size}</span> de{" "}
            <span className="tabular-nums">{calculo.tabela.length}</span> tiers selecionados
          </p>
          <div className="flex items-center gap-3">
            {/* Custo × 2 */}
            <button
              onClick={aplicarCusto2x}
              title={`Preenche unitário = (custo ${comFaca ? "c/ faca" : "s/ faca"} ÷ qtd) × 2`}
              className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#8456e8] hover:text-[#6e3fd4] transition-colors whitespace-nowrap"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75l-2.489-2.489m0 0a3.375 3.375 0 1 0-4.773-4.773 3.375 3.375 0 0 0 4.774 4.774ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              Custo × 2
            </button>
            {(Object.keys(unitOvr).length > 0 || Object.keys(totalOvr).length > 0) && (
              <button onClick={() => { setUnitOvr({}); setTotalOvr({}) }}
                className="text-[10.5px] text-[#c57800] hover:text-[#E08500] font-medium transition-colors whitespace-nowrap">
                ↺ Restaurar
              </button>
            )}
          </div>
        </div>

        {/* Lote section */}
        {(lotes !== undefined || onLoteCreate) && (
          <div className="px-4 pt-3 pb-0 border-t border-[rgba(60,60,67,0.08)] shrink-0">
            <div className={`rounded-xl p-3 ${loteAtribuido ? "bg-violet-50 border border-violet-200" : "border border-dashed border-[rgba(60,60,67,0.12)]"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <svg className={`w-3.5 h-3.5 shrink-0 ${loteAtribuido ? "text-[#a582ff]" : "text-[#8E8E93]"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z" />
                  </svg>
                  <p className={`text-[11.5px] font-semibold ${loteAtribuido ? "text-[#a582ff]" : "text-[#8E8E93]"}`}>
                    {loteAtribuido ? loteAtribuido : "Lote"}
                  </p>
                </div>
                {!loteAtribuido && (
                  <button onClick={() => setShowLoteSection(v => !v)}
                    className="text-[11px] font-semibold text-[#a582ff] hover:text-violet-800 transition-colors">
                    + Agrupar
                  </button>
                )}
                {loteAtribuido && (
                  <span className="text-[10px] text-[#a582ff]">Associado</span>
                )}
              </div>
              {showLoteSection && !loteAtribuido && (
                <div className="mt-2.5 space-y-1.5">
                  {clientLotes.length > 0 && (
                    <>
                      <p className="text-[10px] text-[#8E8E93] font-medium">Lotes de {form.nomeCliente}:</p>
                      {clientLotes.map(l => (
                        <button key={l.id} onClick={() => handleAssignLote(l.id, l.numero)}
                          className="w-full flex items-center gap-2 py-1.5 px-2.5 text-[11px] text-[#a582ff] bg-white hover:bg-violet-50 rounded-lg border border-violet-200 transition-colors text-left">
                          <span className="font-bold">{l.numero}</span>
                          <span className="text-violet-300">·</span>
                          <span className="truncate text-[#a582ff]">{l.nomeCliente}</span>
                        </button>
                      ))}
                    </>
                  )}
                  <button onClick={handleCriarLote} disabled={criandoLote}
                    className="w-full py-1.5 text-[11px] font-semibold text-white bg-[#a582ff] hover:bg-violet-700 disabled:opacity-50 rounded-lg transition-colors">
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
            <p className="text-[11px] text-[#d33a3c] text-center">Selecione ao menos um tier para gerar o PDF.</p>
          )}
          <div className="flex gap-2">
            <button onClick={handleClose}
              className="px-3 py-2.5 text-[11.5px] text-[#8E8E93] hover:text-[#5e5c68] hover:bg-[rgba(116,116,128,0.04)] rounded-xl transition-colors shrink-0">
              Fechar
            </button>
            <button
              onClick={() => onAbrirPdf(gerarHtmlOrcamento({ form, calculo, data, numero }))}
              className="flex-1 py-2.5 text-[11.5px] font-medium border border-[rgba(60,60,67,0.12)] hover:border-[rgba(60,60,67,0.25)] hover:bg-[rgba(116,116,128,0.04)] text-[#72707d] rounded-xl transition-colors">
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
                className="flex-1 py-2.5 text-[11.5px] font-semibold bg-[#161421] hover:bg-[#0b0914] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors">
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
              onClick={() => { onSyncOpcoes(cardId, buildOpcoes()); onAbrirPdf(gerarHtmlOrcamentoCliente({ form: { ...form, qualidades: localQualidades }, calculo: buildCustomCalculo(), data, numero }, telefoneCliente)) }}
              className="flex-1 py-2.5 text-[11.5px] font-semibold bg-[#8456e8] hover:bg-[#7445d4] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors">
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
      blue ? "bg-[#8456e8]/[0.08] text-[#8456e8] border border-[#8456e8]/15" : "bg-[rgba(116,116,128,0.08)] text-[#72707d]"
    }`}>{children}</span>
  )
}
