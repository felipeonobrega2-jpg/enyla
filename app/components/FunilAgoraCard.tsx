"use client"

// Painel → Funil agora: tudo o que está acontecendo, do lead à entrega, em duas linhas (offset e digital).
// Cada etapa: quantos, quanto vale e quantos estão parados. Toque abre a lista (parados primeiro).

import { useEffect, useState } from "react"
import { GitBranch, ChevronRight } from "lucide-react"
import { Cartao, TituloCartao, Gaveta, Esqueleto } from "./ds"
import type { FunilAgora, EtapaFunil, ItemFunil } from "../lib/funilAgora"

const brlCurto = (n: number) => n >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: n >= 100_000 ? 0 : 1 })} mil` : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

export function FunilAgoraCard({ onAbrirConversa, onAbrirCardId, onNavegar }: {
  onAbrirConversa?: (jid: string, nome?: string) => void
  onAbrirCardId?: (id: string) => void
  onNavegar?: (v: "digital") => void
}) {
  const [d, setD] = useState<FunilAgora | null>(null)
  const [aberta, setAberta] = useState<{ linha: string; e: EtapaFunil } | null>(null)
  useEffect(() => {
    const carregar = () => fetch("/api/funil-agora").then(r => r.ok ? r.json() : null).then(x => { if (x) setD(x) }).catch(() => {})
    carregar()
    const t = setInterval(carregar, 120_000)
    return () => clearInterval(t)
  }, [])
  if (!d) return <Esqueleto linhas={2} />

  const linha = (nome: string, etapas: EtapaFunil[]) => (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#898892] mb-1.5">{nome}</p>
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 snap-x">
        {etapas.map((e, i) => (
          <button key={e.id} onClick={() => e.quantos && setAberta({ linha: nome, e })} disabled={!e.quantos}
            className={`ds-toque snap-start shrink-0 relative text-left rounded-xl px-3 py-2.5 min-w-[118px] transition-colors ${e.quantos ? "bg-[rgba(116,116,128,0.06)] hover:bg-[rgba(116,116,128,0.1)]" : "bg-[rgba(116,116,128,0.03)] cursor-default"}`}>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[#5e5c68] whitespace-nowrap">
              {i > 0 && <ChevronRight className="w-3 h-3 -ml-1 text-[#c7c7cc]" />}{e.nome}
            </span>
            <span className="flex items-baseline gap-1.5 mt-0.5">
              <span className={`text-[19px] font-bold ds-num leading-tight ${e.quantos ? "text-[#191625]" : "text-[#c7c7cc]"}`}>{e.quantos}</span>
              {e.parados > 0 && <span className="text-[11px] font-bold text-[#d33a3c] ds-num ds-pop whitespace-nowrap">● {e.parados} parado{e.parados > 1 ? "s" : ""}</span>}
            </span>
            <span className="block text-[11px] text-[#898892] ds-num h-4">{e.valor ? brlCurto(e.valor) : ""}</span>
          </button>
        ))}
      </div>
    </div>
  )

  const abrir = (x: ItemFunil) => {
    if (x.jid && onAbrirConversa) { setAberta(null); onAbrirConversa(x.jid, x.nome) }
    else if (x.cardId && onAbrirCardId) { setAberta(null); onAbrirCardId(x.cardId) }
    else if (x.digitalId && onNavegar) { setAberta(null); onNavegar("digital") }
  }
  const parados = [...d.offset, ...d.digital].reduce((t, e) => t + e.parados, 0)

  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Funil agora" icone={<GitBranch className="w-4 h-4" />}
        sub={parados ? `${parados} parados · toque numa etapa para ver quem` : "Nada parado. Toque numa etapa para ver quem está nela"} />
      <div className="space-y-3">
        {linha("Offset", d.offset)}
        {linha("Digital", d.digital)}
      </div>
      <Gaveta aberta={!!aberta} titulo={aberta ? `${aberta.linha} · ${aberta.e.nome}` : ""} onFechar={() => setAberta(null)}
        sub={aberta ? `${aberta.e.quantos}${aberta.e.valor ? ` · ${brl(aberta.e.valor)}` : ""}${aberta.e.parados ? ` · ${aberta.e.parados} parados` : ""}` : undefined}>
        {aberta && (
          <div className="px-1">
            {aberta.e.itens.map((x, i) => (
              <button key={i} onClick={() => abrir(x)} className="ds-toque w-full text-left px-3 py-2.5 rounded-xl hover:bg-[rgba(116,116,128,0.06)] flex items-start gap-3">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${x.parado ? "bg-[#d33a3c]" : "bg-[#c7c7cc]"}`} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="flex-1 min-w-0 truncate text-[13.5px] font-semibold text-[#191625]">{x.nome}</span>
                    {x.valor ? <span className="text-[13px] font-semibold ds-num text-[#191625] shrink-0">{brl(x.valor)}</span> : null}
                  </span>
                  <span className="block text-[12px] text-[#898892] truncate">{x.sub}</span>
                  {x.parado && <span className="block text-[12px] text-[#d33a3c] font-medium">{x.parado}</span>}
                </span>
              </button>
            ))}
            {aberta.e.quantos > aberta.e.itens.length && <p className="px-3 py-2 text-[12px] text-[#898892]">Mostrando os {aberta.e.itens.length} primeiros (parados e maiores valores).</p>}
          </div>
        )}
      </Gaveta>
    </Cartao>
  )
}
