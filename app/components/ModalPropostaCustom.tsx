"use client"

import { useState, useEffect, useRef } from "react"
import { Cliente, PropostaCustom, LinhaPropostaCustom } from "../types"
import { Material } from "../config"
import { brl } from "../utils"
import { ClienteCombobox } from "./ClienteFields"

function dataToInput(dataStr: string): string {
  // "19/05/2026, 10:15:47" → "2026-05-19"
  const m = dataStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : new Date().toISOString().slice(0, 10)
}

export function ModalPropostaCustom({
  clientes,
  materiais,
  parcFator,
  initialData,
  onClose,
  onSalvar,
  onPdf,
  onWhatsApp,
}: {
  clientes: Cliente[]
  materiais?: Material[]
  parcFator: number
  initialData?: PropostaCustom
  onClose: () => void
  onSalvar: (draft: Omit<PropostaCustom, "id" | "numero" | "cardId">) => void
  onPdf: (draft: Omit<PropostaCustom, "id" | "numero" | "cardId">) => void
  onWhatsApp: (p: PropostaCustom) => void
}) {
  const [nomeCliente, setNomeCliente]     = useState(initialData?.nomeCliente ?? "")
  const [descricao, setDescricao]         = useState(initialData?.descricao ?? "")
  const [material, setMaterial]           = useState(initialData?.material ?? "")
  const [dimensoes, setDimensoes]         = useState(initialData?.dimensoes ?? "")
  const [incluirVerniz, setIncluirVerniz] = useState(initialData?.incluirVerniz ?? false)
  const [comFaca, setComFaca]             = useState(initialData?.comFaca ?? false)
  const [valorFaca, setValorFaca]         = useState(initialData?.valorFaca ?? 0)
  const [numSKUs, setNumSKUs]             = useState(initialData?.numSKUs ?? 1)
  const [validadeDias, setValidadeDias]   = useState(initialData?.validadeDias ?? 7)
  const [obsCliente, setObsCliente]       = useState(initialData?.obsCliente ?? "")
  const [dataInput, setDataInput]         = useState(() =>
    initialData?.data ? dataToInput(initialData.data) : new Date().toISOString().slice(0, 10)
  )
  const [linhas, setLinhas] = useState<LinhaPropostaCustom[]>(
    initialData?.linhas ?? [
      { id: "1", quantidade: 1000,  unitario: 0, ativa: true,  isIdeal: false },
      { id: "2", quantidade: 5000,  unitario: 0, ativa: true,  isIdeal: true  },
      { id: "3", quantidade: 10000, unitario: 0, ativa: true,  isIdeal: false },
    ]
  )

  function addLinha() {
    setLinhas(prev => [...prev, {
      id: Date.now().toString(),
      quantidade: 0,
      unitario: 0,
      ativa: true,
      isIdeal: false,
    }])
  }

  function removeLinha(id: string) {
    setLinhas(prev => {
      const next = prev.filter(l => l.id !== id)
      if (!next.some(l => l.isIdeal) && next.length > 0) next[next.length - 1].isIdeal = true
      return next
    })
  }

  function updateLinha(id: string, field: keyof LinhaPropostaCustom, value: unknown) {
    setLinhas(prev => prev.map(l => {
      if (l.id !== id) return l
      if (field === "isIdeal" && value === true) return { ...l, isIdeal: true }
      return { ...l, [field]: value }
    }).map((l, _, arr) => {
      void arr
      if (field === "isIdeal" && l.id !== id) return { ...l, isIdeal: false }
      return l
    }))
  }

  function buildDraft(): Omit<PropostaCustom, "id" | "numero" | "cardId"> {
    const [y, m, d] = dataInput.split("-")
    const dataFormatada = `${d}/${m}/${y}, ${new Date().toLocaleTimeString("pt-BR")}`
    return { nomeCliente, descricao, material, dimensoes, incluirVerniz, comFaca, valorFaca, numSKUs, validadeDias, obsCliente, linhas, parcFator, data: dataFormatada }
  }

  const linhasAtivas = linhas.filter(l => l.ativa && l.quantidade > 0 && l.unitario >= 0)
  const podeSalvar = linhasAtivas.length > 0 && nomeCliente.trim().length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 flex flex-col overflow-hidden"
        style={{ maxHeight: "94vh" }}>

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9.5px] uppercase tracking-wide font-bold text-[#AF52DE] mb-1">Nova Proposta Personalizada</p>
              <p className="font-bold text-[#1C1C1E] text-[15px] leading-snug">Defina as quantidades e preços manualmente</p>
            </div>
            <button onClick={onClose}
              className="text-[rgba(60,60,67,0.3)] hover:text-[#8E8E93] transition-colors text-xl leading-none mt-0.5 shrink-0">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Cliente */}
          <div className="space-y-2">
            <p className="text-[9.5px] uppercase tracking-wide font-bold text-[#8E8E93]">Cliente</p>
            <ClienteCombobox value={nomeCliente} onChange={setNomeCliente} clientes={clientes} />
          </div>

          {/* Especificações opcionais */}
          <div className="space-y-2">
            <p className="text-[9.5px] uppercase tracking-wide font-bold text-[#8E8E93]">Especificações <span className="normal-case font-normal text-[rgba(60,60,67,0.3)]">(opcional)</span></p>
            <input
              type="text"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Produto (ex: Caixa perfume)"
              className="w-full border border-[rgba(60,60,67,0.12)] rounded-lg px-3 py-2 text-[13px] text-[#1C1C1E] placeholder:text-[rgba(60,60,67,0.3)] focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={dimensoes}
                onChange={e => setDimensoes(e.target.value)}
                placeholder="Dimensões (ex: 8×10×4 cm)"
                className="border border-[rgba(60,60,67,0.12)] rounded-lg px-3 py-2 text-[13px] text-[#1C1C1E] placeholder:text-[rgba(60,60,67,0.3)] focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400"
              />
              {materiais && materiais.length > 0 ? (
                <select
                  value={material}
                  onChange={e => setMaterial(e.target.value)}
                  className="border border-[rgba(60,60,67,0.12)] rounded-lg px-3 py-2 text-[13px] text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400 bg-white"
                >
                  <option value="">— Material —</option>
                  {materiais.map(m => (
                    <option key={m.id} value={m.nome}>{m.nome}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={material}
                  onChange={e => setMaterial(e.target.value)}
                  placeholder="Material (ex: Cartão 300g)"
                  className="border border-[rgba(60,60,67,0.12)] rounded-lg px-3 py-2 text-[13px] text-[#1C1C1E] placeholder:text-[rgba(60,60,67,0.3)] focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400"
                />
              )}
            </div>
            {/* Acabamentos */}
            <div className="flex flex-wrap gap-3 pt-1">
              {/* Verniz UV */}
              <button
                type="button"
                onClick={() => setIncluirVerniz(v => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] font-medium transition-all ${
                  incluirVerniz
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-[rgba(60,60,67,0.12)] bg-white text-[#8E8E93] hover:border-slate-300"
                }`}
              >
                <span className={`w-[14px] h-[14px] rounded-[4px] border-2 flex items-center justify-center shrink-0 transition-all ${
                  incluirVerniz ? "border-blue-600 bg-blue-600" : "border-slate-300"
                }`}>
                  {incluirVerniz && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                </span>
                Verniz UV
              </button>
              {/* Faca */}
              <button
                type="button"
                onClick={() => setComFaca(v => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] font-medium transition-all ${
                  comFaca
                    ? "border-amber-400 bg-amber-50 text-amber-700"
                    : "border-[rgba(60,60,67,0.12)] bg-white text-[#8E8E93] hover:border-slate-300"
                }`}
              >
                <span className={`w-[14px] h-[14px] rounded-[4px] border-2 flex items-center justify-center shrink-0 transition-all ${
                  comFaca ? "border-amber-500 bg-amber-500" : "border-slate-300"
                }`}>
                  {comFaca && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                </span>
                Faca de corte
              </button>
            </div>
            {/* Valor da faca + SKUs */}
            <div className="grid grid-cols-2 gap-2">
              {comFaca && (
                <div className="space-y-1">
                  <label className="text-[9.5px] uppercase tracking-wide font-bold text-[#8E8E93]">Valor da faca (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={valorFaca || ""}
                    onChange={e => setValorFaca(parseFloat(e.target.value) || 0)}
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 text-[13px] text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
                  />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-[9.5px] uppercase tracking-wide font-bold text-[#8E8E93]">Qtd de SKUs</label>
                <input
                  type="number"
                  min="1"
                  value={numSKUs}
                  onChange={e => setNumSKUs(parseInt(e.target.value) || 1)}
                  className="w-full border border-[rgba(60,60,67,0.12)] rounded-lg px-3 py-2 text-[13px] text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400"
                />
              </div>
            </div>
          </div>

          {/* Tabela de preços */}
          <div className="space-y-2">
            <p className="text-[9.5px] uppercase tracking-wide font-bold text-[#8E8E93]">Tabela de Preços</p>
            <div className="border border-[rgba(60,60,67,0.08)] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-[rgba(116,116,128,0.04)]">
                  <tr className="border-b border-[rgba(60,60,67,0.08)]">
                    <th className="py-2 px-3 w-9" />
                    <th className="py-2 px-2 text-left text-[9.5px] uppercase tracking-wider text-[#8E8E93] font-semibold">Quantidade</th>
                    <th className="py-2 px-2 text-right text-[9.5px] uppercase tracking-wider text-[#8E8E93] font-semibold">Unit. (R$)</th>
                    <th className="py-2 px-2 text-right text-[9.5px] uppercase tracking-wider text-[#8E8E93] font-semibold">Total</th>
                    <th className="py-2 px-2 text-center text-[9.5px] uppercase tracking-wider text-[#8E8E93] font-semibold">Ideal</th>
                    <th className="py-2 px-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {linhas.map(l => {
                    const total = l.unitario * l.quantidade
                    return (
                      <tr key={l.id} className={`transition-all ${!l.ativa ? "opacity-40" : ""}`}>
                        {/* Ativa toggle */}
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => updateLinha(l.id, "ativa", !l.ativa)}
                            className={`w-[16px] h-[16px] rounded-[4px] border-2 flex items-center justify-center transition-all ${
                              l.ativa ? "border-violet-600 bg-[#AF52DE]" : "border-slate-300 bg-white"
                            }`}
                          >
                            {l.ativa && (
                              <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        </td>
                        {/* Quantidade */}
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            min="1"
                            value={l.quantidade || ""}
                            onChange={e => updateLinha(l.id, "quantidade", parseInt(e.target.value) || 0)}
                            className="w-full text-[12.5px] font-semibold tabular-nums border border-[rgba(60,60,67,0.12)] rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400"
                          />
                        </td>
                        {/* Unitário */}
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.unitario || ""}
                            onChange={e => updateLinha(l.id, "unitario", parseFloat(e.target.value) || 0)}
                            onFocus={e => e.target.select()}
                            className="w-full text-right text-[12.5px] font-semibold tabular-nums border border-[rgba(60,60,67,0.12)] rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400"
                          />
                        </td>
                        {/* Total */}
                        <td className="py-2.5 px-2 text-right">
                          <span className="text-[13px] font-semibold tabular-nums text-[#1C1C1E]">
                            {total > 0 ? brl(total) : "—"}
                          </span>
                        </td>
                        {/* Ideal radio */}
                        <td className="py-2.5 px-2 text-center">
                          <button
                            onClick={() => updateLinha(l.id, "isIdeal", true)}
                            className={`w-[16px] h-[16px] rounded-full border-2 flex items-center justify-center mx-auto transition-all ${
                              l.isIdeal ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white hover:border-blue-400"
                            }`}
                          >
                            {l.isIdeal && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                          </button>
                        </td>
                        {/* Remover */}
                        <td className="py-2.5 px-2">
                          {linhas.length > 1 && (
                            <button onClick={() => removeLinha(l.id)}
                              className="text-slate-200 hover:text-rose-400 transition-colors text-lg leading-none">×</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="px-4 py-2.5 border-t border-[rgba(60,60,67,0.06)] bg-[rgba(116,116,128,0.04)]/50">
                <button onClick={addLinha}
                  className="flex items-center gap-1 text-[11.5px] text-[#AF52DE] hover:text-violet-800 font-medium transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Adicionar linha
                </button>
              </div>
            </div>
            <p className="text-[10px] text-[#8E8E93]">Coluna <span className="font-semibold">Ideal</span> marca qual linha é recomendada no PDF.</p>
          </div>

          {/* Validade + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9.5px] uppercase tracking-wide font-bold text-[#8E8E93]">Validade (dias)</label>
              <input
                type="number"
                min="1"
                value={validadeDias}
                onChange={e => setValidadeDias(parseInt(e.target.value) || 7)}
                className="w-full border border-[rgba(60,60,67,0.12)] rounded-lg px-3 py-2 text-[13px] text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9.5px] uppercase tracking-wide font-bold text-[#8E8E93]">Data da proposta</label>
              <input
                type="date"
                value={dataInput}
                onChange={e => setDataInput(e.target.value)}
                className="w-full border border-[rgba(60,60,67,0.12)] rounded-lg px-3 py-2 text-[13px] text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[9.5px] uppercase tracking-wide font-bold text-[#8E8E93]">Observações para o cliente <span className="normal-case font-normal text-[rgba(60,60,67,0.3)]">(opcional)</span></label>
            <textarea
              value={obsCliente}
              onChange={e => setObsCliente(e.target.value)}
              rows={3}
              placeholder="Detalhes adicionais, condições especiais…"
              className="w-full border border-[rgba(60,60,67,0.12)] rounded-lg px-3 py-2 text-[13px] text-[#1C1C1E] placeholder:text-[rgba(60,60,67,0.3)] focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400 resize-none"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-[rgba(60,60,67,0.08)] shrink-0 space-y-2">
          {!nomeCliente.trim() && (
            <p className="text-[11px] text-rose-500 text-center">Informe o nome do cliente para continuar.</p>
          )}
          {linhasAtivas.length === 0 && nomeCliente.trim() && (
            <p className="text-[11px] text-rose-500 text-center">Adicione ao menos uma linha com quantidade e preço.</p>
          )}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-2.5 text-[11.5px] text-[#8E8E93] hover:text-[rgba(60,60,67,0.75)] hover:bg-[rgba(116,116,128,0.04)] rounded-xl transition-colors">
              Cancelar
            </button>
            <button
              disabled={!podeSalvar}
              onClick={() => onPdf(buildDraft())}
              className="flex-1 py-2.5 text-[11.5px] font-medium border border-[rgba(60,60,67,0.12)] hover:border-slate-300 hover:bg-[rgba(116,116,128,0.04)] text-[rgba(60,60,67,0.6)] rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Pré-visualizar PDF
            </button>
            <button
              disabled={!podeSalvar}
              onClick={() => {
                const draft = buildDraft()
                const p: PropostaCustom = {
                  ...draft,
                  id: "tmp",
                  numero: "PRÉVIA",
                  data: new Date().toLocaleString("pt-BR"),
                  cardId: "tmp",
                }
                onWhatsApp(p)
              }}
              className="flex-1 py-2.5 text-[11.5px] font-semibold bg-[#25D366] hover:bg-[#20bd5a] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center justify-center gap-1.5">
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.847L0 24l6.335-1.502A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.373l-.36-.214-3.724.882.897-3.63-.235-.374A9.817 9.817 0 0 1 2.182 12c0-5.42 4.398-9.818 9.818-9.818 5.42 0 9.818 4.398 9.818 9.818 0 5.42-4.398 9.818-9.818 9.818z"/></svg>
              WhatsApp
            </button>
            <button
              disabled={!podeSalvar}
              onClick={() => onSalvar(buildDraft())}
              className="flex-1 py-2.5 text-[11.5px] font-bold bg-[#AF52DE] hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors">
              Salvar Proposta
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function BoxPreview3D({
  largura, altura, profundidade, materialNome, incluirVerniz,
}: {
  largura: number; altura: number; profundidade: number
  materialNome?: string; incluirVerniz?: boolean
}) {
  const [rot, setRot] = useState({ x: -22, y: 28 })
  const rotRef    = useRef({ x: -22, y: 28 })
  const isPaused  = useRef(false)
  const rafRef    = useRef<number>(0)
  const lastPos   = useRef({ x: 0, y: 0 })
  const dragRef   = useRef(false)
  const [dragging, setDragging] = useState(false)
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-rotate loop
  useEffect(() => {
    function tick() {
      if (!isPaused.current) {
        rotRef.current = { x: rotRef.current.x, y: rotRef.current.y + 0.28 }
        setRot({ ...rotRef.current })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Global mouse listeners (always active so drag outside box works)
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return
      const dx = e.clientX - lastPos.current.x
      const dy = e.clientY - lastPos.current.y
      lastPos.current = { x: e.clientX, y: e.clientY }
      rotRef.current = {
        x: Math.max(-78, Math.min(78, rotRef.current.x - dy * 0.48)),
        y: rotRef.current.y + dx * 0.48,
      }
      setRot({ ...rotRef.current })
    }
    function onUp() {
      if (!dragRef.current) return
      dragRef.current = false
      setDragging(false)
      if (resumeTimer.current) clearTimeout(resumeTimer.current)
      resumeTimer.current = setTimeout(() => { isPaused.current = false }, 1600)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    isPaused.current = true
    if (resumeTimer.current) clearTimeout(resumeTimer.current)
    dragRef.current = true
    setDragging(true)
    lastPos.current = { x: e.clientX, y: e.clientY }
  }

  // Scale: max dimension → 148px, clamped per-cm
  const maxDim = Math.max(largura, altura, profundidade, 0.01)
  const S = Math.min(148 / maxDim, 28)
  const W = Math.max(largura * S, 10)
  const H = Math.max(altura * S, 10)
  const D = Math.max(profundidade * S, 10)

  const edge = "rgba(100,116,139,0.20)"

  // Face colors: simulate ambient lighting
  const cFront  = incluirVerniz ? "linear-gradient(150deg,#eff6ff,#dbeafe)" : "linear-gradient(150deg,#f8fafc,#eef2f7)"
  const cSideR  = incluirVerniz ? "linear-gradient(160deg,#dbeafe,#c3d9f7)" : "linear-gradient(160deg,#e4eaf2,#d8e0ea)"
  const cSideL  = incluirVerniz ? "linear-gradient(160deg,#bfdbfe,#a5c8f7)" : "linear-gradient(160deg,#d8e0ea,#cdd5df)"
  const cTop    = incluirVerniz ? "linear-gradient(145deg,#f0f9ff,#e0f2fe)" : "linear-gradient(145deg,#f8fafc,#ecf1f7)"
  const cDark   = incluirVerniz ? "#93c5fd" : "#c8d3de"

  const sceneW = W + D + 90
  const sceneH = H + D + 90

  return (
    <div className="flex flex-col items-center gap-3 select-none" style={{ userSelect: "none" }}>

      {/* 3D Scene */}
      <div style={{ width: sceneW, height: sceneH, display: "flex", alignItems: "center", justifyContent: "center", perspective: "900px" }}>
        <div
          onMouseDown={onMouseDown}
          style={{
            width: W, height: H,
            position: "relative",
            transformStyle: "preserve-3d",
            transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
            cursor: dragging ? "grabbing" : "grab",
          }}
        >
          {/* Front */}
          <div style={{ position:"absolute", left:0, top:0, width:W, height:H, background:cFront, border:`1px solid ${edge}`, backfaceVisibility:"hidden", transform:`translateZ(${D/2}px)`, boxSizing:"border-box" }} />
          {/* Back */}
          <div style={{ position:"absolute", left:0, top:0, width:W, height:H, background:cDark, border:`1px solid ${edge}`, backfaceVisibility:"hidden", transform:`rotateY(180deg) translateZ(${D/2}px)`, boxSizing:"border-box" }} />
          {/* Right */}
          <div style={{ position:"absolute", left:(W-D)/2, top:0, width:D, height:H, background:cSideR, border:`1px solid ${edge}`, backfaceVisibility:"hidden", transform:`rotateY(90deg) translateZ(${W/2}px)`, boxSizing:"border-box" }} />
          {/* Left */}
          <div style={{ position:"absolute", left:(W-D)/2, top:0, width:D, height:H, background:cSideL, border:`1px solid ${edge}`, backfaceVisibility:"hidden", transform:`rotateY(-90deg) translateZ(${W/2}px)`, boxSizing:"border-box" }} />
          {/* Top */}
          <div style={{ position:"absolute", left:0, top:(H-D)/2, width:W, height:D, background:cTop, border:`1px solid ${edge}`, backfaceVisibility:"hidden", transform:`rotateX(90deg) translateZ(${H/2}px)`, boxSizing:"border-box" }} />
          {/* Bottom */}
          <div style={{ position:"absolute", left:0, top:(H-D)/2, width:W, height:D, background:cDark, border:`1px solid ${edge}`, backfaceVisibility:"hidden", transform:`rotateX(-90deg) translateZ(${H/2}px)`, boxSizing:"border-box" }} />
        </div>
      </div>

      {/* Dimension chips */}
      <div className="flex items-center gap-1.5">
        {([ ["L", largura], ["A", altura], ["P", profundidade] ] as [string, number][]).map(([label, val]) => (
          <span key={label} className="bg-[rgba(116,116,128,0.08)] rounded-md px-2 py-0.5 text-[11px] font-semibold text-[rgba(60,60,67,0.75)] tabular-nums">
            <span className="text-[#8E8E93] text-[9px] font-normal">{label} </span>{val}
          </span>
        ))}
        <span className="text-[#8E8E93] text-[11px]">cm</span>
        {materialNome && <span className="text-[rgba(60,60,67,0.3)] text-[10px] ml-1">{materialNome}</span>}
        {incluirVerniz && <span className="text-blue-500 text-[9px] font-bold bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full ml-1">UV</span>}
      </div>

      <p className="text-[9px] text-[rgba(60,60,67,0.3)] tracking-wide uppercase">arraste para girar</p>
    </div>
  )
}
