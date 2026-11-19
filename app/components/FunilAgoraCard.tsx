"use client"

// Painel → Funil agora: tudo o que está acontecendo, do lead à entrega, em duas linhas (offset e digital).
// Cada etapa: quantos, quanto vale e quantos estão parados. Toque abre a lista (parados primeiro).

import { useEffect, useState } from "react"
import { GitBranch } from "lucide-react"
import { Cartao, TituloCartao, Gaveta, Esqueleto } from "./ds"
import type { FunilAgora, EtapaFunil, ItemFunil } from "../lib/funilAgora"

const brlCurto = (n: number) => n >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: n >= 100_000 ? 0 : 1 })} mil` : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

export function FunilAgoraCard({ onAbrirConversa, onAbrirCardId, onNavegar }: {
  onAbrirConversa?: (jid: string, nome?: string) => void
  onAbrirCardId?: (id: string) => void
  onNavegar?: (v: "digital") => void
}) {
  const [d, setD] = useState<FunilAgora | null>(null)
  const [aberta, setAberta] = useState<{ linha: string; e: EtapaFunil } | null>(null)
  useEffect(() => {
    const carregar = () => fetch("/api/funil-agora").then(r => r.ok ? r.json() : null).then(x => { if (x) setD(x) }).catch(() => {})
    carregar()
    const t = setInterval(() => { if (!document.hidden) carregar() }, 300_000)
    return () => clearInterval(t)
  }, [])
  if (!d) return <Esqueleto linhas={2} />

  // Funil em barras: largura pelo volume (raiz, para a etapa pequena não sumir ao lado dos leads), a parte vermelha é
  // o que está parado. Etapa vazia fica apagada.
  const funil = (nome: string, etapas: EtapaFunil[], cor: string) => {
    const max = Math.max(1, ...etapas.map(e => e.quantos))
    const paradosLinha = etapas.reduce((t, e) => t + e.parados, 0)
    const valorLinha = etapas.filter(e => !/leads|entregue|enviado/.test(e.id)).reduce((t, e) => t + e.valor, 0)
    return (
      <div className="min-w-0">
        <div className="flex items-baseline gap-x-2 gap-y-0.5 mb-2 flex-wrap">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cor }} />
          <p className="text-[13px] font-semibold text-[#191625]">{nome}</p>
          <p className="text-[11.5px] text-[#898892] min-w-0">{valorLinha ? `${brlCurto(valorLinha)} em andamento` : ""}{paradosLinha ? <span className="text-[#d33a3c] font-semibold"> · {paradosLinha} parados</span> : null}</p>
        </div>
        <div className="space-y-1 ds-escalonado">
          {etapas.map(e => {
            const larg = e.quantos ? Math.max(8, Math.sqrt(e.quantos) / Math.sqrt(max) * 100) : 0
            const pctParado = e.quantos ? e.parados / e.quantos * 100 : 0
            return (
              <button key={e.id} onClick={() => e.quantos && setAberta({ linha: nome, e })} disabled={!e.quantos}
                className={`ds-toque w-full grid grid-cols-[1fr_auto] sm:grid-cols-[104px_1fr_auto] items-center gap-x-2.5 gap-y-1 rounded-lg px-1.5 py-1 sm:py-1.5 text-left ${e.quantos ? "hover:bg-[rgba(116,116,128,0.06)]" : "cursor-default"}`}>
                <span className={`text-[12.5px] sm:text-[12px] leading-tight truncate ${e.quantos ? "text-[#5e5c68] font-medium" : "text-[#c7c7cc]"}`}>{e.nome}</span>
                <span className={`relative ${e.quantos ? "h-3 sm:h-6" : "h-1.5 sm:h-6"} rounded-md bg-[rgba(116,116,128,0.06)] overflow-hidden col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto sm:col-start-2`}>
                  {e.quantos > 0 && (
                    <span className="absolute inset-y-0 left-0 rounded-md flex overflow-hidden ds-cresce-x" style={{ width: `${larg}%`, background: `${cor}2e` }}>
                      <span className="h-full" style={{ width: `${100 - pctParado}%`, background: cor, opacity: 0.85 }} />
                      {e.parados > 0 && <span className="h-full bg-[#d33a3c]" style={{ width: `${pctParado}%` }} />}
                    </span>
                  )}
                </span>
                <span className="text-right min-w-[64px] row-start-1 col-start-2 sm:col-start-3 flex sm:block items-baseline justify-end gap-1.5">
                  {e.valor > 0 && <span className="sm:hidden text-[11px] text-[#898892] ds-num">{brlCurto(e.valor)} ·</span>}
                  <span className={`sm:block text-[13.5px] font-bold ds-num leading-tight ${e.quantos ? "text-[#191625]" : "text-[#c7c7cc]"}`}>{e.quantos}{e.parados > 0 && <span className="text-[11px] font-bold text-[#d33a3c]"> · {e.parados}</span>}</span>
                  {e.valor > 0 && <span className="hidden sm:block text-[10.5px] text-[#898892] ds-num leading-tight">{brlCurto(e.valor)}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const abrir = (x: ItemFunil) => {
    if (x.jid && onAbrirConversa) { setAberta(null); onAbrirConversa(x.jid, x.nome) }
    else if (x.cardId && onAbrirCardId) { setAberta(null); onAbrirCardId(x.cardId) }
    else if (x.digitalId && onNavegar) { setAberta(null); onNavegar("digital") }
  }
  const parados = [...d.offset, ...d.digital].reduce((t, e) => t + e.parados, 0)

  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Funil agora" icone={<GitBranch className="w-4 h-4" />}
        sub={parados ? `${parados} parados no total` : "Nada parado agora"} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
        {funil("Offset", d.offset, "#8456e8")}
        {funil("Digital", d.digital, "#e07b1f")}
      </div>
      <p className="mt-3 text-[11px] text-[#898892] flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-[#8456e8] opacity-85" />andando</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-[#d33a3c]" />parado (esperando resposta ou passou do prazo)</span>
        <span>· toque na etapa para ver quem</span>
      </p>
      <Gaveta aberta={!!aberta} titulo={aberta ? `${aberta.linha} · ${aberta.e.nome}` : ""} onFechar={() => setAberta(null)}
        sub={aberta ? `${aberta.e.quantos}${aberta.e.valor ? ` · ${brl(aberta.e.valor)}` : ""}${aberta.e.parados ? ` · ${aberta.e.parados} parados` : ""}` : undefined}>
        {aberta && (
          <div className="px-1">
            {aberta.e.itens.map((x, i) => (
              <button key={i} onClick={() => abrir(x)} className="ds-toque w-full text-left px-3 py-2.5 rounded-xl hover:bg-[rgba(116,116,128,0.06)] flex items-start gap-3">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${x.parado ? "bg-[#d33a3c]" : "bg-[#c7c7cc]"}`} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="flex-1 min-w-0 truncate text-[13.5px] font-semibold text-[#191625]">{x.nome}</span>
                    {x.valor ? <span className="text-[13px] font-semibold ds-num text-[#191625] shrink-0">{brl(x.valor)}</span> : null}
                  </span>
                  <span className="block text-[12px] text-[#898892] truncate">{x.sub}</span>
                  {x.parado && <span className="block text-[12px] text-[#d33a3c] font-medium">{x.parado}</span>}
                </span>
              </button>
            ))}
            {aberta.e.quantos > aberta.e.itens.length && <p className="px-3 py-2 text-[12px] text-[#898892]">Mostrando os {aberta.e.itens.length} primeiros (parados e maiores valores).</p>}
          </div>
        )}
      </Gaveta>
    </Cartao>
  )
}
