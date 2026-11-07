"use client"

// "Depende de você": o que o sistema não faz sozinho (conta, chave, arquivo, decisão). Os itens se conferem sozinhos
// quando dá; os manuais você marca como feitos.

import { useEffect, useState } from "react"
import { CircleAlert, CheckCircle2, Circle, ChevronDown, ListChecks } from "lucide-react"
import { Cartao, TituloCartao, Selo, type Tom } from "./ds"
import type { Pendencia } from "../lib/pendenciasDono"

const TOM: Record<Pendencia["nivel"], Tom> = { urgente: "perigo", importante: "alerta", "quando der": "neutro" }

export default function DependeDeVoceCard({ onIr }: { onIr?: (aba: string) => void }) {
  const [lista, setLista] = useState<Pendencia[] | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [verFeitos, setVerFeitos] = useState(false)

  useEffect(() => {
    let vivo = true
    fetch("/api/pendencias").then(r => r.json()).then(d => { if (vivo) setLista(d.pendencias ?? []) }).catch(() => { if (vivo) setLista([]) })
    return () => { vivo = false }
  }, [])
  const marcar = async (id: string, feito: boolean) => {
    const d = await fetch("/api/pendencias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, feito }) }).then(r => r.json()).catch(() => null)
    if (d?.pendencias) setLista(d.pendencias)
  }

  const abertas = (lista ?? []).filter(p => !p.feito)
  const feitas = (lista ?? []).filter(p => p.feito)
  const mostrar = verFeitos ? lista ?? [] : abertas

  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Depende de você" icone={<ListChecks className="w-4 h-4" />}
        sub={lista ? `${abertas.length} em aberto · ${feitas.length} feitas. O que está parado esperando uma conta, chave, arquivo ou decisão sua.` : "Conferindo…"} />
      <div className="-mx-2">
        {mostrar.map(p => (
          <div key={p.id} className="rounded-lg hover:bg-[rgba(116,116,128,0.04)]">
            <button onClick={() => setAberto(aberto === p.id ? null : p.id)} className="w-full flex items-center gap-3 px-2 py-2.5 text-left">
              {p.feito ? <CheckCircle2 className="w-4 h-4 text-[#009351] shrink-0" /> : p.nivel === "urgente" ? <CircleAlert className="w-4 h-4 text-[#d33a3c] shrink-0" /> : <Circle className="w-4 h-4 text-[#c7c7cc] shrink-0" />}
              <span className="flex-1 min-w-0">
                <span className={`block text-[13px] font-semibold truncate ${p.feito ? "text-[#898892] line-through" : "text-[#191625]"}`}>{p.titulo}</span>
                <span className="block text-[11px] text-[#898892] truncate">{p.grupo}</span>
              </span>
              {!p.feito && <Selo tom={TOM[p.nivel]}>{p.nivel}</Selo>}
              <ChevronDown className={`w-3.5 h-3.5 text-[#898892] shrink-0 transition-transform ${aberto === p.id ? "rotate-180" : ""}`} />
            </button>
            {aberto === p.id && (
              <div className="px-9 pb-3 space-y-1.5 text-[12px] text-[#5e5c68]">
                <p>{p.porque}</p>
                <p><b className="text-[#191625]">Como:</b> {p.como}</p>
                <div className="flex gap-3 pt-0.5">
                  {p.onde && onIr && <button onClick={() => onIr(p.onde!)} className="text-[#8456e8] font-semibold hover:underline">Abrir</button>}
                  {p.manual && <button onClick={() => void marcar(p.id, !p.feito)} className="text-[#8456e8] font-semibold hover:underline">{p.feito ? "Desmarcar" : "Já fiz"}</button>}
                  {!p.manual && !p.feito && <span className="text-[#898892]">Some daqui sozinho quando estiver feito.</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {feitas.length > 0 && <button onClick={() => setVerFeitos(!verFeitos)} className="mt-2 text-[11.5px] text-[#8456e8] hover:underline">{verFeitos ? "Esconder as feitas" : `Ver as ${feitas.length} feitas`}</button>}
    </Cartao>
  )
}
