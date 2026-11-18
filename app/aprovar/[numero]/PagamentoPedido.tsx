"use client"

import { useState } from "react"
import { CreditCard, QrCode, Lock, AlertCircle, CircleCheck, Clock, Loader2, Truck, Check, ChevronRight } from "lucide-react"

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const num = (v: number) => v.toLocaleString("pt-BR")
const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/")
const sombra = "shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

// Depois de aprovar (ou ao abrir o link de um pedido já aprovado): resumo, como pagar e o que acontece depois.
// Cartão: página segura da InfinitePay, o cliente volta para cá já com a confirmação.
export function PosAprovacao({ numero, token, primeiroNome, quantidade, total, sinal, sinalPct, pix, rastreio, entregaAte, cartao, pago, retorno, nomeAprovou, agoraAprovou }: {
  numero: string; token: string; primeiroNome: string; quantidade: number; total: number; sinal: number; sinalPct: number
  pix: string; rastreio: string; entregaAte?: string | null; cartao: boolean; pago: boolean; retorno?: "pago" | "pendente" | null
  nomeAprovou?: string; agoraAprovou?: boolean
}) {
  const [modo, setModo] = useState<"pix" | "cartao">("pix")
  const [abrindo, setAbrindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const confirmado = pago || retorno === "pago"

  async function irParaCartao() {
    if (abrindo) return
    setAbrindo(true); setErro(null)
    const r = await fetch(`/api/aprovar/${encodeURIComponent(numero)}/cartao`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, nome: nomeAprovou }) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (r?.ok && d.url) { window.location.href = d.url; return }
    setErro(d.erro ?? "Sem conexão. Verifique a internet e tente de novo.")
    setAbrindo(false)
  }

  const passos = [
    { t: "Pagamento", s: confirmado ? "Confirmado" : "Pix ou cartão" },
    { t: "Arte final", s: "Conferimos e enviamos para você aprovar" },
    { t: "Produção", s: "Impressão, acabamento e montagem" },
    { t: "Entrega", s: entregaAte ? `Prevista até ${dataBR(entregaAte)}` : "No prazo combinado" },
  ]
  const atual = confirmado ? 1 : 0

  return (
    <>
      <div className={`bg-white rounded-2xl p-6 ${sombra} animate-[apple-slide-up_.3s_ease-out]`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#009351]/10 flex items-center justify-center shrink-0 ds-pop"><CircleCheck className="w-7 h-7 text-[#009351]" /></div>
          <div className="min-w-0">
            <p className="font-bold text-[#191625] text-[19px] leading-tight">{confirmado ? "Pedido confirmado!" : agoraAprovou ? "Pedido aprovado!" : "Seu pedido está aprovado"}</p>
            <p className="text-[13px] text-[#5e5c68] mt-0.5">{confirmado ? `Pagamento recebido. Obrigado, ${primeiroNome}!` : `Obrigado, ${primeiroNome}. Falta só o pagamento.`}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 rounded-xl bg-[rgba(116,116,128,0.06)]">
          {[["Quantidade", `${num(quantidade)} un`], ["Valor", brl(total)], ["Entrega", entregaAte ? `até ${dataBR(entregaAte).slice(0, 5)}` : "a combinar"]].map(([r, v], i) => (
            <div key={r} className="px-2 py-2.5 text-center min-w-0" style={i ? { borderLeft: "1px solid #E5E5EA" } : undefined}>
              <p className="text-[10.5px] uppercase tracking-wide text-[#8E8E93] font-semibold">{r}</p>
              <p className="text-[14px] font-bold text-[#191625] ds-num truncate mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {!confirmado && (
        <div className={`bg-white rounded-2xl p-5 space-y-3 ${sombra}`}>
          {retorno === "pendente" && (
            <p className="text-[13px] text-[#b26b00] bg-[#b26b00]/[0.08] rounded-xl px-3.5 py-2.5 flex items-start gap-2"><Clock className="w-4 h-4 mt-0.5 shrink-0" />Ainda não recebemos a confirmação do cartão. Se você já pagou, ela chega em instantes: atualize a página.</p>
          )}
          <p className="text-[15px] font-semibold text-[#191625]">Como você prefere pagar?</p>
          {([
            { k: "pix" as const, ic: <QrCode className="w-5 h-5" />, t: "Pix", s: <>Sinal de <strong className="text-[#191625] ds-num">{brl(sinal)}</strong> agora e o restante na entrega</>, selo: "Confirma na hora" },
            ...(cartao ? [{ k: "cartao" as const, ic: <CreditCard className="w-5 h-5" />, t: "Cartão de crédito", s: <>Em até <strong className="text-[#191625]">12x</strong> no cartão</>, selo: null }] : []),
          ]).map(({ k, ic, t, s, selo }) => {
            const sel = modo === k
            return (
              <button key={k} type="button" onClick={() => setModo(k)}
                style={{ border: `2px solid ${sel ? "#8456e8" : "#E5E5EA"}` }}
                className={`ds-toque w-full rounded-xl px-4 py-3.5 flex items-center gap-3 text-left ${sel ? "bg-[#8456e8]/[0.04]" : "bg-white"}`}>
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${sel ? "bg-[#8456e8] text-white" : "bg-[rgba(116,116,128,0.08)] text-[#5e5c68]"}`}>{ic}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2"><span className="text-[15px] font-semibold text-[#191625]">{t}</span>{selo && <span className="text-[10.5px] font-semibold text-[#009351] bg-[#009351]/10 px-1.5 py-0.5 rounded-full">{selo}</span>}</span>
                  <span className="block text-[12.5px] text-[#5e5c68] mt-0.5 leading-snug">{s}</span>
                </span>
                <span className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center ${sel ? "bg-[#8456e8]" : "border-2 border-[#C7C7CC]"}`}>{sel && <Check className="w-3 h-3 text-white" strokeWidth={3} />}</span>
              </button>
            )
          })}
          {erro && <p className="text-[13px] text-[#d33a3c] flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{erro}</p>}
          {modo === "pix" ? (
            <a href={pix} className="ds-toque h-12 w-full rounded-xl bg-[#8456e8] hover:bg-[#7445d4] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors"><QrCode className="w-5 h-5" /> Pagar sinal com Pix</a>
          ) : (
            <button onClick={irParaCartao} disabled={abrindo}
              className="ds-toque h-12 w-full rounded-xl bg-[#8456e8] hover:bg-[#7445d4] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-all disabled:opacity-60">
              {abrindo ? <><Loader2 className="w-5 h-5 animate-spin" /> Abrindo…</> : <>Continuar para o cartão <ChevronRight className="w-5 h-5" /></>}
            </button>
          )}
          <p className="text-[11.5px] text-[#8E8E93] text-center leading-snug px-2">
            <Lock className="w-3 h-3 inline -mt-0.5 mr-1" />{modo === "cartao" ? "Ambiente seguro da InfinitePay. Você volta para cá depois de pagar." : `Sinal de ${sinalPct}% · a produção começa assim que o pagamento é confirmado.`}
          </p>
        </div>
      )}

      <div className={`bg-white rounded-2xl p-5 ${sombra}`}>
        <p className="text-[15px] font-semibold text-[#191625] mb-3">Próximos passos</p>
        <ol>
          {passos.map((p, i) => {
            const feito = i < atual, agora = i === atual
            return (
              <li key={p.t} className="flex gap-3">
                <span className="flex flex-col items-center">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${feito ? "bg-[#009351] text-white" : agora ? "bg-[#8456e8] text-white" : "bg-[rgba(116,116,128,0.1)] text-[#8E8E93]"}`}>
                    {feito ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  {i < passos.length - 1 && <span className={`w-px flex-1 my-1 ${feito ? "bg-[#009351]/40" : "bg-[rgba(60,60,67,0.12)]"}`} />}
                </span>
                <span className="pb-4 min-w-0">
                  <span className={`block text-[14px] font-semibold ${agora || feito ? "text-[#191625]" : "text-[#8E8E93]"}`}>{p.t}</span>
                  <span className="block text-[12.5px] text-[#8E8E93] leading-snug">{p.s}</span>
                </span>
              </li>
            )
          })}
        </ol>
        <a href={rastreio} className="h-11 w-full rounded-xl bg-[rgba(116,116,128,0.08)] text-[#191625] font-medium text-[14px] flex items-center justify-center gap-2">
          <Truck className="w-4 h-4" /> Acompanhar o pedido
        </a>
      </div>
    </>
  )
}
