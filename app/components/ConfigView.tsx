"use client"

import { useState, useRef } from "react"
import { Configuracoes, Material, CONFIG_PADRAO } from "../config"

export function ConfigView({ config, onSave, onExportar, onImportar }: {
  config: Configuracoes
  onSave: (c: Configuracoes) => void
  onExportar: () => void
  onImportar: (file: File) => void
}) {
  const [draft, setDraft] = useState<Configuracoes>(config)
  const importRef = useRef<HTMLInputElement>(null)

  function setCusto(k: keyof Configuracoes["custos"], v: number) {
    setDraft(d => ({ ...d, custos: { ...d.custos, [k]: v } }))
  }
  function setMult(k: keyof Configuracoes["multiplicadores"], v: number) {
    setDraft(d => ({ ...d, multiplicadores: { ...d.multiplicadores, [k]: v } }))
  }

  const custosLabels: [keyof Configuracoes["custos"], string, string][] = [
    ["impressaoPorChapa", "Impressão por chapa", "R$/chapa"],
    ["corteAcerto",       "Corte — acerto",      "R$ fixo"],
    ["corteMilheiro",     "Corte — milheiro",    "R$/milheiro"],
    ["vernizPor2000",     "Verniz UV",            "R$/2000 un"],
    ["colagemMilheiro",   "Colagem",              "R$/milheiro"],
    ["arte",              "Arte / diagramação",   "R$ fixo"],
  ]

  const multLabels: [keyof Configuracoes["multiplicadores"], string, string][] = [
    ["semFaca",       "Multiplicador sem faca",  "×custo"],
    ["comFaca",       "Multiplicador com faca",  "×custo"],
    ["parcelamento12x","Fator parcelamento 12×", "×preço"],
  ]

  return (
    <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">Configurações de custos</p>
        <div className="flex gap-2">
          <button onClick={() => setDraft(CONFIG_PADRAO)}
            className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs rounded-lg transition-colors">
            Restaurar padrões
          </button>
          <button onClick={() => onSave(draft)}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors">
            Salvar configurações
          </button>
        </div>
      </div>

      {/* Chave da API — Forma */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-slate-900 flex items-center justify-center">
            <span className="text-white text-[9px] font-black">F</span>
          </div>
          <p className="text-xs font-semibold text-slate-600">Forma — Chave da API</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-slate-400 mb-2">Chave Anthropic para usar a IA de design de embalagens.</p>
          <input
            type="password"
            value={draft.apiKey}
            onChange={e => setDraft(d => ({ ...d, apiKey: e.target.value }))}
            placeholder="sk-ant-api03-…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-mono placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-600">Custos de produção</p>
        </div>
        <div className="divide-y divide-slate-50">
          {custosLabels.map(([k, label, unit]) => (
            <div key={k} className="flex items-center px-4 py-3 gap-4">
              <div className="flex-1">
                <p className="text-sm text-slate-700">{label}</p>
                <p className="text-[11px] text-slate-400">{unit}</p>
              </div>
              <div className="relative w-32">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">R$</span>
                <input type="number" min={0} step={0.01}
                  value={draft.custos[k]}
                  onChange={e => setCusto(k, Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-600">Multiplicadores de preço</p>
        </div>
        <div className="divide-y divide-slate-50">
          {multLabels.map(([k, label, unit]) => (
            <div key={k} className="flex items-center px-4 py-3 gap-4">
              <div className="flex-1">
                <p className="text-sm text-slate-700">{label}</p>
                <p className="text-[11px] text-slate-400">{unit}</p>
              </div>
              <input type="number" min={0} step={0.01}
                value={draft.multiplicadores[k]}
                onChange={e => setMult(k, Number(e.target.value))}
                className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          ))}
        </div>
      </div>

      <MaterialConfig
        materiais={draft.materiais}
        formatoIds={["66x96", "77x113"]}
        onChange={materiais => setDraft(d => ({ ...d, materiais }))}
      />

      {/* Backup */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
          <p className="text-xs font-semibold text-slate-600">Backup de dados</p>
          <span className="text-[9.5px] text-slate-400 font-normal">histórico, clientes, kanban e configurações</span>
        </div>
        <div className="px-4 py-4 flex items-center gap-3">
          <button
            onClick={onExportar}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar JSON
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
            </svg>
            Importar JSON
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onImportar(f); e.target.value = "" }}
          />
          <p className="text-[10.5px] text-slate-400 ml-1">Substitui todos os dados locais pelo arquivo importado.</p>
        </div>
      </div>
    </div>
  )
}

function MaterialConfig({
  materiais, formatoIds, onChange,
}: {
  materiais: Material[]
  formatoIds: string[]
  onChange: (m: Material[]) => void
}) {
  const [novoNome, setNovoNome] = useState("")

  function setPreco(id: string, fmtId: string, v: number) {
    onChange(materiais.map(m => m.id === id ? { ...m, precos: { ...m.precos, [fmtId]: v } } : m))
  }
  function setNome(id: string, nome: string) {
    onChange(materiais.map(m => m.id === id ? { ...m, nome } : m))
  }
  function remover(id: string) {
    onChange(materiais.filter(m => m.id !== id))
  }
  function adicionar() {
    const nome = novoNome.trim()
    if (!nome) return
    const id = nome.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
    if (materiais.find(m => m.id === id)) return
    const precos: { [k: string]: number } = {}
    formatoIds.forEach(f => { precos[f] = 0 })
    onChange([...materiais, { id, nome, precos }])
    setNovoNome("")
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
        <p className="text-xs font-semibold text-slate-600">Materiais / Gramaturas</p>
        <p className="text-[11px] text-slate-400 mt-0.5">R$ por 100 folhas, por formato de papel</p>
      </div>

      {/* Cabeçalho de formatos */}
      <div className="flex items-center px-4 py-2 border-b border-slate-50 text-[10px] uppercase tracking-wider text-slate-400 font-semibold gap-4">
        <span className="flex-1">Material</span>
        {formatoIds.map(f => <span key={f} className="w-28 text-right">{f}</span>)}
        <span className="w-8" />
      </div>

      <div className="divide-y divide-slate-50">
        {materiais.map(m => (
          <div key={m.id} className="flex items-center px-4 py-2.5 gap-4">
            <input
              value={m.nome}
              onChange={e => setNome(m.id, e.target.value)}
              className="flex-1 border border-transparent hover:border-slate-200 focus:border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
            {formatoIds.map(fmtId => (
              <div key={fmtId} className="relative w-28">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">R$</span>
                <input type="number" min={0} step={1}
                  value={m.precos[fmtId] ?? 0}
                  onChange={e => setPreco(m.id, fmtId, Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 text-sm text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            ))}
            <button onClick={() => remover(m.id)}
              className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors text-lg leading-none shrink-0">
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Adicionar novo */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50">
        <input
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          onKeyDown={e => e.key === "Enter" && adicionar()}
          placeholder="Novo material (ex: Couchê 170g)…"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button onClick={adicionar}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors">
          + Adicionar
        </button>
      </div>
    </div>
  )
}
