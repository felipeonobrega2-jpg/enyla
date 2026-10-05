"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import { brl } from "../utils"

type Conversa = {
  jid: string
  nome: string
  ultima_msg: string | null
  ultima_at: string | null
  nao_lidas: number
  foto_url: string | null
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

function Avatar({ nome, foto }: { nome: string; foto: string | null }) {
  const initials = nome.split(" ").slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase() || "?"
  if (foto) return <img src={foto} alt={nome} className="w-10 h-10 rounded-full object-cover shrink-0" />
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
  onCriarCard,
}: {
  onCriarCard: (nome: string, jid: string) => void
}) {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [ativa, setAtiva] = useState<Conversa | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [busca, setBusca] = useState("")
  const threadRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const carregarConversas = useCallback(async () => {
    const res = await fetch("/api/whatsapp/conversas")
    if (res.ok) setConversas(await res.json())
    setLoadingConvs(false)
  }, [])

  const carregarMensagens = useCallback(async (jid: string) => {
    setLoadingMsgs(true)
    const res = await fetch(`/api/whatsapp/mensagens/${encodeURIComponent(jid)}`)
    if (res.ok) setMensagens(await res.json())
    setLoadingMsgs(false)
  }, [])

  useEffect(() => {
    carregarConversas()
    pollRef.current = setInterval(carregarConversas, 8000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [carregarConversas])

  useEffect(() => {
    if (!ativa) return
    carregarMensagens(ativa.jid)
    const t = setInterval(() => carregarMensagens(ativa.jid), 5000)
    return () => clearInterval(t)
  }, [ativa, carregarMensagens])

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [mensagens])

  async function abrirConversa(c: Conversa) {
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
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (c.ultima_msg ?? "").toLowerCase().includes(busca.toLowerCase())
  )

  const totalNaoLidas = conversas.reduce((s, c) => s + c.nao_lidas, 0)

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
              <p className="text-[13px] font-medium" style={{ color: "var(--text-sub)" }}>
                {busca ? "Nenhuma conversa encontrada" : "Aguardando mensagens…"}
              </p>
              <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
                {!busca && "As conversas aparecerão aqui assim que chegarem mensagens no WhatsApp conectado."}
              </p>
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
              <Avatar nome={c.nome} foto={c.foto_url} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{c.nome}</span>
                  <span className="text-[11px] shrink-0" style={{ color: "var(--text-faint)" }}>{fmtHora(c.ultima_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-[12px] truncate" style={{ color: "var(--text-sub)" }}>{c.ultima_msg ?? ""}</span>
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
              <Avatar nome={ativa.nome} foto={ativa.foto_url} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{ativa.nome}</p>
                <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>{ativa.jid.split("@")[0]}</p>
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
            <div ref={threadRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2" style={{ background: "#efeae2" }}>
              {loadingMsgs && <div className="flex justify-center py-8"><TypingBubble /></div>}

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
                        {m.tipo === "audio" && (
                          <div className="flex items-center gap-2 text-[12px]" style={{ color: "#54656f" }}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 0 1-7 7m0 0a7 7 0 0 1-7-7m7 7v4m0 0H8m4 0h4M12 3a4 4 0 0 1 4 4v4a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4Z" /></svg>
                            Áudio
                          </div>
                        )}
                        {m.tipo === "image" && (
                          <div className="text-[12px] italic mb-1" style={{ color: "#54656f" }}>📷 Imagem</div>
                        )}
                        {m.tipo === "document" && (
                          <div className="text-[12px] italic mb-1" style={{ color: "#54656f" }}>📄 Documento</div>
                        )}
                        {m.tipo === "sticker" && (
                          <div className="text-[12px] italic" style={{ color: "#54656f" }}>🎭 Sticker</div>
                        )}
                        {m.corpo && (
                          <p className="text-[13.5px] leading-snug whitespace-pre-wrap" style={{ color: "#111b21" }}>{m.corpo}</p>
                        )}
                        <p className="text-[10.5px] mt-1 text-right" style={{ color: "#8696a0" }}>
                          {new Date(m.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          {m.from_me && " ✓✓"}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
