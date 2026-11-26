"use client"

// Pendências do Felipe: no máximo 5 itens do que só ele faz, por valor × urgência. Resolvido, Dispensar (pede motivo) e
// Assuma (o agente assume a conversa; nenhuma mensagem sai sem o fluxo atual de Aprovo).
import React, { useCallback, useEffect, useState } from "react"
import { Pin, Check, ExternalLink, Bot, CheckCircle2 } from "lucide-react"
import { Cartao, Selo, Esqueleto } from "./ds"
import { DispensarBotao } from "./Dispensar"
import type { ItemFelipe } from "../lib/pendenciasFelipe"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const brasilia = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
const dia = (s: string) => s.split("-").reverse().join("/")

export function PendenciasFelipeView() {
  const [d, setD] = useState<{ itens: ItemFelipe[]; total: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const chamar = useCallback(async (corpo?: Record<string, unknown>) => {
    const r = await fetch("/api/pendencias-felipe", corpo ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) } : undefined).catch(() => null)
    const x = await r?.json().catch(() => null)
    if (!r?.ok || !x) { setErro(x?.erro ?? "Não consegui falar com o servidor."); return x?.erro ?? "Erro" }
    setErro(null); setD({ itens: x.itens, total: x.total }); return null
  }, [])
  useEffect(() => {
    const ler = () => fetch("/api/pendencias-felipe").then(r => r.ok ? r.json() : null).then(x => { if (x) setD({ itens: x.itens, total: x.total }) }).catch(() => {})
    ler()
    const t = setInterval(() => { if (!document.hidden) ler() }, 60_000)
    return () => clearInterval(t)
  }, [])
  if (!d) return <Esqueleto linhas={5} />
  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <div className="flex items-center gap-2"><Pin className="w-5 h-5 text-[#8456e8]" strokeWidth={1.8} /><h1 className="text-[18px] font-bold text-[#191625]">Pendências do Felipe</h1>
        <span className="text-[12px] text-[#898892]">{d.total > d.itens.length ? `os ${d.itens.length} mais importantes de ${d.total}` : `${d.itens.length} ${d.itens.length === 1 ? "item" : "itens"}`} · valor × urgência</span></div>
      {erro && <p className="text-[12px] text-[#d33a3c]">{erro}</p>}
      {!d.itens.length && <Cartao><p className="flex items-center gap-2 text-[13px] text-[#5e5c68]"><CheckCircle2 className="w-4 h-4 text-[#2f9e5a]" strokeWidth={1.8} />Nada esperando só por você agora.</p></Cartao>}
      {d.itens.map(i => (
        <Cartao key={i.chave}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-bold text-[#191625]">{i.nome}{i.fim4 ? <span className="font-normal text-[#898892]"> · final {i.fim4}</span> : null}</span>
            {i.valor != null ? <Selo tom={i.estimativa ? "alerta" : "sucesso"}>{brl(i.valor)}{i.estimativa ? " · estimativa" : ""}</Selo> : <Selo>sem valor</Selo>}
            {i.icp && <Selo tom="info">ICP</Selo>}
          </div>
          <p className="text-[13px] text-[#191625] mt-1">{i.acao}</p>
          <p className="text-[12px] text-[#5e5c68] mt-1">
            {[i.quantidade ? `${i.quantidade.toLocaleString("pt-BR")} un.` : null, i.medida, i.tipo].filter(Boolean).join(" · ") || "sem quantidade, medida ou tipo"}
          </p>
          <p className="text-[12px] text-[#5e5c68]">
            {i.desde ? `Esperando desde ${brasilia(i.desde)} (Brasília)` : "Sem data de início"}{i.prazo ? ` · prazo ${dia(i.prazo)}` : ""}{i.risco ? ` · ${i.risco}` : ""} · origem: {i.origem}
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-2.5 text-[11.5px]">
            <button onClick={() => void chamar({ op: "resolver", chave: i.chave })} className="inline-flex items-center gap-1 font-semibold text-[#2f9e5a] hover:underline"><Check className="w-3.5 h-3.5" strokeWidth={2} />Resolvido</button>
            <DispensarBotao chave={i.chave} titulo={i.nome} onDispensar={(chave, titulo, motivo) => chamar({ op: "dispensar", chave, titulo, motivo })} />
            {i.podeAssumir && i.jid && <button onClick={() => { if (confirm("O agente assume esta conversa? Nenhuma mensagem sai sem o Aprovo.")) void chamar({ op: "assumir", chave: i.chave, jid: i.jid }) }} className="inline-flex items-center gap-1 font-semibold text-[#8456e8] hover:underline"><Bot className="w-3.5 h-3.5" strokeWidth={1.8} />Assuma</button>}
            <a href={i.link} target={i.link.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#8456e8] hover:underline ml-auto"><ExternalLink className="w-3.5 h-3.5" strokeWidth={1.8} />Resolver</a>
          </div>
        </Cartao>
      ))}
    </div>
  )
}
