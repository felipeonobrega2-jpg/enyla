"use client"

// Painel → Hoje: o que o WhatsApp e os agentes pedem de você agora. Bons negócios esperando resposta (quem
// respondeu à retomada primeiro), o que o anúncio trouxe em 24 h, a ação do relatório de marketing e a reativação.

import { useEffect, useState } from "react"
import { Sun, MessageCircle, RotateCcw, Megaphone, ArrowRight, CheckCircle2 } from "lucide-react"
import { Cartao, TituloCartao, LinhaLista, Selo, Botao, Tom } from "./ds"
import { Hoje, haQuanto } from "../lib/hoje"
import { DadosPedido } from "../lib/atendente"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 })
const dm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const TOM: Record<string, Tom> = { Retomada: "sucesso", "Para você": "alerta", ICP: "sucesso", Oportunidade: "info", "Lead médio": "acento", MQL: "acento" }
const MOSTRAR = 6

function Numero({ rotulo, valor, tom }: { rotulo: string; valor: number; tom?: Tom }) {
  const cor = tom === "sucesso" ? "#009351" : tom === "alerta" ? "#c57800" : "#191625"
  return (
    <div className="flex-1 min-w-0 rounded-xl px-3 py-2 bg-[rgba(116,116,128,0.06)]">
      <p className="text-[10.5px] font-medium text-[#898892] truncate">{rotulo}</p>
      <p className="text-[17px] font-semibold ds-num leading-tight" style={{ color: valor ? cor : "#898892" }}>{valor}</p>
    </div>
  )
}

// "3.000 un · caixa 50ml · " antes da mensagem, quando a IA já sabe
function doPedido(d: DadosPedido | null) {
  if (!d) return ""
  const p = [d.quantidade ? `${d.quantidade.toLocaleString("pt-BR")} un` : "", d.volume_ml ? `${d.volume_ml} ml` : d.produto].filter(Boolean)
  return p.length ? `${p.join(" · ")} · ` : ""
}

export function HojeCard({ onAbrirConversa, onNavegar, onOrcar }: {
  onAbrirConversa: (jid: string) => void
  onOrcar?: (nome: string, jid: string, dados?: DadosPedido) => void
  onNavegar: (view: "whatsapp" | "meta" | "config") => void
}) {
  const [d, setD] = useState<Hoje | null>(null)
  const [verTodos, setVerTodos] = useState(false)

  useEffect(() => {
    const carregar = () => fetch("/api/hoje").then(r => r.ok ? r.json() : null).then(x => x && setD(x)).catch(() => {})
    carregar()
    const t = setInterval(carregar, 60_000)
    return () => clearInterval(t)
  }, [])

  if (!d) return null
  const lista = verTodos ? d.responder : d.responder.slice(0, MOSTRAR)
  const retomadas = d.responder.filter(x => x.retomada).length
  const segurados = d.responder.filter(x => x.porque).length
  const a = d.anuncio
  const r = d.reativacao

  return (
    <Cartao padding={false} className="ds-entrada">
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
        {/* Responder agora */}
        <div className="min-w-0">
          <div className="px-5 pt-5">
            <TituloCartao titulo="Hoje" icone={<Sun className="w-4 h-4" />}
              sub={d.responder.length
                ? [`${d.responder.length} ${d.responder.length === 1 ? "conversa esperando" : "conversas esperando"} sua resposta`,
                  retomadas ? `${retomadas} ${retomadas === 1 ? "voltou" : "voltaram"} pela retomada` : "",
                  segurados ? `${segurados} o agente deixou para você` : ""].filter(Boolean).join(", ")
                : "Nada esperando sua resposta"}
              acao={d.responder.length > 0 ? <Selo tom={retomadas ? "sucesso" : "acento"}>{d.responder.length}</Selo> : undefined} />
          </div>
          <div className="px-2 pb-2 -mt-1">
            {d.responder.length === 0
              ? <div className="flex items-center gap-2 px-3 pb-3 text-[12px] text-[#5e5c68]"><CheckCircle2 className="w-4 h-4 text-[#009351]" />Em dia com MQL e retomadas.</div>
              : lista.map(x => (
                <LinhaLista key={x.jid} titulo={x.nome || x.jid.split("@")[0]} icone={x.retomada ? <RotateCcw className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
                  tom={x.retomada ? "sucesso" : "acento"} sub={`${x.porque ? `Agente segurou: ${x.porque} · ` : ""}${doPedido(x.dados)}${x.mensagem ?? ""}` || undefined}
                  valor={<span className="hidden sm:inline"><Selo tom={TOM[x.rotulo] ?? "acento"}>{x.rotulo}</Selo></span>} valorSub={haQuanto(x.desde)}
                  onClick={() => onAbrirConversa(x.jid)}
                  acao={onOrcar ? (
                    <button onClick={() => onOrcar(x.cliente || x.nome || x.jid.split("@")[0], x.jid, x.dados ?? undefined)} title="Novo orçamento com o que o cliente já contou"
                      className="h-8 px-2.5 mr-1 rounded-lg text-[11.5px] font-semibold text-[#8456e8] hover:bg-[#8456e8]/[0.08] transition-colors shrink-0 whitespace-nowrap">Orçar</button>
                  ) : undefined} />
              ))}
            {d.responder.length > MOSTRAR && (
              <button onClick={() => setVerTodos(v => !v)} className="w-full py-2 text-[12px] font-medium text-[#8456e8] hover:bg-[#8456e8]/[0.04] rounded-lg transition-colors">
                {verTodos ? "Mostrar menos" : `Ver todos (${d.responder.length})`}
              </button>
            )}
            {d.outrosEsperando > 0 && (
              <button onClick={() => onNavegar("whatsapp")} className="w-full flex items-center justify-between px-3 py-2 text-[11.5px] text-[#898892] hover:bg-[rgba(116,116,128,0.06)] rounded-lg transition-colors">
                <span>Mais {d.outrosEsperando} {d.outrosEsperando === 1 ? "conversa esperando" : "conversas esperando"}, ainda sem classificar</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Anúncio e agentes */}
        <div className="min-w-0 px-5 py-5 space-y-4 border-t lg:border-t-0 lg:border-l border-[rgba(60,60,67,0.06)]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892] mb-2">Do anúncio, últimas 24 h</p>
            <div className="flex gap-2">
              <Numero rotulo="Leads" valor={a.leads} />
              <Numero rotulo="MQL" valor={a.mql} tom="sucesso" />
              <Numero rotulo="Sem volume" valor={a.semClassificar} tom="alerta" />
            </div>
          </div>

          {d.marketing && (
            <button onClick={() => onNavegar("meta")} className="w-full text-left rounded-xl px-3.5 py-3 bg-[rgba(132,86,232,0.06)] hover:bg-[rgba(132,86,232,0.1)] transition-colors">
              <p className="text-[10.5px] font-semibold text-[#8456e8] flex items-center gap-1.5">
                <Megaphone className="w-3.5 h-3.5" />Relatório de {dm(d.marketing.dia)}{d.marketing.custoMql != null ? ` · ${brl(d.marketing.custoMql)} por MQL` : ""}
              </p>
              <p className="text-[12.5px] font-medium text-[#191625] leading-snug mt-1">{d.marketing.acao}</p>
            </button>
          )}

          <div className="flex items-center gap-2.5">
            <RotateCcw className={`w-4 h-4 shrink-0 ${r.ligado ? "text-[#009351]" : "text-[#898892]"}`} />
            <p className="flex-1 min-w-0 text-[11.5px] text-[#5e5c68] leading-snug">
              <span className="font-semibold text-[#191625]">Reativação {r.ligado ? "ligada" : "desligada"}</span>
              {r.ligado ? ` · ${r.hoje} de ${r.porDia} hoje` : ""} · {r.fila} {r.fila === 1 ? "bom negócio parado" : "bons negócios parados"}
            </p>
            <Botao variante="fantasma" className="h-7 px-2 text-[11.5px] shrink-0" onClick={() => { onNavegar("config"); setTimeout(() => document.getElementById("reativacao")?.scrollIntoView({ behavior: "smooth" }), 450) }}>Abrir <ArrowRight className="w-3.5 h-3.5" /></Botao>
          </div>
        </div>
      </div>
    </Cartao>
  )
}
