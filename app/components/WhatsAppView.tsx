"use client"

import { Image as ImageIcon, FileText, Smile, Check, X, Paperclip, SendHorizontal } from "lucide-react"
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
  const [status, setStatus] = useState<StatusWhats | null>(null)
  useEffect(() => { fetch("/api/whatsapp/status").then(r => r.json()).then(setStatus).catch(() => {}) }, [])
  const [busca, setBusca] = useState("")
  const threadRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const carregarConversas = useCallback(async () => {
    const res = await fetch("/api/whatsapp/conversas")
    if (res.ok) { const d: unknown = await res.json(); setConversas(Array.isArray(d) ? d : []) }
    setLoadingConvs(false)
  }, [])

  const carregarMensagens = useCallback(async (jid: string) => {
    setLoadingMsgs(true)
    const res = await fetch(`/api/whatsapp/mensagens/${encodeURIComponent(jid)}`)
    if (res.ok) { const d: unknown = await res.json(); setMensagens(Array.isArray(d) ? d : []) }
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
                        <MidiaMensagem id={m.id} tipo={m.tipo} nome={m.corpo} />
                        {m.corpo && m.tipo !== "document" && (
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
