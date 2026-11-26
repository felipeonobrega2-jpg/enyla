"use client"

// Fila de mensagens sugeridas: o sistema prepara (follow-up, aviso de produção, cobrança), você revisa e manda.
// "Escrever com IA" reescreve no seu tom (guia de atendimento + conversa). Follow-up combina com vídeo de produção.

import { useEffect, useMemo, useRef, useState } from "react"
import { Sparkles, SendHorizontal, Video, Image as ImageIcon, X, MessageCircle, Inbox, Clock3 } from "lucide-react"
import type { KanbanCard, LancamentoFinanceiro } from "../types"
import { montarFila, listarDispensados, dentroDaJanela, ItemFila, AvisoPedido, ConversaFila, JANELA } from "../lib/filaMensagens"
import { criarConfirmacaoEnvio } from "../lib/confirmarEnvio"
import type { Vinculos } from "../lib/vinculoWhatsapp"
import { Selo, Botao, Vazio, Tom } from "./ds"
import EnsinarIA, { enviarLicao } from "./EnsinarIA"

type Midia = { id: string; tipo: "video" | "imagem"; ts: string }
const ROTULO: Record<ItemFila["tipo"], { nome: string; tom: Tom }> = {
  followup: { nome: "Follow-up", tom: "info" },
  producao: { nome: "Em produção", tom: "acento" },
  pronto: { nome: "Pronto", tom: "sucesso" },
  cobranca: { nome: "Cobrança", tom: "alerta" },
}

export function FilaMensagens({ conversas, kanban, lancamentos, vinculos, avisos, dispensados, onAvisado, onDispensar, onRestaurar, onAbrirConversa }: {
  conversas: ConversaFila[]
  kanban: KanbanCard[]
  lancamentos: LancamentoFinanceiro[]
  vinculos?: Vinculos
  avisos?: Record<string, AvisoPedido>
  dispensados?: Record<string, string>
  onAvisado: (pedidoKey: string, aviso: AvisoPedido) => void
  onDispensar: (id: string) => void
  onRestaurar?: (ids: string[]) => void
  onAbrirConversa: (jid: string) => void
}) {
  const itens = useMemo(() => montarFila({ conversas, kanban, lancamentos, vinculos, avisos, dispensados }), [conversas, kanban, lancamentos, vinculos, avisos, dispensados])
  const [selId, setSelId] = useState<string | null>(null)
  const sel = itens.find(i => i.id === selId) ?? itens[0] ?? null
  const [verDispensados, setVerDispensados] = useState(false)
  const lista = useMemo(() => listarDispensados(dispensados, conversas), [dispensados, conversas])
  const contagem = (t: ItemFila["tipo"]) => itens.filter(i => i.tipo === t).length

  if (verDispensados) return <Dispensados lista={lista} onVoltar={() => setVerDispensados(false)} onRestaurar={ids => onRestaurar?.(ids)} />

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row" style={{ background: "var(--bg-page)" }}>
      <div className="md:w-[360px] shrink-0 border-r flex flex-col min-h-0" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <p className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>{itens.length} {itens.length === 1 ? "mensagem sugerida" : "mensagens sugeridas"}</p>
          <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-faint)" }}>
            {[[contagem("followup"), "follow-up", "follow-ups"], [contagem("producao") + contagem("pronto"), "aviso de produção", "avisos de produção"], [contagem("cobranca"), "cobrança", "cobranças"]]
              .filter(([n]) => n).map(([n, um, varios]) => `${n} ${n === 1 ? um : varios}`).join(" · ")}
          </p>
          <button onClick={() => setVerDispensados(true)} className="text-[11.5px] mt-1 underline" style={{ color: "var(--text-faint)" }}>Dispensados ({lista.length})</button>
        </div>
        <div className="flex-1 overflow-y-auto max-h-[40vh] md:max-h-none">
          {!itens.length && <Vazio icone={<Inbox className="w-7 h-7" />} titulo="Nada para mandar agora" sub="Follow-ups, avisos de produção e cobranças aparecem aqui quando for a hora." />}
          {itens.map(i => (
            <button key={i.id} onClick={() => setSelId(i.id)} className="w-full text-left px-4 py-3 border-b flex flex-col gap-1 transition-colors"
              style={{ borderColor: "var(--border)", background: sel?.id === i.id ? "rgba(132,86,232,0.07)" : undefined }}>
              <div className="flex items-center gap-2">
                <Selo tom={ROTULO[i.tipo].tom}>{ROTULO[i.tipo].nome}</Selo>
                <span className="text-[13px] font-medium truncate" style={{ color: "var(--text-main)" }}>{i.titulo}</span>
              </div>
              <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>{i.motivo}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {sel && <Editor key={sel.id} item={sel} onAbrirConversa={onAbrirConversa}
          onFeito={() => { if (sel.pedidoKey) onAvisado(sel.pedidoKey, sel.tipo as AvisoPedido); else onDispensar(sel.id) }} />}
      </div>
    </div>
  )
}

// Itens dispensados: "Devolver à Fila" só tira a marca de dispensado; não envia nada.
function Dispensados({ lista, onVoltar, onRestaurar }: { lista: ReturnType<typeof listarDispensados>; onVoltar: () => void; onRestaurar: (ids: string[]) => void }) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const alternar = (id: string) => setMarcados(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const devolver = (ids: string[]) => { onRestaurar(ids); setMarcados(new Set()) }
  const quando = (em: string) => new Date(em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 max-w-[760px] space-y-3" style={{ background: "var(--bg-page)" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <Botao variante="fantasma" onClick={onVoltar}>← Voltar à Fila</Botao>
        <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>{lista.length} {lista.length === 1 ? "dispensado" : "dispensados"}</span>
        {marcados.size > 0 && <Botao className="ml-auto" onClick={() => devolver([...marcados])}>Devolver {marcados.size} à Fila</Botao>}
      </div>
      {!lista.length && <Vazio icone={<Inbox className="w-7 h-7" />} titulo="Nenhum item dispensado" sub="O que você dispensar na Fila aparece aqui por 60 dias." />}
      {lista.map(i => (
        <div key={i.id} className="flex items-center gap-3 rounded-xl px-3.5 py-2.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <input type="checkbox" checked={marcados.has(i.id)} onChange={() => alternar(i.id)} aria-label={`Marcar ${i.nome}`} />
          <div className="min-w-0">
            <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-main)" }}>{i.nome}</p>
            <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>Dispensado em {quando(i.em)}</p>
          </div>
          <Botao variante="fantasma" className="ml-auto" onClick={() => devolver([i.id])}>Devolver à Fila</Botao>
        </div>
      ))}
    </div>
  )
}

function Editor({ item, onFeito, onAbrirConversa }: { item: ItemFila; onFeito: () => void; onAbrirConversa: (jid: string) => void }) {
  const [texto, setTexto] = useState(item.texto)
  const [sugerido, setSugerido] = useState<string | null>(null)   // o que a IA escreveu (se você mudar antes de enviar, ela aprende)
  const [escrevendo, setEscrevendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const confirmacao = useRef(criarConfirmacaoEnvio())   // confirmação antes de "Enviar mesmo assim"
  const [confirmando, setConfirmandoEstado] = useState(false)
  const setConfirmando = (v: boolean) => { if (!v) confirmacao.current.cancelar(); setConfirmandoEstado(v) }
  const [erro, setErro] = useState<string | null>(null)
  const [midia, setMidia] = useState<Midia | null>(null)
  const [escolhendo, setEscolhendo] = useState(false)
  const janela = dentroDaJanela()
  const semDestino = !item.jid && !item.cliente

  async function escreverComIA() {
    setEscrevendo(true); setErro(null)
    const r = await fetch("/api/whatsapp/sugerir", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jid: item.jid, cliente: item.cliente, motivo: `${ROTULO[item.tipo].nome}: ${item.motivo}`, texto }) }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    if (r?.ok && d?.texto) { setTexto(d.texto); setSugerido(d.texto) } else setErro(d?.erro ?? "A IA não respondeu.")
    setEscrevendo(false)
  }

  async function enviar() {
    setEnviando(true); setErro(null)
    // Com conversa: manda no mesmo chat (aceita vídeo). Sem conversa: pelo telefone do cadastro (só texto).
    // Duas mensagens separadas por linha em branco saem como duas mensagens, como você escreve.
    const partes = texto.split(/\n\s*\n/).map(t => t.trim()).filter(Boolean)
    let ok = true, msg = ""
    if (item.jid) {
      if (midia) {
        const r = await fetch("/api/whatsapp/enviar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid: item.jid, midiaId: midia.id }) }).catch(() => null)
        if (!r?.ok) { ok = false; msg = (await r?.json().catch(() => null))?.erro ?? "Não enviou o vídeo." }
      }
      for (const p of ok ? partes : []) {
        const r = await fetch("/api/whatsapp/enviar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid: item.jid, texto: p }) }).catch(() => null)
        if (!r?.ok) { ok = false; msg = (await r?.json().catch(() => null))?.erro ?? "Sem conexão."; break }
      }
    } else {
      const r = await fetch("/api/whatsapp/enviar-cliente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cliente: item.cliente, texto: partes.join("\n\n") }) }).catch(() => null)
      if (!r?.ok) { ok = false; msg = (await r?.json().catch(() => null))?.erro ?? "Sem conexão." }
    }
    setEnviando(false)
    if (ok && sugerido && sugerido.trim() !== texto.trim()) void enviarLicao("mensagens", { correcao: { ia: sugerido, voce: texto } })
    if (ok) onFeito(); else setErro(msg)
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[760px]">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><Selo tom={ROTULO[item.tipo].tom}>{ROTULO[item.tipo].nome}</Selo>
            <span className="text-[15px] font-semibold" style={{ color: "var(--text-main)" }}>{item.titulo}</span></div>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-faint)" }}>{item.motivo}</p>
        </div>
        {item.jid && <Botao variante="fantasma" className="ml-auto" icone={<MessageCircle className="w-4 h-4" />} onClick={() => onAbrirConversa(item.jid!)}>Ver conversa</Botao>}
      </div>

      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={6} disabled={escrevendo}
        className="w-full rounded-xl px-3.5 py-3 text-[13.5px] leading-relaxed outline-none resize-y"
        style={{ background: "var(--bg-surface)", color: "var(--text-main)", border: "1px solid var(--border)" }} />
      <p className="text-[11px] -mt-2" style={{ color: "var(--text-faint)" }}>Linha em branco separa em duas mensagens.</p>

      {item.jid && (
        <div className="space-y-2">
          {midia ? (
            <div className="flex items-center gap-3">
              <MiniMidia m={midia} />
              <Botao variante="fantasma" icone={<X className="w-4 h-4" />} onClick={() => setMidia(null)}>Tirar</Botao>
            </div>
          ) : (
            <Botao icone={<Video className="w-4 h-4" />} onClick={() => setEscolhendo(v => !v)}>
              {item.sugereMidia ? "Anexar vídeo de produção (recomendado)" : "Anexar vídeo ou foto"}
            </Botao>
          )}
          {escolhendo && !midia && <Biblioteca onEscolher={m => { setMidia(m); setEscolhendo(false) }} />}
        </div>
      )}

      {erro && <p className="text-[12.5px] text-[#d33a3c]">{erro}</p>}
      {!janela && <p className="text-[12px] flex items-center gap-1.5" style={{ color: "#b26b00" }}><Clock3 className="w-3.5 h-3.5" />Fora da janela de envio ({JANELA.inicio}h–{JANELA.fim}h). Melhor mandar amanhã cedo.</p>}
      {semDestino && <p className="text-[12px]" style={{ color: "#b26b00" }}>Sem conversa nem telefone deste cliente: ligue a conversa ao cliente na tela do WhatsApp.</p>}

      <EnsinarIA area="mensagens" />

      <div className="flex items-center gap-2 flex-wrap">
        <Botao icone={<Sparkles className="w-4 h-4" />} onClick={escreverComIA} disabled={escrevendo}>{escrevendo ? "Escrevendo no seu tom…" : "Escrever com IA"}</Botao>
        <Botao variante="fantasma" onClick={onFeito}>{item.pedidoKey ? "Já avisei" : "Dispensar"}</Botao>
        <button onClick={() => { if (janela) void enviar(); else { confirmacao.current.pedir({ destinatario: item.titulo, texto }); setConfirmandoEstado(true) } }} disabled={enviando || escrevendo || semDestino || (!texto.trim() && !midia)}
          className="ml-auto h-10 px-5 rounded-xl text-white text-[13.5px] font-semibold flex items-center gap-2 disabled:opacity-50" style={{ background: "#25a35a" }}>
          <SendHorizontal className="w-4 h-4" />{enviando ? "Enviando…" : janela ? "Enviar" : "Enviar mesmo assim"}
        </button>
      </div>

      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}
          role="dialog" aria-modal="true" aria-label="Confirmar envio"
          onKeyDown={e => { if (e.key === "Escape") setConfirmando(false) }}>
          <div className="w-full max-w-[460px] rounded-2xl p-5 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <p className="text-[15px] font-semibold" style={{ color: "var(--text-main)" }}>Confirmar envio ao cliente?</p>
            <p className="text-[12.5px]" style={{ color: "var(--text-faint)" }}>Para: <strong style={{ color: "var(--text-main)" }}>{item.titulo}</strong></p>
            <div className="rounded-xl px-3 py-2 text-[13px] whitespace-pre-wrap max-h-[40vh] overflow-y-auto" style={{ background: "var(--bg-page)", color: "var(--text-main)", border: "1px solid var(--border)" }}>
              {texto.trim() || "(só o vídeo/foto anexado)"}
              {midia && <span className="block mt-1 text-[11.5px]" style={{ color: "var(--text-faint)" }}>+ {midia.tipo === "video" ? "vídeo" : "foto"} anexado</span>}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button autoFocus onClick={() => setConfirmando(false)}
                className="h-10 px-4 rounded-xl text-[13.5px] font-semibold" style={{ border: "1px solid var(--border)", color: "var(--text-main)" }}>Cancelar</button>
              <button onClick={() => { setConfirmandoEstado(false); void confirmacao.current.confirmar(enviar) }}
                className="h-10 px-4 rounded-xl text-white text-[13.5px] font-semibold" style={{ background: "#25a35a" }}>Confirmar envio</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const MiniMidia = ({ m }: { m: Midia }) => {
  const src = `/api/whatsapp/midia/${encodeURIComponent(m.id)}`
  return m.tipo === "video"
    ? <video src={src} preload="metadata" muted className="w-[120px] h-[90px] rounded-lg object-cover bg-black/10" />
    // eslint-disable-next-line @next/next/no-img-element
    : <img src={src} alt="" className="w-[120px] h-[90px] rounded-lg object-cover bg-black/10" />
}

// Vídeos e fotos que você mandou recentemente
function Biblioteca({ onEscolher }: { onEscolher: (m: Midia) => void }) {
  const [lista, setLista] = useState<Midia[] | null>(null)
  const [quebradas, setQuebradas] = useState<Set<string>>(new Set())
  useEffect(() => { fetch("/api/whatsapp/biblioteca").then(r => r.json()).then(d => setLista(Array.isArray(d) ? d : [])).catch(() => setLista([])) }, [])
  if (!lista) return <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>Carregando seus vídeos…</p>
  const visiveis = lista.filter(m => !quebradas.has(m.id))
  if (!visiveis.length) return <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>Nenhum vídeo ou foto enviado recentemente.</p>
  const quebrou = (id: string) => setQuebradas(s => new Set(s).add(id))
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 p-2 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      {visiveis.map(m => {
        const src = `/api/whatsapp/midia/${encodeURIComponent(m.id)}`
        return (
          <button key={m.id} onClick={() => onEscolher(m)} className="relative aspect-[4/3] rounded-lg overflow-hidden bg-black/10 hover:ring-2 ring-[#8456e8]">
            {m.tipo === "video"
              ? <video src={src} preload="metadata" muted onError={() => quebrou(m.id)} className="w-full h-full object-cover" />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={src} alt="" loading="lazy" onError={() => quebrou(m.id)} className="w-full h-full object-cover" />}
            <span className="absolute left-1 bottom-1 w-5 h-5 rounded grid place-items-center bg-black/55 text-white">
              {m.tipo === "video" ? <Video className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
