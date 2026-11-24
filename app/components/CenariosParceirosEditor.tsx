"use client"

// Fornecedores → Parceiros ENYLA: a equipe edita o enunciado do cenário-exemplo (o que o parceiro vê) e a
// referência interna (preço, unidade, fornecedor). A referência nunca vai para a página pública.

import React from "react"
import { ChevronDown, Plus, X } from "lucide-react"
import { SERVICOS_PARCEIRO } from "../lib/parceiros"
import type { CenarioParceiro } from "../lib/cenariosParceiros"

const campo = "h-9 rounded-lg px-2.5 text-[12.5px] bg-[rgba(116,116,128,0.08)] text-[#191625] outline-none"

export function CenariosParceirosEditor({ cenarios, onSalvo }: { cenarios: CenarioParceiro[]; onSalvo: (c: CenarioParceiro[]) => void }) {
  const [aberto, setAberto] = React.useState(false)
  const [rascunho, setRascunho] = React.useState<CenarioParceiro[]>([])
  const [msg, setMsg] = React.useState<string | null>(null)
  React.useEffect(() => { setRascunho(cenarios) }, [cenarios])

  const mudar = (i: number, m: Partial<CenarioParceiro>) => setRascunho(l => l.map((x, k) => k === i ? { ...x, ...m } : x))
  const mudarRef = (i: number, j: number, m: Partial<CenarioParceiro["referencias"][number]>) =>
    mudar(i, { referencias: rascunho[i].referencias.map((r, k) => k === j ? { ...r, ...m } : r) })
  const salvar = async () => {
    setMsg("Salvando…")
    const r = await fetch("/api/parceiros/cenarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cenarios: rascunho }) }).catch(() => null)
    if (!r?.ok) { setMsg("Não consegui salvar."); return }
    onSalvo((await r.json()).cenarios); setMsg("Salvo.")
  }

  return (
    <div className="mt-4 rounded-xl border border-[rgba(60,60,67,0.10)]">
      <button onClick={() => setAberto(a => !a)} className="w-full text-left px-4 py-3 flex items-center gap-3">
        <span className="flex-1 text-[13px] font-semibold text-[#191625]">Cenários-exemplo e preço de referência <span className="font-normal text-[#898892]">(só a equipe vê a referência)</span></span>
        <ChevronDown className={`w-4 h-4 text-[#898892] transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="px-4 pb-4 space-y-3">
          {rascunho.map((c, i) => (
            <div key={c.servicoId} className="rounded-lg bg-[rgba(116,116,128,0.05)] p-3 space-y-2">
              <p className="text-[12.5px] font-semibold text-[#191625]">{SERVICOS_PARCEIRO.find(s => s.id === c.servicoId)?.nome ?? c.servicoId} <span className="font-normal text-[#898892]">· versão {c.versao}</span></p>
              <label className="block text-[11.5px] text-[#898892]">Enunciado (o parceiro vê)
                <textarea className={`${campo} w-full h-16 py-2 resize-none mt-1`} value={c.enunciado} onChange={e => mudar(i, { enunciado: e.target.value })} />
              </label>
              <label className="block text-[11.5px] text-[#898892]">Unidade do exemplo (interno)
                <input className={`${campo} w-full mt-1`} value={c.unidade ?? ""} onChange={e => mudar(i, { unidade: e.target.value })} />
              </label>
              {c.referencias.map((r, j) => (
                <div key={j} className="flex gap-2 items-center">
                  <input className={`${campo} w-28`} inputMode="decimal" placeholder="R$ referência" value={r.preco ?? ""} onChange={e => mudarRef(i, j, { preco: Number(e.target.value.replace(",", ".")) || null })} />
                  <input className={`${campo} flex-1 min-w-0`} placeholder="Fornecedor (interno)" value={r.fornecedorNome ?? ""} onChange={e => mudarRef(i, j, { fornecedorNome: e.target.value })} />
                  <button aria-label="Remover referência" onClick={() => mudar(i, { referencias: c.referencias.filter((_, k) => k !== j) })} className="text-[#898892]"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={() => mudar(i, { referencias: [...c.referencias, { preco: null }] })} className="text-[12px] font-semibold text-[#8456e8] flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Referência</button>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button onClick={salvar} className="ds-toque h-9 px-3.5 rounded-lg text-[12.5px] font-semibold bg-[#8456e8] text-white">Salvar cenários</button>
            {msg && <span className="text-[12px] text-[#898892]">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
