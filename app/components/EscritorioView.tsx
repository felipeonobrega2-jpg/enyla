"use client"

// Escritório: os agentes trabalhando, cada um na sua mesa. O que está fazendo agora, o que fez hoje (hora a hora),
// o que trava (WhatsApp, crédito da IA, cota da hora) e o feed de tudo que aconteceu hoje. Atualiza sozinho.

import { useEffect, useMemo, useState } from "react"
import { MessageCircle, ClipboardList, Repeat, RotateCcw, Printer, FileText, ShieldCheck, GraduationCap, Wifi, WifiOff, Sparkles, Clock, Power } from "lucide-react"
import { Pagina, CabecalhoPagina, Cartao, TituloCartao, Esqueleto, Segmentado } from "./ds"
import { EscritorioVirtual } from "./EscritorioVirtual"
import { Gaveta } from "./ds"
import { HORA_INICIO, type Escritorio, type IdMesa, type Mesa, type EstadoMesa } from "../lib/escritorio"

const VISUAL: Record<IdMesa, { cor: string; Icone: typeof MessageCircle }> = {
  atendente: { cor: "#8456e8", Icone: MessageCircle },
  coletor: { cor: "#2f7cf6", Icone: ClipboardList },
  followup: { cor: "#0f9ba8", Icone: Repeat },
  reativacao: { cor: "#d4497b", Icone: RotateCcw },
  digital: { cor: "#e07b1f", Icone: Printer },
  propostas: { cor: "#1f9d55", Icone: FileText },
  vigia: { cor: "#5e5c68", Icone: ShieldCheck },
  aprendiz: { cor: "#c98a12", Icone: GraduationCap },
  auditor: { cor: "#0e7490", Icone: ShieldCheck },
}
const ESTADO: Record<EstadoMesa, { rotulo: string; cor: string; fundo: string }> = {
  trabalhando: { rotulo: "Trabalhando", cor: "#1f9d55", fundo: "rgba(31,157,85,0.10)" },
  plantao: { rotulo: "De plantão", cor: "#2f7cf6", fundo: "rgba(47,124,246,0.08)" },
  travado: { rotulo: "Travado", cor: "#d33a3c", fundo: "rgba(211,58,60,0.09)" },
  descansando: { rotulo: "Descansando", cor: "#898892", fundo: "rgba(116,116,128,0.08)" },
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
function ha(iso: string | null, agora: number) {
  if (!iso) return null
  const m = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60_000))
  return m < 1 ? "agora" : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.floor(m / 60)}h` : `há ${Math.floor(m / 1440)}d`
}
const horaAgora = () => Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }))

// Três pontinhos discretos de "digitando" para quem está trabalhando
function Digitando({ cor }: { cor: string }) {
  return (
    <span className="inline-flex items-center gap-[3px] ml-1 align-middle" aria-hidden>
      {[0, 1, 2].map(i => <span key={i} className="w-[4px] h-[4px] rounded-full esc-ponto" style={{ background: cor, animationDelay: `${i * 160}ms` }} />)}
    </span>
  )
}

function MesaCard({ m, agora, ativa, onClick }: { m: Mesa; agora: number; ativa: boolean; onClick: () => void }) {
  const { cor, Icone } = VISUAL[m.id]
  const e = ESTADO[m.estado]
  const max = Math.max(1, ...m.horas)
  const hAgora = horaAgora() - HORA_INICIO
  return (
    <button onClick={onClick} aria-pressed={ativa}
      className={`ds-toque text-left w-full min-w-0 rounded-2xl bg-white p-3 sm:p-4 transition-shadow ${ativa ? "ring-2" : ""}`}
      style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 2px 10px rgba(0,0,0,0.04)", ...(ativa ? { ["--tw-ring-color" as string]: `${cor}66` } : {}) }}>
      <div className="flex items-start gap-2.5 sm:gap-3">
        <span className="relative shrink-0">
          <span className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl flex items-center justify-center" style={{ background: `${cor}17`, color: cor }}>
            <Icone className="w-5 h-5" strokeWidth={1.9} />
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white" style={{ background: e.cor }}>
            {m.estado === "trabalhando" && <span className="absolute inset-0 rounded-full esc-pulso" style={{ background: e.cor }} />}
          </span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex flex-col sm:flex-row sm:items-center gap-x-2 gap-y-0.5">
            <span className="text-[13px] sm:text-[14px] font-semibold text-[#191625] leading-tight line-clamp-2 sm:truncate">{m.nome}</span>
            <span className="sm:ml-auto self-start sm:self-auto shrink-0 text-[10px] sm:text-[10.5px] font-semibold rounded-full px-1.5 sm:px-2 py-0.5" style={{ color: e.cor, background: e.fundo }}>{e.rotulo}</span>
          </span>
          <span className="hidden sm:block text-[11.5px] text-[#898892] truncate">{m.papel}</span>
        </span>
      </div>
      <p className={`mt-2.5 sm:mt-3 text-[12px] sm:text-[12.5px] leading-snug line-clamp-2 min-h-[32px] sm:min-h-[34px] ${m.estado === "travado" ? "text-[#d33a3c] font-medium" : "text-[#5e5c68]"}`}>
        {m.agora}{m.estado === "trabalhando" && <Digitando cor={cor} />}
      </p>
      {/* Hoje, hora a hora (8h às 21h) */}
      <div className="mt-2.5 sm:mt-3 flex items-end gap-[2px] sm:gap-[3px] h-6 sm:h-7" aria-label="Atividade de hoje por hora">
        {m.horas.map((n, i) => (
          <span key={i} className="flex-1 rounded-[3px] ds-cresce-y" title={`${HORA_INICIO + i}h: ${n}`}
            style={{ height: n ? `${Math.max(18, n / max * 100)}%` : "3px", background: n ? cor : i === hAgora ? `${cor}40` : "rgba(116,116,128,0.12)", opacity: n ? (i === hAgora ? 1 : 0.7) : 1 }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] text-[#b0afb6] ds-num"><span>8h</span><span>14h</span><span>21h</span></div>
      <div className="mt-2.5 pt-2.5 flex items-baseline gap-1.5 text-[12px] border-t border-[rgba(116,116,128,0.12)]">
        <span className="text-[15px] font-bold text-[#191625] ds-num">{m.hoje}</span>
        <span className="text-[#898892] truncate">{m.hojeRotulo}<span className="hidden sm:inline"> hoje</span></span>
        <span className="hidden sm:inline ml-auto text-[11px] text-[#b0afb6] truncate">{m.extra ?? ha(m.ultimaEm, agora) ?? ""}</span>
      </div>
    </button>
  )
}

function Status({ icone, rotulo, valor, tom }: { icone: React.ReactNode; rotulo: string; valor: React.ReactNode; tom: "ok" | "ruim" | "neutro" }) {
  const cor = tom === "ok" ? "#1f9d55" : tom === "ruim" ? "#d33a3c" : "#898892"
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${cor}14`, color: cor }}>{icone}</span>
      <span className="min-w-0">
        <span className="block text-[10.5px] uppercase tracking-wide text-[#898892] font-semibold">{rotulo}</span>
        <span className="block text-[13px] font-semibold text-[#191625] truncate">{valor}</span>
      </span>
    </div>
  )
}

export function EscritorioView() {
  const [d, setD] = useState<Escritorio | null>(null)
  const [filtro, setFiltro] = useState<IdMesa | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const [mostrar, setMostrar] = useState(12)
  const [modo, setModo] = useState<"sala" | "detalhes">("sala")
  const [feedAberto, setFeedAberto] = useState(false)
  useEffect(() => { try { if (localStorage.getItem("escritorio:modo") === "detalhes") setModo("detalhes") } catch { /* sem storage */ } }, [])
  const trocarModo = (v: "sala" | "detalhes") => { setModo(v); try { localStorage.setItem("escritorio:modo", v) } catch { /* sem storage */ } }
  useEffect(() => {
    const carregar = () => fetch("/api/escritorio").then(r => r.ok ? r.json() : null).then(x => { if (x) { setD(x); setAgora(Date.now()) } }).catch(() => {})
    carregar()
    const t = setInterval(carregar, 30_000)
    return () => clearInterval(t)
  }, [])
  const feed = useMemo(() => (d?.feed ?? []).filter(e => !filtro || e.mesa === filtro), [d, filtro])

  if (!d) return <Pagina><CabecalhoPagina titulo="Escritório" sub="Seus agentes trabalhando agora" /><Esqueleto linhas={6} /></Pagina>

  const trabalhando = d.mesas.filter(m => m.estado === "trabalhando").length
  const travados = d.mesas.filter(m => m.estado === "travado").length
  const totalHoje = d.mesas.reduce((t, m) => t + m.hoje, 0)
  const pctCota = Math.min(100, d.cota.usados / d.cota.limite * 100)
  const sub = travados ? `${travados} ${travados === 1 ? "agente travado" : "agentes travados"} · ${totalHoje} entregas hoje`
    : trabalhando ? `${trabalhando} ${trabalhando === 1 ? "agente trabalhando" : "agentes trabalhando"} agora · ${totalHoje} entregas hoje`
    : `Todos de plantão · ${totalHoje} entregas hoje`

  const segmentado = <Segmentado valor={modo} onChange={trocarModo} opcoes={[{ v: "sala", nome: "Sala" }, { v: "detalhes", nome: "Detalhes" }]} />
  const licoes = Number((d.mesas.find(m => m.id === "aprendiz")?.extra ?? "").match(/\d+/)?.[0] ?? 0)
  const linhaFeed = (e: Escritorio["feed"][number], i: number) => {
    const { cor, Icone } = VISUAL[e.mesa]
    return (
      <li key={`${e.em}-${i}`} className="flex items-start gap-2.5 py-2 border-b last:border-b-0 border-[rgba(116,116,128,0.10)]">
        <span className="text-[11px] text-[#898892] ds-num w-9 shrink-0 pt-[3px]">{hhmm(e.em)}</span>
        <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: `${cor}17`, color: cor }}><Icone className="w-3 h-3" strokeWidth={2} /></span>
        <span className={`flex-1 min-w-0 text-[12.5px] leading-snug break-words ${e.tom === "segurou" ? "text-[#b4690e]" : "text-[#191625]"}`}>{e.texto}</span>
      </li>
    )
  }
  const vidro = { background: "rgba(255,255,255,0.88)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxShadow: "0 4px 18px rgba(20,30,10,0.18)" } as const
  const chip = (ok: boolean | null, icone: React.ReactNode, texto: string) => (
    <span className="flex items-center gap-1.5 rounded-full px-2.5 h-8 text-[12px] font-semibold whitespace-nowrap" style={{ ...vidro, color: ok === false ? "#d33a3c" : "#2a2430" }}>
      <span style={{ color: ok === false ? "#d33a3c" : ok ? "#1f9d55" : "#898892" }}>{icone}</span>{texto}
    </span>
  )

  if (modo === "sala") return (
    <div className="relative h-full min-h-[480px] overflow-hidden ds-entrada" style={{ background: "#7fb069" }}>
      <EscritorioVirtual mesas={d.mesas} selecionada={filtro} cota={d.cota} licoes={licoes} noHorario={d.noHorario}
        onSelecionar={id => { setFiltro(id); setMostrar(12) }} />
      {/* topo: título e situação */}
      <div className="absolute top-2.5 left-2.5 right-2.5 sm:top-3 sm:left-3 sm:right-3 flex items-start justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto rounded-2xl px-3 py-2 sm:px-3.5 sm:py-2.5 min-w-0" style={vidro}>
          <p className="text-[14px] sm:text-[15px] font-bold text-[#191625] leading-tight">Escritório ENYLA</p>
          <p className="text-[11.5px] text-[#5e5c68] leading-tight mt-0.5 truncate">{sub}</p>
        </div>
        <div className="pointer-events-auto flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
          <div className="hidden md:flex items-center gap-1.5">
            {chip(d.whatsapp === "desconectado" ? false : d.whatsapp ? true : null, d.whatsapp === "desconectado" ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />, d.whatsapp === "desconectado" ? "WhatsApp fora" : "WhatsApp")}
            {chip(!d.semCredito, <Sparkles className="w-3.5 h-3.5" />, d.semCredito ? "IA sem crédito" : "IA")}
            {chip(pctCota >= 100 ? false : true, <Clock className="w-3.5 h-3.5" />, `${d.cota.usados}/${d.cota.limite} na hora`)}
          </div>
          <div className="rounded-xl" style={vidro}>{segmentado}</div>
        </div>
      </div>
      {/* feed: no computador, cartão no canto; no celular, a última linha (toque abre tudo) */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 sm:left-auto sm:bottom-3 sm:right-3 sm:w-[330px] pointer-events-auto">
        <div className="rounded-2xl px-3 pt-2.5 pb-1.5" style={vidro}>
          <button onClick={() => setFeedAberto(true)} className="w-full flex items-center justify-between gap-2 text-left">
            <span className="text-[12.5px] font-semibold text-[#191625]">{filtro ? d.mesas.find(m => m.id === filtro)?.nome : "Acontecendo agora"}</span>
            <span className="text-[11.5px] font-semibold text-[#8456e8]">Ver tudo</span>
          </button>
          <ol className="sm:hidden">{feed.slice(0, 1).map(linhaFeed)}</ol>
          <ol className="hidden sm:block">{feed.slice(0, 4).map(linhaFeed)}</ol>
          {feed.length === 0 && <p className="text-[12px] text-[#898892] py-2">Nada por aqui hoje ainda.</p>}
        </div>
      </div>
      <Gaveta aberta={feedAberto} titulo={filtro ? `Hoje · ${d.mesas.find(m => m.id === filtro)?.nome}` : "Acontecendo hoje"} sub={`${feed.length} ações`} onFechar={() => setFeedAberto(false)}>
        <ol className="px-4">{feed.slice(0, mostrar).map(linhaFeed)}</ol>
        {feed.length > mostrar && (
          <div className="px-4 pb-4"><button onClick={() => setMostrar(n => n + 30)} className="ds-toque mt-2 w-full h-10 rounded-xl text-[13px] font-semibold text-[#8456e8] bg-[rgba(132,86,232,0.07)]">Mostrar mais ({feed.length - mostrar})</button></div>
        )}
      </Gaveta>
    </div>
  )

  return (
    <Pagina>
      <CabecalhoPagina titulo="Escritório" sub={sub} acoes={segmentado} />

      {<>
      <Cartao className="ds-entrada">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-4">
          <Status icone={<Power className="w-4 h-4" />} rotulo="Atendimento" tom={d.ligado && d.noHorario ? "ok" : "neutro"}
            valor={!d.ligado ? "Desligado" : d.noHorario ? "No horário" : "Fora do horário"} />
          <Status icone={d.whatsapp === "desconectado" ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />} rotulo="WhatsApp"
            tom={d.whatsapp === "desconectado" ? "ruim" : d.whatsapp ? "ok" : "neutro"} valor={d.whatsapp === "desconectado" ? "Desconectado" : d.whatsapp ? "Conectado" : "Sem sinal ainda"} />
          <Status icone={<Sparkles className="w-4 h-4" />} rotulo="IA" tom={d.semCredito ? "ruim" : "ok"} valor={d.semCredito ? "Sem crédito" : "Funcionando"} />
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: pctCota >= 100 ? "#d33a3c14" : "#8456e814", color: pctCota >= 100 ? "#d33a3c" : "#8456e8" }}><Clock className="w-4 h-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10.5px] uppercase tracking-wide text-[#898892] font-semibold">Envios na hora</span>
                <span className="block text-[13px] font-semibold text-[#191625] ds-num">{d.cota.usados} de {d.cota.limite}</span>
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-[rgba(116,116,128,0.10)] overflow-hidden">
              <div className="h-full rounded-full ds-cresce-x" style={{ width: `${pctCota}%`, background: pctCota >= 100 ? "#d33a3c" : pctCota >= 75 ? "#e07b1f" : "#8456e8" }} />
            </div>
          </div>
        </div>
      </Cartao>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3 ds-escalonado">
        {d.mesas.map(m => <MesaCard key={m.id} m={m} agora={agora} ativa={filtro === m.id} onClick={() => { setFiltro(f => f === m.id ? null : m.id); setMostrar(12) }} />)}
      </div>
      </>}

      <Cartao className="ds-entrada">
        <TituloCartao titulo={filtro ? `Hoje · ${d.mesas.find(m => m.id === filtro)?.nome}` : "Acontecendo hoje"}
          sub={filtro ? "Toque na mesa de novo para ver todos" : "Tudo o que os agentes fizeram, do mais recente"}
          acao={filtro ? <button onClick={() => setFiltro(null)} className="ds-toque text-[12px] font-semibold text-[#8456e8] px-2 py-1 rounded-lg">Ver todos</button> : undefined} />
        {feed.length === 0 ? (
          <p className="text-[13px] text-[#898892] py-6 text-center">Nada por aqui hoje ainda.</p>
        ) : (
          <ol className="relative">
            {feed.slice(0, mostrar).map((e, i) => {
              const { cor, Icone } = VISUAL[e.mesa]
              return (
                <li key={`${e.em}-${i}`} className="flex items-start gap-3 py-2.5 border-b last:border-b-0 border-[rgba(116,116,128,0.10)]">
                  <span className="text-[11.5px] text-[#898892] ds-num w-10 shrink-0 pt-[3px]">{hhmm(e.em)}</span>
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cor}17`, color: cor }}><Icone className="w-3.5 h-3.5" strokeWidth={2} /></span>
                  <span className={`flex-1 min-w-0 text-[13px] leading-snug break-words ${e.tom === "segurou" ? "text-[#b4690e]" : "text-[#191625]"}`}>{e.texto}</span>
                </li>
              )
            })}
          </ol>
        )}
        {feed.length > mostrar && (
          <button onClick={() => setMostrar(n => n + 20)} className="ds-toque mt-2 w-full h-10 rounded-xl text-[13px] font-semibold text-[#8456e8] bg-[rgba(132,86,232,0.07)]">
            Mostrar mais ({feed.length - mostrar})
          </button>
        )}
      </Cartao>
    </Pagina>
  )
}
