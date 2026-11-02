"use client"

// Janela de envio pelo sistema: mensagem pronta para revisar/editar e enviar pelo seu número.
// Usada pelos botões de WhatsApp do Painel e do celular (e, depois, pela aprovação do agente).

import { useEffect, useState } from "react"
import { X, SendHorizontal, ExternalLink, CircleCheck } from "lucide-react"

export type Envio = { cliente: string; texto?: string; modelo?: string; numero?: string }

export function EnviarWhatsapp({ envio, linkWhatsapp, onFechar }: { envio: Envio; linkWhatsapp?: string; onFechar: () => void }) {
  const [texto, setTexto] = useState(envio.texto ?? "")
  const [carregando, setCarregando] = useState(!envio.texto && !!envio.modelo)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  useEffect(() => {
    if (envio.texto || !envio.modelo) return
    const q = new URLSearchParams({ modelo: envio.modelo, nome: envio.cliente, numero: envio.numero ?? "", formato: "json" })
    fetch(`/api/cliente/whatsapp?${q}`).then(r => r.json()).then(d => setTexto(d.texto ?? "")).catch(() => {}).finally(() => setCarregando(false))
  }, [envio])
  async function enviar() {
    setEnviando(true); setErro(null)
    const r = await fetch("/api/whatsapp/enviar-cliente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cliente: envio.cliente, texto }) }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    if (r?.ok) setEnviado(true); else setErro(d?.erro ?? "Sem conexão.")
    setEnviando(false)
  }
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e => { if (e.target === e.currentTarget) onFechar() }}
      style={{ background: "rgba(25,22,37,0.38)" }}>
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl p-5 space-y-3 shadow-2xl" style={{ background: "var(--bg-surface)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--text-main)" }}>Mensagem para {envio.cliente}</p>
            <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>Revise e envie pelo seu número. Ela aparece também na conversa do sistema.</p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-full grid place-items-center hover:bg-black/5" style={{ color: "var(--text-sub)" }}><X className="w-4 h-4" /></button>
        </div>
        {enviado ? (
          <div className="py-6 text-center space-y-2">
            <CircleCheck className="w-10 h-10 mx-auto text-[#009351]" />
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-main)" }}>Enviada</p>
            <button onClick={onFechar} className="text-[13px] font-semibold text-[#8456e8]">Fechar</button>
          </div>
        ) : <>
          <textarea value={carregando ? "Montando a mensagem…" : texto} onChange={e => setTexto(e.target.value)} rows={7} disabled={carregando}
            className="w-full rounded-xl px-3.5 py-3 text-[13.5px] leading-relaxed outline-none resize-y"
            style={{ background: "var(--bg-page)", color: "var(--text-main)", border: "1px solid var(--border)" }} />
          {erro && <p className="text-[12.5px] text-[#d33a3c]">{erro}</p>}
          <div className="flex items-center gap-2">
            {linkWhatsapp && (
              <a href={linkWhatsapp} target="_blank" rel="noreferrer" className="text-[12.5px] font-medium flex items-center gap-1.5 px-3 h-10" style={{ color: "var(--text-sub)" }}>
                <ExternalLink className="w-4 h-4" />Abrir no WhatsApp
              </a>
            )}
            <button onClick={enviar} disabled={enviando || carregando || !texto.trim()}
              className="ml-auto h-10 px-5 rounded-xl text-white text-[13.5px] font-semibold flex items-center gap-2 disabled:opacity-50" style={{ background: "#25a35a" }}>
              <SendHorizontal className="w-4 h-4" />{enviando ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </>}
      </div>
    </div>
  )
}
