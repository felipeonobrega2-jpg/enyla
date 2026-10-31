"use client"

import { useState } from "react"
import Image from "next/image"
import { Check, CircleCheck, Clock, FileText, QrCode, Truck, AlertCircle } from "lucide-react"

type Opcao = { quantidade: number; preco: number; unitario: number }
type Proposta = {
  nomeCliente: string
  opcoes: Opcao[]
  especificacoes: string[]
  observacao?: string
  validaAte: string | null
  vencida: boolean
  jaAprovado: boolean
  sinalPct: number
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const num = (v: number) => v.toLocaleString("pt-BR")
const dataBR = (iso: string) => iso.split("-").reverse().join("/")

function Topo({ numero }: { numero: string }) {
  return (
    <div className="bg-white border-b border-[rgba(60,60,67,0.12)] sticky top-0 z-10">
      <div className="max-w-md mx-auto px-5 h-14 flex items-center gap-3">
        <Image src="/brand/enyla-wordmark-dark.png" alt="Enyla" width={1335} height={328} className="h-5 w-auto" priority />
        <span className="ml-auto text-[10px] font-bold text-[#8456e8] bg-[#8456e8]/10 border border-[#8456e8]/20 px-2.5 py-1 rounded-full font-mono">{numero}</span>
      </div>
    </div>
  )
}

function Aviso({ icone, titulo, texto }: { icone: React.ReactNode; titulo: string; texto: string }) {
  return (
    <div className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="w-12 h-12 rounded-2xl bg-[rgba(116,116,128,0.08)] flex items-center justify-center mx-auto text-[#8E8E93]">{icone}</div>
      <p className="font-bold text-[#191625] text-[16px]">{titulo}</p>
      <p className="text-[13.5px] text-[#8E8E93] leading-relaxed">{texto}</p>
    </div>
  )
}

export default function AprovarClient({ numero, token, proposta }: { numero: string; token: string; proposta: Proposta | null }) {
  const [qtd, setQtd] = useState<number | null>(proposta?.opcoes.length === 1 ? proposta.opcoes[0].quantidade : null)
  const [nome, setNome] = useState("")
  const [aceite, setAceite] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<{ sinal: number; pix: string; rastreio: string } | null>(null)

  const escolhida = proposta?.opcoes.find(o => o.quantidade === qtd)
  const pode = !!escolhida && nome.trim().length >= 2 && aceite && !enviando

  async function aprovar() {
    if (!pode) return
    setEnviando(true); setErro(null)
    try {
      const r = await fetch(`/api/aprovar/${encodeURIComponent(numero)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, quantidade: qtd, nome: nome.trim() }),
      })
      const d = await r.json()
      if (!r.ok) setErro(d.erro ?? "Não foi possível aprovar agora. Tente de novo.")
      else setFeito(d)
    } catch {
      setErro("Sem conexão. Verifique a internet e tente de novo.")
    }
    setEnviando(false)
  }

  return (
    <div className="min-h-screen" style={{ background: "#F2F2F7" }}>
      <Topo numero={numero} />
      <div className="max-w-md mx-auto px-4 py-5 pb-12 space-y-4">
        {!proposta ? (
          <Aviso icone={<AlertCircle className="w-6 h-6" />} titulo="Link inválido" texto="Este link de aprovação não é válido. Peça um novo link para a Enyla." />
        ) : feito ? (
          <>
            <div className="bg-white rounded-2xl p-6 text-center space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] animate-[apple-slide-up_.3s_ease-out]">
              <div className="w-14 h-14 rounded-full bg-[#009351]/10 flex items-center justify-center mx-auto"><CircleCheck className="w-8 h-8 text-[#009351]" /></div>
              <p className="font-bold text-[#191625] text-[18px]">Pedido aprovado!</p>
              <p className="text-[13.5px] text-[#5e5c68] leading-relaxed">
                Obrigado, {nome.trim().split(" ")[0]}. Recebemos a aprovação de <strong>{num(escolhida!.quantidade)} unidades</strong> por <strong>{brl(escolhida!.preco)}</strong>.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-5 space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93]">Próximo passo</p>
              <p className="text-[14px] text-[#191625] leading-relaxed">
                Para iniciar a produção, pague o sinal de <strong>{brl(feito.sinal)}</strong> ({proposta.sinalPct}% do pedido). O restante é combinado na entrega.
              </p>
              <a href={feito.pix} className="h-12 w-full rounded-xl bg-[#8456e8] hover:bg-[#7445d4] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors">
                <QrCode className="w-5 h-5" /> Pagar sinal via Pix
              </a>
              <a href={feito.rastreio} className="h-11 w-full rounded-xl bg-[rgba(116,116,128,0.08)] text-[#191625] font-medium text-[14px] flex items-center justify-center gap-2">
                <Truck className="w-4 h-4" /> Acompanhar o pedido
              </a>
            </div>
          </>
        ) : proposta.jaAprovado ? (
          <Aviso icone={<CircleCheck className="w-6 h-6" />} titulo="Proposta já aprovada" texto="Este orçamento já virou pedido. Você pode acompanhar a produção pelo link de rastreio que enviamos." />
        ) : proposta.vencida ? (
          <Aviso icone={<Clock className="w-6 h-6" />} titulo="Proposta vencida" texto={`Esta proposta valia até ${proposta.validaAte ? dataBR(proposta.validaAte) : "a data combinada"}. Fale com a Enyla para atualizarmos os valores.`} />
        ) : (
          <>
            <div className="pt-1">
              <p className="text-[22px] font-bold text-[#191625] leading-snug tracking-[-0.01em]">Olá, {proposta.nomeCliente.split(" ")[0]}!</p>
              <p className="text-sm text-[#8E8E93] mt-0.5">Confira a proposta e aprove em poucos segundos.</p>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Embalagem personalizada</p>
              <ul className="mt-3 space-y-1.5">
                {proposta.especificacoes.map(e => (
                  <li key={e} className="text-[13.5px] text-[#191625] flex items-start gap-2"><Check className="w-4 h-4 text-[#8456e8] mt-0.5 shrink-0" />{e}</li>
                ))}
              </ul>
              {proposta.observacao && <p className="mt-3 text-[13px] text-[#5e5c68] leading-relaxed bg-[rgba(116,116,128,0.06)] rounded-xl px-3.5 py-2.5">{proposta.observacao}</p>}
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E93] px-1">{proposta.opcoes.length > 1 ? "Escolha a quantidade" : "Quantidade"}</p>
              {proposta.opcoes.map(o => {
                const sel = o.quantidade === qtd
                return (
                  <button key={o.quantidade} onClick={() => setQtd(o.quantidade)}
                    className={`w-full bg-white rounded-2xl px-5 py-4 flex items-center gap-4 text-left transition-all duration-150 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${sel ? "ring-2 ring-[#8456e8]" : "ring-1 ring-transparent hover:ring-[rgba(60,60,67,0.15)]"}`}>
                    <span className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center transition-colors ${sel ? "bg-[#8456e8]" : "border-2 border-[rgba(60,60,67,0.25)]"}`}>
                      {sel && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[16px] font-semibold text-[#191625] ds-num">{num(o.quantidade)} unidades</span>
                      <span className="block text-[12.5px] text-[#8E8E93] ds-num">{brl(o.unitario || o.preco / o.quantidade)} por unidade</span>
                    </span>
                    <span className="text-[17px] font-bold text-[#191625] ds-num">{brl(o.preco)}</span>
                  </button>
                )
              })}
            </div>

            <div className="bg-white rounded-2xl p-5 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <label className="block">
                <span className="text-[12px] font-medium text-[#5e5c68]">Seu nome</span>
                <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Quem está aprovando" autoComplete="name"
                  className="mt-1.5 w-full h-12 rounded-xl px-4 text-[15px] text-[#191625] bg-[rgba(116,116,128,0.06)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/30 transition-colors" />
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} className="mt-0.5 w-5 h-5 accent-[#8456e8] shrink-0" />
                <span className="text-[13px] text-[#5e5c68] leading-relaxed">
                  Aprovo a proposta {numero}{escolhida ? <> de <strong className="text-[#191625]">{num(escolhida.quantidade)} unidades</strong> por <strong className="text-[#191625]">{brl(escolhida.preco)}</strong></> : ""}. A produção começa após o sinal de {proposta.sinalPct}%.
                </span>
              </label>
              {erro && <p className="text-[13px] text-[#d33a3c] flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{erro}</p>}
              <button onClick={aprovar} disabled={!pode}
                className="h-12 w-full rounded-xl bg-[#8456e8] hover:bg-[#7445d4] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-all disabled:opacity-35 disabled:cursor-not-allowed">
                {enviando ? "Aprovando…" : <><Check className="w-5 h-5" /> Aprovar pedido</>}
              </button>
              {proposta.validaAte && <p className="text-[12px] text-[#8E8E93] text-center">Proposta válida até {dataBR(proposta.validaAte)}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
