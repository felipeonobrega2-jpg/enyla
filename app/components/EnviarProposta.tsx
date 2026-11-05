"use client"

// Enviar a proposta ao cliente em um clique: o PDF (o mesmo visual de sempre, já como arquivo), a conversa dele
// achada sozinha e a mensagem com o link de aprovação. Sai pelo seu número e aparece na conversa do sistema.

import { useEffect, useState } from "react"
import { X, CircleCheck, SendHorizontal, Download, FileText, Loader2, ExternalLink } from "lucide-react"
import { htmlParaPdf, baixarArquivo } from "../lib/pdfArquivo"
import { normalizarTelefone } from "../lib/contatos"

type Destino = { jid: string | null; nome?: string; como?: "conversa" | "telefone"; telefone?: string }

const kb = (n: number) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.round(n / 1024)} KB`

export function EnviarProposta({ cliente, numero, gerarHtml, mensagem, onFechar }: {
  cliente: string
  numero?: string
  gerarHtml: () => Promise<string>
  mensagem: (linkAprovacao: string | null) => string
  onFechar: () => void
}) {
  const nomeArquivo = `Proposta ${numero ?? cliente}.pdf`.replace(/[\\/:*?"<>|]/g, "-")
  const [pdf, setPdf] = useState<File | null>(null)
  const [erroPdf, setErroPdf] = useState<string | null>(null)
  const [destino, setDestino] = useState<Destino | null>(null)
  const [telefone, setTelefone] = useState("")
  const [texto, setTexto] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    gerarHtml().then(h => htmlParaPdf(h, nomeArquivo)).then(setPdf).catch(e => setErroPdf(String(e?.message ?? e)))
    fetch(`/api/whatsapp/destino?cliente=${encodeURIComponent(cliente)}`).then(r => r.json()).then(setDestino).catch(() => setDestino({ jid: null }))
    const link = numero ? fetch(`/api/aprovacao/link?numero=${encodeURIComponent(numero)}`).then(r => r.ok ? r.json() : null).then(d => d?.url ?? null).catch(() => null) : Promise.resolve(null)
    link.then(l => setTexto(mensagem(l)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const telDigitado = normalizarTelefone(telefone)
  const jid = destino?.jid ?? (telDigitado ? `${telDigitado}@s.whatsapp.net` : null)

  async function enviar() {
    if (!pdf || !jid) return
    setEnviando(true); setErro(null)
    const f = new FormData()
    f.set("jid", jid); f.set("arquivo", pdf); f.set("legenda", texto ?? "")
    const r = await fetch("/api/whatsapp/enviar", { method: "POST", body: f }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    if (r?.ok) setEnviado(true); else setErro(d?.erro ?? "Sem conexão.")
    setEnviando(false)
  }

  const waMe = `https://wa.me/${destino?.telefone ?? telDigitado ?? ""}?text=${encodeURIComponent(texto ?? "")}`

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e => { if (e.target === e.currentTarget) onFechar() }}
      style={{ background: "rgba(25,22,37,0.38)" }}>
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl p-5 space-y-3 shadow-2xl" style={{ background: "var(--bg-surface)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold" style={{ color: "var(--text-main)" }}>Enviar proposta para {cliente}</p>
            <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
              {!destino ? "Procurando a conversa…"
                : destino.como === "conversa" ? `Na conversa ${destino.nome ? `“${destino.nome}”` : "dele"} do WhatsApp.`
                : destino.como === "telefone" ? `Pelo telefone do cadastro (+${destino.telefone}).`
                : "Não achei a conversa nem telefone no cadastro: digite o número."}
            </p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-full grid place-items-center hover:bg-black/5 shrink-0" style={{ color: "var(--text-sub)" }}><X className="w-4 h-4" /></button>
        </div>

        {enviado ? (
          <div className="py-6 text-center space-y-2">
            <CircleCheck className="w-10 h-10 mx-auto text-[#009351]" />
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-main)" }}>Proposta enviada</p>
            <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>O PDF e a mensagem já estão na conversa.</p>
            <button onClick={onFechar} className="text-[13px] font-semibold text-[#8456e8]">Fechar</button>
          </div>
        ) : <>
          {destino && !destino.jid && (
            <input value={telefone} onChange={e => setTelefone(e.target.value)} inputMode="tel" placeholder="WhatsApp com DDD, ex.: 11 98765-4321"
              className="w-full h-10 rounded-xl px-3.5 text-[13.5px] outline-none"
              style={{ background: "var(--bg-page)", color: "var(--text-main)", border: "1px solid var(--border)" }} />
          )}

          <div className="flex items-center gap-3 rounded-xl px-3.5 py-2.5" style={{ background: "var(--bg-page)", border: "1px solid var(--border)" }}>
            <FileText className="w-5 h-5 text-[#8456e8] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{nomeArquivo}</p>
              <p className="text-[11px]" style={{ color: erroPdf ? "#d33a3c" : "var(--text-faint)" }}>
                {erroPdf ? `Não consegui gerar o PDF (${erroPdf.slice(0, 80)})` : pdf ? kb(pdf.size) : "Gerando o PDF…"}
              </p>
            </div>
            {pdf ? <button onClick={() => baixarArquivo(pdf)} title="Baixar o PDF" className="w-8 h-8 rounded-lg grid place-items-center hover:bg-black/5" style={{ color: "var(--text-sub)" }}><Download className="w-4 h-4" /></button>
              : !erroPdf && <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-faint)" }} />}
          </div>

          <textarea value={texto ?? "Montando a mensagem…"} onChange={e => setTexto(e.target.value)} rows={8} disabled={texto == null}
            className="w-full rounded-xl px-3.5 py-3 text-[13.5px] leading-relaxed outline-none resize-y"
            style={{ background: "var(--bg-page)", color: "var(--text-main)", border: "1px solid var(--border)" }} />
          {erro && <p className="text-[12.5px] text-[#d33a3c]">{erro}</p>}

          <div className="flex items-center gap-2">
            <a href={waMe} target="_blank" rel="noreferrer" className="text-[12.5px] font-medium flex items-center gap-1.5 px-2 h-10" style={{ color: "var(--text-sub)" }}
              title="Abre o WhatsApp com a mensagem; o PDF você anexa">
              <ExternalLink className="w-4 h-4" />Abrir no WhatsApp
            </a>
            <button onClick={enviar} disabled={enviando || !pdf || !jid || texto == null}
              className="ml-auto h-10 px-5 rounded-xl text-white text-[13.5px] font-semibold flex items-center gap-2 disabled:opacity-50" style={{ background: "#25a35a" }}>
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}{enviando ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </>}
      </div>
    </div>
  )
}
