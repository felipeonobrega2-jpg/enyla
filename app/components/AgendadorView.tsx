"use client"

// Escritório → Rotinas: o agendador único. Todas as rotinas automáticas, de onde rodam, quando rodaram pela última
// vez e o que aconteceu. O que parou ou deu erro aparece primeiro, em destaque.

import React, { useEffect, useState } from "react"
import { CheckCircle2, AlertTriangle, XCircle, Clock, Server, Zap, Cloud, Repeat } from "lucide-react"
import { Cartao, Selo, Esqueleto } from "./ds"
import { tempo, type Rotina, type Execucao } from "../lib/agendador"

type Linha = Rotina & { ultima: Execucao | null; situacao: { tom: "ok" | "atrasada" | "erro" | "sem"; texto: string } }
const ONDE: Record<Rotina["onde"], { nome: string; Icone: typeof Server }> = {
  vigia: { nome: "pelo vigia", Icone: Repeat }, carona: { nome: "junto das mensagens", Icone: Zap },
  servidor: { nome: "no servidor", Icone: Server }, vercel: { nome: "na Vercel", Icone: Cloud },
}
const ORDEM = { erro: 0, atrasada: 1, sem: 2, ok: 3 }

export function AgendadorView() {
  const [d, setD] = useState<{ rotinas: Linha[]; noHorario: boolean } | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const carregar = () => fetch("/api/agendador").then(r => r.ok ? r.json() : null).then(x => { if (x) { setD(x); setAgora(Date.now()) } }).catch(() => {})
    carregar()
    const t = setInterval(() => { if (!document.hidden) carregar() }, 60_000)
    return () => clearInterval(t)
  }, [])
  if (!d) return <Esqueleto linhas={6} />
  const lista = [...d.rotinas].sort((a, b) => ORDEM[a.situacao.tom] - ORDEM[b.situacao.tom])
  const problemas = lista.filter(r => r.situacao.tom === "erro" || r.situacao.tom === "atrasada").length
  return (
    <Cartao padding={false}>
      <div className="px-5 pt-5 pb-2 flex items-start gap-3">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: problemas ? "#d33a3c14" : "#00935114", color: problemas ? "#d33a3c" : "#009351" }}>
          {problemas ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[#191625]">Rotinas automáticas</p>
          <p className="text-[12px] text-[#898892]">
            {problemas ? <span className="text-[#d33a3c] font-semibold">{problemas} {problemas === 1 ? "rotina precisa" : "rotinas precisam"} de atenção</span> : "Tudo rodando"}
            {" · "}{d.noHorario ? "agente no horário de trabalho" : "fora do horário do agente (as do agente esperam)"}
          </p>
        </div>
      </div>
      <div className="px-2 pb-2">
        {lista.map(r => {
          const { Icone } = ONDE[r.onde]
          const cor = r.situacao.tom === "erro" ? "#d33a3c" : r.situacao.tom === "atrasada" ? "#c57800" : r.situacao.tom === "sem" ? "#898892" : "#009351"
          return (
            <div key={r.id} className="flex items-start md:items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[rgba(116,116,128,0.05)]">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 md:mt-0" style={{ background: `${cor}14`, color: cor }}>
                {r.situacao.tom === "erro" ? <XCircle className="w-4 h-4" /> : r.situacao.tom === "atrasada" ? <AlertTriangle className="w-4 h-4" /> : r.situacao.tom === "sem" ? <Clock className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              </span>
              <div className="flex-1 min-w-0 grid md:grid-cols-[1.3fr_1fr_1fr] gap-x-4 gap-y-0.5 items-center">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-[#191625] truncate">{r.nome}</p>
                  <p className="text-[11.5px] text-[#898892] line-clamp-1">{r.faz}</p>
                </div>
                <p className="text-[11.5px] text-[#5e5c68] flex items-center gap-1.5 min-w-0"><Icone className="w-3.5 h-3.5 shrink-0 text-[#898892]" /><span className="truncate">{r.quando} · {ONDE[r.onde].nome}</span></p>
                <div className="min-w-0 md:text-right">
                  <p className="text-[12px] font-medium truncate" style={{ color: cor }} title={r.situacao.texto}>{r.situacao.texto}</p>
                  {r.ultima && <p className="text-[11px] text-[#898892]">última: há {tempo(agora - new Date(r.ultima.em).getTime())}</p>}
                </div>
              </div>
              {r.situacao.tom === "erro" && <Selo tom="perigo" className="shrink-0 hidden md:inline-flex">erro</Selo>}
            </div>
          )
        })}
      </div>
    </Cartao>
  )
}
