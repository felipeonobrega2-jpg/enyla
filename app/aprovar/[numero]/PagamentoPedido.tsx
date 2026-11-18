"use client"

import { useState } from "react"
import { CreditCard, QrCode, Lock, AlertCircle, CircleCheck, Clock, Loader2 } from "lucide-react"

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const so = (s: string) => s.replace(/\D/g, "")
const mascara = {
  cartao: (s: string) => so(s).slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 "),
  validade: (s: string) => { const d = so(s).slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d },
  doc: (s: string) => {
    const d = so(s).slice(0, 14)
    return d.length <= 11
      ? d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2")
      : d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2")
  },
  cel: (s: string) => { const d = so(s).slice(0, 11); return d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d },
  cep: (s: string) => { const d = so(s).slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d },
}

function Campo({ rotulo, ...p }: { rotulo: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block min-w-0">
      <span className="text-[12px] font-medium text-[#5e5c68]">{rotulo}</span>
      <input {...p} className="mt-1 w-full h-11 rounded-xl px-3.5 text-[15px] text-[#191625] bg-[rgba(116,116,128,0.06)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/30 transition-colors" />
    </label>
  )
}

export function PagamentoPedido({ numero, token, total, sinal, sinalPct, pix, parcelasMax, nomeInicial }: {
  numero: string; token: string; total: number; sinal: number; sinalPct: number; pix: string; parcelasMax: number; nomeInicial?: string
}) {
  const [modo, setModo] = useState<"pix" | "cartao">("cartao")
  const [f, setF] = useState({ numero: "", nomeCartao: "", validade: "", cvv: "", nome: nomeInicial ?? "", documento: "", email: "", celular: "", cep: "", numeroEndereco: "" })
  const [parcelas, setParcelas] = useState(1)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pago, setPago] = useState<{ analise?: boolean; parcelas: number } | null>(null)
  const muda = (k: keyof typeof f, m?: (s: string) => string) => (e: React.ChangeEvent<HTMLInputElement>) => setF(x => ({ ...x, [k]: m ? m(e.target.value) : e.target.value }))
  const completo = so(f.numero).length >= 13 && f.nomeCartao.trim().length >= 3 && so(f.validade).length === 4 && so(f.cvv).length >= 3
    && f.nome.trim().includes(" ") && [11, 14].includes(so(f.documento).length) && f.email.includes("@") && so(f.celular).length >= 10 && so(f.cep).length === 8 && f.numeroEndereco.trim()

  async function pagar() {
    if (!completo || enviando) return
    setEnviando(true); setErro(null)
    try {
      const r = await fetch(`/api/aprovar/${encodeURIComponent(numero)}/cartao`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, parcelas, ...f }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) setErro(d.erro ?? "Não foi possível pagar agora. Tente de novo.")
      else { setPago({ analise: !!d.emAnalise, parcelas: d.parcelas ?? parcelas }); setF(x => ({ ...x, numero: "", cvv: "" })) }
    } catch { setErro("Sem conexão. Verifique a internet e tente de novo.") }
    setEnviando(false)
  }

  if (pago) return (
    <div className="bg-white rounded-2xl p-6 text-center space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${pago.analise ? "bg-[#b26b00]/10" : "bg-[#009351]/10"}`}>
        {pago.analise ? <Clock className="w-7 h-7 text-[#b26b00]" /> : <CircleCheck className="w-8 h-8 text-[#009351]" />}
      </div>
      <p className="font-bold text-[#191625] text-[18px]">{pago.analise ? "Pagamento em análise" : "Pagamento aprovado!"}</p>
      <p className="text-[13.5px] text-[#5e5c68] leading-relaxed">
        {pago.analise
          ? "A operadora está conferindo o pagamento. Assim que confirmar, a produção começa e avisamos você."
          : <>Recebemos <strong>{brl(total)}</strong>{pago.parcelas > 1 ? <> em <strong>{pago.parcelas}x de {brl(total / pago.parcelas)}</strong></> : null} no cartão. O pedido está pago e a produção já pode começar.</>}
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
          <p className="text-[13px] text-[#5e5c68] leading-relaxed">No cartão você paga o pedido inteiro, <strong className="text-[#191625]">{brl(total)}</strong>{parcelasMax > 1 ? <>, em até {parcelasMax}x sem juros</> : null}.</p>
          <Campo rotulo="Número do cartão" value={f.numero} onChange={muda("numero", mascara.cartao)} inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" />
          <Campo rotulo="Nome impresso no cartão" value={f.nomeCartao} onChange={muda("nomeCartao", s => s.toUpperCase())} autoComplete="cc-name" />
          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo="Validade" value={f.validade} onChange={muda("validade", mascara.validade)} inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" />
            <Campo rotulo="CVV" value={f.cvv} onChange={muda("cvv", s => so(s).slice(0, 4))} inputMode="numeric" autoComplete="cc-csc" placeholder="123" />
          </div>
          {parcelasMax > 1 && (
            <label className="block">
              <span className="text-[12px] font-medium text-[#5e5c68]">Parcelas</span>
              <select value={parcelas} onChange={e => setParcelas(Number(e.target.value))}
                className="mt-1 w-full h-11 rounded-xl px-3 text-[15px] text-[#191625] bg-[rgba(116,116,128,0.06)] focus:outline-none focus:ring-2 focus:ring-[#8456e8]/30">
                {Array.from({ length: parcelasMax }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}x de {brl(total / n)}{n > 1 ? " sem juros" : " à vista"}</option>)}
              </select>
            </label>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] pt-1">Titular do cartão</p>
          <Campo rotulo="Nome completo" value={f.nome} onChange={muda("nome")} autoComplete="name" />
          <Campo rotulo="CPF ou CNPJ" value={f.documento} onChange={muda("documento", mascara.doc)} inputMode="numeric" />
          <Campo rotulo="E-mail" value={f.email} onChange={muda("email")} type="email" autoComplete="email" />
          <Campo rotulo="Celular" value={f.celular} onChange={muda("celular", mascara.cel)} inputMode="tel" autoComplete="tel-national" placeholder="(11) 90000-0000" />
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <Campo rotulo="CEP da fatura" value={f.cep} onChange={muda("cep", mascara.cep)} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" />
            <Campo rotulo="Número" value={f.numeroEndereco} onChange={muda("numeroEndereco", s => s.slice(0, 10))} autoComplete="address-line2" />
          </div>
          {erro && <p className="text-[13px] text-[#d33a3c] flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{erro}</p>}
          <button onClick={pagar} disabled={!completo || enviando}
            className="h-12 w-full rounded-xl bg-[#8456e8] hover:bg-[#7445d4] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-all disabled:opacity-35 disabled:cursor-not-allowed">
            {enviando ? <><Loader2 className="w-5 h-5 animate-spin" /> Processando…</> : <><Lock className="w-4 h-4" /> Pagar {parcelas > 1 ? `${parcelas}x de ${brl(total / parcelas)}` : brl(total)}</>}
          </button>
          <p className="text-[11.5px] text-[#8E8E93] text-center flex items-center justify-center gap-1.5"><Lock className="w-3 h-3" />Pagamento processado pelo Asaas. A Enyla não guarda os dados do cartão.</p>
        </div>
      )}
    </div>
  )
}
