"use client"

// Seletor da área no menu lateral: ENYLA (embalagens sob medida) ou Caixaria (loja online, módulo próprio)
export default function SeletorArea({ caixaria, onTrocar }: { caixaria: boolean; onTrocar: (paraCaixaria: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 p-1 mb-2 rounded-lg bg-white/[0.05]" role="tablist" aria-label="Área">
      {([[false, "ENYLA"], [true, "Caixaria"]] as const).map(([cx, nome]) => {
        const ativo = cx === caixaria
        return (
          <button key={nome} role="tab" aria-selected={ativo} onClick={() => { if (!ativo) onTrocar(cx) }}
            className={`h-7 rounded-md text-[12px] font-semibold transition-colors ${ativo ? "bg-white/[0.14] text-white" : "text-zinc-400 hover:text-zinc-200"}`}>{nome}</button>
        )
      })}
    </div>
  )
}
