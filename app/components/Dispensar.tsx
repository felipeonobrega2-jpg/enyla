"use client"

// Dispensar pendência com motivo (sem apagar): botão com campo de motivo e a seção recolhida "Dispensadas" com Reabrir.
import { useCallback, useEffect, useState } from "react"
import type { Dispensada } from "../lib/pendenciaDispensada"

export function useDispensadas() {
  const [lista, setLista] = useState<Dispensada[]>([])
  const recarregar = useCallback(async () => {
    const d = await fetch("/api/pendencias/dispensadas").then(r => r.json()).catch(() => null)
    if (d?.dispensadas) setLista(d.dispensadas)
  }, [])
  useEffect(() => { fetch("/api/pendencias/dispensadas").then(r => r.json()).then(d => { if (d?.dispensadas) setLista(d.dispensadas) }).catch(() => {}) }, [])
  const chamar = async (corpo: Record<string, unknown>) => {
    const r = await fetch("/api/pendencias/dispensadas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return d.erro ?? "Não consegui salvar."
    await recarregar()
    return null
  }
  return {
    lista, chaves: new Set(lista.map(d => d.chave)),
    dispensar: (chave: string, titulo: string, motivo: string, ate?: string) => chamar({ acao: "dispensar", chave, titulo, motivo, ...(ate ? { ate } : {}) }),
    reabrir: (chave: string) => chamar({ acao: "reabrir", chave }),
  }
}

export function DispensarBotao({ chave, titulo, onDispensar }: { chave: string; titulo: string; onDispensar: (chave: string, titulo: string, motivo: string, ate?: string) => Promise<string | null> }) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [ate, setAte] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  if (!aberto) return <button onClick={e => { e.stopPropagation(); setAberto(true) }} className="text-[11.5px] font-semibold text-[#898892] hover:text-[#8456e8] hover:underline shrink-0">Dispensar</button>
  const salvar = async () => {
    if (!motivo.trim()) { setErro("Diga o motivo."); return }
    const e = await onDispensar(chave, titulo, motivo, ate || undefined)
    if (e) setErro(e); else { setAberto(false); setMotivo(""); setAte(""); setErro(null) }
  }
  return (
    <span onClick={e => e.stopPropagation()} className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
      <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (obrigatório)" className="h-7 px-2 rounded-md border border-[rgba(60,60,67,0.2)] text-[11.5px] min-w-[160px]" />
      <input type="date" value={ate} onChange={e => setAte(e.target.value)} title="Opcional: depois dessa data a pendência volta" className="h-7 px-1.5 rounded-md border border-[rgba(60,60,67,0.2)] text-[11.5px]" />
      <button onClick={() => void salvar()} className="font-semibold text-[#8456e8] hover:underline">Dispensar</button>
      <button onClick={() => { setAberto(false); setErro(null) }} className="text-[#898892] hover:underline">Cancelar</button>
      {erro && <span className="text-[#d33a3c]">{erro}</span>}
    </span>
  )
}

export function SecaoDispensadas({ lista, onReabrir }: { lista: Dispensada[]; onReabrir: (chave: string) => Promise<string | null> }) {
  if (!lista.length) return null
  return (
    <details className="mt-3 text-[12px]">
      <summary className="cursor-pointer text-[#8456e8] font-semibold">Dispensadas ({lista.length})</summary>
      <ul className="mt-1.5 space-y-2">
        {lista.map(d => (
          <li key={d.chave} className="text-[#5e5c68]">
            <span className="block text-[12.5px] font-semibold text-[#191625]">{d.titulo}</span>
            <span className="block">Motivo: {d.motivo}</span>
            <span className="block text-[#898892]">por {d.por} em {new Date(d.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{d.ate ? ` · volta depois de ${d.ate.split("-").reverse().join("/")}` : ""}</span>
            <button onClick={() => void onReabrir(d.chave)} className="text-[#8456e8] font-semibold hover:underline">Reabrir</button>
          </li>
        ))}
      </ul>
    </details>
  )
}
