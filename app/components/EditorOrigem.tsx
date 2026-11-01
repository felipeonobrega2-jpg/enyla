"use client"

import { useState } from "react"
import { CANAIS_ORIGEM, OrigemCliente } from "../lib/coleta"

// Canal de origem em chips; indicação e "outro" pedem um detalhe (quem indicou / de onde)
export function EditorOrigem({ origem, onSalvar, compacto }: { compacto?: boolean; origem: (OrigemCliente & { deduzida?: boolean }) | null; onSalvar: (o: OrigemCliente | null) => void }) {
  const [detalhe, setDetalhe] = useState(origem?.deduzida ? "" : origem?.detalhe ?? "")
  const canal = CANAIS_ORIGEM.find(c => c.id === origem?.canal)
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {CANAIS_ORIGEM.map(c => {
          const ativo = origem?.canal === c.id
          return (
            <button key={c.id} type="button"
              onClick={() => { setDetalhe(""); onSalvar(ativo ? null : { canal: c.id }) }}
              className={`${compacto ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-[12px]"} rounded-lg font-medium transition-colors`}
              style={ativo ? { background: "#8456e8", color: "#fff" } : { background: "rgba(116,116,128,0.08)", color: "#3a3a44" }}>
              {c.rotulo}
            </button>
          )
        })}
      </div>
      {origem?.deduzida && <p className="text-[11px] text-[#898892]">Deduzido da campanha do cadastro. Toque num canal para confirmar ou trocar.</p>}
      {canal?.detalhe && !origem?.deduzida && (
        <input value={detalhe} onChange={e => setDetalhe(e.target.value)} placeholder={canal.detalhe}
          onBlur={() => { if (detalhe.trim() !== (origem?.detalhe ?? "")) onSalvar({ canal: canal.id, detalhe: detalhe.trim() || undefined }) }}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
          className="w-full rounded-xl px-3 py-2.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[#8456e8]/25"
          style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", color: "var(--text-main)" }} />
      )}
    </div>
  )
}
