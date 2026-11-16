"use client"

// Quantidades para oferecer ao cliente, calculadas pelo motor em volta das que você orçou (ver lib/sugerirQuantidades).

import { Lightbulb, Plus } from "lucide-react"
import type { SugestaoQtd } from "../lib/sugerirQuantidades"
import { brl, num } from "../utils"

const ROTULO: Record<SugestaoQtd["tipo"], string> = { rende: "Rende mais", abaixo: "Mais em conta", volume: "Volume" }
const COR: Record<SugestaoQtd["tipo"], string> = { rende: "#009351", abaixo: "#c57800", volume: "#8456e8" }

export function QuantidadesSugeridas({ sugestoes, onAdicionar }: { sugestoes: SugestaoQtd[]; onAdicionar: (s: SugestaoQtd) => void }) {
  if (!sugestoes.length) return null
  return (
    <div className="mt-2.5 space-y-1.5">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#898892] flex items-center gap-1"><Lightbulb className="w-3 h-3" />Sugestões para o cliente</p>
      {sugestoes.map(s => (
        <button key={s.quantidade} type="button" onClick={() => onAdicionar(s)} title="Adicionar esta quantidade ao orçamento"
          className="w-full text-left rounded-lg border border-[rgba(60,60,67,0.1)] bg-white px-2.5 py-2 hover:border-[#8456e8]/40 transition-colors group">
          <span className="flex items-center gap-1.5">
            <span className="text-[12.5px] font-semibold text-[#191625] ds-num">{num(s.quantidade)} un</span>
            <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: COR[s.tipo], background: `${COR[s.tipo]}14` }}>{ROTULO[s.tipo]}</span>
            <span className="ml-auto text-[11px] text-[#5e5c68] ds-num">{brl(s.total)}</span>
            <Plus className="w-3.5 h-3.5 text-[#c7c7cc] group-hover:text-[#8456e8] shrink-0" />
          </span>
          <span className="block mt-0.5 text-[10.5px] text-[#898892] leading-snug">{s.texto}</span>
        </button>
      ))}
    </div>
  )
}
