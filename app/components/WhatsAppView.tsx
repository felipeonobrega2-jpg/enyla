"use client"

import { Image as ImageIcon, FileText, Smile, Check, CheckCheck, X, Paperclip, SendHorizontal, Mic, Video, Columns3, List, Pin } from "lucide-react"
import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import type { KanbanCard, LancamentoFinanceiro } from "../types"
import { montarPedidos, nomeChave } from "../lib/negocio"
import { clienteDaConversa, Vinculos } from "../lib/vinculoWhatsapp"
import { lerOrigem } from "../lib/origemWhatsapp"
import { ETAPAS, Etapa, posicaoNoFunil } from "../lib/funilWhatsapp"
import { brl } from "../utils"

type Conversa = {
  jid: string
  nome: string
  ultima_msg: string | null
  ultima_at: string | null
  nao_lidas: number
  foto_url: string | null
  campanha?: string | null
  ultima_recebida_at?: string | null
  ultima_enviada_at?: string | null
  status_lead?: string | null
  ultima_classificacao_at?: string | null
}

type Mensagem = {
  id: string
  jid: string
  from_me: boolean
  corpo: string | null
  tipo: string
  media_url: string | null
  ts: string
  kanban_card_id: string | null
  status?: string | null
}

function fmtHora(iso: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  const hoje = new Date()
  const msAgo = hoje.getTime() - d.getTime()
  if (msAgo < 86_400_000 && d.getDate() === hoje.getDate()) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

// Foto de perfil buscada pelo sistema (cópia guardada); sem foto, as iniciais
function Avatar({ nome, jid }: { nome: string; jid: string }) {
  const [semFoto, setSemFoto] = useState(false)
  const initials = nome.split(" ").slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase() || "?"
  // eslint-disable-next-line @next/next/no-img-element
  if (!semFoto) return <img src={`/api/whatsapp/foto/${encodeURIComponent(jid)}`} alt="" loading="lazy" onError={() => setSemFoto(true)} className="w-10 h-10 rounded-full object-cover shrink-0 bg-[#8456e8]/15" />
  return (
    <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-[13px] font-bold text-white"
      style={{ background: "#8456e8" }}>
      {initials}
    </div>
  )
}

function TypingBubble() {
  return (
    <div className="flex gap-1 items-center px-3 py-2 rounded-2xl rounded-bl-sm max-w-fit"
      style={{ background: "#f0f0f0" }}>
      {[0, 1, 2].map(i => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  )
}

export default function WhatsAppView({
  onCriarCard, kanban = [], lancamentos = [], vinculos, onVincular, onAbrirCliente,
}: {
  onCriarCard: (nome: string, jid: string) => void
  kanban?: KanbanCard[]
  lancamentos?: LancamentoFinanceiro[]
  vinculos?: Vinculos
  onVincular?: (jid: string, cliente: string | null) => void
  onAbrirCliente?: (nome: string) => void
}) {
  // Clientes do cadastro (quem tem orçamento/pedido) e o resumo de cada um, para ligar às conversas
  const nomesClientes = useMemo(() => [...new Set(kanban.filter(c => !c.isTerceirizado && c.nomeCliente).map(c => c.nomeCliente))].sort(), [kanban])
  const resumo = useMemo(() => {
    const m = new Map<string, { pedidos: number; vendido: number; deve: number }>()
    for (const p of montarPedidos(kanban, lancamentos).filter(p => p.dataFechamento)) {
      const k = nomeChave(p.nomeCliente), r = m.get(k) ?? { pedidos: 0, vendido: 0, deve: 0 }
      m.set(k, { pedidos: r.pedidos + 1, vendido: r.vendido + p.venda, deve: r.deve + p.aReceber })
    }
    return m
  }, [kanban, lancamentos])
  const clienteDe = (c: { jid: string; nome: string | null }) => clienteDaConversa(c, nomesClientes, vinculos)
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [ativa, setAtiva] = useState<Conversa | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [status, setStatus] = useState<StatusWhats | null>(null)
  useEffect(() => { fetch("/api/whatsapp/status").then(r => r.json()).then(setStatus).catch(() => {}) }, [])
  const [busca, setBusca] = useState("")
  const [filtro, setFiltro] = useState<"todas" | "anuncio" | "site" | "clientes">("todas")
  const [modo, setModo] = useState<"lista" | "funil">("lista")
  const threadRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const carregarConversas = useCallback(async () => {
    const res = await fetch("/api/whatsapp/conversas")
    if (res.ok) {
      const d: unknown = await res.json()
      const novas = Array.isArray(d) ? d as Conversa[] : []
      setConversas(prev => JSON.stringify(prev) === JSON.stringify(novas) ? prev : novas)
    }
    setLoadingConvs(false)
  }, [])

  // Atualização silenciosa: só troca a lista se chegou mensagem nova (não redesenha nem para o áudio que está tocando)
  const carregarMensagens = useCallback(async (jid: string, primeira = false) => {
    if (primeira) setLoadingMsgs(true)
    const res = await fetch(`/api/whatsapp/mensagens/${encodeURIComponent(jid)}`).catch(() => null)
    if (res?.ok) {
      const d: unknown = await res.json()
      const novas = Array.isArray(d) ? d as Mensagem[] : []
      setMensagens(prev => {
        if (primeira || !prev.length) return novas
        if (prev[prev.length - 1]?.id === novas[novas.length - 1]?.id) return prev
        // Mantém as anteriores já carregadas e acrescenta as novas
        const ids = new Set(prev.map(m => m.id))
        return [...prev, ...novas.filter(m => !ids.has(m.id))]
      })
    }
    if (primeira) setLoadingMsgs(false)
  }, [])

  useEffect(() => {
    carregarConversas()
    pollRef.current = setInterval(carregarConversas, 8000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [carregarConversas])

  useEffect(() => {
    if (!ativa) return
    carregarMensagens(ativa.jid, true)
    const t = setInterval(() => carregarMensagens(ativa.jid), 5000)
    return () => clearInterval(t)
  }, [ativa, carregarMensagens])

  // Desce para o fim ao abrir e quando chega mensagem nova, a menos que você esteja lendo lá em cima
  const ultimaId = mensagens[mensagens.length - 1]?.id
  const rolouParaCima = useRef(false)
  useEffect(() => {
    const el = threadRef.current
    if (el && !rolouParaCima.current) el.scrollTop = el.scrollHeight
  }, [ultimaId])

  async function abrirConversa(c: Conversa) {
    rolouParaCima.current = false
    setAtiva(c)
    setMensagens([])
    if (c.nao_lidas > 0) {
      await fetch("/api/whatsapp/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: c.jid }),
      })
      setConversas(prev => prev.map(x => x.jid === c.jid ? { ...x, nao_lidas: 0 } : x))
    }
  }

  const filtradas = conversas.filter(c =>
    (filtro === "todas" || (filtro === "clientes" ? !!clienteDe(c) : lerOrigem(c.campanha)?.canal === filtro)) &&
    (c.nome.toLowerCase().includes(busca.toLowerCase()) || (c.ultima_msg ?? "").toLowerCase().includes(busca.toLowerCase()))
  )

  const totalNaoLidas = conversas.reduce((s, c) => s + c.nao_lidas, 0)

  if (modo === "funil") return (
    <FunilConversas conversas={conversas} cardsDe={c => { const cl = clienteDe(c); return cl ? kanban.filter(k => nomeChave(k.nomeCliente) === nomeChave(cl.nome)) : [] }}
      clienteDe={clienteDe}
      onAbrir={c => { setModo("lista"); abrirConversa(c) }}
      onMover={async (jid, etapa) => {
        setConversas(prev => prev.map(c => c.jid === jid ? { ...c, status_lead: etapa, ultima_classificacao_at: etapa ? new Date().toISOString() : null } : c))
        await fetch("/api/whatsapp/conversas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid, etapa }) }).catch(() => {})
      }}
      onVoltar={() => setModo("lista")} />
  )

  return (
    <div className="flex h-full" style={{ background: "var(--bg-page)" }}>

      {/* ── Coluna esquerda: lista de conversas ─── */}
      <div className="w-80 shrink-0 flex flex-col border-r" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>

        {/* Header */}
        <div className="px-4 pt-5 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.862L.057 23.929a.5.5 0 0 0 .614.614l6.067-1.475A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.933 0-3.742-.523-5.289-1.433l-.378-.225-3.924.953.953-3.924-.225-.378A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            <span className="text-[15px] font-semibold" style={{ color: "var(--text-main)" }}>WhatsApp</span>
            <button onClick={() => setModo("funil")} className="ml-2 h-7 px-2.5 rounded-lg text-[11.5px] font-semibold flex items-center gap-1" style={{ background: "rgba(132,86,232,0.1)", color: "#8456e8" }}>
              <Columns3 className="w-3.5 h-3.5" />Funil
            </button>
            {totalNaoLidas > 0 && (
              <span className="ml-auto text-[11px] font-bold text-white bg-[#25D366] rounded-full px-2 py-0.5">
                {totalNaoLidas}
              </span>
            )}
          </div>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar conversa…"
            className="w-full text-[13px] px-3 py-2 rounded-xl outline-none"
            style={{ background: "var(--bg-page)", color: "var(--text-main)", border: "1px solid var(--border)" }}
          />
          <div className="flex gap-1 mt-2 flex-wrap">
            {([["todas", "Todas"], ["anuncio", "Anúncio"], ["site", "Site"], ["clientes", "Clientes"]] as const).map(([v, n]) => (
              <button key={v} onClick={() => setFiltro(v)} className="h-7 px-2.5 rounded-full text-[11.5px] font-medium transition-colors"
                style={filtro === v ? { background: "#191625", color: "#fff" } : { background: "var(--bg-page)", color: "var(--text-sub)", border: "1px solid var(--border)" }}>
                {n}{v !== "todas" ? ` ${conversas.filter(c => v === "clientes" ? !!clienteDe(c) : lerOrigem(c.campanha)?.canal === v).length}` : ""}
              </button>
            ))}
          </div>
          {status?.evolution?.conectado && <ImportarHistorico onFim={carregarConversas} />}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvs && (
            <div className="flex flex-col gap-3 p-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3 items-center animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-zinc-200 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-zinc-200 rounded w-3/4" />
                    <div className="h-2.5 bg-zinc-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingConvs && filtradas.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
              <svg className="w-10 h-10 opacity-20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.862L.057 23.929a.5.5 0 0 0 .614.614l6.067-1.475A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.933 0-3.742-.523-5.289-1.433l-.378-.225-3.924.953.953-3.924-.225-.378A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
              {busca || (status && status.totalConversas > 0) ? (
                <p className="text-[13px] font-medium" style={{ color: "var(--text-sub)" }}>
                  {busca ? "Nenhuma conversa encontrada" : "Aguardando mensagens…"}
                </p>
              ) : (
                <ConexaoWhats status={status} onAtualizar={setStatus} />
              )}
            </div>
          )}

          {filtradas.map(c => (
            <button
              key={c.jid}
              onClick={() => abrirConversa(c)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.03]"
              style={{
                background: ativa?.jid === c.jid ? "rgba(132,86,232,0.06)" : undefined,
                borderLeft: ativa?.jid === c.jid ? "2px solid #8456e8" : "2px solid transparent",
              }}
            >
              <Avatar nome={c.nome} jid={c.jid} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-semibold truncate flex items-center gap-1.5 min-w-0" style={{ color: "var(--text-main)" }}>
                    <span className="truncate">{c.nome}</span>
                    {clienteDe(c) && <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-px rounded" style={{ background: "rgba(132,86,232,0.12)", color: "#8456e8" }}>cliente</span>}
                    <SeloOrigem campanha={c.campanha} />
                  </span>
                  <span className="text-[11px] shrink-0" style={{ color: "var(--text-faint)" }}>{fmtHora(c.ultima_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-[12px] truncate flex items-center gap-1 min-w-0" style={{ color: "var(--text-sub)" }}><Previa texto={c.ultima_msg} /></span>
                  {c.nao_lidas > 0 && (
                    <span className="shrink-0 text-[10px] font-bold text-white bg-[#25D366] rounded-full w-4 h-4 flex items-center justify-center">
                      {c.nao_lidas > 9 ? "9+" : c.nao_lidas}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Painel direito: thread ─────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!ativa ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(37,211,102,0.1)" }}>
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.862L.057 23.929a.5.5 0 0 0 .614.614l6.067-1.475A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.933 0-3.742-.523-5.289-1.433l-.378-.225-3.924.953.953-3.924-.225-.378A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
            </div>
            <div>
              <p className="text-[15px] font-semibold mb-1" style={{ color: "var(--text-main)" }}>Selecione uma conversa</p>
              <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Clique em um contato para ver as mensagens</p>
            </div>
          </div>
        ) : (
          <>
            {/* Topbar da conversa */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b shrink-0" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
              <Avatar key={ativa.jid} nome={ativa.nome} jid={ativa.jid} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{ativa.nome}</p>
                <OrigemDaConversa campanha={ativa.campanha} />
                <ClienteDaConversa cliente={clienteDe(ativa)} resumo={resumo} clientes={nomesClientes}
                  onVincular={onVincular ? nome => onVincular(ativa.jid, nome) : undefined} onAbrir={onAbrirCliente} />
              </div>
              <button
                onClick={() => onCriarCard(ativa.nome, ativa.jid)}
                className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-2 rounded-xl transition-colors hover:opacity-90"
                style={{ background: "#8456e8", color: "#fff" }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Criar card no Kanban
              </button>
            </div>

            {/* Thread */}
            <div ref={threadRef} onScroll={e => { const el = e.currentTarget; rolouParaCima.current = el.scrollHeight - el.scrollTop - el.clientHeight > 200 }}
              className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2" style={{ background: "#efeae2" }}>
              {loadingMsgs && <div className="flex justify-center py-8"><TypingBubble /></div>}
              {!loadingMsgs && mensagens.length >= 300 && <CarregarAnteriores key={ativa.jid} jid={ativa.jid} primeira={mensagens[0]?.ts}
                onCarregar={antigas => {
                  const el = threadRef.current, alturaAntes = el?.scrollHeight ?? 0
                  rolouParaCima.current = true
                  setMensagens(prev => { const ids = new Set(prev.map(m => m.id)); return [...antigas.filter(m => !ids.has(m.id)), ...prev] })
                  // Mantém a posição de leitura depois de acrescentar mensagens em cima
                  requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - alturaAntes })
                }} />}
              {!loadingMsgs && <TranscreverConversa jid={ativa.jid} pendentes={mensagens.filter(m => (m.tipo === "audio" || m.tipo === "audioMessage") && !m.corpo).length}
                onFim={() => carregarMensagens(ativa.jid)} />}

              {!loadingMsgs && mensagens.map((m, i) => {
                const prevDate = i > 0 ? new Date(mensagens[i - 1].ts).toDateString() : null
                const thisDate = new Date(m.ts).toDateString()
                const showDate = prevDate !== thisDate

                return (
                  <div key={m.id}>
                    {showDate && (
                      <div className="flex justify-center my-2">
                        <span className="text-[11px] px-3 py-0.5 rounded-full bg-white/70 shadow-sm" style={{ color: "#54656f" }}>
                          {new Date(m.ts).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}>
                      <div
                        className="max-w-[70%] px-3 py-2 rounded-2xl shadow-sm"
                        style={{
                          background: m.from_me ? "#d9fdd3" : "#ffffff",
                          borderRadius: m.from_me ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                        }}
                      >
                        <MidiaMensagem id={m.id} tipo={m.tipo} nome={m.corpo} />
                        {m.corpo && (m.tipo === "audio" || m.tipo === "audioMessage") ? (
                          <p className="text-[12.5px] leading-snug whitespace-pre-wrap italic mt-1 max-w-[320px]" style={{ color: m.corpo.startsWith("[") ? "#8696a0" : "#3b4a54" }}>
                            {!m.corpo.startsWith("[") && <span className="not-italic text-[10px] font-semibold uppercase tracking-wide mr-1" style={{ color: "#8696a0" }}>Transcrição</span>}
                            {m.corpo}
                          </p>
                        ) : m.corpo && m.tipo !== "document" && (
                          <p className="text-[13.5px] leading-snug whitespace-pre-wrap" style={{ color: "#111b21" }}>{m.corpo}</p>
                        )}
                        <p className="text-[10.5px] mt-1 flex items-center justify-end gap-1" style={{ color: "#8696a0" }}>
                          {new Date(m.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          {m.from_me && <Recibo status={m.status} />}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <Compositor jid={ativa.jid} onEnviado={() => carregarMensagens(ativa.jid)} />
          </>
        )}
      </div>
    </div>
  )
}

type DiagEvo = { configurado: boolean; alcancavel: boolean; autorizado: boolean; conectado: boolean; estado: string | null; webhookOk: boolean; webhookDestino: string | null; host: string | null }
type StatusWhats = { segredoConfigurado: boolean; totalConversas: number; evolution?: DiagEvo }

// Checklist da integração com o Evolution (situação real, lida no servidor) e o botão que acerta o webhook
export function ConexaoWhats({ status, onAtualizar }: { status: StatusWhats | null; onAtualizar: (s: StatusWhats) => void }) {
  const [configurando, setConfigurando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [pareando, setPareando] = useState(false)
  // Enquanto o QR está na tela: busca um novo a cada 15 s (ele expira) até o número conectar
  useEffect(() => {
    if (!pareando) return
    let vivo = true
    let primeira = true
    const buscar = async () => {
      const r = await fetch(`/api/whatsapp/qr${primeira ? "?novo=1" : ""}`).then(r => r.json()).catch(() => null)
      primeira = false
      if (!vivo || !r) return
      if (r.evolution && status) onAtualizar({ ...status, evolution: r.evolution })
      if (r.conectado) { setPareando(false); setQr(null); return }
      if (r.qr) setQr(r.qr); else if (r.erro) setErro(r.erro)
    }
    buscar()
    const t = setInterval(buscar, 15_000)
    return () => { vivo = false; clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pareando])
  const e = status?.evolution
  const itens: { ok: boolean; txt: string; dica?: string }[] = !status ? [] : [
    { ok: !!e?.configurado, txt: "Endereço, chave e instância do Evolution na Vercel", dica: "EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE" },
    { ok: !!e?.alcancavel, txt: `Servidor do Evolution respondendo${e?.host ? ` (${e.host})` : ""}`, dica: "Confira se a VPS e o contêiner do Evolution estão no ar" },
    { ok: !!e?.autorizado, txt: "Chave aceita pelo Evolution", dica: "A EVOLUTION_API_KEY não confere com a da VPS" },
    { ok: !!e?.conectado, txt: `Seu número conectado${e?.estado && e.estado !== "open" ? ` (estado: ${e.estado})` : ""}`, dica: "Toque em \"Conectar meu número\" abaixo e leia o QR code com o WhatsApp do celular" },
    { ok: status.segredoConfigurado, txt: "Senha do webhook definida", dica: "WHATSAPP_WEBHOOK_SECRET na Vercel" },
    { ok: !!e?.webhookOk, txt: "Webhook apontando para o sistema", dica: e?.webhookDestino ? `Hoje aponta para ${e.webhookDestino}` : "Ainda não configurado" },
  ]
  const podeConfigurar = !!e?.autorizado && status?.segredoConfigurado && !e?.webhookOk
  async function configurar() {
    setConfigurando(true); setErro(null)
    const r = await fetch("/api/whatsapp/configurar", { method: "POST" }).then(r => r.json()).catch(() => null)
    if (!r?.ok) setErro(r?.erro ?? "Não deu para configurar agora.")
    if (r?.evolution && status) onAtualizar({ ...status, evolution: r.evolution })
    setConfigurando(false)
  }
  return (
    <div className="text-left max-w-[320px] space-y-3">
      <p className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>WhatsApp ainda não está recebendo mensagens</p>
      {!status ? <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>Verificando a conexão…</p> : (
        <ul className="space-y-2">
          {itens.map(i => (
            <li key={i.txt} className="flex gap-2 text-[12px] leading-snug">
              <span className="mt-[2px] w-4 h-4 rounded-full shrink-0 grid place-items-center text-white" style={{ background: i.ok ? "#009351" : "#d33a3c" }}>{i.ok ? <Check className="w-2.5 h-2.5" strokeWidth={3.5} /> : <X className="w-2.5 h-2.5" strokeWidth={3.5} />}</span>
              <span>
                <span style={{ color: i.ok ? "var(--text-main)" : "#d33a3c", fontWeight: i.ok ? 400 : 600 }}>{i.txt}</span>
                {!i.ok && i.dica && <span className="block text-[11px]" style={{ color: "var(--text-faint)" }}>{i.dica}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {e?.autorizado && !e.conectado && (
        pareando ? (
          <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--bg-surface)" }}>
            {qr
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={qr} alt="QR code para conectar o WhatsApp" className="w-56 h-56 mx-auto" />
              : <p className="text-[12px] py-10 text-center" style={{ color: "var(--text-faint)" }}>Gerando o QR code…</p>}
            <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-sub)" }}>
              No celular: WhatsApp → <b>Configurações</b> → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b>, e aponte para o código. Ele se renova sozinho até conectar.
            </p>
            <button onClick={() => { setPareando(false); setQr(null) }} className="text-[12px] font-semibold text-[#8456e8]">Cancelar</button>
          </div>
        ) : (
          <button onClick={() => { setErro(null); setPareando(true) }}
            className="h-9 px-4 rounded-xl text-[12.5px] font-semibold text-white mr-2" style={{ background: "#25a35a" }}>
            Conectar meu número
          </button>
        )
      )}
      {podeConfigurar && (
        <button onClick={configurar} disabled={configurando}
          className="h-9 px-4 rounded-xl text-[12.5px] font-semibold text-white disabled:opacity-50" style={{ background: "#8456e8" }}>
          {configurando ? "Configurando…" : "Configurar webhook"}
        </button>
      )}
      {erro && <p className="text-[12px] text-[#d33a3c]">{erro}</p>}
      <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-faint)" }}>
        Enquanto isso, os botões de WhatsApp do Painel, de Clientes e de Parceiros já abrem a conversa com a mensagem pronta no seu WhatsApp.
      </p>
    </div>
  )
}

// Busca no Evolution (banco da VPS) o histórico completo, página por página, e completa nomes e telefones
function ImportarHistorico({ onFim }: { onFim: () => void }) {
  const [prog, setProg] = useState<{ pagina: number; paginas: number; total: number } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [rodando, setRodando] = useState(false)
  async function importar() {
    setRodando(true); setMsg(null)
    let pagina = 1
    for (;;) {
      const r = await fetch("/api/whatsapp/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pagina }) })
        .then(r => r.json()).catch(() => null)
      if (!r || r.erro) { setMsg(r?.erro ?? "Parou no meio (sem conexão). Toque de novo: continua sem duplicar."); break }
      setProg({ pagina, paginas: r.paginas, total: r.total })
      if (r.fim || !r.paginas) { setMsg(`Histórico importado: ${r.total.toLocaleString("pt-BR")} mensagens.`); break }
      pagina++
    }
    setRodando(false); onFim()
  }
  const pct = prog?.paginas ? Math.round(prog.pagina / prog.paginas * 100) : 0
  return (
    <div className="mt-2">
      <button onClick={importar} disabled={rodando}
        className="w-full h-8 rounded-xl text-[12px] font-semibold disabled:opacity-70 transition-colors"
        style={{ background: "rgba(37,163,90,0.1)", color: "#1e8a4c" }}>
        {rodando ? `Importando histórico… ${pct}%` : "Importar histórico do WhatsApp"}
      </button>
      {rodando && <div className="h-1 mt-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}><div className="h-full bg-[#25a35a] transition-[width]" style={{ width: `${pct}%` }} /></div>}
      {msg && <p className="text-[11px] mt-1.5" style={{ color: "var(--text-sub)" }}>{msg}</p>}
      <button onClick={async () => {
        setMsg("Classificando origens…")
        const r = await fetch("/api/whatsapp/origens", { method: "POST" }).then(r => r.json()).catch(() => null)
        setMsg(r ? `Origens: ${r.anuncio} de anúncio, ${r.site} do site · ${r.clientes} clientes atualizados.` : "Não deu para classificar agora.")
        onFim()
      }} className="mt-1 text-[11px] font-semibold text-[#8456e8]">Atualizar origens (anúncio / site)</button>
    </div>
  )
}

// Mídia da mensagem servida pelo sistema (cópia guardada; primeira vez busca no Evolution)
function MidiaMensagem({ id, tipo: bruto, nome }: { id: string; tipo: string; nome: string | null }) {
  const [falhou, setFalhou] = useState(false)
  // Importações antigas gravaram o tipo cru do WhatsApp
  const tipo = ({ videoMessage: "video", ptvMessage: "video", documentWithCaptionMessage: "document" } as Record<string, string>)[bruto] ?? bruto
  const src = `/api/whatsapp/midia/${encodeURIComponent(id)}`
  const indisponivel = (rotulo: string) => (
    <div className="text-[12px] italic mb-1" style={{ color: "#54656f" }}>{rotulo} indisponível</div>
  )
  if (tipo === "image") return falhou ? indisponivel("Imagem") : (
    <a href={src} target="_blank" rel="noreferrer" className="block mb-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Imagem" loading="lazy" onError={() => setFalhou(true)} className="rounded-xl max-w-[260px] max-h-[320px] object-cover bg-black/5 min-w-[120px] min-h-[80px]" />
    </a>
  )
  if (tipo === "sticker") return falhou ? indisponivel("Figurinha") : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="Figurinha" loading="lazy" onError={() => setFalhou(true)} className="w-28 h-28 object-contain" />
  )
  if (tipo === "audio") return falhou ? indisponivel("Áudio") : (
    <audio controls preload="none" src={src} onError={() => setFalhou(true)} className="w-[240px] max-w-full h-10" />
  )
  if (tipo === "video") return falhou ? indisponivel("Vídeo") : (
    <video controls preload="none" src={src} onError={() => setFalhou(true)} className="rounded-xl max-w-[280px] max-h-[320px] bg-black/5 mb-1" />
  )
  if (tipo === "document") return (
    <a href={src} target="_blank" rel="noreferrer" download={nome ?? undefined}
      className="flex items-center gap-2 px-3 py-2 mb-1 rounded-xl bg-black/[0.04] hover:bg-black/[0.07] max-w-[260px]">
      <FileText className="w-5 h-5 shrink-0" style={{ color: "#8456e8" }} />
      <span className="text-[12.5px] truncate" style={{ color: "#111b21" }}>{nome || "Documento"}</span>
    </a>
  )
  return null
}

// Caixa de resposta: Enter envia, Shift+Enter pula linha; clipe anexa foto/arquivo (com legenda)
export function Compositor({ jid, onEnviado }: { jid: string; onEnviado: () => void }) {
  const [texto, setTexto] = useState("")
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  async function enviar() {
    if (enviando || (!texto.trim() && !arquivo)) return
    setEnviando(true); setErro(null)
    let r: Response | null
    if (arquivo) {
      const f = new FormData()
      f.set("jid", jid); f.set("arquivo", arquivo); f.set("legenda", texto.trim())
      r = await fetch("/api/whatsapp/enviar", { method: "POST", body: f }).catch(() => null)
    } else {
      r = await fetch("/api/whatsapp/enviar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid, texto }) }).catch(() => null)
    }
    const d = r ? await r.json().catch(() => null) : null
    if (r?.ok) { setTexto(""); setArquivo(null); onEnviado() } else setErro(d?.erro ?? "Sem conexão. Tente de novo.")
    setEnviando(false)
  }
  return (
    <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      {arquivo && (
        <div className="mb-2 flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-lg w-fit max-w-full" style={{ background: "var(--bg-alt)", color: "var(--text-main)" }}>
          <Paperclip className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{arquivo.name}</span>
          <button onClick={() => setArquivo(null)} aria-label="Remover anexo" className="shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {erro && <p className="mb-2 text-[12px] text-[#d33a3c]">{erro}</p>}
      <div className="flex items-end gap-2">
        <button onClick={() => inputRef.current?.click()} aria-label="Anexar foto ou arquivo" title="Anexar foto ou arquivo"
          className="w-10 h-10 rounded-xl grid place-items-center shrink-0 transition-colors hover:bg-black/5" style={{ color: "var(--text-sub)" }}>
          <Paperclip className="w-5 h-5" />
        </button>
        <input ref={inputRef} type="file" className="hidden" onChange={e => { setArquivo(e.target.files?.[0] ?? null); e.target.value = "" }} />
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={1}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar() } }}
          placeholder={arquivo ? "Legenda (opcional)" : "Escreva uma mensagem"}
          className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-[13.5px] outline-none max-h-40"
          style={{ background: "var(--bg-page)", color: "var(--text-main)", border: "1px solid var(--border)", fieldSizing: "content" } as React.CSSProperties} />
        <button onClick={enviar} disabled={enviando || (!texto.trim() && !arquivo)} aria-label="Enviar"
          className="w-10 h-10 rounded-xl grid place-items-center shrink-0 text-white disabled:opacity-40 transition-opacity" style={{ background: "#25a35a" }}>
          <SendHorizontal className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}

const brlCurto = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

// Linha abaixo do nome na conversa: cliente ligado (com resumo) ou "Vincular cliente"
export function ClienteDaConversa({ cliente, resumo, clientes, onVincular, onAbrir }: {
  cliente: { nome: string; manual: boolean } | null
  resumo: Map<string, { pedidos: number; vendido: number; deve: number }>
  clientes: string[]
  onVincular?: (nome: string | null) => void
  onAbrir?: (nome: string) => void
}) {
  const [escolhendo, setEscolhendo] = useState(false)
  const [busca, setBusca] = useState("")
  if (escolhendo && onVincular) {
    const lista = clientes.filter(c => nomeChave(c).includes(nomeChave(busca))).slice(0, 8)
    return (
      <div className="relative mt-1">
        <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente do cadastro…"
          onKeyDown={e => { if (e.key === "Escape") setEscolhendo(false) }}
          className="w-64 text-[12px] px-2.5 py-1.5 rounded-lg outline-none" style={{ background: "var(--bg-page)", color: "var(--text-main)", border: "1px solid var(--border)" }} />
        <div className="absolute z-20 mt-1 w-64 rounded-lg shadow-lg overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          {lista.map(c => (
            <button key={c} onClick={() => { onVincular(c); setEscolhendo(false); setBusca("") }}
              className="block w-full text-left text-[12px] px-3 py-1.5 hover:bg-black/5" style={{ color: "var(--text-main)" }}>{c}</button>
          ))}
          {cliente && <button onClick={() => { onVincular(null); setEscolhendo(false) }} className="block w-full text-left text-[12px] px-3 py-1.5 hover:bg-black/5 text-[#d33a3c]">Não é cliente</button>}
          <button onClick={() => setEscolhendo(false)} className="block w-full text-left text-[11.5px] px-3 py-1.5 hover:bg-black/5" style={{ color: "var(--text-faint)" }}>Cancelar</button>
        </div>
      </div>
    )
  }
  if (!cliente) return onVincular
    ? <button onClick={() => setEscolhendo(true)} className="text-[11.5px] font-semibold text-[#8456e8]">Vincular cliente</button>
    : null
  const r = resumo.get(nomeChave(cliente.nome))
  return (
    <p className="text-[11.5px] flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text-sub)" }}>
      <button onClick={() => onAbrir?.(cliente.nome)} className="font-semibold text-[#8456e8] hover:underline">{cliente.nome}</button>
      <span>· {r ? `${r.pedidos} ${r.pedidos === 1 ? "pedido" : "pedidos"} · ${brlCurto(r.vendido)}` : "só orçamentos"}</span>
      {r && r.deve > 0.5 && <span className="font-semibold text-[#d33a3c]">· deve {brlCurto(r.deve)}</span>}
      {onVincular && <button onClick={() => setEscolhendo(true)} className="ml-1 underline" style={{ color: "var(--text-faint)" }}>{cliente.manual ? "trocar" : "não é ele?"}</button>}
    </p>
  )
}

// Prévia da última mensagem: mídia aparece como ícone + nome ("Áudio", "Foto"…), não como código do WhatsApp
const PREVIAS: Record<string, [string, typeof Mic]> = {
  audio: ["Áudio", Mic], audioMessage: ["Áudio", Mic], image: ["Foto", ImageIcon], imageMessage: ["Foto", ImageIcon],
  video: ["Vídeo", Video], videoMessage: ["Vídeo", Video], document: ["Documento", FileText], documentMessage: ["Documento", FileText],
  sticker: ["Figurinha", Smile], stickerMessage: ["Figurinha", Smile], reaction: ["Reação", Smile],
}
function Previa({ texto }: { texto: string | null }) {
  const m = /^\[(\w+)\]$/.exec(texto ?? "")
  if (!m) return <span className="truncate">{texto ?? ""}</span>
  const [rotulo, Icone] = PREVIAS[m[1]] ?? ["Mensagem", FileText]
  return <><Icone className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{rotulo}</span></>
}

// Transcreve os áudios ainda sem texto da conversa aberta (alguns por vez, até acabar)
function TranscreverConversa({ jid, pendentes, onFim }: { jid: string; pendentes: number; onFim: () => void }) {
  const [rodando, setRodando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  if (!pendentes && !erro) return null
  async function rodar() {
    setRodando(true); setErro(null)
    for (;;) {
      const r = await fetch("/api/whatsapp/transcrever", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid }) })
        .then(r => r.json()).catch(() => null)
      onFim()
      if (!r || r.erro) { setErro(r?.erro ?? "Parou (sem conexão). Toque de novo para continuar."); break }
      if (!r.restantes) break
    }
    setRodando(false)
  }
  return (
    <div className="sticky top-0 z-10 flex justify-center mb-1">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full shadow-sm text-[12px]" style={{ background: "#ffffff", color: "#54656f" }}>
        <Mic className="w-3.5 h-3.5" />
        {erro ? <span className="text-[#d33a3c]">{erro}</span> : <span>{pendentes} {pendentes === 1 ? "áudio sem transcrição" : "áudios sem transcrição"}</span>}
        <button onClick={rodar} disabled={rodando} className="font-semibold text-[#1e8a4c] disabled:opacity-60">{rodando ? "Transcrevendo…" : "Transcrever"}</button>
      </div>
    </div>
  )
}

// "Carregar mensagens anteriores": busca as 300 anteriores à mais antiga já na tela
function CarregarAnteriores({ jid, primeira, onCarregar }: { jid: string; primeira?: string; onCarregar: (m: Mensagem[]) => void }) {
  const [carregando, setCarregando] = useState(false)
  const [acabou, setAcabou] = useState(false)
  if (acabou || !primeira) return null
  async function carregar() {
    setCarregando(true)
    const r = await fetch(`/api/whatsapp/mensagens/${encodeURIComponent(jid)}?antes=${encodeURIComponent(primeira!)}`).then(r => r.json()).catch(() => null)
    const lista = Array.isArray(r) ? r as Mensagem[] : []
    if (lista.length < 300) setAcabou(true)
    if (lista.length) onCarregar(lista)
    setCarregando(false)
  }
  return (
    <div className="flex justify-center mb-2">
      <button onClick={carregar} disabled={carregando} className="text-[12px] font-semibold px-3 py-1.5 rounded-full shadow-sm disabled:opacity-60" style={{ background: "#ffffff", color: "#54656f" }}>
        {carregando ? "Carregando…" : "Carregar mensagens anteriores"}
      </button>
    </div>
  )
}

// ✓ enviada · ✓✓ entregue · ✓✓ azul lida (sem informação ainda: ✓)
function Recibo({ status }: { status?: string | null }) {
  if (status === "lida") return <CheckCheck className="w-3.5 h-3.5" style={{ color: "#53bdeb" }} aria-label="lida" />
  if (status === "entregue") return <CheckCheck className="w-3.5 h-3.5" aria-label="entregue" />
  return <Check className="w-3.5 h-3.5" aria-label="enviada" />
}

// Origem da conversa (primeira mensagem): anúncio da Meta ou botão do site
export function SeloOrigem({ campanha }: { campanha?: string | null }) {
  const o = lerOrigem(campanha)
  if (!o) return null
  const [txt, cor, fundo] = o.canal === "anuncio" ? ["anúncio", "#c57800", "rgba(197,120,0,0.12)"] : o.canal === "site" ? ["site", "#2f7cf6", "rgba(47,124,246,0.12)"] : ["instagram", "#d33a8a", "rgba(211,58,138,0.12)"]
  return <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-px rounded" style={{ background: fundo, color: cor }}>{txt}</span>
}

export function OrigemDaConversa({ campanha }: { campanha?: string | null }) {
  const o = lerOrigem(campanha)
  if (!o) return null
  return (
    <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
      {o.canal === "anuncio" ? <>veio do anúncio{o.campanhaNome ? <> · <b style={{ color: "#c57800" }}>{o.campanhaNome}</b>{o.provavel ? " (provável)" : ""}</> : ""}</> : o.canal === "site" ? "veio pelo botão do site" : "veio do Instagram"}
    </p>
  )
}

// Funil de conversas (antes da venda): leads por etapa, arrastáveis; "responder" = cliente falou por último
const PERIODOS = [{ dias: 30, nome: "30 dias" }, { dias: 60, nome: "60 dias" }, { dias: 90, nome: "90 dias" }, { dias: 0, nome: "Tudo" }] as const

export function FunilConversas({ conversas, cardsDe, clienteDe, onAbrir, onMover, onVoltar, hoje = new Date() }: {
  conversas: Conversa[]
  cardsDe: (c: Conversa) => KanbanCard[]
  clienteDe: (c: Conversa) => { nome: string } | null
  onAbrir: (c: Conversa) => void
  onMover: (jid: string, etapa: Etapa | null) => void
  onVoltar: () => void
  hoje?: Date
}) {
  const [periodo, setPeriodo] = useState<number>(30)
  const [origem, setOrigem] = useState<"todas" | "anuncio" | "site">("todas")
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<Etapa | null>(null)
  const limite = periodo ? hoje.getTime() - periodo * 86_400_000 : 0
  const itens = conversas
    .filter(c => !c.jid.endsWith("@g.us") && c.ultima_recebida_at && new Date(c.ultima_at ?? 0).getTime() >= limite)
    .filter(c => origem === "todas" || lerOrigem(c.campanha)?.canal === origem)
    .map(c => ({ c, p: posicaoNoFunil(c, cardsDe(c), hoje) }))
  const porEtapa = (e: Etapa) => itens.filter(i => i.p.etapa === e)
    .sort((a, b) => Number(b.p.responder) - Number(a.p.responder) || (b.c.ultima_at ?? "").localeCompare(a.c.ultima_at ?? ""))
  const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg-page)" }}>
      <div className="px-5 py-3 border-b flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
        <span className="text-[15px] font-semibold" style={{ color: "var(--text-main)" }}>Funil de conversas</span>
        <button onClick={onVoltar} className="h-7 px-2.5 rounded-lg text-[11.5px] font-semibold flex items-center gap-1" style={{ background: "rgba(132,86,232,0.1)", color: "#8456e8" }}>
          <List className="w-3.5 h-3.5" />Lista
        </button>
        <div className="flex gap-1 ml-auto flex-wrap">
          {(["todas", "anuncio", "site"] as const).map(o => (
            <button key={o} onClick={() => setOrigem(o)} className="h-7 px-2.5 rounded-full text-[11.5px] font-medium"
              style={origem === o ? { background: "#191625", color: "#fff" } : { background: "var(--bg-page)", color: "var(--text-sub)", border: "1px solid var(--border)" }}>
              {o === "todas" ? "Todas origens" : o === "anuncio" ? "Anúncio" : "Site"}
            </button>
          ))}
          <span className="w-px mx-1" style={{ background: "var(--border)" }} />
          {PERIODOS.map(p => (
            <button key={p.dias} onClick={() => setPeriodo(p.dias)} className="h-7 px-2.5 rounded-full text-[11.5px] font-medium"
              style={periodo === p.dias ? { background: "#191625", color: "#fff" } : { background: "var(--bg-page)", color: "var(--text-sub)", border: "1px solid var(--border)" }}>
              {p.nome}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 p-4 h-full min-w-full w-max">
          {ETAPAS.map(e => {
            const lista = porEtapa(e.id)
            const valor = lista.reduce((t, i) => t + (i.p.valor ?? 0), 0)
            return (
              <div key={e.id} className="flex-1 min-w-[210px] max-w-[320px] flex flex-col rounded-2xl transition-colors"
                style={{ background: sobre === e.id ? "rgba(132,86,232,0.08)" : "rgba(116,116,128,0.06)" }}
                onDragOver={ev => { ev.preventDefault(); setSobre(e.id) }} onDragLeave={() => setSobre(null)}
                onDrop={ev => { ev.preventDefault(); setSobre(null); if (arrastando) onMover(arrastando, e.id); setArrastando(null) }}>
                <div className="px-3.5 pt-3 pb-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-main)" }}>{e.nome}</span>
                    <span className="text-[11.5px] font-semibold" style={{ color: "var(--text-faint)" }}>{lista.length}</span>
                  </div>
                  {valor > 0 && <p className="text-[11px] ds-num" style={{ color: "var(--text-sub)" }}>{brl0(valor)}</p>}
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                  {lista.map(({ c, p }) => {
                    const cli = clienteDe(c)
                    return (
                      <div key={c.jid} draggable onDragStart={() => setArrastando(c.jid)} onDragEnd={() => setArrastando(null)}
                        onClick={() => onAbrir(c)}
                        className="rounded-xl p-3 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-shadow"
                        style={{ background: "var(--bg-surface)", opacity: arrastando === c.jid ? 0.5 : 1 }}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[12.5px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{cli?.nome ?? c.nome}</span>
                          <SeloOrigem campanha={c.campanha} />
                          {p.manual && <span title="Etapa escolhida à mão"><Pin className="w-3 h-3 shrink-0" style={{ color: "var(--text-faint)" }} /></span>}
                        </div>
                        <p className="text-[11.5px] truncate mt-0.5 flex items-center gap-1 min-w-0" style={{ color: "var(--text-sub)" }}><Previa texto={c.ultima_msg} /></p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {p.responder && <span className="text-[10px] font-bold uppercase px-1.5 py-px rounded" style={{ background: "rgba(37,163,90,0.14)", color: "#1e8a4c" }}>responder</span>}
                          {p.esfriando && <span className="text-[10px] font-bold uppercase px-1.5 py-px rounded" style={{ background: "rgba(197,120,0,0.12)", color: "#c57800" }}>esfriando</span>}
                          {p.valor ? <span className="text-[11px] font-semibold ds-num" style={{ color: "var(--text-main)" }}>{brl0(p.valor)}</span> : null}
                          <span className="ml-auto text-[10.5px]" style={{ color: "var(--text-faint)" }}>{fmtHora(c.ultima_at)}</span>
                        </div>
                        {p.manual && (
                          <button onClick={ev => { ev.stopPropagation(); onMover(c.jid, null) }} className="text-[10.5px] mt-1.5 underline" style={{ color: "var(--text-faint)" }}>voltar ao automático</button>
                        )}
                      </div>
                    )
                  })}
                  {!lista.length && <p className="text-[11.5px] text-center py-6" style={{ color: "var(--text-faint)" }}>Nenhuma conversa</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
