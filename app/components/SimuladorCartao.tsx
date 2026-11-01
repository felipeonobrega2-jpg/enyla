"use client"

// Simulador "E se…": mexe nas alavancas e compara o mês simulado com o mês típico real

import { useState } from "react"
import { SlidersHorizontal, RotateCcw } from "lucide-react"
import { BaseSimulador, Alavancas, alavancasIniciais, simular } from "../lib/simulador"
import { Cartao, TituloCartao } from "./ds"
import { brl } from "../utils"

const pct = (n: number, casas = 0) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`

function Controle({ rotulo, dica, valor, min, max, passo, formato, onChange, base }: {
  rotulo: string; dica: string; valor: number; min: number; max: number; passo: number
  formato: (n: number) => string; onChange: (n: number) => void; base?: number
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] font-semibold text-[#191625]">{rotulo}</p>
        <p className="text-[13px] font-bold text-[#8456e8] ds-num">{formato(valor)}</p>
      </div>
      <input type="range" min={min} max={max} step={passo} value={valor} onChange={e => onChange(Number(e.target.value))}
        className="w-full mt-1.5 accent-[#8456e8]" aria-label={rotulo} />
      <p className="text-[11px] text-[#898892]">{dica}{base != null ? ` · hoje: ${formato(base)}` : ""}</p>
    </div>
  )
}

function Comparacao({ rotulo, base, sim }: { rotulo: string; base: number; sim: number }) {
  const d = sim - base
  return (
    <div className="rounded-xl p-4 bg-[rgba(116,116,128,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#898892]">{rotulo}</p>
      <p className="text-[22px] font-bold text-[#191625] ds-num mt-1">{brl(sim)}</p>
      <p className="text-[12px] ds-num" style={{ color: Math.abs(d) < 1 ? "#898892" : d > 0 ? "#009351" : "#d33a3c" }}>
        {Math.abs(d) < 1 ? `igual ao mês típico` : `${d > 0 ? "+" : "−"}${brl(Math.abs(d))} por mês`}
      </p>
    </div>
  )
}

export function SimuladorCartao({ base }: { base: BaseSimulador }) {
  const inicial = alavancasIniciais(base)
  const [a, setA] = useState<Alavancas>(inicial)
  const set = (k: keyof Alavancas) => (v: number) => setA(x => ({ ...x, [k]: v }))
  const r0 = simular(base, inicial), r = simular(base, a)
  const mexeu = JSON.stringify(a) !== JSON.stringify(inicial)
  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Simulador: e se…" icone={<SlidersHorizontal className="w-4 h-4" />}
        sub={`Mês típico dos últimos ${base.meses} meses: ${base.orcamentosNovosMes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} orçamentos de clientes novos, fechamento ${pct(base.taxaNovo)}, ticket ${brl(base.ticketNovo)}, ${brl(base.vendaRecorrenteMes)} em recompras, margem ${pct(base.margemPct)}`}
        acao={mexeu ? <button onClick={() => setA(inicial)} className="h-8 px-3 rounded-lg text-[12px] font-semibold text-[#8456e8] hover:bg-[#8456e8]/[0.08] flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" />Voltar ao real</button> : undefined} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <Comparacao rotulo="Vendas no mês" base={r0.vendas} sim={r.vendas} />
        <Comparacao rotulo="Margem no mês" base={r0.margem} sim={r.margem} />
        <Comparacao rotulo="Sobra depois dos fixos" base={r0.lucro} sim={r.lucro} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-5">
        <Controle rotulo="Fechamento de clientes novos" dica="acompanhar quem some depois do orçamento" valor={a.taxaNovo} base={base.taxaNovo}
          min={0} max={Math.max(0.5, Math.ceil(base.taxaNovo * 10) / 10)} passo={0.01} formato={n => pct(n)} onChange={set("taxaNovo")} />
        <Controle rotulo="Mais orçamentos por mês" dica="anúncio, indicação, Instagram" valor={a.maisOrcamentosPct}
          min={0} max={100} passo={5} formato={n => `+${n}%`} onChange={set("maisOrcamentosPct")} />
        <Controle rotulo="Preço" dica="o custo de produção não muda: a diferença vira margem" valor={a.precoPct}
          min={-15} max={20} passo={1} formato={n => `${n > 0 ? "+" : ""}${n}%`} onChange={set("precoPct")} />
        <Controle rotulo="Quanto o aumento derruba o fechamento" dica="pontos perdidos a cada +10% de preço; ainda não dá para medir, escolha um palpite" valor={a.perdaPorAumento}
          min={0} max={10} passo={0.5} formato={n => `${n.toLocaleString("pt-BR")} pts`} onChange={set("perdaPorAumento")} />
        <Controle rotulo="Clientes reativados por mês" dica={`cada um compra ~${brl(base.ticketRecorrente)}`} valor={a.reativadosMes}
          min={0} max={5} passo={1} formato={n => String(n)} onChange={set("reativadosMes")} />
        <Controle rotulo="Anúncio por mês" dica="entra como gasto; junte com “mais orçamentos”" valor={a.anuncioMes}
          min={0} max={5000} passo={100} formato={brl} onChange={set("anuncioMes")} />
      </div>
      {a.precoPct > 0 && a.perdaPorAumento > 0 && (
        <p className="text-[11.5px] text-[#898892] mt-4">Com o aumento, o fechamento de clientes novos cai para {pct(r.taxaEfetiva, 1)}.</p>
      )}
      <p className="text-[11px] text-[#898892] mt-3">Gastos fixos considerados: {brl(base.fixosMes)} por mês (os cadastrados em Configurações). Estimativa simples para comparar caminhos, não uma promessa.</p>
    </Cartao>
  )
}
