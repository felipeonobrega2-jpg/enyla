"use client"

import { useState, useRef, useEffect, Fragment } from "react"

type Msg = { role: "user" | "assistant"; content: string }

// Markdown leve só pro que a Forma realmente usa: **negrito**, parágrafos e
// listas com "-"/"—". Sem dependência externa — não precisamos de markdown
// completo (tabela, código, títulos) numa bolha de chat estreita.
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={`${keyPrefix}-${i}`} className="font-semibold">{part}</strong> : <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>
  )
}

function renderMarkdownLite(text: string) {
  const blocks = text.trim().split(/\n{2,}/)
  return blocks.map((block, bi) => {
    const lines = block.split("\n").filter(l => l.trim())
    const isList = lines.length > 0 && lines.every(l => /^[-—*]\s+/.test(l.trim()))
    if (isList) {
      return (
        <ul key={bi} className="space-y-1 my-1.5 list-none">
          {lines.map((l, li) => (
            <li key={li} className="flex gap-1.5">
              <span className="text-slate-400 shrink-0">·</span>
              <span>{renderInline(l.trim().replace(/^[-—*]\s+/, ""), `${bi}-${li}`)}</span>
            </li>
          ))}
        </ul>
      )
    }
    return (
      <p key={bi} className={bi > 0 ? "mt-2" : ""}>
        {lines.map((l, li) => (
          <Fragment key={li}>
            {li > 0 && <br />}
            {renderInline(l, `${bi}-${li}`)}
          </Fragment>
        ))}
      </p>
    )
  })
}

const STORAGE_KEY = "assistente:conversa"

function loadMsgs(): Msg[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveMsgs(msgs: Msg[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs))
  } catch {
    // quota exceeded — ignore
  }
}

export default function FormaBubble({ apiKey }: { apiKey: string }) {
  const [open, setOpen]       = useState(false)
  const [msgs, setMsgs]       = useState<Msg[]>([])
  const [input, setInput]     = useState("")
  const [loading, setLoading] = useState(false)
  const [erro, setErro]       = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMsgs(loadMsgs())
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [msgs, loading, open])

  async function send() {
    const text = input.trim()
    if (!text) return
    if (!apiKey) { setErro("Configure sua chave de API em Configurações."); return }

    const nextMsgs: Msg[] = [...msgs, { role: "user", content: text }]
    setMsgs(nextMsgs)
    setInput("")
    setErro("")
    setLoading(true)

    try {
      const res = await fetch("/api/assistente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: nextMsgs, apiKey }),
      })
      const data = await res.json()
      if (data.error) { setErro(data.error); setLoading(false); return }
      const textBlock = data.content?.find((b: { type: string }) => b.type === "text")
      const finalMsgs: Msg[] = [...nextMsgs, { role: "assistant", content: textBlock?.text ?? "" }]
      setMsgs(finalMsgs)
      saveMsgs(finalMsgs)
    } catch {
      setErro("Erro de conexão com a API.")
    }
    setLoading(false)
  }

  function limpar() {
    setMsgs([])
    saveMsgs([])
    setErro("")
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <div className="w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="shrink-0 px-4 py-3 bg-slate-900 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}>
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-[12.5px] font-semibold leading-tight">Forma</p>
              <p className="text-zinc-500 text-[10px] leading-tight">Pergunte qualquer coisa sobre o sistema</p>
            </div>
            {msgs.length > 0 && (
              <button onClick={limpar} title="Limpar conversa"
                className="text-zinc-500 hover:text-zinc-300 text-[11px] font-medium px-1.5 transition-colors">
                Limpar
              </button>
            )}
            <button onClick={() => setOpen(false)} title="Fechar"
              className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50">
            {msgs.length === 0 && (
              <div className="text-center text-slate-400 text-[12px] mt-10 px-4">
                Pergunte sobre faturamento, pedidos, clientes, pagamentos pendentes ou qualquer dado do sistema.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-[12.5px] leading-relaxed ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-sm whitespace-pre-wrap"
                    : "bg-white border border-slate-200 text-slate-700 rounded-tl-sm"
                }`}>
                  {m.role === "assistant" ? renderMarkdownLite(m.content) : m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-3 py-2 flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:-0.2s]" />
                  <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:-0.1s]" />
                  <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
                </div>
              </div>
            )}
            {erro && <p className="text-rose-500 text-[11px] text-center">{erro}</p>}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 p-3 border-t border-slate-100 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Pergunte algo..."
              disabled={loading}
              className="flex-1 h-9 px-3 rounded-xl border border-slate-200 text-[12.5px] outline-none focus:border-indigo-400 transition-colors disabled:bg-slate-50"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-opacity"
              style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.269 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Bolinha flutuante */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Forma — assistente do sistema"
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
        style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}
      >
        {open ? (
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
          </svg>
        )}
      </button>
    </div>
  )
}
