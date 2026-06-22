"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { gerarDielineSVG } from "./dielineGen"

type LayoutSugerido = {
  tipo: string
  largura: number
  altura: number
  profundidade: number
  abaColagem: number
  materialId: string
  materialNome: string
}

type Msg = {
  role: "user" | "assistant"
  content: string | MsgContent[]
  layout?: LayoutSugerido
}

type MsgContent =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }

type FormaConversa = {
  id: string
  titulo: string
  criadaEm: string
  msgs: Msg[]
}

const STORAGE_KEY = "forma:conversas"
const MAX_CONVERSAS = 25

function parseLayout(text: string): LayoutSugerido | null {
  const match = text.match(/```layout\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

function renderText(text: string) {
  const clean = text.replace(/```layout[\s\S]*?```/g, "").trim()
  return clean
}

function stripImages(msgs: Msg[]): Msg[] {
  return msgs.map(m => {
    if (typeof m.content === "string") return m
    const stripped = m.content.map(c =>
      c.type === "image" ? { type: "text" as const, text: "[imagem]" } : c
    )
    return { ...m, content: stripped }
  })
}

function loadConversas(): FormaConversa[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveConversas(conversas: FormaConversa[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversas.slice(0, MAX_CONVERSAS)))
  } catch {
    // quota exceeded — ignore
  }
}

function msgTitulo(msgs: Msg[]): string {
  const first = msgs.find(m => m.role === "user")
  if (!first) return "Nova conversa"
  const txt = typeof first.content === "string"
    ? first.content
    : first.content.filter(c => c.type === "text").map(c => c.type === "text" ? c.text : "").join("")
  return txt.slice(0, 60) || "Nova conversa"
}

type LayoutCardProps = {
  layout: LayoutSugerido
  onUsar: () => void
}

function LayoutCard({ layout, onUsar }: LayoutCardProps) {
  const svgString = gerarDielineSVG({
    largura:      layout.largura,
    altura:       layout.altura,
    profundidade: layout.profundidade,
    abaColagem:   layout.abaColagem,
    tipo:         layout.tipo,
    nome:         layout.materialNome,
  })

  function downloadSVG() {
    const blob = new Blob([svgString], { type: "image/svg+xml" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `faca-${layout.largura}x${layout.altura}x${layout.profundidade}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl rounded-tl-sm p-4 space-y-3 max-w-[75vw]">
      <p className="text-[10px] uppercase tracking-wide font-bold text-blue-500">Layout sugerido — faca aberta</p>

      <div className="bg-white rounded-xl border border-blue-100 overflow-auto p-2">
        <div
          className="min-w-0"
          dangerouslySetInnerHTML={{ __html: svgString }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          ["Largura",      `${layout.largura} cm`],
          ["Altura",       `${layout.altura} cm`],
          ["Profundidade", `${layout.profundidade} cm`],
          ["Aba colagem",  `${layout.abaColagem} cm`],
          ["Material",     layout.materialNome],
          ["Tipo",         layout.tipo],
        ].map(([l, v]) => (
          <div key={l} className="bg-white rounded-lg px-2.5 py-2 border border-blue-100">
            <p className="text-[9px] text-blue-400 uppercase tracking-wide font-semibold">{l}</p>
            <p className="text-xs font-bold text-slate-800 mt-0.5 leading-tight">{v}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={downloadSVG}
          className="flex-1 py-2 bg-white hover:bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold rounded-xl transition-colors">
          Baixar faca (.svg) ↓
        </button>
        <button
          onClick={onUsar}
          className="flex-1 py-2 bg-slate-900 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition-colors">
          Usar no orçamento →
        </button>
      </div>
    </div>
  )
}

export default function FormaView({
  apiKey,
  materiais,
  onUsarLayout,
}: {
  apiKey: string
  materiais?: Array<{ id: string; nome: string }>
  onUsarLayout: (layout: LayoutSugerido) => void
}) {
  const [msgs, setMsgs]       = useState<Msg[]>([])
  const [input, setInput]     = useState("")
  const [loading, setLoading] = useState(false)
  const [imgB64, setImgB64]   = useState<{ data: string; media_type: string } | null>(null)
  const [imgPreview, setImgPreview] = useState<string | null>(null)
  const [erro, setErro]       = useState("")
  const [conversas, setConversas] = useState<FormaConversa[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const bottomRef  = useRef<HTMLDivElement>(null)
  const fileRef    = useRef<HTMLInputElement>(null)
  const historyRef = useRef<HTMLDivElement>(null)
  const conversaAtualIdRef = useRef<string | null>(null)

  useEffect(() => {
    setConversas(loadConversas())
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [msgs, loading])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false)
      }
    }
    if (showHistory) document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [showHistory])

  const autoSalvar = useCallback((updatedMsgs: Msg[]) => {
    if (updatedMsgs.length === 0) return
    const stripped = stripImages(updatedMsgs)
    const all = loadConversas()

    if (conversaAtualIdRef.current) {
      const idx = all.findIndex(c => c.id === conversaAtualIdRef.current)
      if (idx >= 0) {
        all[idx] = { ...all[idx], msgs: stripped, titulo: msgTitulo(stripped) }
        saveConversas(all)
        setConversas([...all])
        return
      }
    }

    const novaId = crypto.randomUUID()
    conversaAtualIdRef.current = novaId
    const nova: FormaConversa = {
      id: novaId,
      titulo: msgTitulo(stripped),
      criadaEm: new Date().toISOString(),
      msgs: stripped,
    }
    const updated = [nova, ...all]
    saveConversas(updated)
    setConversas(updated)
  }, [])

  function carregarConversa(conversa: FormaConversa) {
    setMsgs(conversa.msgs)
    conversaAtualIdRef.current = conversa.id
    setInput("")
    setImgB64(null)
    setImgPreview(null)
    setErro("")
    setShowHistory(false)
  }

  function deletarConversa(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const updated = conversas.filter(c => c.id !== id)
    saveConversas(updated)
    setConversas(updated)
    if (conversaAtualIdRef.current === id) {
      conversaAtualIdRef.current = null
      setMsgs([])
    }
  }

  function handleImage(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      const [header, data] = dataUrl.split(",")
      const media_type = header.match(/:(.*?);/)?.[1] ?? "image/jpeg"
      setImgB64({ data, media_type })
      setImgPreview(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  async function send() {
    const text = input.trim()
    if (!text && !imgB64) return
    if (!apiKey) { setErro("Configure sua chave de API em Configurações."); return }

    const userContent: MsgContent[] = []
    if (imgB64) userContent.push({ type: "image", source: { type: "base64", ...imgB64 } })
    if (text) userContent.push({ type: "text", text })

    const userMsg: Msg = { role: "user", content: userContent }
    const nextMsgs = [...msgs, userMsg]
    setMsgs(nextMsgs)
    setInput("")
    setImgB64(null)
    setImgPreview(null)
    setErro("")
    setLoading(true)

    const apiMsgs = nextMsgs.map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch("/api/forma", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: apiMsgs, apiKey, materiais }),
      })
      const data = await res.json()
      if (data.error) { setErro(data.error); setLoading(false); return }
      const textBlock = data.content?.find((b: { type: string }) => b.type === "text")
      const replyText = textBlock?.text ?? ""
      const layout = parseLayout(replyText)
      const finalMsgs: Msg[] = [...nextMsgs, { role: "assistant", content: replyText, layout: layout ?? undefined }]
      setMsgs(finalMsgs)
      autoSalvar(finalMsgs)
    } catch {
      setErro("Erro de conexão com a API.")
    }
    setLoading(false)
  }

  function limpar() {
    conversaAtualIdRef.current = null
    setMsgs([])
    setInput("")
    setImgB64(null)
    setImgPreview(null)
    setErro("")
  }

  const semChave = !apiKey

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">

      {/* Header */}
      <div className="shrink-0 px-6 py-3 bg-white border-b border-slate-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
          <span className="text-white text-xs font-black">F</span>
        </div>
        <div>
          <p className="font-bold text-slate-800 text-sm leading-tight">Forma</p>
          <p className="text-[10px] text-slate-400">IA de design de embalagens</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Histórico */}
          <div className="relative" ref={historyRef}>
            <button
              onClick={() => setShowHistory(v => !v)}
              title="Histórico de conversas"
              className="w-8 h-8 flex items-center justify-center border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600 transition-colors relative">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
              </svg>
              {conversas.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-slate-700 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none">
                  {conversas.length > 9 ? "9+" : conversas.length}
                </span>
              )}
            </button>

            {showHistory && (
              <div className="absolute right-0 top-10 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-600">Conversas anteriores</p>
                  <span className="text-[10px] text-slate-400">{conversas.length}/{MAX_CONVERSAS}</span>
                </div>
                {conversas.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">
                    Nenhuma conversa salva ainda.
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                    {conversas.map(c => (
                      <button
                        key={c.id}
                        onClick={() => carregarConversa(c)}
                        className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors group flex items-start gap-2 ${
                          conversaAtualIdRef.current === c.id ? "bg-blue-50" : ""
                        }`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 truncate leading-snug">{c.titulo}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(c.criadaEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            {" · "}{c.msgs.length} msgs
                          </p>
                        </div>
                        <span
                          onClick={e => deletarConversa(c.id, e)}
                          className="mt-0.5 text-slate-300 hover:text-rose-400 text-base leading-none opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-pointer select-none">
                          ×
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {msgs.length > 0 && (
            <button onClick={limpar}
              className="text-[11px] text-slate-400 hover:text-slate-600 border border-slate-200 hover:bg-slate-50 px-2.5 py-1 rounded-lg transition-colors">
              Nova conversa
            </button>
          )}
        </div>
      </div>

      {/* Aviso sem chave */}
      {semChave && (
        <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
          Configure sua chave de API em <strong>Configurações → Chave da API</strong> para usar a Forma.
        </div>
      )}

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        {msgs.length === 0 && !semChave && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center">
              <span className="text-white text-2xl font-black">F</span>
            </div>
            <div>
              <p className="font-bold text-slate-700 text-base">Olá, sou a Forma.</p>
              <p className="text-slate-400 text-sm mt-1 max-w-xs leading-relaxed">
                Descreva um produto ou envie uma imagem de referência e vou sugerir o layout ideal da embalagem.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {[
                "Uma caixa para peptídeos 200g",
                "Embalagem para café especial 250g",
                "Caixa de cosmético premium sérum 30ml",
                "Caixa de chá com sachês",
              ].map(s => (
                <button key={s} onClick={() => { setInput(s) }}
                  className="text-xs bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-full transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-white text-[10px] font-black">F</span>
              </div>
            )}
            <div className={`max-w-[75%] space-y-2`}>
              {Array.isArray(msg.content) && msg.content.filter(c => c.type === "image").map((c, j) => (
                c.type === "image" && (
                  <img key={j} src={`data:${c.source.media_type};base64,${c.source.data}`}
                    className="rounded-xl max-h-48 object-contain border border-slate-200" alt="referência" />
                )
              ))}
              {(() => {
                const txt = typeof msg.content === "string"
                  ? msg.content
                  : msg.content.filter(c => c.type === "text").map(c => c.type === "text" ? c.text : "").join("")
                const clean = renderText(txt)
                if (!clean) return null
                return (
                  <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-slate-900 text-white rounded-tr-sm"
                      : "bg-white border border-slate-100 text-slate-700 rounded-tl-sm shadow-sm"
                  }`}>
                    {clean}
                  </div>
                )
              })()}
              {msg.layout && (
                <LayoutCard layout={msg.layout} onUsar={() => onUsarLayout(msg.layout!)} />
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                V
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-black">F</span>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {erro && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-600">
            {erro}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 bg-white border-t border-slate-100 px-4 py-3 space-y-2">
        {imgPreview && (
          <div className="relative inline-block">
            <img src={imgPreview} className="h-16 rounded-lg border border-slate-200 object-contain" alt="preview" />
            <button onClick={() => { setImgB64(null); setImgPreview(null) }}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-slate-800 text-white rounded-full text-[11px] leading-none flex items-center justify-center hover:bg-rose-500 transition-colors">
              ×
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImage(f); e.target.value = "" }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={semChave}
            title="Enviar imagem de referência"
            className="w-9 h-9 shrink-0 flex items-center justify-center border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 3h18M3 21h18" />
            </svg>
          </button>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
            disabled={semChave || loading}
            placeholder="Descreva o produto ou a embalagem desejada…"
            rows={1}
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent resize-none disabled:opacity-40 transition"
            style={{ maxHeight: 120, overflowY: "auto" }}
          />
          <button
            onClick={send}
            disabled={semChave || loading || (!input.trim() && !imgB64)}
            className="w-9 h-9 shrink-0 bg-slate-900 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.269 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-slate-300 text-center">Enter para enviar · Shift+Enter para nova linha · imagens aceitas</p>
      </div>

    </div>
  )
}
