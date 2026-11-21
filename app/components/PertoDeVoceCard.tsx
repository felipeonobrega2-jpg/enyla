"use client"

// Painel → Perto de você: os leads que você quer à mão (estrela). Cada um mostra quem está esperando quem e a sua nota;
// embaixo, as sugestões da semana (ICP e Oportunidade primeiro) para pôr na lista com um toque.

import React, { useEffect, useState } from "react"
import { Star, X, Plus, ChevronDown, MessageCircle, PencilLine } from "lucide-react"
import { Cartao, Selo } from "./ds"
import { situacao, rotuloPerfil, type ConversaPerto } from "../lib/perto"

type ItemPerto = { jid: string; nota: string; em: string; conversa: ConversaPerto | null }
const SUGESTOES = 6

export function PertoDeVoceCard({ onAbrirConversa }: { onAbrirConversa: (jid: string, nome?: string) => void }) {
  const [itens, setItens] = useState<ItemPerto[] | null>(null)
  const [sugestoes, setSugestoes] = useState<ConversaPerto[]>([])
  const [verSugestoes, setVerSugestoes] = useState(false)
  const [maisSugestoes, setMaisSugestoes] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)

  const carregar = () => fetch("/api/perto").then(r => r.ok ? r.json() : null).then(d => {
    if (!d) return
    setItens(d.itens ?? []); setSugestoes(d.sugestoes ?? [])
  }).catch(() => {})
  useEffect(() => {
    carregar()
    const t = setInterval(() => { if (!document.hidden) carregar() }, 180_000)
    return () => clearInterval(t)
  }, [])

  const mandar = (jid: string, acao: string, nota?: string) =>
    fetch("/api/perto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid, acao, nota }) }).catch(() => {})
  const por = (c: ConversaPerto) => {
    setSugestoes(l => l.filter(x => x.jid !== c.jid))
    setItens(l => [{ jid: c.jid, nota: "", em: new Date().toISOString(), conversa: c }, ...(l ?? [])])
    mandar(c.jid, "por")
  }
  const dispensar = (jid: string) => { setSugestoes(l => l.filter(x => x.jid !== jid)); mandar(jid, "dispensar") }
  const tirar = (jid: string) => { setItens(l => (l ?? []).filter(x => x.jid !== jid)); mandar(jid, "tirar") }
  const salvarNota = (jid: string, nota: string) => {
    setItens(l => (l ?? []).map(x => x.jid === jid ? { ...x, nota } : x)); setEditando(null); mandar(jid, "nota", nota)
  }

  if (itens === null) return null
  const esperando = itens.filter(i => i.conversa && situacao(i.conversa).esperandoVoce).length
  const mostradas = maisSugestoes ? sugestoes : sugestoes.slice(0, SUGESTOES)

  return (
    <Cartao padding={false} className="ds-entrada">
      <div className="px-5 pt-5 flex items-start gap-3">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#c5780014", color: "#c57800" }}><Star className="w-4 h-4" /></span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[#191625] leading-tight">Perto de você</p>
          <p className="text-[12px] text-[#898892] mt-0.5">
            {itens.length
              ? <>{itens.length} {itens.length === 1 ? "lead" : "leads"} que você quer à mão{esperando ? <> · <span className="font-semibold text-[#1d8a4b]">{esperando} esperando você</span></> : null}</>
              : "Marque com a estrela os leads que você quer acompanhar de perto"}
          </p>
        </div>
      </div>

      <div className="px-2 pt-2 pb-1">
        {itens.length === 0 && (
          <p className="px-3 py-2 text-[12.5px] text-[#5e5c68]">Toque na estrela de uma conversa no WhatsApp, ou escolha nas sugestões abaixo.</p>
        )}
        {itens.map(i => {
          const c = i.conversa, s = c ? situacao(c) : null
          return (
            <div key={i.jid} className="group flex items-start md:items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[rgba(116,116,128,0.05)] transition-colors">
              <button onClick={() => tirar(i.jid)} title="Tirar da lista" aria-label="Tirar da lista"
                className="ds-toque w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ color: "#c57800" }}>
                <Star className="w-4 h-4" fill="currentColor" />
              </button>
              <div className="flex-1 min-w-0">
                <button onClick={() => onAbrirConversa(i.jid, c?.nome ?? undefined)} className="w-full text-left">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[13.5px] font-semibold text-[#191625] truncate">{c?.nome || i.jid.split("@")[0]}</span>
                    {c && <Selo tom={rotuloPerfil(c) === "ICP" ? "acento" : "neutro"} className="shrink-0">{rotuloPerfil(c)}</Selo>}
                    {c?.status_lead === "pedido" && <Selo tom="sucesso" className="shrink-0">Pedido</Selo>}
                  </span>
                  {s && <span className="block text-[12px] mt-0.5 line-clamp-2 md:line-clamp-1" style={{ color: s.esperandoVoce ? "#1d8a4b" : "#898892", fontWeight: s.esperandoVoce ? 600 : 400 }}>
                    {s.texto}{c?.ultima_msg ? <span className="font-normal text-[#5e5c68]"> · “{c.ultima_msg.slice(0, 90)}”</span> : null}
                  </span>}
                </button>
                {editando === i.jid
                  ? <NotaEditor inicial={i.nota} onSalvar={n => salvarNota(i.jid, n)} onCancelar={() => setEditando(null)} />
                  : i.nota
                    ? <button onClick={() => setEditando(i.jid)} className="block text-left text-[12px] text-[#5e5c68] mt-1 italic line-clamp-2 md:line-clamp-1 max-w-full">Nota: {i.nota}</button>
                    : null}
              </div>
              <div className="flex items-center shrink-0 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                <BotaoIcone titulo="Escrever uma nota" onClick={() => setEditando(i.jid)}><PencilLine className="w-4 h-4" /></BotaoIcone>
                <span className="hidden md:flex"><BotaoIcone titulo="Abrir conversa" onClick={() => onAbrirConversa(i.jid, c?.nome ?? undefined)}><MessageCircle className="w-4 h-4" /></BotaoIcone></span>
              </div>
            </div>
          )
        })}
      </div>

      {sugestoes.length > 0 && (
        <div className="border-t border-[rgba(60,60,67,0.08)] mx-2 mb-2">
          <button onClick={() => setVerSugestoes(v => !v)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left rounded-lg hover:bg-[rgba(116,116,128,0.05)]">
            <span className="flex-1 text-[12.5px] text-[#5e5c68]"><span className="font-semibold text-[#191625]">{sugestoes.length} bons leads</span> da semana para bater o olho</span>
            <ChevronDown className={`w-4 h-4 text-[#898892] transition-transform ${verSugestoes ? "rotate-180" : ""}`} />
          </button>
          {verSugestoes && <div className="ds-escalonado">
            {mostradas.map(c => {
              const s = situacao(c)
              return (
                <div key={c.jid} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[rgba(116,116,128,0.05)]">
                  <button onClick={() => por(c)} title="Pôr na lista" aria-label="Pôr na lista"
                    className="ds-toque w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[#898892] hover:text-[#c57800] hover:bg-[#c57800]/10">
                    <Plus className="w-4 h-4" />
                  </button>
                  <button onClick={() => onAbrirConversa(c.jid, c.nome ?? undefined)} className="flex-1 min-w-0 text-left">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-semibold text-[#191625] truncate">{c.nome || c.jid.split("@")[0]}</span>
                      <Selo tom={rotuloPerfil(c) === "ICP" ? "acento" : "neutro"} className="shrink-0">{rotuloPerfil(c)}</Selo>
                    </span>
                    <span className="block text-[11.5px] text-[#898892] line-clamp-2 md:line-clamp-1 mt-0.5">{s.texto}{c.ultima_msg ? ` · “${c.ultima_msg.slice(0, 80)}”` : ""}</span>
                  </button>
                  <BotaoIcone titulo="Não sugerir de novo" onClick={() => dispensar(c.jid)}><X className="w-4 h-4" /></BotaoIcone>
                </div>
              )
            })}
            {sugestoes.length > SUGESTOES && (
              <button onClick={() => setMaisSugestoes(v => !v)} className="w-full py-2 text-[12px] font-medium text-[#8456e8] hover:bg-[#8456e8]/[0.04] rounded-lg">
                {maisSugestoes ? "Mostrar menos" : `Ver mais ${sugestoes.length - SUGESTOES}`}
              </button>
            )}
          </div>}
        </div>
      )}
    </Cartao>
  )
}

function NotaEditor({ inicial, onSalvar, onCancelar }: { inicial: string; onSalvar: (n: string) => void; onCancelar: () => void }) {
  const [t, setT] = useState(inicial)
  return (
    <form onSubmit={e => { e.preventDefault(); onSalvar(t) }} className="flex items-center gap-2 mt-1.5">
      <input autoFocus value={t} onChange={e => setT(e.target.value)} maxLength={140} placeholder="Por que ele está perto? (ex.: quer 20 mil no ano)"
        onKeyDown={e => { if (e.key === "Escape") onCancelar() }}
        className="flex-1 min-w-0 h-8 rounded-lg bg-white px-2.5 text-[12.5px] text-[#191625] ds-borda focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20" />
      <button type="submit" className="h-8 px-3 rounded-lg text-[12px] font-semibold text-white" style={{ background: "#8456e8" }}>Salvar</button>
    </form>
  )
}

function BotaoIcone({ titulo, onClick, children }: { titulo: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={titulo} aria-label={titulo} onClick={e => { e.stopPropagation(); onClick() }}
    className="ds-toque w-8 h-8 rounded-lg flex items-center justify-center text-[#898892] hover:text-[#191625] hover:bg-[rgba(116,116,128,0.1)] transition-colors shrink-0">{children}</button>
}
