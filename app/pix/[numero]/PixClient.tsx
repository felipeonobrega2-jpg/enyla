"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import QRCode from "qrcode"
import { gerarPixPayload } from "@/app/lib/pix"

const CHAVE_PIX      = "financeiro@enyla.com.br"
const NOME_RECEBEDOR = "Enyla"
const CIDADE         = "Natal"

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

interface PixData { valor: number; cliente: string; expISO: string | null }

function useCountdown(expISO: string | null) {
  const [msLeft, setMsLeft] = useState<number>(() =>
    expISO ? Math.max(0, new Date(expISO).getTime() - Date.now()) : -1
  )
  useEffect(() => {
    if (!expISO) return
    const tick = () => setMsLeft(Math.max(0, new Date(expISO).getTime() - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expISO])
  return msLeft
}

function fmtCountdown(ms: number) {
  const t = Math.floor(ms / 1000)
  const pad = (n: number) => String(n).padStart(2, "0")
  return { h: pad(Math.floor(t / 3600)), m: pad(Math.floor((t % 3600) / 60)), s: pad(t % 60) }
}

function fmtExpTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

export default function PixClient({ numero }: { numero: string }) {
  // Read URL params directly on the client — most reliable across all browsers/devices
  const params = useSearchParams()
  const v = params.get("v")
  // support both ?e= (new short) and ?exp= (old format)
  const e = params.get("e") ?? params.get("exp")
  const c = params.get("c")

  const fromUrl: PixData | null = v
    ? { valor: parseFloat(v) || 0, cliente: c ?? "", expISO: e }
    : null

  const [apiData,   setApiData]   = useState<PixData | null>(null)
  const [loading,   setLoading]   = useState(!fromUrl)
  const [notFound,  setNotFound]  = useState(false)
  const [copied,    setCopied]    = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  const data: PixData | null = fromUrl ?? apiData

  useEffect(() => {
    if (fromUrl) return // URL params present — use them directly
    // Short URL: fetch from DB
    fetch(`/api/pix-link/${encodeURIComponent(numero)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: PixData) => setApiData(d))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numero])

  const msLeft  = useCountdown(data?.expISO ?? null)
  const expired = data?.expISO != null && msLeft === 0

  const payload = data ? gerarPixPayload({
    chave: CHAVE_PIX, nome: NOME_RECEBEDOR, cidade: CIDADE,
    valor: data.valor,
    txid: numero.replace(/[^a-zA-Z0-9]/g, "").slice(0, 25),
    descricao: `Lote ${numero}`,
  }) : ""

  useEffect(() => {
    if (!payload || expired) return
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M", margin: 1, width: 320,
      color: { dark: "#1C1C1E", light: "#FFFFFF" },
    }).then(setQrDataUrl).catch(() => {})
  }, [payload, expired])

  function copy() {
    navigator.clipboard.writeText(payload).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    })
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: "#1C1C1E", borderTopColor: "transparent" }} />
      </div>
    )
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  if (notFound || !data) {
    return (
      <div className="min-h-[100dvh] bg-white flex flex-col items-center justify-center px-5 text-center gap-4">
        <Image src="/brand/enyla-wordmark-dark.png" alt="Enyla" width={1335} height={328}
          className="h-3.5 w-auto opacity-60" />
        <p className="text-[18px] font-bold text-[#1C1C1E]">Link inválido</p>
        <p className="text-[13px] text-[#8E8E93]">Solicite um novo link ao vendedor.</p>
      </div>
    )
  }

  // ── Urgency ───────────────────────────────────────────────────────────────
  const nearEnd  = msLeft >= 0 && msLeft < 30 * 60 * 1000
  const urgent   = msLeft >= 0 && msLeft < 60 * 60 * 1000
  const timerBg  = nearEnd ? "#FF3B30" : urgent ? "#FF9500" : "#1C1C1E"

  // ── Expired ───────────────────────────────────────────────────────────────
  if (expired) {
    return (
      <div className="min-h-[100dvh] bg-white flex flex-col items-center justify-center px-5 text-center gap-4">
        <Image src="/brand/enyla-wordmark-dark.png" alt="Enyla" width={1335} height={328}
          className="h-3.5 w-auto opacity-60" />
        <div className="w-14 h-14 rounded-full bg-[#FF3B30]/10 flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#FF3B30" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <p className="text-[18px] font-bold text-[#1C1C1E]">Link expirado</p>
        <p className="text-[13px] text-[#8E8E93]">Solicite um novo link ao vendedor.</p>
      </div>
    )
  }

  const timer = (data.expISO && msLeft >= 0) ? fmtCountdown(msLeft) : null
  const { valor, cliente, expISO } = data

  return (
    <div className="min-h-[100dvh] bg-white flex flex-col">

      {/* ── Countdown banner ─────────────────────────────────────────────── */}
      {expISO && timer && (
        <div className={`w-full flex items-center justify-center gap-3 px-4 py-3 transition-colors duration-500 ${nearEnd ? "animate-pulse" : ""}`}
          style={{ background: timerBg }}>
          <div className="flex items-center gap-1">
            {[timer.h, timer.m, timer.s].map((unit, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="flex gap-[2px]">
                  {unit.split("").map((d, j) => (
                    <span key={j}
                      className="inline-flex items-center justify-center w-6 h-8 rounded-md text-[15px] font-bold tabular-nums text-white"
                      style={{ background: "rgba(255,255,255,0.18)" }}>
                      {d}
                    </span>
                  ))}
                </div>
                {i < 2 && <span className="text-[14px] font-bold text-white opacity-70 mx-0.5">:</span>}
              </div>
            ))}
          </div>
          <div className="text-white">
            <p className="text-[11px] font-semibold leading-tight opacity-90">
              {nearEnd ? "Expirando agora!" : urgent ? "Expira em breve" : "Link válido até"}
            </p>
            <p className="text-[10px] opacity-60 leading-tight">{fmtExpTime(expISO)}</p>
          </div>
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center px-5 pt-7 pb-8 w-full max-w-[360px] mx-auto">

        <Image src="/brand/enyla-wordmark-dark.png" alt="Enyla" width={1335} height={328}
          className="h-3.5 w-auto opacity-60 mb-6" />

        <div className="rounded-2xl overflow-hidden mb-6"
          style={{ background: "#F7F7F7", padding: "14px", border: "1px solid rgba(0,0,0,0.07)" }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR Code PIX" width={210} height={210}
              className="block rounded-xl" style={{ imageRendering: "pixelated" }} />
          ) : (
            <div className="w-[210px] h-[210px] flex items-center justify-center">
              <div className="w-5 h-5 border-2 rounded-full animate-spin"
                style={{ borderColor: "#1C1C1E", borderTopColor: "transparent" }} />
            </div>
          )}
        </div>

        <div className="text-center mb-6 w-full">
          <p className="text-[12px] text-[#8E8E93] mb-1">
            Lote {numero}{cliente ? ` · ${cliente.split(" ")[0]}` : ""}
          </p>
          <p className="font-bold text-[#1C1C1E] tabular-nums leading-none"
            style={{ fontSize: "clamp(32px, 10vw, 46px)", letterSpacing: "-1.5px" }}>
            {valor > 0 ? brl(valor) : "—"}
          </p>
        </div>

        <button onClick={copy}
          className="w-full py-4 rounded-2xl text-[15px] font-semibold transition-all duration-200 active:scale-[0.98] mb-8"
          style={{ background: copied ? "#34C759" : "#1C1C1E", color: "white" }}>
          {copied ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Código copiado!
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
              </svg>
              Copiar código PIX
            </span>
          )}
        </button>

        <div className="w-full space-y-3.5">
          {([
            <>Abra o app do banco e acesse <strong className="text-[#1C1C1E]">PIX → Copia e Cola</strong></>,
            <>Cole o código e confirme o valor {valor > 0 && <strong className="text-[#1C1C1E]">{brl(valor)}</strong>}</>,
            <>Envie o comprovante pelo <strong className="text-[#1C1C1E]">WhatsApp</strong></>,
          ] as React.ReactNode[]).map((text, i) => (
            <div key={i} className="flex gap-3 items-start">
              <span className="shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center mt-0.5"
                style={{ background: "rgba(0,0,0,0.06)", color: "#1C1C1E" }}>
                {i + 1}
              </span>
              <p className="text-[13px] text-[#8E8E93] leading-snug">{text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="py-4 text-center">
        <p className="text-[10px] tracking-wide" style={{ color: "rgba(60,60,67,0.25)" }}>enyla.com.br</p>
      </div>
    </div>
  )
}
