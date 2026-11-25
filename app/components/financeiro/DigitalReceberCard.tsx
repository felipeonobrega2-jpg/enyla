"use client"
import { useEffect, useState } from "react"
import { brl } from "../../utils"
import type { DigitalAReceber } from "../../lib/digitalReceber"

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

// A receber do Digital: total, sinal, o que já está pago, o que está em conferência e o saldo com vencimento.
// "Pago" só com confirmação do Asaas ou vínculo bancário; senão fica em conferência.
export function DigitalReceberCard() {
  const [lista, setLista] = useState<DigitalAReceber[] | null>(null)
  const [erro, setErro] = useState(false)
  useEffect(() => {
    let vivo = true
    fetch("/api/digital/receber").then(r => r.ok ? r.json() : Promise.reject()).then(j => { if (vivo) setLista(j.pedidos ?? []) }).catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
  }, [])
  if (erro) return <p className="text-[12px] text-[#d33a3c]">Não consegui carregar o a receber do Digital.</p>
  if (!lista) return <p className="text-[12px] text-[#898892]">Carregando o Digital…</p>
  const saldo = lista.reduce((s, p) => s + p.saldo, 0), conf = lista.reduce((s, p) => s + p.emConferencia, 0)
  return (
    <div className="rounded-xl border border-[rgba(60,60,67,0.12)] bg-white overflow-hidden mb-4">
      <div className="px-5 py-3 flex items-center justify-between border-b border-[rgba(60,60,67,0.08)]">
        <span className="text-[12.5px] font-semibold text-[#191625]">Digital · {lista.length} {lista.length === 1 ? "pedido" : "pedidos"}</span>
        <span className="text-[12px] text-[#5e5c68] ds-num">saldo {brl(saldo)}{conf > 0 ? ` · em conferência ${brl(conf)}` : ""}</span>
      </div>
      {lista.length === 0 && <p className="px-5 py-4 text-[12px] text-[#898892]">Nenhum pedido Digital com saldo ou em conferência.</p>}
      {lista.map(p => (
        <div key={p.id} className="px-5 py-3 border-b last:border-b-0 border-[rgba(60,60,67,0.06)] text-[12px]">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-[#191625]">{p.id} · {p.cliente ?? "—"}</span>
            <span className="ds-num text-[#191625]">total {brl(p.total)}</span>
          </div>
          <p className="text-[#5e5c68] mt-0.5 ds-num">
            sinal {brl(p.sinal.valor)} {p.sinal.situacao === "pago" ? "(pago)" : p.sinal.situacao === "em conferencia" ? "(em conferência)" : "(a receber)"}
            {" · "}pago {brl(p.pago)}{p.emConferencia > 0 ? ` · em conferência ${brl(p.emConferencia)}` : ""}
            {" · "}saldo {brl(p.saldo)}
            {p.saldo > 0 && <> · <span className={p.atrasado ? "text-[#d33a3c] font-semibold" : ""}>{p.vencimentoSaldo ? `vence ${dm(p.vencimentoSaldo)}${p.atrasado ? " (atrasado)" : ""}` : "sem vencimento (material ainda não pronto)"}</span></>}
          </p>
        </div>
      ))}
    </div>
  )
}
