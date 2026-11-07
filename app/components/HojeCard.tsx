"use client"

// Painel → Hoje: o que o WhatsApp e os agentes pedem de você agora. Bons negócios esperando resposta (quem
// respondeu à retomada primeiro), o que o anúncio trouxe em 24 h, a ação do relatório de marketing e a reativação.

import { useEffect, useState } from "react"
import { Sun, MessageCircle, RotateCcw, Megaphone, ArrowRight, CheckCircle2, CalendarClock, FileText, Printer, AlertTriangle } from "lucide-react"
import { Cartao, TituloCartao, LinhaLista, Selo, Botao, Tom } from "./ds"
import { Hoje, ItemHoje, haQuanto } from "../lib/hoje"
import { ProximoPasso } from "./ProximoPasso"
import { DadosPedido } from "../lib/atendente"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 })
const dm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const TOM: Record<string, Tom> = { Retomada: "sucesso", ICP: "sucesso", Oportunidade: "info", "Lead médio": "acento", MQL: "acento" }
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
  onAbrirConversa: (jid: string, nome?: string, dados?: DadosPedido) => void
  onOrcar?: (nome: string, jid: string, dados?: DadosPedido) => void
  onNavegar: (view: "whatsapp" | "meta" | "config" | "gastos" | "digital") => void
}) {
  const [d, setD] = useState<Hoje | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const [verRetomar, setVerRetomar] = useState(false)
  const [feitos, setFeitos] = useState<Set<string>>(new Set())

  useEffect(() => {
    const carregar = () => fetch("/api/hoje").then(r => r.ok ? r.json() : null).then(x => { if (x) { setD(x); setFeitos(new Set()) } }).catch(() => {})
    carregar()
    const t = setInterval(carregar, 60_000)
    return () => clearInterval(t)
  }, [])

  if (!d) return null
  // Marcou o próximo passo: some na hora (o servidor confirma na próxima atualização)
  const responder = d.responder.filter(x => !feitos.has(x.jid))
  const retomar = (d.retomar ?? []).filter(x => !feitos.has(x.jid))
  const orcar = (d.orcar ?? []).filter(x => !feitos.has(x.jid))
  const retomadas = responder.filter(x => x.retomada).length

  const linha = (x: ItemHoje) => (
    <LinhaLista key={x.jid} titulo={x.nome || x.jid.split("@")[0]}
      icone={x.retomada ? <RotateCcw className="w-4 h-4" /> : x.lista === "orcar" ? <FileText className="w-4 h-4" /> : x.lista === "retomar" ? <CalendarClock className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
      tom={x.retomada ? "sucesso" : x.lista === "orcar" ? "alerta" : x.lista === "retomar" ? "info" : "acento"}
      sub={x.lista === "orcar"
        ? `Esperando o seu orçamento ${haQuanto(x.desde)} · ${doPedido(x.dados)}${x.dados?.resumo || x.mensagem || ""}`
        : x.lista === "retomar"
        ? `${x.nota ? `Lembrete: ${x.nota} · ` : `Sem resposta ${haQuanto(x.desde)} · `}${doPedido(x.dados)}${x.mensagem ?? ""}`
        : `${doPedido(x.dados)}${x.mensagem ?? ""}` || undefined}
      valor={<span className="hidden sm:inline"><Selo tom={TOM[x.rotulo] ?? "acento"}>{x.rotulo}</Selo></span>} valorSub={x.lista === "responder" ? haQuanto(x.desde) : undefined}
      onClick={() => onAbrirConversa(x.jid, x.nome || x.jid.split("@")[0], x.dados ?? undefined)}
      acao={<div className="flex items-center shrink-0 mr-1">
        {onOrcar && <button onClick={() => onOrcar(x.cliente || x.nome || x.jid.split("@")[0], x.jid, x.dados ?? undefined)} title="Novo orçamento com o que o cliente já contou"
          className="h-8 px-2 rounded-lg text-[11.5px] font-semibold text-[#8456e8] hover:bg-[#8456e8]/[0.08] transition-colors whitespace-nowrap">Orçar</button>}
        <ProximoPasso jid={x.jid} onFeito={t => { if (t === "orcar") { fetch("/api/hoje").then(r => r.ok ? r.json() : null).then(n => { if (n) setD(n) }).catch(() => {}) } else setFeitos(f => new Set(f).add(x.jid)) }} />
      </div>} />
  )
  const a = d.anuncio
  const r = d.reativacao

  return (
    <Cartao padding={false} className="ds-entrada">
      {/* Saldo de IA ou anúncios acabando: a operação para */}
      {d.gastos?.alertas?.length ? (
        <button onClick={() => onNavegar("gastos")} className={`w-full flex items-start gap-2.5 text-left px-5 py-3 text-[12.5px] rounded-t-[inherit] transition-colors ${d.gastos.alertas.some(a => a.nivel === "perigo") ? "bg-[#d33a3c]/8 text-[#b42d2f] hover:bg-[#d33a3c]/12" : "bg-[#c57800]/8 text-[#9a5e00] hover:bg-[#c57800]/12"}`}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span className="flex-1 min-w-0 leading-snug">{d.gastos.alertas.map(a => a.texto).join(" ")}</span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        </button>
      ) : null}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
        {/* Responder e retomar */}
        <div className="min-w-0">
          <div className="px-5 pt-5">
            <TituloCartao titulo="Hoje" icone={<Sun className="w-4 h-4" />}
              sub={[
                orcar.length ? `${orcar.length} ${orcar.length === 1 ? "orçamento" : "orçamentos"} para fazer` : "",
                responder.length ? `${responder.length} para responder` : "Ninguém para responder",
                retomadas ? `${retomadas} ${retomadas === 1 ? "voltou" : "voltaram"} pela retomada` : "",
                retomar.length ? `${retomar.length} para retomar` : "",
              ].filter(Boolean).join(", ")}
              acao={orcar.length + responder.length + retomar.length > 0 ? <Selo tom={orcar.length ? "alerta" : retomadas ? "sucesso" : "acento"}>{orcar.length + responder.length + retomar.length}</Selo> : undefined} />
          </div>
          <div className="px-2 pb-2 -mt-1">
            {orcar.length > 0 && (<>
              <p className="px-3 pt-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#c57800]">Orçamento para fazer</p>
              {orcar.map(linha)}
              <p className="px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#898892]">Responder</p>
            </>)}
            {responder.length === 0
              ? <div className="flex items-center gap-2 px-3 pb-3 text-[12px] text-[#5e5c68]"><CheckCircle2 className="w-4 h-4 text-[#009351]" />Em dia: nenhum bom negócio esperando sua resposta.</div>
              : (verTodos ? responder : responder.slice(0, MOSTRAR)).map(linha)}
            {responder.length > MOSTRAR && (
              <button onClick={() => setVerTodos(v => !v)} className="w-full py-2 text-[12px] font-medium text-[#8456e8] hover:bg-[#8456e8]/[0.04] rounded-lg transition-colors">
                {verTodos ? "Mostrar menos" : `Ver todos (${responder.length})`}
              </button>
            )}
            {retomar.length > 0 && (<>
              <p className="px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#898892]">Retomar hoje</p>
              {(verRetomar ? retomar : retomar.slice(0, MOSTRAR)).map(linha)}
              {retomar.length > MOSTRAR && (
                <button onClick={() => setVerRetomar(v => !v)} className="w-full py-2 text-[12px] font-medium text-[#8456e8] hover:bg-[#8456e8]/[0.04] rounded-lg transition-colors">
                  {verRetomar ? "Mostrar menos" : `Ver todos (${retomar.length})`}
                </button>
              )}
            </>)}
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

          {d.digital && (d.digital.ligado || d.digital.ativos > 0) && (
            <div className="flex items-center gap-2.5">
              <Printer className="w-4 h-4 shrink-0 text-[#c2410c]" />
              <p className="flex-1 min-w-0 text-[11.5px] text-[#5e5c68] leading-snug">
                <span className="font-semibold text-[#191625]">Digital</span>
                {[` · ${d.digital.aguardandoSinal ?? 0} esperando o sinal`, d.digital.pagos ? `${d.digital.pagos} ${d.digital.pagos === 1 ? "pago" : "pagos"}` : "", `${d.digital.ativos} na semana`].filter(Boolean).join(" · ")}
              </p>
              <Botao variante="fantasma" className="h-7 px-2 text-[11.5px] shrink-0" onClick={() => onNavegar("digital")}>Abrir <ArrowRight className="w-3.5 h-3.5" /></Botao>
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <RotateCcw className={`w-4 h-4 shrink-0 ${r.ligado ? "text-[#009351]" : "text-[#898892]"}`} />
            <p className="flex-1 min-w-0 text-[11.5px] text-[#5e5c68] leading-snug">
              <span className="font-semibold text-[#191625]">Reativação {r.ligado ? "ligada" : "desligada"}</span>
              {r.ligado ? ` · ${r.hoje} de ${r.porDia} hoje` : ""} · {r.fila} {r.fila === 1 ? "bom negócio parado" : "bons negócios parados"}
            </p>
            <Botao variante="fantasma" className="h-7 px-2 text-[11.5px] shrink-0" onClick={() => { try { sessionStorage.setItem("config:aba", "agentes") } catch {} onNavegar("config"); setTimeout(() => document.getElementById("reativacao")?.scrollIntoView({ behavior: "smooth" }), 450) }}>Abrir <ArrowRight className="w-3.5 h-3.5" /></Botao>
          </div>
        </div>
      </div>
    </Cartao>
  )
}
