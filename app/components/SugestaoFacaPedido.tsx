"use client"

// Orçamento aberto pela conversa: o que o cliente pediu (caixa/ml) e as facas guardadas que combinam, para pôr o
// desenho real na mesa com um clique. As medidas digitadas ficam só como reserva, para quando não há DXF.

import { Scissors, MessageCircle, Ruler } from "lucide-react"
import { nomeDoDesenho, type Desenho, type FacaSugerida } from "../lib/biblioteca"

export function SugestaoFacaPedido({ pedido, achadas, onUsar, onMedidas }: {
  pedido: string                    // "caixa 5 × 12 × 5 cm · 50 ml"
  achadas: FacaSugerida[]
  onUsar: (d: Desenho) => void
  onMedidas?: () => void            // preencher as medidas à mão (sem DXF)
}) {
  return (
    <div className="mb-2 rounded-xl border border-[#8456e8]/20 bg-[#8456e8]/[0.04] p-3 space-y-2">
      <p className="text-[11.5px] text-[#5e5c68] flex items-start gap-1.5 leading-snug">
        <MessageCircle className="w-3.5 h-3.5 mt-0.5 text-[#8456e8] shrink-0" />
        <span>O cliente pediu <span className="font-semibold text-[#191625]">{pedido}</span></span>
      </p>
      {achadas.length > 0 ? (
        <>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#8456e8]">{achadas.length === 1 ? "Faca guardada que combina" : `${achadas.length} facas guardadas combinam`}</p>
          <ul className="space-y-1">
            {achadas.map(({ d, motivo }) => (
              <li key={d.id}>
                <button type="button" onClick={() => onUsar(d)}
                  className="w-full text-left flex items-start gap-2 rounded-lg bg-white px-2.5 py-2 border border-[rgba(60,60,67,0.08)] hover:border-[#8456e8]/40 transition-colors">
                  <Scissors className="w-3.5 h-3.5 mt-0.5 text-[#8456e8] shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold text-[#191625] truncate">{nomeDoDesenho(d)}</span>
                    <span className="block text-[10.5px] text-[#898892] truncate">{motivo}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[11.5px] text-[#5e5c68] leading-snug">Nenhuma faca guardada com essa medida. Baixe o DXF no Pacdora e solte aqui: ele fica guardado para a próxima.</p>
      )}
      {onMedidas && (
        <button type="button" onClick={onMedidas} className="text-[11px] font-medium text-[#898892] hover:text-[#8456e8] flex items-center gap-1">
          <Ruler className="w-3 h-3" />Orçar só com as medidas, sem DXF
        </button>
      )}
    </div>
  )
}
