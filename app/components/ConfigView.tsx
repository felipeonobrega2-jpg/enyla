"use client"

import React, { useState, useRef, useEffect } from "react"
import { Configuracoes, Material, CONFIG_PADRAO } from "../config"
import { useTheme, ThemeChoice } from "./ThemeProvider"

export function ConfigView({ config, onSave, onExportar, onImportar }: {
  config: Configuracoes
  onSave: (c: Configuracoes) => void
  onExportar: () => void
  onImportar: (file: File) => void
}) {
  const [draft, setDraft] = useState<Configuracoes>(config)
  const importRef = useRef<HTMLInputElement>(null)

  // Sync draft when config loads from API (useState only uses initial value once)
  useEffect(() => { setDraft(config) }, [config])

  function setCusto(k: keyof Configuracoes["custos"], v: number) {
    setDraft(d => ({ ...d, custos: { ...d.custos, [k]: v } }))
  }
  function setMult(k: keyof Configuracoes["multiplicadores"], v: number) {
    setDraft(d => ({ ...d, multiplicadores: { ...d.multiplicadores, [k]: v } }))
  }

  const { theme, setTheme } = useTheme()

  const themeOptions: { value: ThemeChoice; label: string; icon: React.ReactNode }[] = [
    {
      value: "system",
      label: "Sistema",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3" />
        </svg>
      ),
    },
    {
      value: "light",
      label: "Claro",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      ),
    },
    {
      value: "dark",
      label: "Escuro",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      ),
    },
  ]

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

      {/* Aparência */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
          </svg>
          <p className="text-xs font-semibold text-slate-600">Aparência</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[11px] text-slate-400 mb-3">Tema da interface. "Sistema" acompanha automaticamente a preferência do seu dispositivo.</p>
          <div className="flex gap-2">
            {themeOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-semibold transition-all ${
                  theme === opt.value
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400"
                    : "border-slate-200 dark:border-[#30363d] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#484f58] hover:bg-slate-50 dark:hover:bg-[#1e2535]"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
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

// Isolated row so nome uses local state — prevents cursor-jumping on each keystroke
function MaterialRow({ m, formatoIds, onNomeChange, onPrecoChange, onRemove }: {
  m: Material
  formatoIds: string[]
  onNomeChange: (id: string, nome: string) => void
  onPrecoChange: (id: string, fmtId: string, v: number) => void
  onRemove: (id: string) => void
}) {
  const [nome, setNome] = useState(m.nome)
  useEffect(() => { setNome(m.nome) }, [m.nome])

  return (
    <div className="flex items-center px-4 py-2.5 gap-4">
      <input
        value={nome}
        onChange={e => setNome(e.target.value)}
        onBlur={e => onNomeChange(m.id, e.target.value)}
        className="flex-1 border border-transparent hover:border-slate-200 focus:border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
      />
      {formatoIds.map(fmtId => (
        <div key={fmtId} className="relative w-28">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">R$</span>
          <input type="number" min={0} step={1}
            value={m.precos[fmtId] ?? 0}
            onChange={e => onPrecoChange(m.id, fmtId, Number(e.target.value))}
            className="w-full border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 text-sm text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
      ))}
      <button onClick={() => onRemove(m.id)}
        className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors text-lg leading-none shrink-0">
        ×
      </button>
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
          <MaterialRow
            key={m.id}
            m={m}
            formatoIds={formatoIds}
            onNomeChange={setNome}
            onPrecoChange={setPreco}
            onRemove={remover}
          />
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
