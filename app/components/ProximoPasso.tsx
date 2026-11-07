"use client"

// Próximo passo de uma conversa, em um clique (Hoje e topo da conversa do WhatsApp): esperando o cliente, lembrar
// em tal dia (com nota), fechou ou não vai rolar. Some do Hoje e volta sozinha na hora certa.

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CalendarClock, Hourglass, CheckCircle2, XCircle, Loader2, RotateCcw, ListChecks, FileText } from "lucide-react"
import type { ProximoPasso as Passo } from "../lib/hoje"

export type TipoPasso = "esperando" | "lembrar" | "orcar" | "fechou" | "perdido" | "limpar"
const LARGURA = 288
const dm = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })
const amanha = () => new Date(Date.now() + 86_400_000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

export function ProximoPasso({ jid, rotulo, onFeito, className = "" }: {
  jid: string
  rotulo?: string                       // texto do botão (sem: só o ícone)
  onFeito?: (tipo: TipoPasso) => void
  className?: string
}) {
  const botao = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [atual, setAtual] = useState<Passo | null | undefined>(undefined)
  const [nota, setNota] = useState("")
  const [data, setData] = useState("")
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function abrir() {
    const r = botao.current!.getBoundingClientRect()
    const left = Math.max(8, Math.min(window.innerWidth - LARGURA - 8, r.right - LARGURA))
    const top = r.bottom + 6 + 380 > window.innerHeight ? Math.max(8, r.top - 6 - 380) : r.bottom + 6
    setPos({ top, left }); setErro(null)
    fetch(`/api/whatsapp/proximo-passo?jid=${encodeURIComponent(jid)}`).then(r => r.json()).then(d => setAtual(d.passo ?? null)).catch(() => setAtual(null))
  }
  useEffect(() => {
    if (!pos) return
    const fechar = (e: KeyboardEvent) => { if (e.key === "Escape") setPos(null) }
    window.addEventListener("keydown", fechar)
    return () => window.removeEventListener("keydown", fechar)
  }, [pos])

  async function marcar(tipo: TipoPasso, extra: { dias?: number; data?: string } = {}) {
    setSalvando(tipo + (extra.dias ?? extra.data ?? "")); setErro(null)
    const r = await fetch("/api/whatsapp/proximo-passo", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jid, tipo, ...extra, ...((tipo === "lembrar" || tipo === "orcar") && nota.trim() ? { nota } : {}) }) }).catch(() => null)
    setSalvando(null)
    if (!r?.ok) return setErro("Não salvou. Tente de novo.")
    setPos(null); setNota(""); setData("")
    onFeito?.(tipo)
  }

  const opcao = (tipo: TipoPasso, icone: React.ReactNode, titulo: string, sub: string, cor: string, extra?: { dias?: number; data?: string }) => (
    <button onClick={() => marcar(tipo, extra)} disabled={!!salvando}
      className="w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-[rgba(116,116,128,0.08)] disabled:opacity-50 transition-colors">
      <span className="mt-0.5 shrink-0" style={{ color: cor }}>{salvando === tipo ? <Loader2 className="w-4 h-4 animate-spin" /> : icone}</span>
      <span className="min-w-0"><span className="block text-[12.5px] font-semibold text-[#191625]">{titulo}</span><span className="block text-[11px] text-[#898892] leading-snug">{sub}</span></span>
    </button>
  )
  const chip = (dias: number, nome: string) => (
    <button onClick={() => marcar("lembrar", { dias })} disabled={!!salvando}
      className="h-7 px-2.5 rounded-md text-[11.5px] font-semibold text-[#8456e8] bg-[#8456e8]/[0.08] hover:bg-[#8456e8]/[0.14] disabled:opacity-50 transition-colors">
      {salvando === `lembrar${dias}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : nome}
    </button>
  )

  return <>
    <button ref={botao} onClick={e => { e.stopPropagation(); if (pos) setPos(null); else abrir() }} title="Próximo passo: esperando o cliente, lembrar, fechou ou não vai rolar"
      className={rotulo ? `flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-2 rounded-xl transition-colors hover:bg-black/5 ${className}` : `w-8 h-8 rounded-lg grid place-items-center text-[#72707d] hover:bg-[rgba(116,116,128,0.1)] transition-colors shrink-0 ${className}`}
      style={rotulo ? { color: "var(--text-sub)" } : undefined}>
      <ListChecks className="w-4 h-4" />{rotulo}
    </button>
    {pos && createPortal(
      <div className="fixed inset-0 z-[90]" onClick={e => { e.stopPropagation(); setPos(null) }}>
        <div onClick={e => e.stopPropagation()} className="fixed bg-white rounded-xl shadow-2xl ds-borda p-1.5" style={{ top: pos.top, left: pos.left, width: LARGURA }}>
          {atual && (
            <div className="flex items-start gap-2 mx-1.5 mt-1 mb-1.5 px-2.5 py-2 rounded-lg bg-[rgba(132,86,232,0.06)]">
              <p className="flex-1 text-[11.5px] text-[#5e5c68] leading-snug">
                {atual.tipo === "esperando" ? "Esperando o cliente" : atual.tipo === "orcar" ? "Esperando o seu orçamento" : "Lembrete"} até <b className="text-[#191625]">{dm(atual.ate)}</b>{atual.nota ? ` · ${atual.nota}` : ""}
              </p>
              <button onClick={() => marcar("limpar")} title="Tirar (volta para a regra automática)" className="text-[#898892] hover:text-[#191625] shrink-0"><RotateCcw className="w-3.5 h-3.5" /></button>
            </div>
          )}
          {opcao("orcar", <FileText className="w-4 h-4" />, "Esperando meu orçamento", "Vai para “Orçamento para fazer” no Hoje e sai sozinho quando você manda o PDF ou cria o orçamento. A nota do Lembrar vale aqui também.", "#c57800")}
          {opcao("esperando", <Hourglass className="w-4 h-4" />, "Resolvido, esperando o cliente", "Sai do Hoje. Volta se ele escrever algo (um “ok” não conta) ou em 3 dias.", "#8456e8")}
          <div className="px-3 py-2">
            <p className="text-[12.5px] font-semibold text-[#191625] flex items-center gap-2"><CalendarClock className="w-4 h-4 text-[#1f7ae0]" />Lembrar</p>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (opcional): vai mandar a arte…" maxLength={120}
              className="mt-1.5 w-full h-8 rounded-lg px-2.5 text-[12px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 ds-borda" />
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {chip(1, "Amanhã")}{chip(3, "3 dias")}{chip(7, "1 semana")}
              <input type="date" value={data} min={amanha()} onChange={e => setData(e.target.value)} aria-label="Escolher o dia"
                className="h-7 px-1.5 rounded-md text-[11.5px] text-[#5e5c68] ds-borda bg-white w-[118px]" />
              {data && <button onClick={() => marcar("lembrar", { data })} disabled={!!salvando} className="h-7 px-2 rounded-md text-[11.5px] font-semibold text-white bg-[#8456e8] disabled:opacity-50">Ok</button>}
            </div>
          </div>
          <div className="border-t border-[rgba(60,60,67,0.08)] my-1" />
          {opcao("fechou", <CheckCircle2 className="w-4 h-4" />, "Fechou", "Sai de vez; no funil vai para Virou pedido.", "#009351")}
          {opcao("perdido", <XCircle className="w-4 h-4" />, "Não vai rolar", "Sai de vez; no funil vai para Perdido.", "#d33a3c")}
          {erro && <p className="px-3 pb-1.5 text-[11.5px] text-[#d33a3c]">{erro}</p>}
        </div>
      </div>, document.body)}
  </>
}
