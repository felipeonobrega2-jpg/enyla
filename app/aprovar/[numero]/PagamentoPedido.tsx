"use client"

import { useState } from "react"
import { CreditCard, QrCode, Lock, AlertCircle, CircleCheck, Clock, Loader2 } from "lucide-react"

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

// Pagamento do pedido: cartão (100%, InfinitePay, até 12x) ou Pix do sinal. O cartão abre a página segura da
// InfinitePay e o cliente volta para cá sozinho, já com a confirmação.
export function PagamentoPedido({ numero, token, total, sinal, sinalPct, pix, nomeInicial, retorno }: {
  numero: string; token: string; total: number; sinal: number; sinalPct: number; pix: string; nomeInicial?: string
  retorno?: "pago" | "pendente" | null
}) {
  const [modo, setModo] = useState<"pix" | "cartao">("cartao")
  const [abrindo, setAbrindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function pagarNoCartao() {
    if (abrindo) return
    setAbrindo(true); setErro(null)
    const r = await fetch(`/api/aprovar/${encodeURIComponent(numero)}/cartao`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, nome: nomeInicial }) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (r?.ok && d.url) { window.location.href = d.url; return }
    setErro(d.erro ?? "Sem conexão. Verifique a internet e tente de novo.")
    setAbrindo(false)
  }

  if (retorno === "pago") return (
    <div className="bg-white rounded-2xl p-6 text-center space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="w-14 h-14 rounded-full bg-[#009351]/10 flex items-center justify-center mx-auto"><CircleCheck className="w-8 h-8 text-[#009351]" /></div>
      <p className="font-bold text-[#191625] text-[18px]">Pagamento aprovado!</p>
      <p className="text-[13.5px] text-[#5e5c68] leading-relaxed">Recebemos <strong>{brl(total)}</strong>. O pedido está pago e a produção já pode começar. Vamos te avisando por aqui e no WhatsApp.</p>
    </div>
  )

  return (
    <div className="bg-white rounded-2xl p-5 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {retorno === "pendente" && (
        <p className="text-[13px] text-[#b26b00] bg-[#b26b00]/8 rounded-xl px-3.5 py-2.5 flex items-start gap-2"><Clock className="w-4 h-4 mt-0.5 shrink-0" />Ainda não recebemos a confirmação do pagamento. Se você já pagou, ela chega em instantes: atualize a página. Senão, tente de novo abaixo.</p>
      )}
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
          <p className="text-[13.5px] text-[#191625] leading-relaxed">No cartão você paga o pedido inteiro, <strong>{brl(total)}</strong>, em até 12x.</p>
          <p className="text-[12.5px] text-[#5e5c68] leading-relaxed">Você vai para a página segura da InfinitePay, paga e volta para cá sozinho, já com a confirmação.</p>
          {erro && <p className="text-[13px] text-[#d33a3c] flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{erro}</p>}
          <button onClick={pagarNoCartao} disabled={abrindo}
            className="h-12 w-full rounded-xl bg-[#8456e8] hover:bg-[#7445d4] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-all disabled:opacity-60">
            {abrindo ? <><Loader2 className="w-5 h-5 animate-spin" /> Abrindo o pagamento…</> : <><CreditCard className="w-5 h-5" /> Pagar {brl(total)} no cartão</>}
          </button>
          <p className="text-[11.5px] text-[#8E8E93] text-center flex items-center justify-center gap-1.5"><Lock className="w-3 h-3" />Pagamento processado pela InfinitePay. A Enyla não vê nem guarda os dados do cartão.</p>
        </div>
      )}
    </div>
  )
}
