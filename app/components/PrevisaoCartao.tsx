"use client"

// Próximos 30 dias: vendas esperadas (com a conta à vista), carga da produção e entregas por semana

import { Telescope, FileText, RotateCcw, Factory, CalendarX2 } from "lucide-react"
import { Previsao } from "../lib/previsao"
import { Cartao, TituloCartao, LinhaLista, Colunas, Selo } from "./ds"
import { brl, num } from "../utils"

const mil = (n: number) => n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : num(n)
const pct = (n: number) => `${Math.round(n * 100)}%`
const curta = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })

export function PrevisaoCartao({ p, onAbrirCliente }: { p: Previsao; onAbrirCliente: (nome: string) => void }) {
  const carga = p.unidadesEmProducao + p.unidadesEsperadas
  const leituraCarga = !p.mesTipico ? null
    : p.mesMaisCheio && carga > p.mesMaisCheio ? { txt: "acima do mês mais cheio: confirme prazos com os fornecedores", tom: "perigo" as const }
    : carga > p.mesTipico * 1.2 ? { txt: "acima do mês típico", tom: "alerta" as const }
    : { txt: "dentro do normal", tom: "sucesso" as const }
  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo={`Próximos ${p.dias} dias`} icone={<Telescope className="w-4 h-4" />}
        sub={`Orçamentos abertos e recompras previstas, cada um pela chance real de fechar (cliente novo ${pct(p.chanceNovo)}, quem já comprou ${pct(p.chanceRecorrente)})`} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl p-4" style={{ background: "rgba(132,86,232,0.06)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8456e8]">Vendas esperadas</p>
          <p className="text-[24px] font-bold text-[#191625] ds-num mt-1">{brl(p.esperado)}</p>
          <p className="text-[11.5px] text-[#898892]">se tudo fechar: {brl(p.seTudoFechar)}</p>
        </div>
        <div className="rounded-xl p-4 bg-[rgba(116,116,128,0.05)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#898892] flex items-center gap-1.5"><Factory className="w-3.5 h-3.5" />Carga da produção</p>
          <p className="text-[24px] font-bold text-[#191625] ds-num mt-1">{mil(carga)} <span className="text-[13px] font-medium text-[#898892]">un</span></p>
          <p className="text-[11.5px] text-[#898892]">{mil(p.unidadesEmProducao)} em produção + ~{mil(p.unidadesEsperadas)} esperadas{p.mesTipico ? ` · mês típico ${mil(p.mesTipico)}` : ""}</p>
          {leituraCarga && <div className="mt-1.5"><Selo tom={leituraCarga.tom}>{leituraCarga.txt}</Selo></div>}
        </div>
        <div className="rounded-xl p-4 bg-[rgba(116,116,128,0.05)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#898892] flex items-center gap-1.5"><CalendarX2 className="w-3.5 h-3.5" />Entregas atrasadas</p>
          <p className="text-[24px] font-bold ds-num mt-1" style={{ color: p.atrasadas.length ? "#d33a3c" : "#191625" }}>{p.atrasadas.length}</p>
          <p className="text-[11.5px] text-[#898892] truncate">{p.atrasadas.length ? p.atrasadas.map(a => a.numero).join(", ") : "tudo no prazo"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <div>
          <p className="text-[11.5px] font-semibold text-[#5e5c68] mb-1">De onde vem a previsão</p>
          {p.itens.length === 0
            ? <p className="text-[12px] text-[#898892] py-3">Nenhum orçamento aberto nem recompra prevista para o período.</p>
            : <div className="-mx-2">{p.itens.map((i, k) => (
                <LinhaLista key={k} titulo={i.titulo} sub={i.sub} tom={i.tipo === "recompra" ? "acento" : "info"}
                  icone={i.tipo === "recompra" ? <RotateCcw className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  valor={brl(i.valor * i.chance)} valorSub={`${pct(i.chance)} de ${brl(i.valor)}`}
                  onClick={() => onAbrirCliente(i.cliente ?? i.card?.nomeCliente ?? "")} />
              ))}</div>}
        </div>
        <div>
          <p className="text-[11.5px] font-semibold text-[#5e5c68] mb-2">Entregas previstas por semana (unidades)</p>
          <Colunas formato={n => `${mil(n)} un`} altura={120}
            itens={p.semanas.map((s, i) => ({ rotulo: i === 0 ? "esta" : curta(s.inicio), valor: s.unidades, destaque: i === 0 }))} />
          <p className="text-[11px] text-[#898892] mt-2">Pelas datas de entrega previstas dos pedidos em produção. Pedido sem data não entra.</p>
        </div>
      </div>
    </Cartao>
  )
}
