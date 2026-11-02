"use client"

import { useEffect, useState } from "react"
import { Mic, Square, Trash2, SendHorizontal, Check, Loader2, X } from "lucide-react"
import { useGravador, tempo, extensaoAudio } from "../lib/gravador"

// Tela cheia de gravação no celular: usada pelo link (/gravar) e pelo sistema do celular quando o computador pede
export function GravarClient({ token, nome, expira, onFechar, onEnviado }: { token: string; nome: string | null; expira: number | null; onFechar?: () => void; onEnviado?: () => void }) {
  const grav = useGravador()
  const [enviando, setEnviando] = useState(false)
  const [enviados, setEnviados] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t) }, [])
  const vencido = !nome || !expira || expira <= agora

  async function enviar() {
    const blob = grav.estado === "gravando" ? await grav.parar() : grav.audio?.blob
    if (!blob) return
    setEnviando(true); setErro(null)
    const f = new FormData()
    f.set("t", token); f.set("audio", new File([blob], `voz.${extensaoAudio(blob.type)}`, { type: blob.type }))
    const r = await fetch("/api/gravar", { method: "POST", body: f }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    setEnviando(false)
    if (r?.ok) { setEnviados(n => n + 1); grav.cancelar(); onEnviado?.() } else setErro(d?.erro ?? "Não enviou. Tente de novo.")
  }

  const gravando = grav.estado === "gravando"
  return (
    <main className="min-h-dvh flex flex-col items-center justify-between px-6 py-10 text-white relative" style={{ background: "linear-gradient(180deg,#191625,#0b0914)" }}>
      {onFechar && <button onClick={() => { grav.cancelar(); onFechar() }} aria-label="Fechar" className="absolute top-4 right-4 w-10 h-10 rounded-full grid place-items-center bg-white/10"><X className="w-5 h-5" /></button>}
      <div className="text-center">
        <p className="text-[13px] text-white/50">Áudio para</p>
        <h1 className="text-[24px] font-semibold mt-1">{nome ?? "—"}</h1>
        {!vencido && <p className="text-[12px] text-white/40 mt-1">link vale mais {tempo(Math.max(0, Math.round((expira! - agora) / 1000)))}</p>}
      </div>

      {vencido ? (
        <p className="text-center text-[15px] text-white/70 max-w-xs">Este link venceu. No computador, clique no microfone da conversa e escolha “Gravar no celular” de novo.</p>
      ) : (
        <div className="flex flex-col items-center gap-6 w-full max-w-sm">
          <div className="h-16 w-full flex items-center justify-center gap-[3px]">
            {gravando ? grav.niveis.map((n, i) => <span key={i} className="w-[4px] rounded-full bg-[#25d366]" style={{ height: `${Math.max(10, n * 100)}%`, opacity: 0.5 + n * 0.5 }} />)
              : grav.estado === "pronto" && grav.audio ? <audio controls src={grav.audio.url} className="w-full" />
              : enviados ? <p className="text-[#25d366] flex items-center gap-2 text-[15px] font-semibold"><Check className="w-5 h-5" />Enviado{enviados > 1 ? ` (${enviados})` : ""}</p>
              : <p className="text-white/50 text-[14px]">Toque no microfone para gravar</p>}
          </div>
          <p className="text-[34px] font-semibold tabular-nums">{gravando || grav.estado === "pronto" ? tempo(grav.segundos) : "0:00"}</p>

          <div className="flex items-center gap-6">
            {(gravando || grav.estado === "pronto") && (
              <button onClick={grav.cancelar} aria-label="Descartar" className="w-14 h-14 rounded-full grid place-items-center bg-white/10 text-[#ff6b6b]"><Trash2 className="w-6 h-6" /></button>
            )}
            {gravando ? (
              <button onClick={() => grav.parar()} aria-label="Parar" className="w-24 h-24 rounded-full grid place-items-center bg-[#d33a3c] shadow-[0_0_0_10px_rgba(211,58,60,0.2)]"><Square className="w-9 h-9 fill-white" /></button>
            ) : grav.estado === "pronto" ? null : (
              <button onClick={grav.iniciar} disabled={grav.estado === "pedindo"} aria-label="Gravar" className="w-24 h-24 rounded-full grid place-items-center bg-[#25a35a] shadow-[0_0_0_10px_rgba(37,163,90,0.18)] active:scale-95 transition-transform">
                <Mic className="w-10 h-10" />
              </button>
            )}
            {(gravando || grav.estado === "pronto") && (
              <button onClick={enviar} disabled={enviando} aria-label="Enviar" className="w-14 h-14 rounded-full grid place-items-center bg-[#25a35a]">
                {enviando ? <Loader2 className="w-6 h-6 animate-spin" /> : <SendHorizontal className="w-6 h-6" />}
              </button>
            )}
          </div>
          {(erro || grav.erro) && <p className="text-[13px] text-[#ff8a8a] text-center">{erro || grav.erro}</p>}
        </div>
      )}
      <p className="text-[11px] text-white/30">ENYLA · o áudio sai pelo seu WhatsApp</p>
    </main>
  )
}
