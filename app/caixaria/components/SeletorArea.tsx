"use client"

import Image from "next/image"

// Seletor da área no menu lateral: ENYLA (embalagens sob medida) ou Cartuxo (loja online, módulo próprio).
// Cada aba mostra a logo da marca (versões para fundo escuro).
const AREAS = [
  { caixaria: false, nome: "ENYLA", logo: "/brand/enyla-wordmark-light.png", w: 1335, h: 328 },
  { caixaria: true, nome: "Cartuxo", logo: "/brand/cartuxo-wordmark-light.png", w: 1400, h: 249 },
] as const

export default function SeletorArea({ caixaria, onTrocar }: { caixaria: boolean; onTrocar: (paraCaixaria: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 p-1 mb-2 rounded-lg bg-white/[0.05]" role="tablist" aria-label="Área">
      {AREAS.map(a => {
        const ativo = a.caixaria === caixaria
        return (
          <button key={a.nome} role="tab" aria-selected={ativo} aria-label={a.nome} title={a.nome}
            onClick={() => { if (!ativo) onTrocar(a.caixaria) }}
            className={`h-8 rounded-md flex items-center justify-center transition-all ${ativo ? "bg-white/[0.12]" : "opacity-45 hover:opacity-80"}`}>
            <Image src={a.logo} alt={a.nome} width={a.w} height={a.h} className="h-3.5 w-auto" />
          </button>
        )
      })}
    </div>
  )
}
