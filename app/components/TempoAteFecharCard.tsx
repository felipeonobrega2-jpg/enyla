"use client"

// Dashboard → Tempo até fechar: do primeiro contato no WhatsApp ao primeiro pedido fechado (offset) ou ao sinal pago
// (digital). Mediana e a faixa onde cai a metade dos casos; os mais recentes; quem ficou sem dado.

import { useEffect, useState } from "react"
import { Hourglass } from "lucide-react"
import { Cartao, TituloCartao } from "./ds"
import type { TempoAteFechar, Estatistica } from "../lib/tempoAteFechar"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

function Bloco({ titulo, e, sub }: { titulo: string; e: Estatistica; sub: string }) {
  return (
    <div className="rounded-[14px] p-4 self-start" style={{ background: "var(--bg-muted, rgba(116,116,128,0.06))" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>{titulo}</p>
      {e ? <>
        <p className="text-[28px] font-bold leading-tight mt-1 ds-num" style={{ color: "var(--text-main)" }}>{e.mediana} <span className="text-[14px] font-semibold">dias</span></p>
        <p className="text-[12px] mt-1" style={{ color: "var(--text-sub, var(--text-faint))" }}>
          {e.n > 1 ? `Metade fecha entre ${e.p25} e ${e.p75} dias · média ${e.media}` : "1 venda até agora"} · {e.n} {e.n === 1 ? "cliente" : "clientes"}
        </p>
      </> : <p className="text-[13px] mt-2" style={{ color: "var(--text-faint)" }}>Sem vendas com conversa ligada ainda</p>}
      <p className="text-[11px] mt-2" style={{ color: "var(--text-faint)" }}>{sub}</p>
    </div>
  )
}

export function TempoAteFecharCard() {
  const [t, setT] = useState<TempoAteFechar | null>(null)
  const [erro, setErro] = useState(false)
  useEffect(() => { fetch("/api/tempo-fechar").then(r => r.ok ? r.json() : Promise.reject()).then(setT).catch(() => setErro(true)) }, [])

  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Tempo até fechar" icone={<Hourglass className="w-4 h-4" />}
        sub="Do primeiro contato no WhatsApp até o primeiro pedido fechado (offset) ou o sinal pago (digital). Todas as vendas, não só as do período." />
      {!t ? <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>{erro ? "Não deu para calcular agora." : "Calculando…"}</p> : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Bloco titulo="Offset" e={t.offset} sub="até o primeiro pedido fechado · pedidos maiores costumam demorar mais" />
          <Bloco titulo="Digital" e={t.digital} sub="até o sinal pago" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-faint)" }}>Mais recentes</p>
            <div className="space-y-0.5">
              {t.casos.filter(c => c.dias != null).slice(0, 6).map(c => (
                <div key={c.cliente + c.fechou} className="flex items-center gap-2 text-[12.5px] py-1">
                  <span className="truncate flex-1 min-w-0" style={{ color: "var(--text-main)" }}>{c.cliente}</span>
                  <span className="shrink-0 ds-num" style={{ color: "var(--text-faint)" }}>{dataBR(c.fechou)} · {brl(c.valor)}{c.tipo === "digital" ? " · digital" : ""}</span>
                  <span className="shrink-0 w-[58px] text-right font-semibold ds-num" style={{ color: "var(--text-main)" }}>{c.dias} {c.dias === 1 ? "dia" : "dias"}</span>
                </div>
              ))}
            </div>
            {t.semDado.length > 0 && (
              <p className="text-[11.5px] mt-2 leading-snug" style={{ color: "var(--text-faint)" }}>
                Fora da conta ({t.semDado.length}), sem conversa ligada ou de antes do histórico: {t.semDado.slice(0, 6).join(", ")}{t.semDado.length > 6 ? "…" : ""}. Ligue a conversa ao cliente no WhatsApp do sistema para entrar.
              </p>
            )}
          </div>
        </div>
      )}
    </Cartao>
  )
}
