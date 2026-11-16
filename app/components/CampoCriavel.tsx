"use client"

// Campo de escolher digitando: filtra as opções e, se o que você digitou não existe, oferece "Criar “…”".
// Enter escolhe a primeira (ou cria); Esc fecha.

import { useEffect, useMemo, useRef, useState } from "react"
import { Plus, Loader2, ChevronDown, Check } from "lucide-react"

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

export function CampoCriavel({ valor, opcoes, onEscolher, onCriar, placeholder, className, rotuloCriar = "Criar" }: {
  valor: string                                   // id escolhido ("" = nada)
  opcoes: { id: string; nome: string }[]
  onEscolher: (id: string) => void
  onCriar: (nome: string) => Promise<string | null>   // devolve o id criado
  placeholder?: string
  className?: string
  rotuloCriar?: string
}) {
  const atual = opcoes.find(o => o.id === valor)
  const [texto, setTexto] = useState(atual?.nome ?? "")
  const [aberto, setAberto] = useState(false)
  const [criando, setCriando] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!aberto) setTexto(atual?.nome ?? "") }, [atual?.nome, aberto])
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener("mousedown", fora)
    return () => document.removeEventListener("mousedown", fora)
  }, [])

  const q = norm(texto)
  const filtradas = useMemo(() => !q || (atual && norm(atual.nome) === q) ? opcoes : opcoes.filter(o => norm(o.nome).includes(q)), [opcoes, q, atual])
  const existe = opcoes.some(o => norm(o.nome) === q)
  const podeCriar = !!q && !existe

  async function criar() {
    const nome = texto.trim()
    if (!nome || criando) return
    setCriando(true)
    const id = await onCriar(nome)
    setCriando(false)
    if (id) { onEscolher(id); setAberto(false) }
  }
  function escolher(id: string) { onEscolher(id); setAberto(false) }

  return (
    <div ref={caixa} className="relative">
      <div className="relative">
        <input value={texto} placeholder={placeholder ?? "Digite para buscar ou criar…"} className={`${className ?? ""} pr-8`}
          onFocus={e => { setAberto(true); e.currentTarget.select() }}
          onChange={e => { setTexto(e.target.value); setAberto(true) }}
          onKeyDown={e => {
            if (e.key === "Escape") { setAberto(false); return }
            if (e.key !== "Enter") return
            e.preventDefault()
            const exata = opcoes.find(o => norm(o.nome) === q)
            if (exata) escolher(exata.id)
            else if (filtradas.length === 1 && !podeCriar) escolher(filtradas[0].id)
            else if (podeCriar) void criar()
          }} />
        {criando ? <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8456e8]" />
          : <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#898892] pointer-events-none" />}
      </div>
      {aberto && (filtradas.length > 0 || podeCriar) && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-[240px] overflow-y-auto rounded-xl bg-white shadow-[0_8px_30px_rgba(25,22,37,0.14)] border border-[rgba(60,60,67,0.1)] py-1">
          {podeCriar && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => void criar()}
              className="w-full text-left px-3 py-2 text-[12.5px] font-semibold text-[#8456e8] hover:bg-[#8456e8]/[0.06] flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />{rotuloCriar} “{texto.trim()}”
            </button>
          )}
          {filtradas.map(o => (
            <button key={o.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => escolher(o.id)}
              className="w-full text-left px-3 py-2 text-[12.5px] text-[#191625] hover:bg-[rgba(116,116,128,0.06)] flex items-center gap-1.5">
              <span className="flex-1 truncate">{o.nome}</span>{o.id === valor && <Check className="w-3.5 h-3.5 text-[#8456e8]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
