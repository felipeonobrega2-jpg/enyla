"use client"

import Image from "next/image"

// Seletor da área no menu lateral: ENYLA (embalagens sob medida) ou Cartuxo (loja online, módulo próprio).
// Cada aba mostra a logo da marca (versões para fundo escuro).
const AREAS = [
  { cartuxo: false, nome: "ENYLA", logo: "/brand/enyla-wordmark-light.png", w: 1335, h: 328 },
  { cartuxo: true, nome: "Cartuxo", logo: "/brand/cartuxo-marca-clara.png", w: 1400, h: 249 },
] as const

export default function SeletorArea({ cartuxo, onTrocar }: { cartuxo: boolean; onTrocar: (paraCartuxo: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 p-1 mb-2 rounded-lg bg-white/[0.05]" role="tablist" aria-label="Área">
      {AREAS.map(a => {
        const ativo = a.cartuxo === cartuxo
        return (
          <button key={a.nome} role="tab" aria-selected={ativo} aria-label={a.nome} title={a.nome}
            onClick={() => { if (!ativo) onTrocar(a.cartuxo) }}
            className={`h-8 rounded-md flex items-center justify-center transition-all ${ativo ? "bg-white/[0.12]" : "opacity-45 hover:opacity-80"}`}>
            <Image src={a.logo} alt={a.nome} width={a.w} height={a.h} className="h-3.5 w-auto" />
          </button>
        )
      })}
    </div>
  )
}
