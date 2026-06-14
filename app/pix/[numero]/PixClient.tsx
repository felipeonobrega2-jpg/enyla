"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { gerarPixPayload } from "@/app/lib/pix"

const CHAVE_PIX = "financeiro@enyla.com.br"
const NOME_RECEBEDOR = "Enyla"
const CIDADE = "Natal"

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

type CopyState = "idle" | "copied"

function CopyButton({
  text,
  label,
  sublabel,
  accent = "#007AFF",
}: {
  text: string
  label: string
  sublabel?: string
  accent?: string
}) {
  const [state, setState] = useState<CopyState>("idle")

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setState("copied")
      setTimeout(() => setState("idle"), 2000)
    })
  }

  const copied = state === "copied"

  return (
    <button
      onClick={copy}
      className="w-full rounded-2xl border transition-all active:scale-[0.98]"
      style={{
        background: copied ? `${accent}10` : "white",
        borderColor: copied ? accent : "rgba(60,60,67,0.12)",
        padding: "14px 16px",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-left min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#8E8E93" }}>
            {label}
          </p>
          {sublabel && (
            <p className="mt-0.5 text-[13px] font-mono truncate" style={{ color: "#1C1C1E" }}>
              {sublabel}
            </p>
          )}
        </div>
        <div
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all"
          style={{
            background: copied ? accent : `${accent}15`,
            color: copied ? "white" : accent,
          }}
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Copiado
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
              </svg>
              Copiar
            </>
          )}
        </div>
      </div>
    </button>
  )
}

export default function PixClient({
  numero,
  valor,
  cliente,
}: {
  numero: string
  valor: number
  cliente: string
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  const payload = gerarPixPayload({
    chave: CHAVE_PIX,
    nome: NOME_RECEBEDOR,
    cidade: CIDADE,
    valor,
    txid: numero.replace(/[^a-zA-Z0-9]/g, "").slice(0, 25),
    descricao: `Pedido ${numero}`,
  })

  useEffect(() => {
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
      color: { dark: "#1C1C1E", light: "#FFFFFF" },
    })
      .then(setQrDataUrl)
      .catch(() => {})
  }, [payload])

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, #f5f5f7 0%, #ececf1 100%)" }}
    >
      {/* Header */}
      <div className="px-5 pt-12 pb-6 text-center">
        <p
          className="text-[11px] font-bold tracking-[0.12em] uppercase mb-1"
          style={{ color: "#007AFF" }}
        >
          Enyla Embalagens
        </p>
        <p className="text-[22px] font-bold" style={{ color: "#1C1C1E", letterSpacing: "-0.5px" }}>
          Pagamento via PIX
        </p>
        {cliente && (
          <p className="mt-1 text-[14px]" style={{ color: "#8E8E93" }}>
            Olá, {cliente.split(" ")[0]} 👋
          </p>
        )}
      </div>

      {/* Card principal */}
      <div className="flex-1 px-4 pb-10 space-y-3 max-w-sm mx-auto w-full">

        {/* Valor + pedido */}
        <div
          className="rounded-3xl px-5 py-5 text-center shadow-sm"
          style={{ background: "white", border: "1px solid rgba(60,60,67,0.08)" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#8E8E93" }}>
            Pedido {numero}
          </p>
          <p
            className="text-[38px] font-bold tabular-nums leading-none"
            style={{ color: "#1C1C1E", letterSpacing: "-1px" }}
          >
            {valor > 0 ? brl(valor) : "—"}
          </p>
          {valor > 0 && (
            <p className="mt-1.5 text-[12px]" style={{ color: "#34C759" }}>
              Valor já preenchido automaticamente
            </p>
          )}
        </div>

        {/* QR Code */}
        <div
          className="rounded-3xl px-5 py-5 flex flex-col items-center gap-3 shadow-sm"
          style={{ background: "white", border: "1px solid rgba(60,60,67,0.08)" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide self-start" style={{ color: "#8E8E93" }}>
            QR Code PIX
          </p>

          <div
            className="rounded-2xl p-3"
            style={{ background: "#F2F2F7" }}
          >
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR Code PIX"
                width={200}
                height={200}
                className="rounded-xl block"
              />
            ) : (
              <div
                className="w-[200px] h-[200px] rounded-xl flex items-center justify-center"
                style={{ background: "#F2F2F7" }}
              >
                <div
                  className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: "#007AFF", borderTopColor: "transparent" }}
                />
              </div>
            )}
          </div>

          <p className="text-[11.5px] text-center" style={{ color: "#8E8E93" }}>
            Aponte a câmera do seu banco para o código acima
          </p>
        </div>

        {/* Copiar chave */}
        <CopyButton
          text={CHAVE_PIX}
          label="Chave PIX (e-mail)"
          sublabel={CHAVE_PIX}
          accent="#007AFF"
        />

        {/* Copiar código completo */}
        <CopyButton
          text={payload}
          label="PIX Copia e Cola"
          sublabel={payload.slice(0, 32) + "…"}
          accent="#34C759"
        />

        {/* Rodapé informativo */}
        <div
          className="rounded-2xl px-4 py-4 flex gap-3"
          style={{ background: "rgba(0,122,255,0.06)", border: "1px solid rgba(0,122,255,0.12)" }}
        >
          <svg className="w-4 h-4 mt-0.5 shrink-0 text-[#007AFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
          </svg>
          <div className="space-y-0.5">
            <p className="text-[12px] font-semibold" style={{ color: "#007AFF" }}>
              Pagamento instantâneo
            </p>
            <p className="text-[11.5px] leading-relaxed" style={{ color: "rgba(0,122,255,0.75)" }}>
              Funciona em qualquer app de banco. Após o pagamento, envie o comprovante pelo WhatsApp.
            </p>
          </div>
        </div>

        {/* Branding */}
        <p className="text-center text-[10.5px] pt-2" style={{ color: "rgba(60,60,67,0.3)" }}>
          Enyla Embalagens · {CIDADE}
        </p>
      </div>
    </div>
  )
}
