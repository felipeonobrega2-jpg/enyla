"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { KanbanCard, Cliente, LancamentoFinanceiro, COLUNAS_KANBAN } from "../types"
import { brl } from "../utils"

type HistEntry = {
  numero?: string
  data: string
  form: { nomeCliente: string; materialNome: string; frente: number; alturaBox: number; lateral: number }
}

type Resultado = {
  id: string
  tipo: "orcamento" | "pedido" | "cliente" | "lancamento"
  titulo: string
  subtitulo: string
  valor?: number
  view: string
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}
function hit(field: string | undefined | null, q: string) {
  return !!field && norm(field).includes(norm(q))
}

const LABEL_TIPO: Record<string, string> = {
  orcamento:  "Orçamentos",
  pedido:     "Pedidos",
  cliente:    "Clientes",
  lancamento: "Lançamentos",
}

function Icone({ tipo, selected }: { tipo: string; selected: boolean }) {
  const cls = `w-3.5 h-3.5 ${selected ? "text-[#5009c4]" : "text-[#8E8E93]"}`
  if (tipo === "orcamento") return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
  if (tipo === "pedido") return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  )
  if (tipo === "cliente") return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  )
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
    </svg>
  )
}

export default function BuscaGlobal({
  historico,
  kanban,
  clientes,
  lancamentos,
  onClose,
  onNavigate,
}: {
  historico: HistEntry[]
  kanban: KanbanCard[]
  clientes: Cliente[]
  lancamentos: LancamentoFinanceiro[]
  onClose: () => void
  onNavigate: (view: string) => void
}) {
  const [query, setQuery] = useState("")
  const [sel, setSel]     = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const resultados = useMemo((): Resultado[] => {
    const q = query.trim()
    if (!q) return []
    const out: Resultado[] = []

    // Orçamentos
    let countOrc = 0
    for (const item of historico) {
      if (countOrc >= 4) break
      if (hit(item.numero, q) || hit(item.form.nomeCliente, q) || hit(item.form.materialNome, q)) {
        out.push({
          id: `orc-${item.numero ?? item.data}`,
          tipo: "orcamento",
          titulo: [item.numero ? `#${item.numero}` : null, item.form.nomeCliente].filter(Boolean).join(" · "),
          subtitulo: `${item.form.materialNome} · ${item.form.frente}×${item.form.alturaBox}×${item.form.lateral} cm · ${item.data.split(",")[0]}`,
          view: "historico",
        })
        countOrc++
      }
    }

    // Pedidos (kanban)
    let countPed = 0
    for (const card of kanban) {
      if (countPed >= 4) break
      if (hit(card.numero, q) || hit(card.nomeCliente, q) || hit(card.loteNumero, q) || hit(card.materialNome, q)) {
        out.push({
          id: `ped-${card.id}`,
          tipo: "pedido",
          titulo: [card.numero ? `#${card.numero}` : null, card.nomeCliente].filter(Boolean).join(" · "),
          subtitulo: [COLUNAS_KANBAN[card.coluna], card.materialNome, card.loteNumero ? `Lote ${card.loteNumero}` : null].filter(Boolean).join(" · "),
          valor: card.preco,
          view: "kanban",
        })
        countPed++
      }
    }

    // Clientes
    let countCli = 0
    for (const c of clientes) {
      if (countCli >= 3) break
      if (hit(c.nome, q) || hit(c.telefone, q) || hit(c.email, q)) {
        out.push({
          id: `cli-${c.id}`,
          tipo: "cliente",
          titulo: c.nome,
          subtitulo: [c.telefone, c.email].filter(Boolean).join(" · ") || "Sem contato",
          view: "clientes",
        })
        countCli++
      }
    }

    // Lançamentos
    let countLan = 0
    for (const l of lancamentos) {
      if (countLan >= 3) break
      if (hit(l.descricao, q) || hit(l.nomeCliente, q)) {
        out.push({
          id: `lan-${l.id}`,
          tipo: "lancamento",
          titulo: l.descricao,
          subtitulo: [l.nomeCliente, l.dataVencimento, l.status === "pago" ? "Pago" : "Pendente"].filter(Boolean).join(" · "),
          valor: l.valor,
          view: "financeiro",
        })
        countLan++
      }
    }

    return out
  }, [query, historico, kanban, clientes, lancamentos])

  useEffect(() => { setSel(0) }, [resultados])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape")    { onClose(); return }
      if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(s + 1, resultados.length - 1)) }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
      if (e.key === "Enter" && resultados[sel]) { onNavigate(resultados[sel].view); onClose() }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [resultados, sel, onClose, onNavigate])

  const tipos = ["orcamento", "pedido", "cliente", "lancamento"] as const
  const isEmpty = query.trim() === ""
  const noResults = !isEmpty && resultados.length === 0

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[12vh]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[rgba(60,60,67,0.1)]">
          <svg className="w-4 h-4 text-[#8E8E93] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar orçamentos, pedidos, clientes, lançamentos…"
            className="flex-1 text-[15px] text-[#1C1C1E] placeholder:text-[#C7C7CC] focus:outline-none bg-transparent"
          />
          {query && (
            <button onClick={() => setQuery("")}
              className="w-5 h-5 rounded-full bg-[rgba(116,116,128,0.15)] text-[#8E8E93] flex items-center justify-center text-sm leading-none hover:bg-[rgba(116,116,128,0.25)] transition-colors shrink-0">
              ×
            </button>
          )}
          <kbd className="text-[10px] text-[#8E8E93] bg-[rgba(116,116,128,0.1)] px-1.5 py-0.5 rounded font-medium shrink-0">Esc</kbd>
        </div>

        {/* Body */}
        {isEmpty ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[13px] text-[#C7C7CC]">Orçamentos · Pedidos · Clientes · Lançamentos</p>
          </div>
        ) : noResults ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[13px] font-medium text-[#1C1C1E] mb-1">Nenhum resultado</p>
            <p className="text-[12px] text-[#8E8E93]">Nada encontrado para "{query}"</p>
          </div>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto py-1.5">
            {tipos.map(tipo => {
              const grupo = resultados.filter(r => r.tipo === tipo)
              if (!grupo.length) return null
              return (
                <div key={tipo}>
                  <p className="px-4 pt-2.5 pb-1 text-[9.5px] font-bold uppercase tracking-wide text-[#8E8E93]">
                    {LABEL_TIPO[tipo]}
                  </p>
                  {grupo.map(r => {
                    const idx = resultados.indexOf(r)
                    const isSelected = idx === sel
                    return (
                      <button
                        key={r.id}
                        onClick={() => { onNavigate(r.view); onClose() }}
                        onMouseEnter={() => setSel(idx)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          isSelected ? "bg-[#5009c4]/[0.06]" : "hover:bg-[rgba(0,0,0,0.02)]"
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? "bg-[#5009c4]/10" : "bg-[rgba(116,116,128,0.08)]"
                        }`}>
                          <Icone tipo={tipo} selected={isSelected} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-medium text-[#1C1C1E] truncate">{r.titulo}</p>
                          <p className="text-[10.5px] text-[#8E8E93] truncate mt-0.5">{r.subtitulo}</p>
                        </div>
                        {r.valor !== undefined && (
                          <p className="text-[12px] font-semibold text-[#1C1C1E] tabular-nums shrink-0">{brl(r.valor)}</p>
                        )}
                        {isSelected && (
                          <svg className="w-3.5 h-3.5 text-[#5009c4] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        {resultados.length > 0 && (
          <div className="border-t border-[rgba(60,60,67,0.08)] px-4 py-2 flex items-center gap-4">
            {[["↑↓", "navegar"], ["↵", "abrir"], ["Esc", "fechar"]].map(([k, l]) => (
              <span key={k} className="flex items-center gap-1 text-[10px] text-[#8E8E93]">
                <kbd className="bg-[rgba(116,116,128,0.1)] px-1 py-0.5 rounded text-[9px] font-medium">{k}</kbd>
                {l}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
