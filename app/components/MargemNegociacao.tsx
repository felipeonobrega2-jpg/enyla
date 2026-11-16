"use client"

// Margem de negociação pelas sobras: quanto dá para baixar o preço sem perder, porque as sobras do offset
// (até 10% a mais na tiragem) costumam pagar a diferença. Só para quantidades de offset (1.000+).

import { HandCoins } from "lucide-react"
import type { Calculo } from "../types"
import type { EstatisticaSobras } from "../lib/sobras"
import { brl, num } from "../utils"

const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`

export function MargemNegociacao({ calculo, comFaca, sobras }: { calculo: Calculo; comFaca: boolean; sobras: EstatisticaSobras | null }) {
  const linhas = calculo.tabela.filter(l => l.quantidade >= 1000)
  if (!sobras || !linhas.length || sobras.pctEsperado <= 0) return null
  const p = sobras.pctEsperado
  return (
    <div className="rounded-2xl bg-white p-5 ds-cartao">
      <p className="text-[13.5px] font-semibold text-[#191625] flex items-center gap-2"><HandCoins className="w-4 h-4 text-[#8456e8]" />Margem de negociação (sobras)</p>
      <p className="text-[11.5px] text-[#898892] mt-0.5 leading-snug">
        Nos últimos {sobras.pedidos} pedidos entregues, as sobras renderam <b className="text-[#191625]">{pct(p)}</b> do valor somando todos.
        Em {sobras.comSobra} deles houve sobra vendida, e nesses ela rendeu em geral {pct(sobras.pctQuandoTem)}{sobras.unidadesQuandoTem ? ` (${pct(sobras.unidadesQuandoTem)} de unidades a mais)` : ""}.
        Se o cliente pedir desconto, até {pct(p)} as sobras costumam cobrir.
      </p>
      <table className="mt-3 w-full text-[12.5px]">
        <thead>
          <tr className="text-[10.5px] font-bold uppercase tracking-wider text-[#898892]">
            <th className="text-left font-bold pb-1.5">Quantidade</th>
            <th className="text-right font-bold pb-1.5">Pode baixar até</th>
            <th className="text-right font-bold pb-1.5">Preço mínimo</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => {
            const preco = comFaca ? l.precoComFaca : l.precoSemFaca
            return (
              <tr key={l.quantidade} className="border-t border-[rgba(60,60,67,0.06)]">
                <td className="py-1.5 ds-num text-[#191625]">{num(l.quantidade)} un · {brl(preco)}</td>
                <td className="py-1.5 ds-num text-right text-[#c57800] font-semibold">−{brl(preco * p)}</td>
                <td className="py-1.5 ds-num text-right font-semibold text-[#191625]">{brl(preco * (1 - p))} <span className="text-[#898892] font-normal">({brl(preco * (1 - p) / l.quantidade)}/un)</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
