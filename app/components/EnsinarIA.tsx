"use client"

// "Ensinar a IA": o mesmo bloco em toda tela que usa IA. Você escreve do seu jeito, ela lê antes de cada resposta.
// As correções automáticas (quando você muda o que ela escreveu) aparecem aqui também, e dá para apagar ou editar.

import { useEffect, useState } from "react"
import { GraduationCap, X, Pencil, ChevronDown } from "lucide-react"
import { Botao } from "./ds"
import { AREAS_IA, AreaIA, LicaoIA } from "../lib/licoesIA"

export async function enviarLicao(area: AreaIA, corpo: Record<string, unknown>): Promise<LicaoIA[] | null> {
  const r = await fetch("/api/ia/licoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ area, ...corpo }) }).catch(() => null)
  const d = r?.ok ? await r.json().catch(() => null) : null
  return d?.licoes ?? null
}

export default function EnsinarIA({ area, aberto: abertoInicial = false, className = "" }: { area: AreaIA; aberto?: boolean; className?: string }) {
  const info = AREAS_IA[area]
  const [licoes, setLicoes] = useState<LicaoIA[] | null>(null)
  const [aberto, setAberto] = useState(abertoInicial)
  const [nova, setNova] = useState("")
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    fetch(`/api/ia/licoes?area=${area}`).then(r => r.json()).then(d => setLicoes(d.licoes ?? [])).catch(() => setLicoes([]))
    // Outra parte da tela ensinou (ex.: a Forma guardou pela conversa): recarrega
    const ouvir = (e: Event) => { if ((e as CustomEvent).detail === area) fetch(`/api/ia/licoes?area=${area}`).then(r => r.json()).then(d => setLicoes(d.licoes ?? [])).catch(() => {}) }
    window.addEventListener("licoes-ia", ouvir)
    return () => window.removeEventListener("licoes-ia", ouvir)
  }, [area])

  async function mudar(corpo: Record<string, unknown>) {
    setSalvando(true)
    const l = await enviarLicao(area, corpo)
    if (l) setLicoes(l)
    setSalvando(false)
    return !!l
  }
  async function adicionar() {
    if (!nova.trim()) return
    if (await mudar({ nova })) setNova("")
  }

  const n = licoes?.length ?? 0
  return (
    <div className={`rounded-xl ${className}`} style={{ background: "var(--bg-surface, #fff)", border: "1px solid var(--border, rgba(60,60,67,0.12))" }}>
      <button onClick={() => setAberto(v => !v)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <GraduationCap className="w-4 h-4 shrink-0" style={{ color: "#8456e8" }} />
        <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--text-main, #191625)" }}>
          Ensinar a IA{n ? <span className="font-normal" style={{ color: "var(--text-faint, #898892)" }}> · {n} {n === 1 ? "lição" : "lições"}</span> : null}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${aberto ? "rotate-180" : ""}`} style={{ color: "var(--text-faint, #898892)" }} />
      </button>
      {aberto && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[11px]" style={{ color: "var(--text-faint, #898892)" }}>{info.explica}</p>
          {licoes === null && <p className="text-[11.5px]" style={{ color: "var(--text-faint, #898892)" }}>Carregando…</p>}
          {!!licoes?.length && (
            <div className="space-y-1 max-h-[220px] overflow-y-auto">
              {[...licoes].reverse().map(l => (
                <div key={l.id} className="flex items-start gap-1.5 text-[12px] group" style={{ color: "var(--text-main, #191625)" }}>
                  {editando?.id === l.id ? (<>
                    <input autoFocus value={editando.texto} onChange={e => setEditando({ ...editando, texto: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") { void mudar({ editar: editando }); setEditando(null) } if (e.key === "Escape") setEditando(null) }}
                      className="flex-1 min-w-0 h-8 px-2 rounded-lg text-[12px] outline-none" style={{ border: "1px solid var(--border, rgba(60,60,67,0.18))" }} />
                    <Botao className="h-8" onClick={() => { void mudar({ editar: editando }); setEditando(null) }}>Salvar</Botao>
                  </>) : (<>
                    <span className="flex-1 min-w-0 break-words">
                      {l.origem === "correcao" && <span className="text-[10px] font-semibold uppercase tracking-wide mr-1" style={{ color: "#8456e8" }}>correção</span>}
                      {l.texto}
                    </span>
                    <button onClick={() => setEditando({ id: l.id, texto: l.texto })} aria-label="Editar" className="shrink-0 p-0.5 opacity-60 hover:opacity-100"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => void mudar({ tirar: l.id })} aria-label="Apagar" className="shrink-0 p-0.5 opacity-60 hover:opacity-100 hover:text-[#d33a3c]"><X className="w-3.5 h-3.5" /></button>
                  </>)}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <textarea value={nova} onChange={e => setNova(e.target.value)} rows={2} placeholder={info.exemplo}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void adicionar() } }}
              className="flex-1 min-w-0 px-2.5 py-2 rounded-lg text-[12px] outline-none resize-none"
              style={{ border: "1px solid var(--border, rgba(60,60,67,0.18))", background: "transparent", color: "var(--text-main, #191625)" }} />
            <Botao variante="primario" disabled={!nova.trim() || salvando} onClick={() => void adicionar()} className="self-end">Ensinar</Botao>
          </div>
        </div>
      )}
    </div>
  )
}
