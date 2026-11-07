"use client"

import { Image as ImageIcon, FileText, Smile, Check, CheckCheck, X, Paperclip, SendHorizontal, Mic, Video, Pin, Clock3, AlertCircle, Archive, Tag, ChevronRight, Reply, Keyboard, Sparkles, Laptop, Smartphone, Trash2, Square, Merge, Search } from "lucide-react"
import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect, useSyncExternalStore } from "react"
import type { KanbanCard, LancamentoFinanceiro } from "../types"
import { montarPedidos, nomeChave } from "../lib/negocio"
import { clienteDaConversa, Vinculos } from "../lib/vinculoWhatsapp"
import { lerOrigem } from "../lib/origemWhatsapp"
import { ETAPAS, Etapa, posicaoNoFunil, estaFechada, aguardandoResposta } from "../lib/funilWhatsapp"
import { Segmentado } from "./ds"
import { FilaMensagens } from "./FilaMensagens"
import { montarFila, AvisoPedido } from "../lib/filaMensagens"
import { Atendimento, DadosPedido, ROTULO_ALERTA, temDados } from "../lib/atendente"
import { ProximoPasso } from "./ProximoPasso"
import { LeadAvaliado, ROTULO_PERFIL } from "../lib/agenteLeads"
import { useGravador, useMicrofones, tempo, extensaoAudio } from "../lib/gravador"
import { filtrar, preencher, Rapida } from "../lib/mensagensRapidas"
import { COL_HOT } from "../types"

export type Conversa = {
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
  fechada_em?: string | null
  etiquetas?: string[] | null
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
export function Avatar({ nome, jid, pequeno }: { nome: string; jid: string; pequeno?: boolean }) {
  const tam = pequeno ? "w-7 h-7 text-[10.5px]" : "w-10 h-10 text-[13px]"
  const [semFoto, setSemFoto] = useState(false)
  const initials = nome.split(" ").slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase() || "?"
  // eslint-disable-next-line @next/next/no-img-element
  if (!semFoto) return <img src={`/api/whatsapp/foto/${encodeURIComponent(jid)}`} alt="" loading="lazy" onError={() => setSemFoto(true)} className={`${tam} rounded-full object-cover shrink-0 bg-[#8456e8]/15`} />
  return (
    <div className={`${tam} rounded-full shrink-0 flex items-center justify-center font-bold text-white`}
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
  onCriarCard, kanban = [], lancamentos = [], vinculos, onVincular, onAbrirCliente, etiquetasDef = [], onCriarEtiqueta,
  avisos, dispensados, onAvisado, onDispensar, abrirJid,
}: {
  abrirJid?: { jid: string; vez: number }   // vindo do aviso de mensagens: abre esta conversa
  avisos?: Record<string, AvisoPedido>
  dispensados?: Record<string, string>
  onAvisado?: (pedidoKey: string, aviso: AvisoPedido) => void
  onDispensar?: (id: string) => void
  etiquetasDef?: EtiquetaDef[]
  onCriarEtiqueta?: (e: EtiquetaDef) => void
  onCriarCard: (nome: string, jid: string, dados?: DadosPedido) => void
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
  // Cliente é quem já comprou (tem pedido); quem só recebeu orçamento continua lead
  const comprou = (c: { jid: string; nome: string | null }) => { const cli = clienteDe(c); return !!cli && (resumo.get(nomeChave(cli.nome))?.pedidos ?? 0) > 0 }
  const defDe = (nome: string): EtiquetaDef => etiquetasDef.find(e => e.nome === nome) ?? { nome, cor: "#7a7983" }
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [ativa, setAtiva] = useState<Conversa | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [status, setStatus] = useState<StatusWhats | null>(null)
  useEffect(() => { fetch("/api/whatsapp/status").then(r => r.json()).then(setStatus).catch(() => {}) }, [])
  const [busca, setBusca] = useState("")
  const [filtro, setFiltro] = useState<"todas" | "responder" | "anuncio" | "site" | "clientes" | "fechadas">("todas")
  const [modo, setModo] = useState<"lista" | "funil" | "fila">("lista")
  const [etiquetaFiltro, setEtiquetaFiltro] = useState<string | null>(null)
  // Fecha/reabre ou troca etiquetas: atualiza a tela na hora e grava em seguida
  async function alterar(jids: string[], campos: { fechar?: boolean; etiquetas?: string[] }) {
    const agora = new Date().toISOString()
    setConversas(prev => prev.map(c => !jids.includes(c.jid) ? c : {
      ...c,
      ...(campos.fechar !== undefined ? { fechada_em: campos.fechar ? agora : null } : {}),
      ...(campos.etiquetas !== undefined ? { etiquetas: campos.etiquetas } : {}),
    }))
    if (campos.fechar && ativa && jids.includes(ativa.jid)) setAtiva(null)
    await fetch("/api/whatsapp/conversas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jids, ...campos }) }).catch(() => {})
  }
  const threadRef = useRef<HTMLDivElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const buscaRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Conversas já abertas ficam guardadas: voltar a uma delas é instantâneo (atualiza por trás)
  const cache = useRef(new Map<string, Mensagem[]>())
  // Mensagens que já estavam na tela ao abrir não animam; só as que chegam depois
  const [base, setBase] = useState<Set<string>>(new Set())
  const [agora, setAgora] = useState(() => Date.now())
  // Linha brilha quando chega mensagem nova
  const anteriores = useRef<Conversa[]>([])
  const [brilho, setBrilho] = useState<Set<string>>(new Set())

  const carregarConversas = useCallback(async () => {
    const res = await fetch("/api/whatsapp/conversas")
    if (res.ok) {
      const d: unknown = await res.json()
      const novas = Array.isArray(d) ? d as Conversa[] : []
      const antes = anteriores.current
      if (antes.length) {
        const mudou = novas.filter(n => antes.find(a => a.jid === n.jid)?.ultima_at !== n.ultima_at).map(n => n.jid)
        if (mudou.length && mudou.length < 20) { setBrilho(new Set(mudou)); setTimeout(() => setBrilho(new Set()), 1700) }
      }
      anteriores.current = novas
      setAgora(Date.now())
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
      if (primeira) setBase(new Set(novas.map(m => m.id)))
      setMensagens(prev => {
        if (primeira || !prev.length) return novas
        if (prev[prev.length - 1]?.id === novas[novas.length - 1]?.id) return prev
        // Mantém as anteriores já carregadas e acrescenta as novas
        const ids = new Set(prev.map(m => m.id))
        return [...prev, ...novas.filter(m => !ids.has(m.id))]
      })
    }
    if (primeira) setLoadingMsgs(false)
  }, [setBase])

  useEffect(() => {
    carregarConversas()
    pollRef.current = setInterval(carregarConversas, 8000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [carregarConversas])

  useEffect(() => {
    if (!ativa) return
    carregarMensagens(ativa.jid, !cache.current.has(ativa.jid))
    const t = setInterval(() => carregarMensagens(ativa.jid), 5000)
    return () => clearInterval(t)
  }, [ativa, carregarMensagens])

  // Desce para o fim ao abrir e quando chega mensagem nova, a menos que você esteja lendo lá em cima
  const ultimaId = mensagens[mensagens.length - 1]?.id
  const rolouParaCima = useRef(false)
  useLayoutEffect(() => {
    const el = threadRef.current
    if (el && !rolouParaCima.current) el.scrollTop = el.scrollHeight
  }, [ultimaId, ativa?.jid])

  useEffect(() => { if (ativa && mensagens.length) cache.current.set(ativa.jid, mensagens) }, [ativa, mensagens])


  async function abrirConversa(c: Conversa) {
    rolouParaCima.current = false
    fecharEspiada()
    const guardadas = cache.current.get(c.jid) ?? []
    setBase(new Set(guardadas.map(m => m.id)))
    setAtiva(c)
    setMensagens(guardadas)
    requestAnimationFrame(() => listaRef.current?.querySelector(`[data-linha="${CSS.escape(c.jid)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }))
    if (c.nao_lidas > 0) {
      await fetch("/api/whatsapp/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: c.jid }),
      })
      setConversas(prev => prev.map(x => x.jid === c.jid ? { ...x, nao_lidas: 0 } : x))
    }
  }


  // Esperando você: o cliente falou por último (nos últimos 14 dias)
  const aguardando = (c: Conversa) => aguardandoResposta(c, agora)
  const filtradas = conversas.filter(c =>
    (filtro === "fechadas" ? estaFechada(c) : !estaFechada(c)) &&
    (filtro !== "responder" || aguardando(c)) &&
    (!etiquetaFiltro || (c.etiquetas ?? []).includes(etiquetaFiltro)) &&
    (filtro === "todas" || filtro === "fechadas" || filtro === "responder" || (filtro === "clientes" ? comprou(c) : lerOrigem(c.campanha)?.canal === filtro)) &&
    (c.nome.toLowerCase().includes(busca.toLowerCase()) || (c.ultima_msg ?? "").toLowerCase().includes(busca.toLowerCase()))
  )

  // Mesma pessoa em duas conversas (número e @lid com o mesmo nome): oferece juntar
  const gemea = ativa && ativa.nome && !/^\d+$/.test(ativa.nome)
    ? conversas.find(c => c.jid !== ativa.jid && c.nome === ativa.nome && (c.jid.endsWith("@lid") !== ativa.jid.endsWith("@lid")))
    : undefined
  const [juntando, setJuntando] = useState(false)
  async function juntarComGemea() {
    if (!ativa || !gemea) return
    setJuntando(true)
    const r = await fetch("/api/whatsapp/juntar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: ativa.jid, b: gemea.jid }) }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    setJuntando(false)
    if (!r?.ok) { alert(d?.erro ?? "Não juntou."); return }
    cache.current.delete(ativa.jid); cache.current.delete(gemea.jid)
    const res = await fetch("/api/whatsapp/conversas").then(x => x.json()).catch(() => null)
    const lista: Conversa[] = Array.isArray(res) ? res : conversas
    setConversas(lista)
    const fica = lista.find(c => c.jid === d.fica)
    if (fica) abrirConversa(fica)
  }

  const totalNaoLidas = conversas.reduce((s, c) => s + c.nao_lidas, 0)
  const totalAguardando = conversas.filter(aguardando).length

  // Próxima conversa esperando você (depois de responder uma, vai direto para a seguinte)
  function abrirProxima() {
    const fila = filtradas.filter(c => aguardando(c) && c.jid !== ativa?.jid)
    const idx = ativa ? filtradas.findIndex(c => c.jid === ativa.jid) : -1
    const prox = fila.find(c => filtradas.indexOf(c) > idx) ?? fila[0]
    if (prox) abrirConversa(prox)
  }
  // Depois de enviar: a linha sobe e deixa de "esperar você" na hora, sem esperar a atualização
  function marcarEnviada(jid: string, texto: string) {
    const agora = new Date().toISOString()
    setConversas(prev => prev.map(c => c.jid === jid ? { ...c, ultima_msg: texto || c.ultima_msg, ultima_at: agora, ultima_enviada_at: agora, nao_lidas: 0 } : c)
      .sort((a, b) => (b.ultima_at ?? "").localeCompare(a.ultima_at ?? "")))
  }
  async function marcarLida(c: Conversa) {
    setConversas(prev => prev.map(x => x.jid === c.jid ? { ...x, nao_lidas: 0 } : x))
    await fetch("/api/whatsapp/conversas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid: c.jid }) }).catch(() => {})
  }

  // Espiada: parar o mouse numa linha mostra as últimas mensagens e deixa responder dali
  const esp = useEspiada(c => { if (c.nao_lidas) marcarLida(c) })
  const { espiada, fechar: fecharEspiada, limpar: limparTimers } = esp
  const espiar = (c: Conversa, el: HTMLElement, fixa = false) => { if (c.jid === ativa?.jid && !fixa) { limparTimers(); return } esp.espiar(c, el, fixa) }
  const soltarEspiada = esp.soltar

  // Pedido de fora (aviso de mensagens): abre a conversa quando a lista estiver carregada
  const abertoPorFora = useRef<number | null>(null)
  useEffect(() => {
    if (!abrirJid || abertoPorFora.current === abrirJid.vez) return
    const c = conversas.find(x => x.jid === abrirJid.jid)
    if (!c) return
    abertoPorFora.current = abrirJid.vez
    queueMicrotask(() => { setModo("lista"); abrirConversa(c) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirJid, conversas])

  useReordenacaoSuave(listaRef, filtradas.map(c => c.jid).join("|"))

  // Teclado: ↑↓ (ou J/K) navega, / busca, R responde, N vai para a próxima esperando você, E fecha a conversa
  useEffect(() => {
    if (modo !== "lista") return
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement
      if (alvo?.closest?.("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return
      const idx = ativa ? filtradas.findIndex(c => c.jid === ativa.jid) : -1
      const k = e.key.toLowerCase()
      if (k === "arrowdown" || k === "j") { e.preventDefault(); const c = filtradas[Math.min(filtradas.length - 1, idx + 1)]; if (c) abrirConversa(c) }
      else if (k === "arrowup" || k === "k") { e.preventDefault(); const c = filtradas[Math.max(0, idx - 1)]; if (c) abrirConversa(c) }
      else if (k === "/") { e.preventDefault(); buscaRef.current?.focus() }
      else if (k === "r" || k === "enter") { e.preventDefault(); (document.querySelector('[data-compositor="principal"]') as HTMLTextAreaElement | null)?.focus() }
      else if (k === "n") { e.preventDefault(); abrirProxima() }
      else if (k === "e" && ativa) { e.preventDefault(); alterar([ativa.jid], { fechar: !estaFechada(ativa) }) }
    }
    window.addEventListener("keydown", tecla)
    return () => window.removeEventListener("keydown", tecla)
  })

  const naFila = useMemo(() => montarFila({ conversas, kanban, lancamentos, vinculos, avisos, dispensados }).length, [conversas, kanban, lancamentos, vinculos, avisos, dispensados])

  // Barra do topo, igual na lista e no funil (alternância padrão do sistema)
  const topo = (
    <div className="px-5 py-2.5 border-b flex items-center gap-3 shrink-0" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.862L.057 23.929a.5.5 0 0 0 .614.614l6.067-1.475A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.933 0-3.742-.523-5.289-1.433l-.378-.225-3.924.953.953-3.924-.225-.378A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                  </svg>
      <span className="text-[15px] font-semibold" style={{ color: "var(--text-main)" }}>WhatsApp</span>
      {totalNaoLidas > 0 && <span className="text-[11px] font-bold text-white bg-[#25D366] rounded-full px-2 py-0.5">{totalNaoLidas}</span>}
      <div className="ml-auto"><Segmentado<"lista" | "funil" | "fila"> valor={modo} onChange={setModo}
        opcoes={[{ v: "lista", nome: "Conversas" }, { v: "funil", nome: "Funil" }, { v: "fila", nome: naFila ? `Fila (${naFila})` : "Fila" }]} /></div>
    </div>
  )

  if (modo === "fila") return (
    <div className="flex flex-col h-full">{topo}<div className="flex-1 min-h-0 ds-troca-tela"><FilaMensagens conversas={conversas} kanban={kanban} lancamentos={lancamentos}
      vinculos={vinculos} avisos={avisos} dispensados={dispensados}
      onAvisado={(k, a) => onAvisado?.(k, a)} onDispensar={id => onDispensar?.(id)}
      onAbrirConversa={jid => { const c = conversas.find(x => x.jid === jid); if (c) { setModo("lista"); abrirConversa(c) } }} /></div></div>
  )

  if (modo === "funil") return (
    <div className="flex flex-col h-full">{topo}<div className="flex-1 min-h-0 ds-troca-tela"><FunilConversas conversas={conversas.filter(c => !estaFechada(c))}
      etiquetasDef={etiquetasDef} onFechar={jids => alterar(jids, { fechar: true })} cardsDe={c => { const cl = clienteDe(c); return cl ? kanban.filter(k => nomeChave(k.nomeCliente) === nomeChave(cl.nome)) : [] }}
      clienteDe={clienteDe}
      onAbrir={c => { setModo("lista"); abrirConversa(c) }}
      brilho={brilho} onEnviada={marcarEnviada} onLida={marcarLida}
      onMover={async (jid, etapa) => {
        setConversas(prev => prev.map(c => c.jid === jid ? { ...c, status_lead: etapa, ultima_classificacao_at: etapa ? new Date().toISOString() : null } : c))
        await fetch("/api/whatsapp/conversas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid, etapa }) }).catch(() => {})
      }}
      /></div></div>
  )

  return (
    <div className="flex flex-col h-full">{topo}
    <div className="flex flex-1 min-h-0" style={{ background: "var(--bg-page)" }}>

      {/* ── Coluna esquerda: lista de conversas ─── */}
      <div className="w-80 shrink-0 flex flex-col border-r" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>

        {/* Header */}
        <div className="px-4 pt-5 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
          <input
            ref={buscaRef}
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar conversa…  ( / )"
            className="w-full text-[13px] px-3 py-2 rounded-xl outline-none"
            style={{ background: "var(--bg-page)", color: "var(--text-main)", border: "1px solid var(--border)" }}
          />
          <div className="flex gap-1 mt-2 flex-wrap">
            <button onClick={() => setFiltro(f => f === "responder" ? "todas" : "responder")} className="h-7 px-2.5 rounded-full text-[11.5px] font-semibold transition-colors flex items-center gap-1"
              title="Clientes que falaram por último (N abre a próxima)"
              style={filtro === "responder" ? { background: "#25a35a", color: "#fff" } : { background: "rgba(37,163,90,0.1)", color: "#1d8a4b" }}>
              <Reply className="w-3.5 h-3.5" />Responder {totalAguardando}
            </button>
            {([["todas", "Todas"], ["anuncio", "Anúncio"], ["site", "Site"], ["clientes", "Clientes"], ["fechadas", "Fechadas"]] as const).map(([v, n]) => (
              <button key={v} onClick={() => setFiltro(v)} className="h-7 px-2.5 rounded-full text-[11.5px] font-medium transition-colors"
                style={filtro === v ? { background: "#191625", color: "#fff" } : { background: "var(--bg-page)", color: "var(--text-sub)", border: "1px solid var(--border)" }}>
                {n}{v !== "todas" ? ` ${conversas.filter(c => v === "fechadas" ? estaFechada(c) : !estaFechada(c) && (v === "clientes" ? comprou(c) : lerOrigem(c.campanha)?.canal === v)).length}` : ""}
              </button>
            ))}
          </div>
          {etiquetasDef.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {etiquetasDef.map(e => (
                <button key={e.nome} onClick={() => setEtiquetaFiltro(f => f === e.nome ? null : e.nome)}
                  className="rounded-full" style={{ outline: etiquetaFiltro === e.nome ? `2px solid ${e.cor}` : undefined, outlineOffset: 1 }}>
                  <EtiquetaChip def={e} />
                </button>
              ))}
            </div>
          )}
          {status?.evolution?.conectado && <ImportarHistorico onFim={carregarConversas} />}
        </div>

        {/* Lista */}
        <div ref={listaRef} className="flex-1 overflow-y-auto" onScroll={() => { if (!espiada?.fixa) fecharEspiada() }}>
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
            <div
              key={c.jid}
              data-linha={c.jid}
              role="button" tabIndex={-1}
              onClick={() => abrirConversa(c)}
              onMouseEnter={e => espiar(c, e.currentTarget)}
              onMouseLeave={soltarEspiada}
              className={`group relative w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer transition-colors hover:bg-black/[0.03] ${brilho.has(c.jid) ? "wa-brilho" : ""}`}
              style={{
                background: ativa?.jid === c.jid ? "rgba(132,86,232,0.06)" : espiada?.conversa.jid === c.jid ? "rgba(116,116,128,0.06)" : undefined,
                borderLeft: ativa?.jid === c.jid ? "2px solid #8456e8" : aguardando(c) ? "2px solid rgba(37,163,90,0.55)" : "2px solid transparent",
              }}
            >
              <Avatar nome={c.nome} jid={c.jid} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-semibold truncate flex items-center gap-1.5 min-w-0" style={{ color: "var(--text-main)" }}>
                    <span className="truncate">{c.nome}</span>
                    {comprou(c)
                      ? <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-px rounded" style={{ background: "rgba(132,86,232,0.12)", color: "#8456e8" }}>cliente</span>
                      : clienteDe(c) && <span title="Recebeu orçamento, ainda não comprou" className="shrink-0 text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-px rounded" style={{ background: "rgba(31,122,224,0.1)", color: "#1f7ae0" }}>orçamento</span>}
                    <SeloOrigem campanha={c.campanha} />
                    {(c.etiquetas ?? []).slice(0, 2).map(n => <EtiquetaChip key={n} def={defDe(n)} mini />)}
                  </span>
                  <span className="text-[11px] shrink-0 group-hover:hidden" style={{ color: aguardando(c) ? "#1d8a4b" : "var(--text-faint)", fontWeight: aguardando(c) ? 600 : undefined }}>{fmtHora(c.ultima_at)}</span>
                  {/* Ações no hover: responder aqui mesmo, marcar como lida, fechar */}
                  <span className="hidden group-hover:flex wa-acoes items-center gap-0.5 shrink-0 -my-1" onClick={e => e.stopPropagation()}>
                    <button title="Responder sem abrir" onClick={e => espiar(c, e.currentTarget.closest("[data-linha]") as HTMLElement, true)}
                      className="w-7 h-7 rounded-lg grid place-items-center hover:bg-[#25a35a]/15 text-[#1d8a4b]"><Reply className="w-4 h-4" /></button>
                    {c.nao_lidas > 0 && <button title="Marcar como lida" onClick={() => marcarLida(c)}
                      className="w-7 h-7 rounded-lg grid place-items-center hover:bg-black/5" style={{ color: "var(--text-sub)" }}><CheckCheck className="w-4 h-4" /></button>}
                    <button title={estaFechada(c) ? "Reabrir" : "Fechar conversa"} onClick={() => { alterar([c.jid], { fechar: !estaFechada(c) }); fecharEspiada() }}
                      className="w-7 h-7 rounded-lg grid place-items-center hover:bg-black/5" style={{ color: "var(--text-sub)" }}><Archive className="w-4 h-4" /></button>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-[12px] truncate flex items-center gap-1 min-w-0" style={{ color: "var(--text-sub)" }}><Previa texto={c.ultima_msg} /></span>
                  {c.nao_lidas > 0 && (
                    <span key={c.nao_lidas} className="shrink-0 text-[10px] font-bold text-white bg-[#25D366] rounded-full w-4 h-4 flex items-center justify-center wa-enviada">
                      {c.nao_lidas > 9 ? "9+" : c.nao_lidas}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="hidden md:flex items-center gap-1.5 px-4 py-2 border-t text-[10.5px] shrink-0" style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}>
          <Keyboard className="w-3.5 h-3.5 shrink-0" />↑↓ navegar · R responder · N próxima · E fechar · ⌘↵ envia e vai para a próxima
        </p>
      </div>

      {espiada && (
        <Espiada key={espiada.conversa.jid} conversa={espiada.conversa} topo={espiada.topo} fixa={espiada.fixa}
          esquerda={espiada.esquerda}
          onFixar={esp.fixar}
          onFechar={fecharEspiada}
          onAbrir={() => abrirConversa(espiada.conversa)}
          onEnviada={t => marcarEnviada(espiada.conversa.jid, t)}
          onOrcamento={d => onCriarCard(clienteDe(espiada.conversa)?.nome ?? espiada.conversa.nome, espiada.conversa.jid, d)}
          onMouseEnter={limparTimers} onMouseLeave={soltarEspiada} />
      )}

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
              {gemea && (
                <button onClick={juntarComGemea} disabled={juntando} title={`Mesma pessoa em duas conversas (${gemea.jid.endsWith("@lid") ? "identificador novo" : "número"}). Junta tudo numa só.`}
                  className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-50" style={{ background: "rgba(197,120,0,0.12)", color: "#b26b00" }}>
                  <Merge className="w-4 h-4" />{juntando ? "Juntando…" : `Juntar com a outra conversa de ${ativa.nome.split(" ")[0]}`}
                </button>
              )}
              <EtiquetasDaConversa selecionadas={ativa.etiquetas ?? []} definicoes={etiquetasDef}
                onMudar={lista => { alterar([ativa.jid], { etiquetas: lista }); setAtiva(a => a ? { ...a, etiquetas: lista } : a) }}
                onCriar={onCriarEtiqueta} />
              <ProximoPasso key={ativa.jid} jid={ativa.jid} rotulo="Próximo passo" />
              <button onClick={() => alterar([ativa.jid], { fechar: !estaFechada(ativa) })} title={estaFechada(ativa) ? "Reabrir conversa" : "Fechar conversa (volta sozinha se o cliente escrever)"}
                className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-2 rounded-xl transition-colors hover:bg-black/5" style={{ color: "var(--text-sub)" }}>
                <Archive className="w-4 h-4" />{estaFechada(ativa) ? "Reabrir" : "Fechar"}
              </button>
              <button
                onClick={() => onCriarCard(clienteDe(ativa)?.nome ?? ativa.nome, ativa.jid, sugestoes.get(ativa.jid)?.dados)}
                className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-2 rounded-xl transition-colors hover:opacity-90"
                style={{ background: "#8456e8", color: "#fff" }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Fazer orçamento
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
                  setBase(b => new Set([...b, ...antigas.map(m => m.id)]))
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
                    <div className={`flex ${m.from_me ? "justify-end" : "justify-start"} ${base.has(m.id) ? "" : m.from_me ? "wa-bolha-eu" : "wa-bolha-ele"}`}>
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

            <RespostaComSugestao key={ativa.jid} jid={ativa.jid} contato={ativa.nome} cliente={clienteDe(ativa)?.nome ?? null}
              ultima={mensagens[mensagens.length - 1]} auto={!loadingMsgs}
              onOrcamento={d => onCriarCard(clienteDe(ativa)?.nome ?? ativa.nome, ativa.jid, d)}
              orcamento={(() => { const cl = clienteDe(ativa); return cl ? kanban.filter(k => nomeChave(k.nomeCliente) === nomeChave(cl.nome) && (k.coluna === 0 || k.coluna === COL_HOT)).map(k => k.numero).pop() ?? null : null })()}
              onEnviarEProxima={abrirProxima}
              onOtimista={m => { rolouParaCima.current = false; setMensagens(prev => [...prev, m]); marcarEnviada(ativa.jid, m.corpo ?? "") }}
              onResultado={(tmp, real) => { if (real) setBase(b => new Set(b).add(real)); setMensagens(prev => real && prev.some(x => x.id === real)
                ? prev.filter(x => x.id !== tmp)   // a atualização automática já trouxe a confirmada
                : prev.map(x => x.id !== tmp ? x : real ? { ...x, id: real, status: "enviada" } : { ...x, status: "erro" })) }} />
          </>
        )}
      </div>
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

// Velocidade dos áudios (1×, 1,5×, 2×): vale para todos os players e fica lembrada neste navegador
const VELOCIDADES = [1, 1.5, 2] as const
let velocidadeAtual: number = (() => { try { const v = Number(localStorage.getItem("wa-velocidade")); return VELOCIDADES.includes(v as 1) ? v : 1 } catch { return 1 } })()
const ouvintesVelocidade = new Set<() => void>()
const velocidade = {
  ler: () => velocidadeAtual,
  ouvir: (f: () => void) => { ouvintesVelocidade.add(f); return () => { ouvintesVelocidade.delete(f) } },
  proxima: () => {
    velocidadeAtual = VELOCIDADES[(VELOCIDADES.indexOf(velocidadeAtual as 1) + 1) % VELOCIDADES.length]
    try { localStorage.setItem("wa-velocidade", String(velocidadeAtual)) } catch {}
    ouvintesVelocidade.forEach(f => f())
  },
}

function AudioComVelocidade({ src, onErro }: { src: string; onErro: () => void }) {
  const ref = useRef<HTMLAudioElement>(null)
  const vel = useSyncExternalStore(velocidade.ouvir, velocidade.ler, () => 1)
  // O navegador volta para 1× ao carregar o arquivo: reaplica ao carregar e ao tocar
  useEffect(() => { if (ref.current) ref.current.playbackRate = vel }, [vel])
  const aplicar = () => { if (ref.current) ref.current.playbackRate = velocidade.ler() }
  return (
    <div className="flex items-center gap-1.5">
      <audio ref={ref} controls preload="none" src={src} onError={onErro} onLoadedMetadata={aplicar} onPlay={aplicar} className="w-[240px] max-w-full h-10" />
      <button onClick={velocidade.proxima} title="Velocidade do áudio"
        className="shrink-0 h-6 min-w-[38px] px-1.5 rounded-full text-[11px] font-bold tabular-nums transition-colors"
        style={vel === 1 ? { background: "rgba(84,101,111,0.12)", color: "#54656f" } : { background: "#8456e8", color: "#fff" }}>
        {String(vel).replace(".", ",")}×
      </button>
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
  if (tipo === "audio" && id.startsWith("tmp-")) return (
    <div className="flex items-center gap-2 text-[12px] italic mb-1 px-1" style={{ color: "#54656f" }}><Mic className="w-4 h-4" />Enviando áudio…</div>
  )
  if (tipo === "audio") return falhou ? indisponivel("Áudio") : <AudioComVelocidade src={src} onErro={() => setFalhou(true)} />
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

// Caixa de resposta: Enter envia, Shift+Enter pula linha; clipe anexa foto/arquivo (com legenda).
// A mensagem aparece na hora (reloginho) e vira ✓ quando o WhatsApp confirma, sem travar a digitação.
export function Compositor({ jid, contato = "", cliente = null, orcamento = null, onOtimista, onResultado, onEnviarEProxima, autoFoco, compacto, onEnviou, sugestao, usarTexto, colado }: {
  jid: string
  colado?: boolean                           // logo abaixo da sugestão (sem a linha de cima)
  sugestao?: string                          // Tab com a caixa vazia usa a resposta sugerida
  usarTexto?: { texto: string; vez: number }  // botão "Usar" da sugestão
  onEnviarEProxima?: () => void   // ⌘/Ctrl+Enter: envia e já abre a próxima conversa esperando você
  onEnviou?: () => void
  autoFoco?: boolean
  compacto?: boolean              // dentro da espiada da lista
  contato?: string
  cliente?: string | null
  orcamento?: string | null
  onOtimista: (m: Mensagem) => void
  onResultado: (tmpId: string, realId: string | null) => void
}) {
  const [texto, setTexto] = useState("")
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  // Mensagens rápidas: "/" abre a lista; setas escolhem, Enter insere já preenchida
  const [rapidas, setRapidas] = useState<Rapida[]>([])
  const [sel, setSel] = useState(0)
  const [fechou, setFechou] = useState(false)
  useEffect(() => { fetch("/api/whatsapp/rapidas").then(r => r.json()).then(d => setRapidas(Array.isArray(d) ? d : [])).catch(() => {}) }, [])
  useEffect(() => { if (autoFoco) areaRef.current?.focus() }, [autoFoco, jid])
  // "Usar" da sugestão: troca o texto (durante a renderização, sem efeito em cascata) e põe o cursor no fim
  const [vezUsada, setVezUsada] = useState<number | undefined>()
  if (usarTexto && usarTexto.vez !== vezUsada) { setVezUsada(usarTexto.vez); setTexto(usarTexto.texto) }
  useEffect(() => {
    if (!usarTexto) return
    requestAnimationFrame(() => { const a = areaRef.current; if (a) { a.focus(); a.setSelectionRange(a.value.length, a.value.length) } })
  }, [usarTexto])
  const sugestoes = texto.startsWith("/") && !/\s/.test(texto) && !fechou ? filtrar(rapidas, texto) : []
  async function inserir(r: Rapida) {
    const t = await preencher(r.corpo ?? "", {
      contato, cliente,
      links: {
        pagina: async () => cliente ? (await fetch(`/api/cliente/link?nome=${encodeURIComponent(cliente)}`).then(x => x.json()).catch(() => null))?.url ?? null : null,
        proposta: async () => orcamento ? (await fetch(`/api/aprovacao/link?numero=${encodeURIComponent(orcamento)}`).then(x => x.json()).catch(() => null))?.url ?? null : null,
      },
    })
    setTexto(t); setSel(0); areaRef.current?.focus()
  }
  // Áudio: microfone do computador ou do iPhone (Continuidade da Apple)
  const grav = useGravador()
  const [menuMic, setMenuMic] = useState(false)
  const microfones = useMicrofones(`${menuMic}${grav.estado}`)
  const iphone = microfones.find(m => m.iphone)
  const outros = microfones.filter(m => !m.iphone)
  function enviarAudio(blob: Blob) {
    const tmp = `tmp-${Date.now()}`
    onOtimista({ id: tmp, jid, from_me: true, corpo: null, tipo: "audio", media_url: null, ts: new Date().toISOString(), kanban_card_id: null, status: "enviando" })
    onEnviou?.()
    const f = new FormData()
    f.set("jid", jid); f.set("voz", "1"); f.set("arquivo", new File([blob], `voz.${extensaoAudio(blob.type)}`, { type: blob.type }))
    fetch("/api/whatsapp/enviar", { method: "POST", body: f }).then(async r => {
      const d = await r.json().catch(() => null)
      if (r.ok && d?.id) onResultado(tmp, d.id)
      else { onResultado(tmp, null); setErro(d?.erro ?? "Não enviou o áudio.") }
    }).catch(() => { onResultado(tmp, null); setErro("Sem conexão: o áudio não foi enviado.") })
  }
  async function enviarGravacao() {
    const b = await grav.parar()
    if (b) enviarAudio(b)
    grav.cancelar()
  }

  function enviar() {
    const t = texto.trim(), a = arquivo
    if (!t && !a) return
    const tmp = `tmp-${Date.now()}`
    onOtimista({ id: tmp, jid, from_me: true, corpo: a ? (t || `Enviando ${a.name}…`) : t, tipo: "text", media_url: null, ts: new Date().toISOString(), kanban_card_id: null, status: "enviando" })
    setTexto(""); setArquivo(null); setErro(null); areaRef.current?.focus()
    onEnviou?.()
    let req: Promise<Response>
    if (a) {
      const f = new FormData()
      f.set("jid", jid); f.set("arquivo", a); f.set("legenda", t)
      req = fetch("/api/whatsapp/enviar", { method: "POST", body: f })
    } else {
      req = fetch("/api/whatsapp/enviar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid, texto: t }) })
    }
    req.then(async r => {
      const d = await r.json().catch(() => null)
      if (r.ok && d?.id) onResultado(tmp, d.id)
      else { onResultado(tmp, null); setErro(d?.erro ?? "Não enviou.") }
    }).catch(() => { onResultado(tmp, null); setErro("Sem conexão: a mensagem não foi enviada.") })
  }
  return (
    <div className={`shrink-0 ${colado ? "" : "border-t"} ${compacto ? "px-3 py-2.5" : "px-4 py-3"}`} style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      {arquivo && (
        <div className="mb-2 flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-lg w-fit max-w-full" style={{ background: "var(--bg-alt)", color: "var(--text-main)" }}>
          <Paperclip className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{arquivo.name}</span>
          <button onClick={() => setArquivo(null)} aria-label="Remover anexo" className="shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {(erro || grav.erro) && <p className="mb-2 text-[12px] text-[#d33a3c]">{erro || grav.erro}</p>}
      {sugestoes.length > 0 && (
        <div className="mb-2 rounded-xl overflow-hidden shadow-lg max-w-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          {sugestoes.map((r, i) => (
            <button key={r.id} onMouseDown={e => { e.preventDefault(); inserir(r) }} onMouseEnter={() => setSel(i)}
              className="w-full text-left px-3 py-2 flex gap-3 items-baseline" style={{ background: i === sel ? "rgba(132,86,232,0.08)" : undefined }}>
              <span className="text-[12px] font-mono font-semibold shrink-0" style={{ color: "#8456e8" }}>{r.atalho}</span>
              <span className="text-[12.5px] truncate" style={{ color: "var(--text-main)" }}>{r.corpo}</span>
            </button>
          ))}
          <p className="px-3 py-1.5 text-[10.5px] border-t" style={{ color: "var(--text-faint)", borderColor: "var(--border)" }}>↑↓ escolher · Enter inserir · Esc fechar · edite em Configurações → Mensagens rápidas</p>
        </div>
      )}
      {grav.estado === "gravando" || grav.estado === "pedindo" || grav.estado === "pronto" ? (
        <BarraGravacao grav={grav} onEnviar={enviarGravacao} />
      ) : (
      <div className="flex items-end gap-2">
        <button onClick={() => inputRef.current?.click()} aria-label="Anexar foto ou arquivo" title="Anexar foto ou arquivo"
          className="w-10 h-10 rounded-xl grid place-items-center shrink-0 transition-colors hover:bg-black/5" style={{ color: "var(--text-sub)" }}>
          <Paperclip className="w-5 h-5" />
        </button>
        <input ref={inputRef} type="file" className="hidden" onChange={e => { setArquivo(e.target.files?.[0] ?? null); e.target.value = "" }} />
        <textarea ref={areaRef} value={texto} onChange={e => { setTexto(e.target.value); setFechou(false); setSel(0) }} rows={1}
          onKeyDown={e => {
            if (sugestoes.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel(i => (i + 1) % sugestoes.length); return }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel(i => (i - 1 + sugestoes.length) % sugestoes.length); return }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); inserir(sugestoes[Math.min(sel, sugestoes.length - 1)]); return }
              if (e.key === "Escape") { setFechou(true); return }
            }
            if (e.key === "Tab" && !e.shiftKey && !texto && sugestao) { e.preventDefault(); setTexto(sugestao); return }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onEnviarEProxima) { e.preventDefault(); if (texto.trim() || arquivo) enviar(); onEnviarEProxima(); return }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar() }
            if (e.key === "Escape") areaRef.current?.blur()
          }}
          data-compositor={compacto ? "espiada" : "principal"}
          placeholder={arquivo ? "Legenda (opcional)" : sugestao ? "Tab usa a sugestão · Enter envia" : compacto ? "Responder… (Enter envia, / mensagens rápidas)" : "Escreva uma mensagem"}
          className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-[13.5px] outline-none max-h-40"
          style={{ background: "var(--bg-page)", color: "var(--text-main)", border: "1px solid var(--border)", fieldSizing: "content" } as React.CSSProperties} />
        {!texto.trim() && !arquivo ? (
          <div className="relative shrink-0">
            <button onClick={() => { if (iphone || outros.length > 1) setMenuMic(m => !m); else grav.iniciar(outros[0]?.id) }} aria-label="Gravar áudio" title="Gravar áudio"
              className="w-10 h-10 rounded-xl grid place-items-center text-white transition-transform active:scale-95" style={{ background: "#25a35a" }}>
              <Mic className="w-5 h-5" />
            </button>
            {menuMic && (
              <div className="absolute bottom-12 right-0 z-30 w-64 rounded-xl shadow-xl overflow-hidden wa-espiar" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", transformOrigin: "bottom right" }}
                onMouseLeave={() => setMenuMic(false)}>
                {iphone && (
                  <button onClick={() => { setMenuMic(false); grav.iniciar(iphone.id) }} className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 hover:bg-[#25a35a]/[0.08] border-b" style={{ borderColor: "var(--border)" }}>
                    <Smartphone className="w-4 h-4 text-[#1d8a4b]" />
                    <span><span className="block text-[12.5px] font-semibold" style={{ color: "var(--text-main)" }}>Microfone do iPhone</span>
                      <span className="block text-[11px]" style={{ color: "var(--text-faint)" }}>pela Continuidade da Apple, sem abrir nada</span></span>
                  </button>
                )}
                <button onClick={() => { setMenuMic(false); grav.iniciar(outros.length === 1 ? outros[0].id : undefined) }} className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 hover:bg-[#25a35a]/[0.08]">
                  <Laptop className="w-4 h-4 text-[#1d8a4b]" />
                  <span className="min-w-0"><span className="block text-[12.5px] font-semibold" style={{ color: "var(--text-main)" }}>Gravar aqui</span>
                    <span className="block text-[11px] truncate" style={{ color: "var(--text-faint)" }}>{outros.length === 1 ? outros[0].nome : "microfone deste computador"}</span></span>
                </button>
                {outros.length > 1 && outros.map(m => (
                  <button key={m.id} onClick={() => { setMenuMic(false); grav.iniciar(m.id) }} className="w-full text-left pl-10 pr-3.5 py-1.5 text-[11.5px] truncate hover:bg-[#25a35a]/[0.08]" style={{ color: "var(--text-sub)" }}>{m.nome}</button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button onClick={enviar} aria-label="Enviar"
            className="w-10 h-10 rounded-xl grid place-items-center shrink-0 text-white transition-opacity" style={{ background: "#25a35a" }}>
            <SendHorizontal className="w-5 h-5" />
          </button>
        )}
      </div>
      )}
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
      <span>· {r ? `cliente · ${r.pedidos} ${r.pedidos === 1 ? "pedido" : "pedidos"} · ${brlCurto(r.vendido)}` : "lead com orçamento (ainda não comprou)"}</span>
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
  if (status === "enviando") return <Clock3 className="w-3 h-3" aria-label="enviando" />
  if (status === "erro") return <span className="flex items-center gap-0.5 text-[#d33a3c]"><AlertCircle className="w-3.5 h-3.5" />não enviada</span>
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

export function FunilConversas({ conversas, cardsDe, clienteDe, onAbrir, onMover, onFechar, etiquetasDef = [], hoje = new Date(), brilho, onEnviada, onLida }: {
  brilho?: Set<string>
  onEnviada?: (jid: string, texto: string) => void
  onLida?: (c: Conversa) => void
  onFechar?: (jids: string[]) => void
  etiquetasDef?: EtiquetaDef[]
  conversas: Conversa[]
  cardsDe: (c: Conversa) => KanbanCard[]
  clienteDe: (c: Conversa) => { nome: string } | null
  onAbrir: (c: Conversa) => void
  onMover: (jid: string, etapa: Etapa | null) => void
  hoje?: Date
}) {
  const [periodo, setPeriodo] = useState<number>(30)
  const [origem, setOrigem] = useState<"todas" | "anuncio" | "site">("todas")
  const [etiqueta, setEtiqueta] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<Etapa | null>(null)
  const limite = periodo ? hoje.getTime() - periodo * 86_400_000 : 0
  const itens = conversas
    .filter(c => !c.jid.endsWith("@g.us") && c.ultima_recebida_at && new Date(c.ultima_at ?? 0).getTime() >= limite)
    .filter(c => origem === "todas" || lerOrigem(c.campanha)?.canal === origem)
    .filter(c => !etiqueta || (c.etiquetas ?? []).includes(etiqueta))
    .map(c => ({ c, p: posicaoNoFunil(c, cardsDe(c), hoje) }))
  const porEtapa = (e: Etapa) => itens.filter(i => i.p.etapa === e)
    .sort((a, b) => Number(b.p.responder) - Number(a.p.responder) || (b.c.ultima_at ?? "").localeCompare(a.c.ultima_at ?? ""))
  const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
  const quadroRef = useRef<HTMLDivElement>(null)
  const esp = useEspiada(c => { if (c.nao_lidas) onLida?.(c) })
  useReordenacaoSuave(quadroRef, ETAPAS.map(e => porEtapa(e.id).map(i => i.c.jid).join(",")).join("|"))
  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg-page)" }}>
      <div className="px-5 py-3 border-b flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
        <div className="flex gap-1 flex-wrap">
          {(["todas", "anuncio", "site"] as const).map(o => (
            <button key={o} onClick={() => setOrigem(o)} className="h-7 px-2.5 rounded-full text-[11.5px] font-medium"
              style={origem === o ? { background: "#191625", color: "#fff" } : { background: "var(--bg-page)", color: "var(--text-sub)", border: "1px solid var(--border)" }}>
              {o === "todas" ? "Todas origens" : o === "anuncio" ? "Anúncio" : "Site"}
            </button>
          ))}
          {etiquetasDef.length > 0 && <>
            <span className="w-px mx-1" style={{ background: "var(--border)" }} />
            {etiquetasDef.map(e => (
              <button key={e.nome} onClick={() => setEtiqueta(x => x === e.nome ? null : e.nome)} className="rounded-full self-center"
                style={{ outline: etiqueta === e.nome ? `2px solid ${e.cor}` : undefined, outlineOffset: 1 }}><EtiquetaChip def={e} /></button>
            ))}
          </>}
          <span className="w-px mx-1" style={{ background: "var(--border)" }} />
          {PERIODOS.map(p => (
            <button key={p.dias} onClick={() => setPeriodo(p.dias)} className="h-7 px-2.5 rounded-full text-[11.5px] font-medium"
              style={periodo === p.dias ? { background: "#191625", color: "#fff" } : { background: "var(--bg-page)", color: "var(--text-sub)", border: "1px solid var(--border)" }}>
              {p.nome}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-x-auto overflow-y-hidden" onScroll={() => { if (!esp.espiada?.fixa) esp.fechar() }}>
        <div ref={quadroRef} className="flex gap-3 p-4 h-full min-w-full w-max">
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
                  {(e.id === "perdido" || e.id === "descartado") && lista.length > 0 && onFechar && (
                    <button onClick={() => onFechar(lista.map(i => i.c.jid))} className="text-[11px] font-semibold mt-1" style={{ color: "#8456e8" }}>Fechar todas ({lista.length})</button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2" onScroll={() => { if (!esp.espiada?.fixa) esp.fechar() }}>
                  {lista.map(({ c, p }) => {
                    const cli = clienteDe(c)
                    return (
                      <div key={c.jid} data-linha={c.jid} draggable
                        onDragStart={() => { esp.fechar(); setArrastando(c.jid) }} onDragEnd={() => setArrastando(null)}
                        onClick={() => { esp.fechar(); onAbrir(c) }}
                        onMouseEnter={ev => { if (!arrastando) esp.espiar(c, ev.currentTarget) }} onMouseLeave={esp.soltar}
                        className={`group relative rounded-xl p-3 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.09)] hover:-translate-y-px transition-[box-shadow,transform,opacity] duration-200 ${brilho?.has(c.jid) ? "wa-brilho" : ""}`}
                        style={{ background: "var(--bg-surface)", opacity: arrastando === c.jid ? 0.45 : 1, outline: esp.espiada?.conversa.jid === c.jid ? "2px solid rgba(132,86,232,0.35)" : undefined }}>
                        {/* Ações no hover: responder aqui, fechar */}
                        <span className="hidden group-hover:flex wa-acoes absolute top-2 right-2 items-center gap-0.5 rounded-lg shadow-sm" style={{ background: "var(--bg-surface)" }} onClick={ev => ev.stopPropagation()}>
                          <button title="Responder sem abrir" onClick={ev => esp.espiar(c, ev.currentTarget.closest("[data-linha]") as HTMLElement, true)}
                            className="w-7 h-7 rounded-lg grid place-items-center hover:bg-[#25a35a]/15 text-[#1d8a4b]"><Reply className="w-4 h-4" /></button>
                          {onFechar && <button title="Fechar conversa" onClick={() => { esp.fechar(); onFechar([c.jid]) }}
                            className="w-7 h-7 rounded-lg grid place-items-center hover:bg-black/5" style={{ color: "var(--text-sub)" }}><Archive className="w-4 h-4" /></button>}
                        </span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Avatar nome={cli?.nome ?? c.nome} jid={c.jid} pequeno />
                          <span className="text-[12.5px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{cli?.nome ?? c.nome}</span>
                          <SeloOrigem campanha={c.campanha} />
                          {p.manual && <span title="Etapa escolhida à mão"><Pin className="w-3 h-3 shrink-0" style={{ color: "var(--text-faint)" }} /></span>}
                        </div>
                        {(c.etiquetas ?? []).length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">{(c.etiquetas ?? []).map(n => <EtiquetaChip key={n} def={etiquetasDef.find(d => d.nome === n) ?? { nome: n, cor: "#7a7983" }} mini />)}</div>
                        )}
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
      {esp.espiada && (
        <Espiada key={esp.espiada.conversa.jid} conversa={esp.espiada.conversa} topo={esp.espiada.topo} esquerda={esp.espiada.esquerda} fixa={esp.espiada.fixa}
          onFixar={esp.fixar} onFechar={esp.fechar}
          onAbrir={() => { const c = esp.espiada!.conversa; esp.fechar(); onAbrir(c) }}
          onEnviada={t => onEnviada?.(esp.espiada!.conversa.jid, t)}
          onMouseEnter={esp.limpar} onMouseLeave={esp.soltar} />
      )}
    </div>
  )
}

// Etiquetas (suas, com cor): definidas em config.etiquetasWhatsapp, marcadas por conversa
export type EtiquetaDef = { nome: string; cor: string }
const CORES_ETIQUETA = ["#8456e8", "#2f7cf6", "#009351", "#c57800", "#d33a3c", "#d33a8a", "#0e9aa7", "#7a7983"]

function EtiquetaChip({ def, mini }: { def: EtiquetaDef; mini?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full shrink-0 ${mini ? "text-[9.5px] px-1.5 py-px" : "text-[11px] px-2 py-0.5"} font-semibold`}
      style={{ background: `${def.cor}1f`, color: def.cor }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: def.cor }} />{def.nome}
    </span>
  )
}

function EtiquetasDaConversa({ selecionadas, definicoes, onMudar, onCriar }: {
  selecionadas: string[]; definicoes: EtiquetaDef[]
  onMudar: (lista: string[]) => void; onCriar?: (e: EtiquetaDef) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [nova, setNova] = useState("")
  const [cor, setCor] = useState(CORES_ETIQUETA[0])
  const alternar = (n: string) => onMudar(selecionadas.includes(n) ? selecionadas.filter(x => x !== n) : [...selecionadas, n])
  return (
    <div className="relative flex items-center gap-1 flex-wrap justify-end max-w-[260px]">
      {selecionadas.map(n => <EtiquetaChip key={n} def={definicoes.find(d => d.nome === n) ?? { nome: n, cor: "#7a7983" }} />)}
      <button onClick={() => setAberto(a => !a)} title="Etiquetas" className="w-8 h-8 rounded-lg grid place-items-center hover:bg-black/5" style={{ color: "var(--text-sub)" }}>
        <Tag className="w-4 h-4" />
      </button>
      {aberto && (
        <div className="absolute right-0 top-9 z-30 w-64 rounded-xl shadow-xl p-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          {definicoes.map(d => (
            <button key={d.nome} onClick={() => alternar(d.nome)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-black/5">
              <span className="w-4 h-4 rounded grid place-items-center" style={{ border: `1.5px solid ${d.cor}`, background: selecionadas.includes(d.nome) ? d.cor : "transparent" }}>
                {selecionadas.includes(d.nome) && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
              </span>
              <EtiquetaChip def={d} />
            </button>
          ))}
          {onCriar && (
            <div className="border-t mt-1 pt-2 px-1 space-y-1.5" style={{ borderColor: "var(--border)" }}>
              <input value={nova} onChange={e => setNova(e.target.value)} placeholder="Nova etiqueta…"
                onKeyDown={e => { if (e.key === "Enter" && nova.trim()) { const d = { nome: nova.trim(), cor }; onCriar(d); onMudar([...selecionadas, d.nome]); setNova("") } }}
                className="w-full text-[12px] px-2.5 py-1.5 rounded-lg outline-none" style={{ background: "var(--bg-page)", color: "var(--text-main)", border: "1px solid var(--border)" }} />
              <div className="flex gap-1">
                {CORES_ETIQUETA.map(c => <button key={c} onClick={() => setCor(c)} aria-label="cor" className="w-5 h-5 rounded-full" style={{ background: c, outline: cor === c ? `2px solid ${c}` : undefined, outlineOffset: 1 }} />)}
              </div>
            </div>
          )}
          <button onClick={() => setAberto(false)} className="w-full text-[11.5px] mt-1.5 py-1" style={{ color: "var(--text-faint)" }}>Fechar</button>
        </div>
      )}
    </div>
  )
}

// Reordenação suave: cada item [data-linha] desliza da posição antiga para a nova (conversa que recebeu mensagem sobe,
// card que mudou de etapa atravessa o funil). Posição pela cadeia de offsets, que não muda com a rolagem.
function useReordenacaoSuave(ref: React.RefObject<HTMLDivElement | null>, chave: string) {
  const posicoes = useRef(new Map<string, { x: number; y: number }>())
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const calmo = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const posDe = (n: HTMLElement | null) => { let x = 0, y = 0; while (n) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null } return { x, y } }
    const novas = new Map<string, { x: number; y: number }>()
    for (const item of Array.from(el.querySelectorAll<HTMLElement>("[data-linha]"))) {
      const k = item.dataset.linha!
      const o = posDe(item)
      novas.set(k, { x: o.x, y: o.y })
      const antes = posicoes.current.get(k)
      if (!antes || calmo || !item.animate) continue
      const dx = antes.x - o.x, dy = antes.y - o.y
      if ((dx || dy) && Math.abs(dx) < 2500 && Math.abs(dy) < 1500)
        item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 360, easing: "cubic-bezier(.3,.9,.3,1)" })
    }
    posicoes.current = novas
  }, [ref, chave])
}

// Espiada compartilhada pela lista e pelo funil: abre parando o mouse (450 ms) ou fixa pelo botão Responder
type EstadoEspiada = { conversa: Conversa; topo: number; esquerda: number; fixa: boolean }
function useEspiada(aoFixar?: (c: Conversa) => void) {
  const [espiada, setEspiada] = useState<EstadoEspiada | null>(null)
  const timerAbrir = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerFechar = useRef<ReturnType<typeof setTimeout> | null>(null)
  const limpar = useCallback(() => { if (timerAbrir.current) clearTimeout(timerAbrir.current); if (timerFechar.current) clearTimeout(timerFechar.current) }, [])
  // Ao lado do elemento: à direita se couber, senão à esquerda
  const lugar = (el: HTMLElement) => {
    const r = el.getBoundingClientRect(), larg = 408
    return { topo: r.top, esquerda: r.right + larg < window.innerWidth ? r.right + 8 : Math.max(8, r.left - larg) }
  }
  function espiar(c: Conversa, el: HTMLElement, fixa = false) {
    limpar()
    const abrir = () => setEspiada(e => e?.fixa && !fixa ? e : { conversa: c, ...lugar(el), fixa })
    if (fixa) { abrir(); aoFixar?.(c) } else timerAbrir.current = setTimeout(abrir, 450)
  }
  const soltar = () => { limpar(); timerFechar.current = setTimeout(() => setEspiada(e => e?.fixa ? e : null), 220) }
  const fechar = useCallback(() => { limpar(); setEspiada(null) }, [limpar])
  const fixar = () => { limpar(); setEspiada(e => { if (e && !e.fixa) { aoFixar?.(e.conversa); return { ...e, fixa: true } } return e }) }
  useEffect(() => limpar, [limpar])
  return { espiada, espiar, soltar, fechar, fixar, limpar }
}

// Espiada: últimas mensagens + resposta, sem abrir a conversa. Abre parando o mouse na linha (ou no botão Responder).
export function Espiada({ conversa, topo, esquerda, fixa, onFixar, onFechar, onAbrir, onEnviada, onMouseEnter, onMouseLeave, onOrcamento }: {
  conversa: Conversa
  onOrcamento?: (d: DadosPedido) => void
  topo: number
  esquerda: number
  fixa: boolean
  onFixar: () => void
  onFechar: () => void
  onAbrir: () => void
  onEnviada: (texto: string) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const [msgs, setMsgs] = useState<Mensagem[] | null>(null)
  const [base, setBase] = useState<Set<string>>(new Set())
  const fimRef = useRef<HTMLDivElement>(null)
  const caixaRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let vivo = true
    fetch(`/api/whatsapp/mensagens/${encodeURIComponent(conversa.jid)}?limite=8`).then(r => r.json())
      .then((d: unknown) => { if (!vivo) return; const l = Array.isArray(d) ? d as Mensagem[] : []; setMsgs(l); setBase(new Set(l.map(m => m.id))) })
      .catch(() => vivo && setMsgs([]))
    return () => { vivo = false }
  }, [conversa.jid])
  useEffect(() => { fimRef.current?.scrollIntoView({ block: "end" }) }, [msgs])
  // Fixa: fecha com Esc ou clicando fora
  useEffect(() => {
    if (!fixa) return
    const fora = (e: MouseEvent) => { if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) onFechar() }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar() }
    document.addEventListener("mousedown", fora); document.addEventListener("keydown", esc)
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc) }
  }, [fixa, onFechar])
  const altura = typeof window !== "undefined" ? Math.max(440, Math.min(560, window.innerHeight - 80)) : 440
  const top = Math.max(64, Math.min(topo - 24, (typeof window !== "undefined" ? window.innerHeight : 900) - altura - 12))
  return (
    <div ref={caixaRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onFocusCapture={onFixar} onMouseDown={onFixar}
      className="wa-espiar fixed z-[60] w-[400px] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      style={{ top, left: esquerda, height: altura, background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <Avatar nome={conversa.nome} jid={conversa.jid} pequeno />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{conversa.nome}</p>
          <p className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>{fixa ? "Esc fecha" : "clique para responder aqui"}</p>
        </div>
        <button onClick={onAbrir} className="text-[11.5px] font-semibold px-2.5 h-7 rounded-lg hover:bg-black/5 flex items-center gap-1" style={{ color: "#8456e8" }}>
          Abrir<ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button onClick={onFechar} aria-label="Fechar" className="w-7 h-7 rounded-lg grid place-items-center hover:bg-black/5" style={{ color: "var(--text-sub)" }}><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1.5" style={{ background: "#efeae2" }}>
        {!msgs && <div className="flex justify-center py-8"><TypingBubble /></div>}
        {msgs?.map(m => (
          <div key={m.id} className={`flex ${m.from_me ? "justify-end" : "justify-start"} ${base.has(m.id) ? "" : m.from_me ? "wa-bolha-eu" : "wa-bolha-ele"}`}>
            <div className="max-w-[85%] px-2.5 py-1.5 shadow-sm" style={{ background: m.from_me ? "#d9fdd3" : "#fff", borderRadius: m.from_me ? "14px 14px 4px 14px" : "14px 14px 14px 4px" }}>
              <MidiaMensagem id={m.id} tipo={m.tipo} nome={m.corpo} />
              {m.corpo && m.tipo !== "document" && (
                <p className={`text-[12.5px] leading-snug whitespace-pre-wrap ${m.tipo === "audio" || m.tipo === "audioMessage" ? "italic" : ""}`} style={{ color: "#111b21" }}>{m.corpo}</p>
              )}
              <p className="text-[10px] mt-0.5 flex items-center justify-end gap-1" style={{ color: "#8696a0" }}>
                {new Date(m.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                {m.from_me && <Recibo status={m.status} />}
              </p>
            </div>
          </div>
        ))}
        <div ref={fimRef} />
      </div>
      <RespostaComSugestao compacto autoFoco={fixa} jid={conversa.jid} contato={conversa.nome}
        ultima={msgs?.[msgs.length - 1]} auto={fixa && !!msgs} onOrcamento={onOrcamento}
        onOtimista={m => { setMsgs(prev => [...(prev ?? []), m]); onEnviada(m.corpo ?? "") }}
        onResultado={(tmp, real) => {
          if (real) setBase(b => new Set(b).add(real))
          setMsgs(prev => (prev ?? []).map(x => x.id !== tmp ? x : real ? { ...x, id: real, status: "enviada" } : { ...x, status: "erro" }))
        }} />
    </div>
  )
}

// ── Atendente: resposta sugerida no seu tom + dados do pedido ─────────────────
// Guardada por conversa (vale até chegar mensagem nova). Gera sozinha quando o cliente está esperando você.
const sugestoes = new Map<string, Atendimento>()
function useAtendimento(jid: string, ultima: { id: string; from_me: boolean } | undefined, auto: boolean) {
  const [at, setAt] = useState<Atendimento | null>(() => sugestoes.get(jid) ?? null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const pedindo = useRef<string | null>(null)
  const gerar = useCallback(async (outra?: boolean) => {
    pedindo.current = jid
    setCarregando(true); setErro(null)
    const r = await fetch("/api/whatsapp/atender", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid, outra: outra === true }) }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    if (pedindo.current !== jid) return
    if (r?.ok && d?.resposta !== undefined) { sugestoes.set(jid, d); setAt(d) } else setErro(d?.erro ?? "A IA não respondeu.")
    setCarregando(false)
  }, [jid])
  const guardada = sugestoes.get(jid)
  const velha = !!guardada && !!ultima && guardada.ultimaId !== ultima.id
  // Cliente falou por último e não há sugestão para a mensagem dele: gera (um componente por conversa: key = jid).
  // Espera 600 ms: passando por várias conversas com ↑↓, só gera para aquela em que você parou.
  const precisa = auto && !!ultima && !ultima.from_me && !ultima.id.startsWith("tmp-") && (!guardada || velha)
  useEffect(() => {
    if (!precisa) return
    const t = setTimeout(() => gerar(), 600)
    return () => clearTimeout(t)
  }, [precisa, gerar, ultima?.id])
  return { at: velha && !ultima?.from_me ? null : at, carregando, erro, gerar, descartar: () => { sugestoes.delete(jid); setAt(null) } }
}

function SugestaoAtendente({ estado, onUsar, onOrcamento, compacto }: {
  estado: ReturnType<typeof useAtendimento>
  onUsar: (texto: string) => void
  onOrcamento?: (d: DadosPedido) => void
  compacto?: boolean
}) {
  const { at, carregando, erro, gerar, descartar } = estado
  if (!at && !carregando && !erro) return (
    <div className={`shrink-0 ${compacto ? "px-3 pt-2" : "px-4 pt-2.5"}`} style={{ background: "var(--bg-surface)" }}>
      <button onClick={() => gerar()} className="text-[11.5px] font-semibold flex items-center gap-1.5 px-2.5 h-7 rounded-lg hover:bg-[#8456e8]/10" style={{ color: "#8456e8" }}>
        <Sparkles className="w-3.5 h-3.5" />Sugerir resposta
      </button>
    </div>
  )
  const d = at?.dados
  const chips = d ? [
    d.produto,
    d.caixa_cm ? `caixa ${d.caixa_cm.frente}×${d.caixa_cm.lateral}×${d.caixa_cm.altura} cm` : "",
    d.frasco_cm ? `frasco ${d.frasco_cm}` : "",
    d.quantidade ? `${d.quantidade.toLocaleString("pt-BR")} un` : "",
    d.tem_arte === true ? "tem arte" : d.tem_arte === false ? "sem arte" : "",
  ].filter(Boolean) : []
  return (
    <div className={`shrink-0 border-t ${compacto ? "px-3 pt-2" : "px-4 pt-2.5"}`} style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      <div className="wa-espiar rounded-xl px-3 py-2.5" style={{ background: "rgba(132,86,232,0.06)", border: "1px solid rgba(132,86,232,0.18)" }}>
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: "#8456e8" }} />
          <span className="text-[11px] font-semibold" style={{ color: "#8456e8" }}>{carregando ? "Pensando na resposta…" : "Sugestão no seu tom"}</span>
          {at && at.alerta !== "nenhum" && (
            <span title={at.motivo_alerta} className="text-[10px] font-bold uppercase px-1.5 py-px rounded flex items-center gap-1" style={{ background: "rgba(197,120,0,0.14)", color: "#b26b00" }}>
              <AlertCircle className="w-3 h-3" />{ROTULO_ALERTA[at.alerta]}
            </span>
          )}
          {(() => { const l = (at as (Atendimento & { lead?: LeadAvaliado }) | null)?.lead; return l && l.perfil !== "nao_lead" && (
            <span title={l.motivo} className="text-[10px] font-bold uppercase px-1.5 py-px rounded" style={l.perfil === "icp" ? { background: "rgba(0,147,81,0.12)", color: "#009351" } : l.perfil === "pequeno" ? { background: "rgba(116,116,128,0.12)", color: "var(--text-sub)" } : { background: "rgba(132,86,232,0.12)", color: "#8456e8" }}>
              {ROTULO_PERFIL[l.perfil]}{l.quantidade_total ? ` · ${l.quantidade_total.toLocaleString("pt-BR")}` : ""}
            </span>
          ) })()}
          {at?.sugere_video && <span className="text-[10px] font-semibold flex items-center gap-1" style={{ color: "var(--text-faint)" }}><Video className="w-3 h-3" />vale mandar vídeo</span>}
          <span className="ml-auto flex items-center gap-0.5">
            {!carregando && <button onClick={() => gerar(true)} title="Gerar outra" className="text-[11px] px-2 h-6 rounded-md hover:bg-black/5" style={{ color: "var(--text-sub)" }}>Outra</button>}
            <button onClick={descartar} aria-label="Dispensar sugestão" className="w-6 h-6 rounded-md grid place-items-center hover:bg-black/5" style={{ color: "var(--text-faint)" }}><X className="w-3.5 h-3.5" /></button>
          </span>
        </div>
        {carregando && !at ? (
          <div className="space-y-1.5 py-0.5">{[85, 60].map(w => <div key={w} className="h-2.5 rounded bg-[#8456e8]/10 animate-pulse" style={{ width: `${w}%` }} />)}</div>
        ) : erro && !at ? (
          <p className="text-[12px] text-[#d33a3c]">{erro}</p>
        ) : at && (<>
          {at.resposta
            ? <button onClick={() => onUsar(at.resposta)} title="Usar (Tab)" className={`w-full text-left text-[12.5px] leading-snug whitespace-pre-wrap rounded-lg px-2 py-1.5 hover:bg-white/70 transition-colors ${compacto ? "max-h-24 overflow-y-auto" : ""}`} style={{ color: "var(--text-main)" }}>{at.resposta}</button>
            : <p className="text-[12px] italic" style={{ color: "var(--text-faint)" }}>Nada para responder agora.</p>}
          {at.alerta !== "nenhum" && at.motivo_alerta && <p className="text-[11px] mt-1" style={{ color: "#b26b00" }}>{at.motivo_alerta}</p>}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {chips.map(c => <span key={c} className="text-[10.5px] px-1.5 py-px rounded" style={{ background: "var(--bg-page)", color: "var(--text-sub)", border: "1px solid var(--border)" }}>{c}</span>)}
            <span className="ml-auto flex items-center gap-1">
              {onOrcamento && d && temDados(d) && <button onClick={() => onOrcamento(d)} className="text-[11.5px] font-semibold px-2.5 h-7 rounded-lg hover:bg-[#8456e8]/10" style={{ color: "#8456e8" }}>Orçamento com estes dados</button>}
              {at.resposta && <button onClick={() => onUsar(at.resposta)} className="text-[11.5px] font-semibold px-3 h-7 rounded-lg text-white" style={{ background: "#8456e8" }}>Usar <span className="opacity-60 font-normal">Tab</span></button>}
            </span>
          </div>
        </>)}
      </div>
    </div>
  )
}

// Caixa de resposta com o atendente em cima (conversa aberta e espiada)
function RespostaComSugestao({ jid, ultima, auto, compacto, onOrcamento, ...props }: {
  ultima: { id: string; from_me: boolean } | undefined
  auto: boolean
  onOrcamento?: (d: DadosPedido) => void
} & Omit<Parameters<typeof Compositor>[0], "sugestao" | "usarTexto" | "colado">) {
  const estado = useAtendimento(jid, ultima, auto)
  const [usar, setUsar] = useState<{ texto: string; vez: number } | undefined>()
  return <>
    <SugestaoAtendente estado={estado} compacto={compacto} onOrcamento={onOrcamento} onUsar={t => setUsar({ texto: t, vez: Date.now() })} />
    <Compositor {...props} jid={jid} compacto={compacto} colado={!!(estado.at || estado.carregando || estado.erro)}
      sugestao={estado.at?.resposta || undefined} usarTexto={usar} onEnviou={() => { estado.descartar(); props.onEnviou?.() }} />
  </>
}

// Gravando pelo microfone deste computador: tempo, barrinhas do volume, cancelar, parar para ouvir e enviar
function BarraGravacao({ grav, onEnviar }: { grav: ReturnType<typeof useGravador>; onEnviar: () => void }) {
  const gravando = grav.estado === "gravando"
  return (
    <div className="flex items-center gap-2 wa-espiar">
      <button onClick={grav.cancelar} aria-label="Descartar áudio" title="Descartar"
        className="w-10 h-10 rounded-xl grid place-items-center shrink-0 hover:bg-[#d33a3c]/10 text-[#d33a3c]"><Trash2 className="w-5 h-5" /></button>
      <div className="flex-1 min-w-0 h-10 rounded-xl px-3 flex items-center gap-3" style={{ background: "var(--bg-page)", border: "1px solid var(--border)" }}>
        {grav.estado === "pronto" && grav.audio ? (
          <audio controls src={grav.audio.url} className="h-8 w-full" />
        ) : (<>
          <span className={`w-2.5 h-2.5 rounded-full bg-[#d33a3c] shrink-0 ${gravando ? "animate-pulse" : "opacity-40"}`} />
          <span className="text-[13px] font-semibold ds-num shrink-0" style={{ color: "var(--text-main)" }}>{grav.estado === "pedindo" ? "Liberando o microfone…" : tempo(grav.segundos)}</span>
          <span className="flex-1 flex items-center justify-end gap-[2px] h-6 overflow-hidden">
            {grav.niveis.map((n, i) => <span key={i} className="w-[3px] rounded-full bg-[#25a35a] shrink-0" style={{ height: `${Math.max(12, n * 100)}%`, opacity: 0.45 + n * 0.55 }} />)}
          </span>
        </>)}
      </div>
      {gravando && (
        <button onClick={() => grav.parar()} aria-label="Parar e ouvir" title="Parar e ouvir antes de enviar"
          className="w-10 h-10 rounded-xl grid place-items-center shrink-0 hover:bg-black/5" style={{ color: "var(--text-sub)" }}><Square className="w-4 h-4 fill-current" /></button>
      )}
      <button onClick={onEnviar} disabled={grav.estado === "pedindo"} aria-label="Enviar áudio" title="Enviar"
        className="w-10 h-10 rounded-xl grid place-items-center shrink-0 text-white disabled:opacity-40" style={{ background: "#25a35a" }}><SendHorizontal className="w-5 h-5" /></button>
    </div>
  )
}

// ── Conversa ao lado do orçamento ──────────────────────────────────────────────
// Painel fixo à direita, sem cobrir o formulário: o que a IA tirou da conversa no topo, as mensagens (áudios com
// a transcrição) e uma busca ("verniz", "medida") para achar o detalhe que faltou sem sair do orçamento.
const diaDe = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" })
export function ConversaLateral({ jid, nome, dados, onFechar, onAbrir, responder, onOrcamento, onEnviou }: {
  jid: string
  nome: string
  dados?: DadosPedido | null
  onFechar: () => void
  onAbrir: () => void
  responder?: boolean                       // caixa de resposta embaixo (com a sugestão da IA): responde sem sair da tela
  onOrcamento?: (d: DadosPedido) => void
  onEnviou?: () => void
}) {
  const [msgs, setMsgs] = useState<Mensagem[] | null>(null)
  const [busca, setBusca] = useState("")
  const fimRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let vivo = true
    fetch(`/api/whatsapp/mensagens/${encodeURIComponent(jid)}`).then(r => r.json())
      .then((d: unknown) => { if (vivo) setMsgs(Array.isArray(d) ? d as Mensagem[] : []) })
      .catch(() => vivo && setMsgs([]))
    return () => { vivo = false }
  }, [jid])
  useEffect(() => { if (!busca) fimRef.current?.scrollIntoView({ block: "end" }) }, [msgs, busca])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar() }
    document.addEventListener("keydown", esc)
    return () => document.removeEventListener("keydown", esc)
  }, [onFechar])

  const termo = busca.trim().toLowerCase()
  const lista = (msgs ?? []).filter(m => !termo || (m.corpo ?? "").toLowerCase().includes(termo))
  const marcar = (t: string) => {
    if (!termo) return t
    const i = t.toLowerCase().indexOf(termo)
    return i < 0 ? t : <>{t.slice(0, i)}<mark className="bg-[#ffe08a] rounded-sm px-0.5">{t.slice(i, i + termo.length)}</mark>{t.slice(i + termo.length)}</>
  }
  const pedido = dados ? [
    dados.quantidade ? `${dados.quantidade.toLocaleString("pt-BR")} un` : "",
    dados.volume_ml ? `${dados.volume_ml} ml` : "",
    dados.caixa_cm ? `caixa ${[dados.caixa_cm.frente, dados.caixa_cm.lateral, dados.caixa_cm.altura].map(n => n.toLocaleString("pt-BR")).join("×")} cm` : "",
    dados.tem_arte === true ? "tem arte" : dados.tem_arte === false ? "sem arte" : "",
  ].filter(Boolean) : []

  return (
    <div className="wa-conversa-lateral fixed z-[70] top-0 right-0 bottom-0 w-full sm:w-[400px] shadow-2xl flex flex-col print:hidden"
      style={{ background: "var(--bg-surface)", borderLeft: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <Avatar nome={nome} jid={jid} pequeno />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{nome}</p>
          <p className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>Conversa no WhatsApp · Esc fecha</p>
        </div>
        {responder && <ProximoPasso jid={jid} />}
        <button onClick={onAbrir} className="text-[11.5px] font-semibold px-2.5 h-7 rounded-lg hover:bg-black/5 flex items-center gap-1" style={{ color: "#8456e8" }}>
          Abrir<ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button onClick={onFechar} aria-label="Fechar" className="w-7 h-7 rounded-lg grid place-items-center hover:bg-black/5" style={{ color: "var(--text-sub)" }}><X className="w-4 h-4" /></button>
      </div>
      {dados && (dados.resumo || pedido.length > 0) && (
        <div className="px-3.5 py-2.5 border-b shrink-0 bg-[rgba(132,86,232,0.05)]" style={{ borderColor: "var(--border)" }}>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#8456e8] flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />O que ele pediu</p>
          {pedido.length > 0 && <p className="text-[12.5px] font-semibold mt-1" style={{ color: "var(--text-main)" }}>{pedido.join(" · ")}</p>}
          {dados.produto && <p className="text-[12px] mt-0.5" style={{ color: "var(--text-sub)" }}>{dados.produto}{dados.frasco_cm ? ` · frasco: ${dados.frasco_cm}` : ""}</p>}
          {dados.resumo && <p className="text-[12px] mt-1 leading-snug" style={{ color: "var(--text-sub)" }}>{dados.resumo}</p>}
        </div>
      )}
      <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 h-8 px-2.5 rounded-lg bg-[rgba(116,116,128,0.08)]">
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-faint)" }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar na conversa: verniz, medida, prazo…"
            className="flex-1 min-w-0 bg-transparent text-[12.5px] focus:outline-none" style={{ color: "var(--text-main)" }} />
          {busca && <button onClick={() => setBusca("")} aria-label="Limpar busca" style={{ color: "var(--text-faint)" }}><X className="w-3.5 h-3.5" /></button>}
        </div>
        {termo && msgs && <p className="text-[10.5px] mt-1 px-1" style={{ color: "var(--text-faint)" }}>{lista.length ? `${lista.length} ${lista.length === 1 ? "mensagem" : "mensagens"}` : "Nada encontrado"}</p>}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1.5" style={{ background: "#efeae2" }}>
        {!msgs && <div className="flex justify-center py-8"><TypingBubble /></div>}
        {msgs && msgs.length === 0 && <p className="text-center text-[12px] py-8" style={{ color: "#54656f" }}>Nenhuma mensagem guardada desta conversa.</p>}
        {lista.map((m, i) => {
          const novoDia = !lista[i - 1] || diaDe(lista[i - 1].ts) !== diaDe(m.ts)
          return (
            <div key={m.id}>
              {novoDia && <div className="flex justify-center my-1.5"><span className="text-[10.5px] font-medium px-2.5 py-0.5 rounded-md bg-white/80" style={{ color: "#54656f" }}>{diaDe(m.ts)}</span></div>}
              <div className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%] px-2.5 py-1.5 shadow-sm" style={{ background: m.from_me ? "#d9fdd3" : "#fff", borderRadius: m.from_me ? "14px 14px 4px 14px" : "14px 14px 14px 4px" }}>
                  <MidiaMensagem id={m.id} tipo={m.tipo} nome={m.corpo} />
                  {m.corpo && m.tipo !== "document" && (
                    <p className={`text-[12.5px] leading-snug whitespace-pre-wrap ${m.tipo === "audio" || m.tipo === "audioMessage" ? "italic" : ""}`} style={{ color: "#111b21" }}>{marcar(m.corpo)}</p>
                  )}
                  <p className="text-[10px] mt-0.5 text-right" style={{ color: "#8696a0" }}>
                    {new Date(m.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={fimRef} />
      </div>
      {responder && msgs && (
        <div className="shrink-0 pb-2" style={{ background: "var(--bg-surface)" }}>
          <RespostaComSugestao compacto autoFoco jid={jid} contato={nome}
            ultima={msgs[msgs.length - 1]} auto onOrcamento={onOrcamento} onEnviou={onEnviou}
            onOtimista={m => { setBusca(""); setMsgs(prev => [...(prev ?? []), m]) }}
            onResultado={(tmp, real) => setMsgs(prev => (prev ?? []).map(x => x.id !== tmp ? x : real ? { ...x, id: real, status: "enviada" } : { ...x, status: "erro" }))} />
        </div>
      )}
    </div>
  )
}
