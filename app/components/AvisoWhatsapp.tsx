"use client"

// Aviso do WhatsApp que acompanha o sistema todo: quantas conversas esperam resposta, a prévia de cada uma,
// responder ali mesmo (janelinha com a sugestão da IA) e a prévia deslizando quando chega mensagem nova.
// Com a aba em segundo plano: "(3)" no título e, se ativado, notificação do computador.

import { useCallback, useEffect, useRef, useState } from "react"
import { MessageCircle, X, Bell, BellOff, ChevronRight } from "lucide-react"
import { Avatar, Espiada, Conversa } from "./WhatsAppView"
import type { DadosPedido } from "../lib/atendente"

type Pendente = Pick<Conversa, "jid" | "nome" | "ultima_msg" | "ultima_at" | "nao_lidas" | "ultima_recebida_at" | "ultima_enviada_at" | "fechada_em" | "campanha">

const ha = (iso: string | null | undefined) => {
  if (!iso) return ""
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  return `há ${d} ${d === 1 ? "dia" : "dias"}`
}
const previa = (t: string | null) => !t ? "" : t.startsWith("[") ? ({ "[audio]": "Áudio", "[audioMessage]": "Áudio", "[image]": "Foto", "[imageMessage]": "Foto", "[video]": "Vídeo", "[videoMessage]": "Vídeo", "[document]": "Documento", "[sticker]": "Figurinha" } as Record<string, string>)[t] ?? "Mensagem" : t

export function AvisoWhatsapp({ oculto, onContagem, onAbrir, onOrcamento }: {
  oculto?: boolean                                  // na própria tela do WhatsApp só atualiza título e contagem
  onContagem?: (n: number) => void
  onAbrir: (jid: string) => void                    // abre a conversa na tela do WhatsApp
  onOrcamento?: (nome: string, jid: string, dados?: DadosPedido) => void
}) {
  const [lista, setLista] = useState<Pendente[]>([])
  const [aberto, setAberto] = useState(false)
  const [toast, setToast] = useState<Pendente | null>(null)
  const [espiada, setEspiada] = useState<{ conversa: Pendente; topo: number; esquerda: number } | null>(null)
  const [notificar, setNotificar] = useState(() => {
    try { return localStorage.getItem("wa:notificar") === "1" && typeof Notification !== "undefined" && Notification.permission === "granted" } catch { return false }
  })
  const vistos = useRef<Map<string, string> | null>(null)   // jid → última mensagem recebida já avisada
  const painel = useRef<HTMLDivElement>(null)
  const tituloBase = useRef<string>("")

  useEffect(() => {
    tituloBase.current = document.title.replace(/^\(\d+\)\s*/, "")
  }, [])

  const notificarRef = useRef(notificar)
  const onAbrirRef = useRef(onAbrir)
  useEffect(() => { notificarRef.current = notificar; onAbrirRef.current = onAbrir })

  const carregar = useCallback(async () => {
    const r = await fetch("/api/whatsapp/pendentes").catch(() => null)
    if (!r?.ok) return
    const d = await r.json().catch(() => null)
    if (!Array.isArray(d)) return
    const novos: Pendente[] = d
    // Mensagem nova desde a última olhada: prévia deslizando (e notificação se a aba estiver escondida)
    if (vistos.current) {
      const chegou = novos.find(c => vistos.current!.get(c.jid) !== c.ultima_recebida_at)
      if (chegou) {
        setToast(chegou)
        if (document.hidden && notificarRef.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
          const n = new Notification(chegou.nome, { body: previa(chegou.ultima_msg), tag: chegou.jid, icon: "/brand/enyla-mark-light.png" })
          n.onclick = () => { window.focus(); onAbrirRef.current(chegou.jid); n.close() }
        }
      }
    }
    vistos.current = new Map(novos.map(c => [c.jid, c.ultima_recebida_at ?? ""]))
    setLista(novos)
  }, [])

  // A cada 15 s (30 s com a aba escondida)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const ciclo = async () => { await carregar(); t = setTimeout(ciclo, document.hidden ? 30_000 : 15_000) }
    ciclo()
    return () => clearTimeout(t)
  }, [carregar])

  useEffect(() => {
    onContagem?.(lista.length)
    document.title = (lista.length ? `(${lista.length}) ` : "") + (tituloBase.current || document.title.replace(/^\(\d+\)\s*/, ""))
  }, [lista.length, onContagem])

  // A prévia some sozinha
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 7000); return () => clearTimeout(t) }, [toast])

  // Fecha o painel clicando fora (a janelinha de resposta conta como dentro)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      const alvo = e.target as HTMLElement
      if (painel.current?.contains(alvo) || alvo.closest?.(".wa-espiar")) return
      setAberto(false); setEspiada(null)
    }
    document.addEventListener("mousedown", fora)
    return () => document.removeEventListener("mousedown", fora)
  }, [aberto])

  async function alternarNotificacao() {
    if (notificar) { setNotificar(false); try { localStorage.setItem("wa:notificar", "0") } catch {}; return }
    if (typeof Notification === "undefined") return alert("Este navegador não mostra notificações.")
    const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission()
    if (p === "granted") { setNotificar(true); try { localStorage.setItem("wa:notificar", "1") } catch {} }
    else alert("O navegador bloqueou as notificações. Libere nas configurações do site (cadeado ao lado do endereço).")
  }

  function responder(c: Pendente, el: HTMLElement) {
    const r = el.getBoundingClientRect()
    setEspiada({ conversa: c, topo: r.top, esquerda: Math.max(8, (painel.current?.getBoundingClientRect().left ?? r.left) - 408) })
  }

  if (oculto) return null
  const n = lista.length
  return (
    <>
      {/* Prévia de mensagem nova */}
      {toast && !aberto && (
        <button onClick={() => { setToast(null); setAberto(true) }}
          className="fixed bottom-[84px] right-5 z-[55] w-[320px] text-left rounded-2xl px-3.5 py-3 shadow-2xl flex items-start gap-3 wa-espiar print:hidden"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <Avatar nome={toast.nome} jid={toast.jid} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5"><span className="text-[13px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{toast.nome}</span>
              <span className="text-[10.5px] shrink-0" style={{ color: "#1d8a4b" }}>{ha(toast.ultima_recebida_at)}</span></span>
            <span className="block text-[12.5px] leading-snug line-clamp-2" style={{ color: "var(--text-sub)" }}>{previa(toast.ultima_msg)}</span>
          </span>
          <span onClick={e => { e.stopPropagation(); setToast(null) }} className="shrink-0" style={{ color: "var(--text-faint)" }}><X className="w-4 h-4" /></span>
        </button>
      )}

      <div ref={painel} className="fixed bottom-5 right-[88px] z-[55] flex flex-col items-end gap-2 print:hidden">
        {aberto && (
          <div className="w-[360px] max-h-[min(560px,70vh)] rounded-2xl shadow-2xl overflow-hidden flex flex-col wa-espiar" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", transformOrigin: "bottom right" }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <MessageCircle className="w-4 h-4 text-[#25a35a]" />
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>{n ? `${n} esperando resposta` : "Tudo respondido"}</span>
              <button onClick={alternarNotificacao} title={notificar ? "Desligar avisos do computador" : "Avisar no computador quando chegar mensagem"}
                className="ml-auto w-7 h-7 rounded-lg grid place-items-center hover:bg-black/5" style={{ color: notificar ? "#1d8a4b" : "var(--text-faint)" }}>
                {notificar ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              </button>
              <button onClick={() => { setAberto(false); setEspiada(null) }} aria-label="Fechar" className="w-7 h-7 rounded-lg grid place-items-center hover:bg-black/5" style={{ color: "var(--text-faint)" }}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {!n && <p className="px-4 py-8 text-center text-[12.5px]" style={{ color: "var(--text-faint)" }}>Nenhum cliente esperando você.</p>}
              {lista.map(c => (
                <div key={c.jid} className="group flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-black/[0.03]"
                  style={{ background: espiada?.conversa.jid === c.jid ? "rgba(37,163,90,0.08)" : undefined }}
                  onClick={e => responder(c, e.currentTarget)}>
                  <Avatar nome={c.nome} jid={c.jid} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{c.nome}</span>
                      <span className="ml-auto text-[10.5px] shrink-0 font-semibold" style={{ color: "#1d8a4b" }}>{ha(c.ultima_recebida_at)}</span>
                    </div>
                    <p className="text-[12px] leading-snug line-clamp-2" style={{ color: "var(--text-sub)" }}>{previa(c.ultima_msg)}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setAberto(false); setEspiada(null); onAbrir(c.jid) }} title="Abrir no WhatsApp do sistema"
                    className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg grid place-items-center hover:bg-black/5 shrink-0" style={{ color: "var(--text-faint)" }}>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="px-4 py-2 border-t text-[10.5px]" style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}>Clique numa conversa para responder aqui · seta abre no WhatsApp</p>
          </div>
        )}
        <button onClick={() => { setAberto(a => !a); setToast(null); setEspiada(null) }}
          className="h-12 pl-3.5 pr-4 rounded-full shadow-lg flex items-center gap-2 text-white transition-transform hover:scale-[1.03] active:scale-95"
          style={{ background: n ? "#25a35a" : "#5e5c68" }} title="Conversas esperando resposta">
          <MessageCircle className="w-5 h-5" />
          <span key={n} className="text-[13.5px] font-bold ds-num wa-enviada">{n}</span>
          {n > 0 && <span className="text-[12px] font-medium opacity-90">para responder</span>}
        </button>
      </div>

      {espiada && (
        <Espiada key={espiada.conversa.jid} conversa={{ ...espiada.conversa, foto_url: null } as Conversa} topo={espiada.topo} esquerda={espiada.esquerda} fixa
          onFixar={() => {}} onFechar={() => setEspiada(null)}
          onAbrir={() => { const j = espiada.conversa.jid; setEspiada(null); setAberto(false); onAbrir(j) }}
          onEnviada={() => { const j = espiada.conversa.jid; setLista(l => l.filter(c => c.jid !== j)); vistos.current?.delete(j) }}
          onOrcamento={onOrcamento ? d => { const c = espiada.conversa; setEspiada(null); setAberto(false); onOrcamento(c.nome, c.jid, d) } : undefined}
          onMouseEnter={() => {}} onMouseLeave={() => {}} />
      )}
    </>
  )
}
