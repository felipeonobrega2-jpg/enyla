"use client"

import { useState } from "react"
import { FormData, Calculo, LinhaTabela, KanbanOpcao } from "../types"
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
}: {
  data: { form: FormData; calculo: Calculo; numero: string; data: string; cardId: string }
  config: Configuracoes
  onClose: () => void
  onAbrirPdf: (html: string) => void
  onWhatsApp: (form: FormData, calculo: Calculo, numero?: string) => void
  onSyncOpcoes: (cardId: string, opcoes: KanbanOpcao[]) => void
  onSalvar?: (customCalculo: Calculo, opcoes: KanbanOpcao[]) => void
}) {
  const { form, calculo, numero, data, cardId } = d
  const comFaca = form.comFaca

  // Which quantities are shown in the client PDF (initially all)
  const [ativos, setAtivos] = useState<Set<number>>(
    () => new Set(calculo.tabela.map(l => l.quantidade))
  )
  // Overridden unit price per quantity (stored as string to allow mid-typing)
  const [unitOvr, setUnitOvr] = useState<Record<number, string>>({})
  // Overridden ideal quantity (null = use calculated default)
  const [idealOvr, setIdealOvr] = useState<number | null>(null)
  const effectiveIdealQtd = idealOvr ?? calculo.sweetSpotIdealQtd

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
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9.5px] uppercase tracking-[0.1em] font-bold text-slate-400 mb-1">Personalizar proposta para o cliente</p>
              <p className="font-bold text-slate-800 text-[15px] leading-snug">{form.nomeCliente || "Sem nome"}</p>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full inline-block mt-1 tabular-nums">
                {numero}
              </span>
            </div>
            <button onClick={handleClose}
              className="text-slate-300 hover:text-slate-500 transition-colors text-xl leading-none mt-0.5 shrink-0">×</button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
            Marque os tiers que aparecerão no PDF. Edite o valor unitário para ajustar o total — útil para negociações.
          </p>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1 px-2">
          <table className="w-full">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-slate-100">
                <th className="py-3 px-3 w-10" />
                <th className="py-3 px-2 text-left text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Qtd</th>
                <th className="py-3 px-2 text-right text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Unitário</th>
                <th className="py-3 px-2 text-right text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total</th>
                <th className="py-3 px-2 text-right text-[10px] uppercase tracking-wider text-slate-400 font-semibold">12×/mês</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
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
                      isIdeal ? "bg-blue-50/50" : ""
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
                            ? "border-blue-600 bg-blue-600"
                            : "border-slate-300 bg-white hover:border-slate-400"
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
                          className={`transition-colors shrink-0 ${isIdeal ? "text-blue-600" : "text-slate-200 hover:text-blue-400"}`}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                          </svg>
                        </button>
                        <span className="font-bold text-[13px] text-slate-800 tabular-nums">{num(linha.quantidade)}</span>
                        {isIdeal && <span className="text-[8.5px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-black tracking-wide">IDEAL</span>}
                        {isMin && !isIdeal && <span className="text-[8.5px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-black tracking-wide">MÍN</span>}
                      </div>
                    </td>

                    {/* Unitário (editável) */}
                    <td className="py-3 px-2">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-slate-400 text-[10px]">R$</span>
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
                              ? "border-amber-400 bg-amber-50 text-amber-900 focus:ring-amber-300/50 focus:border-amber-400"
                              : "border-slate-200 text-slate-800 focus:ring-blue-400/30 focus:border-blue-400"
                          }`}
                        />
                      </div>
                    </td>

                    {/* Total */}
                    <td className="py-3 px-2 text-right">
                      <span className={`font-black text-[13.5px] tabular-nums ${
                        ativo ? (modified ? "text-amber-700" : "text-blue-700") : "text-slate-400"
                      }`}>
                        {brl(total)}
                      </span>
                      {modified && ativo && (
                        <p className="text-[9px] text-slate-400 line-through tabular-nums">
                          {brl((comFaca ? linha.unitarioComFaca : linha.unitarioSemFaca) * linha.quantidade)}
                        </p>
                      )}
                    </td>

                    {/* Parcela */}
                    <td className="py-3 px-2 text-right">
                      <span className="text-[11.5px] text-slate-400 tabular-nums">{brl(parcela)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Resumo + reset */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-slate-500">
            <span className="font-semibold tabular-nums">{ativos.size}</span> de{" "}
            <span className="tabular-nums">{calculo.tabela.length}</span> tiers selecionados
          </p>
          {Object.keys(unitOvr).length > 0 && (
            <button onClick={() => setUnitOvr({})}
              className="text-[10.5px] text-amber-600 hover:text-amber-800 font-medium transition-colors">
              ↺ Restaurar preços
            </button>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-4 pb-4 pt-3 border-t border-slate-100 shrink-0">
          {nenhum && (
            <p className="text-[11px] text-rose-500 text-center mb-2">Selecione ao menos um tier para gerar o PDF.</p>
          )}
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
              className="w-full mb-2 py-2.5 text-[12px] font-bold bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors">
              Salvar alterações
            </button>
          )}
          <div className="flex gap-2">
            <button onClick={handleClose}
              className="px-3 py-2.5 text-[11.5px] text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">
              Fechar
            </button>
            <button
              onClick={() => onAbrirPdf(gerarHtmlOrcamento({ form, calculo, data, numero }))}
              className="flex-1 py-2.5 text-[11.5px] font-medium border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors">
              PDF Gráfica
            </button>
            <button
              disabled={nenhum}
              onClick={() => { onSyncOpcoes(cardId, buildOpcoes()); onWhatsApp(form, buildCustomCalculo(), numero) }}
              className="flex-1 py-2.5 text-[11.5px] font-semibold bg-[#25D366] hover:bg-[#20bd5a] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center justify-center gap-1.5">
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.847L0 24l6.335-1.502A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.373l-.36-.214-3.724.882.897-3.63-.235-.374A9.817 9.817 0 0 1 2.182 12c0-5.42 4.398-9.818 9.818-9.818 5.42 0 9.818 4.398 9.818 9.818 0 5.42-4.398 9.818-9.818 9.818z"/></svg>
              WhatsApp
            </button>
            <button
              disabled={nenhum}
              onClick={() => { onSyncOpcoes(cardId, buildOpcoes()); onAbrirPdf(gerarHtmlOrcamentoCliente({ form, calculo: buildCustomCalculo(), data, numero })) }}
              className="flex-1 py-2.5 text-[11.5px] font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors">
              PDF Cliente ↓
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
