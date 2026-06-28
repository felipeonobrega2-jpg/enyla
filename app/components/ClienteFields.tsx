"use client"

import { useState, useEffect, useRef } from "react"
import { Cliente } from "../types"

const inputCls = "w-full h-9 border border-slate-200 rounded-lg px-3 text-[13px] text-slate-900 placeholder:text-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-400 transition-all"

export function ClienteCombobox({
  value, onChange, clientes,
}: {
  value: string
  onChange: (v: string) => void
  clientes: Cliente[]
}) {
  const [open, setOpen]           = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  const matches = value.trim().length >= 2
    ? clientes.filter(c => c.nome.toLowerCase().includes(value.toLowerCase())).slice(0, 6)
    : []

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  function select(nome: string) {
    onChange(nome)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || !matches.length) return
    if (e.key === "ArrowDown")  { e.preventDefault(); setHighlighted(h => Math.min(h + 1, matches.length - 1)) }
    if (e.key === "ArrowUp")    { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
    if (e.key === "Enter")      { e.preventDefault(); select(matches[highlighted].nome) }
    if (e.key === "Escape")     { setOpen(false) }
  }

  const showDropdown = open && matches.length > 0

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder="Nome do cliente"
        className={inputCls}
        onChange={e => { onChange(e.target.value); setHighlighted(0); setOpen(e.target.value.trim().length >= 2) }}
        onFocus={() => { setOpen(value.trim().length >= 2); setHighlighted(0) }}
        onKeyDown={onKeyDown}
      />

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {matches.map((c, i) => (
            <button
              key={c.id}
              onMouseDown={e => { e.preventDefault(); select(c.nome) }}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                i === highlighted ? "bg-violet-50" : "hover:bg-slate-50"
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                {c.nome[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-[12.5px] truncate leading-tight">{c.nome}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                  {c.telefone ?? c.email ?? c.criadoEm}
                </p>
              </div>
              {i === highlighted && (
                <svg className="w-3 h-3 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ClienteContactCard({
  cliente, nome, onUpdate,
}: {
  cliente: Cliente | null
  nome: string
  onUpdate: (updates: Partial<Cliente>) => void
}) {
  const hasData = !!(cliente?.telefone || cliente?.email || cliente?.cnpj || cliente?.notas)
  // Novo cliente (sem dados) ou draft → abre automaticamente
  const [aberto, setAberto] = useState(!hasData)

  return (
    <div className="mt-2 rounded-xl border border-slate-200/80 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setAberto(a => !a)}
        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="w-6 h-6 rounded-full bg-slate-900 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
          {nome[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-slate-700 truncate leading-tight">{nome}</p>
          {cliente?.telefone && (
            <p className="text-[9.5px] text-slate-400 mt-0.5">{cliente.telefone}</p>
          )}
          {!hasData && (
            <p className="text-[9.5px] text-violet-500 mt-0.5">+ Adicionar contato</p>
          )}
        </div>
        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${aberto ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Contact fields */}
      {aberto && (
        <div className="border-t border-slate-100 px-3 py-3 space-y-2 bg-slate-50/50">
          <ContactField
            icon={
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current text-emerald-500"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.847L0 24l6.335-1.502A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.373l-.36-.214-3.724.882.897-3.63-.235-.374A9.817 9.817 0 012.182 12c0-5.42 4.398-9.818 9.818-9.818 5.42 0 9.818 4.398 9.818 9.818 0 5.42-4.398 9.818-9.818 9.818z"/></svg>
            }
            value={cliente?.telefone ?? ""}
            placeholder="WhatsApp / Telefone"
            onBlur={v => onUpdate({ telefone: v || undefined })}
            action={cliente?.telefone
              ? () => window.open(`https://wa.me/55${cliente!.telefone!.replace(/\D/g, "")}`, "_blank")
              : undefined
            }
          />
          <ContactField
            icon={
              <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            value={cliente?.email ?? ""}
            placeholder="E-mail"
            onBlur={v => onUpdate({ email: v || undefined })}
          />
          <ContactField
            icon={
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            }
            value={cliente?.cnpj ?? ""}
            placeholder="CNPJ (opcional)"
            onBlur={v => onUpdate({ cnpj: v || undefined })}
          />
          <ContactField
            icon={
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            }
            value={cliente?.notas ?? ""}
            placeholder="Notas rápidas…"
            onBlur={v => onUpdate({ notas: v || undefined })}
            multiline
          />
        </div>
      )}
    </div>
  )
}

function ContactField({
  icon, value, placeholder, onBlur, action, multiline,
}: {
  icon: React.ReactNode
  value: string
  placeholder: string
  onBlur: (v: string) => void
  action?: () => void
  multiline?: boolean
}) {
  const [local, setLocal] = useState(value)

  useEffect(() => { setLocal(value) }, [value])

  const fieldCls = "flex-1 text-[11.5px] text-slate-700 placeholder:text-slate-300 bg-transparent focus:outline-none leading-relaxed"

  return (
    <div className="flex items-start gap-2 group">
      <span className="shrink-0 mt-0.5 w-4 flex items-center justify-center">{icon}</span>
      {multiline ? (
        <textarea
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={e => onBlur(e.target.value.trim())}
          placeholder={placeholder}
          rows={2}
          className={`${fieldCls} resize-none`}
        />
      ) : (
        <input
          type="text"
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={e => onBlur(e.target.value.trim())}
          placeholder={placeholder}
          className={fieldCls}
        />
      )}
      {action && local && (
        <button
          onClick={action}
          title="Abrir no WhatsApp"
          className="shrink-0 w-5 h-5 flex items-center justify-center text-emerald-500 hover:text-emerald-700 opacity-0 group-hover:opacity-100 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      )}
    </div>
  )
}
