"use client"

// Orçamento → Dieline: acha a faca guardada (pelo seu nome, palavras-chave, modelo ou medida) sem abrir a página de facas.
// Digita "perfume 20ml", clica e o desenho vai para a mesa.

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, Scissors, Loader2 } from "lucide-react"
import { Desenho, buscarDesenhos, tagsMaisUsadas, nomeDoDesenho, descricaoCaixa, normalizarBusca } from "../lib/biblioteca"

export function BuscaFacaGuardada({ onEscolher }: { onEscolher: (d: Desenho) => void | Promise<void> }) {
  const [lista, setLista] = useState<Desenho[] | null>(null)
  const [termo, setTermo] = useState("")
  const [aberto, setAberto] = useState(false)
  const [abrindo, setAbrindo] = useState<string | null>(null)
  const caixa = useRef<HTMLDivElement>(null)

  // Só busca a biblioteca quando você usa o campo
  const carregar = () => { if (lista === null) fetch("/api/biblioteca").then(r => r.json()).then(d => setLista(d.desenhos ?? [])).catch(() => setLista([])) }
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener("mousedown", fora)
    return () => document.removeEventListener("mousedown", fora)
  }, [])

  const achados = useMemo(() => buscarDesenhos(lista ?? [], termo).slice(0, 8), [lista, termo])
  const atalhos = useMemo(() => tagsMaisUsadas(lista ?? [], 8), [lista])
  const usados = normalizarBusca(termo).split(" ")

  async function escolher(d: Desenho) {
    setAbrindo(d.id)
    await onEscolher(d)
    setAbrindo(null); setAberto(false); setTermo("")
  }

  return (
    <div ref={caixa} className="relative mb-2">
      <span className="flex items-center gap-2 h-10 rounded-xl px-3 bg-[rgba(116,116,128,0.06)] focus-within:ring-2 focus-within:ring-[#8456e8]/30">
        <Search className="w-3.5 h-3.5 text-[#898892] shrink-0" />
        <input value={termo} onChange={e => { setTermo(e.target.value); setAberto(true) }} onFocus={() => { carregar(); setAberto(true) }}
          onKeyDown={e => { if (e.key === "Enter" && achados[0]) { e.preventDefault(); void escolher(achados[0]) } if (e.key === "Escape") setAberto(false) }}
          placeholder="Buscar faca guardada: perfume 20ml…" aria-label="Buscar faca guardada"
          className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-[#191625] placeholder:text-[#898892]" />
      </span>

      {aberto && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-xl bg-white shadow-[0_8px_30px_rgba(25,22,37,0.14)] ds-borda overflow-hidden">
          {atalhos.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-2 border-b border-[rgba(60,60,67,0.07)]">
              {atalhos.map(t => {
                const ativo = usados.includes(t)
                return (
                  <button key={t} type="button" onClick={() => setTermo(ativo ? usados.filter(x => x !== t).join(" ") : `${termo.trim()} ${t}`.trim())}
                    className={`h-6 px-2 rounded-full text-[11px] font-semibold ${ativo ? "bg-[#8456e8] text-white" : "bg-[#8456e8]/[0.08] text-[#8456e8]"}`}>{t}</button>
                )
              })}
            </div>
          )}
          {lista === null ? <p className="px-3 py-3 text-[12px] text-[#898892] flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Carregando as facas…</p>
            : achados.length === 0 ? <p className="px-3 py-3 text-[12px] text-[#898892]">{lista.length ? "Nenhuma faca com isso. Tente outra palavra ou a medida (5x5x12)." : "Nenhuma faca guardada ainda."}</p>
            : (
              <ul className="max-h-[320px] overflow-y-auto">
                {achados.map(d => (
                  <li key={d.id}>
                    <button type="button" onClick={() => void escolher(d)} disabled={!!abrindo}
                      className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-[#8456e8]/[0.05] border-t border-[rgba(60,60,67,0.06)] first:border-t-0 disabled:opacity-60">
                      {abrindo === d.id ? <Loader2 className="w-3.5 h-3.5 mt-0.5 animate-spin text-[#8456e8] shrink-0" /> : <Scissors className="w-3.5 h-3.5 mt-0.5 text-[#8456e8] shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-semibold text-[#191625] truncate">{nomeDoDesenho(d)}</span>
                        <span className="block text-[11px] text-[#898892] truncate">{d.modelo ? `${d.modelo} · ` : ""}caixa {descricaoCaixa(d)}</span>
                        {(d.tags ?? []).length > 0 && (
                          <span className="flex flex-wrap gap-1 mt-1">{d.tags!.map(t => <span key={t} className="px-1.5 rounded-full bg-[rgba(116,116,128,0.08)] text-[10.5px] text-[#5e5c68]">{t}</span>)}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  )
}
