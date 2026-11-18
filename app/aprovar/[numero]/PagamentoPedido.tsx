"use client"

import { useEffect, useRef, useState } from "react"
import { CreditCard, QrCode, Lock, AlertCircle, CircleCheck, Clock, Loader2 } from "lucide-react"

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

type Controlador = { unmount: () => void }
type MPGlobal = new (chave: string, opts: { locale: string }) => { bricks: () => { create: (tipo: string, alvo: string, cfg: unknown) => Promise<Controlador> } }
declare global { interface Window { MercadoPago?: MPGlobal; MP_DEVICE_SESSION_ID?: string } }

// Carrega um script uma vez só
function carregar(src: string, attrs: Record<string, string> = {}) {
  return new Promise<void>((ok, erro) => {
    if (document.querySelector(`script[src="${src}"]`)) { ok(); return }
    const s = document.createElement("script")
    s.src = src; s.async = true
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v)
    s.onload = () => ok(); s.onerror = () => erro(new Error(src))
    document.head.appendChild(s)
  })
}

export function PagamentoPedido({ numero, token, total, sinal, sinalPct, pix, parcelasMax, nomeInicial, chavePublica }: {
  numero: string; token: string; total: number; sinal: number; sinalPct: number; pix: string; parcelasMax: number; nomeInicial?: string; chavePublica: string
}) {
  const [modo, setModo] = useState<"pix" | "cartao">("cartao")
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pago, setPago] = useState<{ analise?: boolean; parcelas: number } | null>(null)
  const controlador = useRef<Controlador | null>(null)

  useEffect(() => {
    if (modo !== "cartao" || pago || !chavePublica) return
    let vivo = true
    setPronto(false)
    ;(async () => {
      try {
        // Antifraude do Mercado Pago (identifica o aparelho: aumenta a aprovação)
        carregar("https://www.mercadopago.com/v2/security.js", { view: "checkout" }).catch(() => {})
        await carregar("https://sdk.mercadopago.com/js/v2")
        if (!vivo || !window.MercadoPago) return
        const mp = new window.MercadoPago(chavePublica, { locale: "pt-BR" })
        controlador.current = await mp.bricks().create("cardPayment", "cartao_mp", {
          initialization: { amount: total },
          customization: {
            paymentMethods: { maxInstallments: parcelasMax, minInstallments: 1, types: { excluded: ["debit_card", "prepaid_card"] } },
            visual: { style: { theme: "default", customVariables: { baseColor: "#8456e8", borderRadiusMedium: "12px", borderRadiusLarge: "16px" } }, texts: { formSubmit: `Pagar ${brl(total)}` } },
          },
          callbacks: {
            onReady: () => vivo && setPronto(true),
            onError: (e: unknown) => console.error("[mp brick]", e),
            onSubmit: async (dados: unknown) => {
              setErro(null)
              const r = await fetch(`/api/aprovar/${encodeURIComponent(numero)}/cartao`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ t: token, cartao: dados, sessao: window.MP_DEVICE_SESSION_ID, nome: nomeInicial }),
              }).catch(() => null)
              const d = r ? await r.json().catch(() => ({})) : {}
              if (!r || !r.ok || !d.ok) { setErro(d.erro ?? "Sem conexão. Verifique a internet e tente de novo."); return }
              setPago({ analise: !!d.emAnalise, parcelas: d.parcelas ?? 1 })
            },
          },
        })
      } catch {
        if (vivo) setErro("Não foi possível carregar o pagamento no cartão. Recarregue a página ou pague pelo Pix.")
      }
    })()
    return () => { vivo = false; controlador.current?.unmount(); controlador.current = null }
  }, [modo, pago, chavePublica, total, parcelasMax, numero, token, nomeInicial])

  if (pago) return (
    <div className="bg-white rounded-2xl p-6 text-center space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${pago.analise ? "bg-[#b26b00]/10" : "bg-[#009351]/10"}`}>
        {pago.analise ? <Clock className="w-7 h-7 text-[#b26b00]" /> : <CircleCheck className="w-8 h-8 text-[#009351]" />}
      </div>
      <p className="font-bold text-[#191625] text-[18px]">{pago.analise ? "Pagamento em análise" : "Pagamento aprovado!"}</p>
      <p className="text-[13.5px] text-[#5e5c68] leading-relaxed">
        {pago.analise
          ? "O Mercado Pago está conferindo o pagamento (costuma levar minutos). Assim que confirmar, a produção começa e avisamos você."
          : <>Recebemos <strong>{brl(total)}</strong>{pago.parcelas > 1 ? <> em <strong>{pago.parcelas}x</strong></> : null} no cartão. O pedido está pago e a produção já pode começar.</>}
      </p>
    </div>
  )

  return (
    <div className="bg-white rounded-2xl p-5 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93]">Como você quer pagar?</p>
      <div className="grid grid-cols-2 gap-2">
        {([["cartao", <CreditCard key="c" className="w-4 h-4" />, "Cartão", `${brl(total)} · 100%`], ["pix", <QrCode key="p" className="w-4 h-4" />, "Pix", `sinal ${brl(sinal)} · ${sinalPct}%`]] as const).map(([k, ic, t, s]) => (
          <button key={k} type="button" onClick={() => setModo(k)}
            className={`rounded-xl px-3 py-2.5 text-left transition-all ${modo === k ? "ring-2 ring-[#8456e8] bg-[#8456e8]/5" : "ring-1 ring-[rgba(60,60,67,0.15)]"}`}>
            <span className="flex items-center gap-1.5 text-[14px] font-semibold text-[#191625]">{ic}{t}</span>
            <span className="block text-[11.5px] text-[#8E8E93] mt-0.5 ds-num">{s}</span>
          </button>
        ))}
      </div>

      {modo === "pix" ? (
        <div className="space-y-3">
          <p className="text-[13.5px] text-[#191625] leading-relaxed">Pague o sinal de <strong>{brl(sinal)}</strong> ({sinalPct}% do pedido) para iniciar a produção. O restante é combinado na entrega.</p>
          <a href={pix} className="h-12 w-full rounded-xl bg-[#8456e8] hover:bg-[#7445d4] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors"><QrCode className="w-5 h-5" /> Pagar sinal via Pix</a>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-[#5e5c68] leading-relaxed">No cartão você paga o pedido inteiro, <strong className="text-[#191625]">{brl(total)}</strong>{parcelasMax > 1 ? <>, em até {parcelasMax}x</> : null}.</p>
          {!pronto && !erro && <p className="text-[13px] text-[#8E8E93] flex items-center gap-2 justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" />Carregando o pagamento seguro…</p>}
          <div id="cartao_mp" className="-mx-1" />
          {erro && <p className="text-[13px] text-[#d33a3c] flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{erro}</p>}
          <p className="text-[11.5px] text-[#8E8E93] text-center flex items-center justify-center gap-1.5"><Lock className="w-3 h-3" />Pagamento processado pelo Mercado Pago. A Enyla não vê nem guarda os dados do cartão.</p>
        </div>
      )}
    </div>
  )
}
