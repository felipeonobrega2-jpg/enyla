"use client"

// "Preço que fecha" no orçamento: chance histórica do tipo de cliente, último preço que ele pagou
// e, por quantidade, o preço sugerido comparado ao que costuma fechar (preço ÷ custo do motor)

import { Users, History, Scale } from "lucide-react"
import { Calculo } from "../types"
import { Section } from "./ui"
import { LinhaOrcamento, referenciaParaOrcamento, faixaQtd, AMOSTRA_MINIMA, ROTULO_QTD } from "../lib/precoQueFecha"
import { KanbanCard } from "../types"

const pct = (n: number | null) => n == null ? "—" : `${Math.round(n * 100)}%`
const x = (n: number) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const dataCurta = (iso?: string | null) => iso ? new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : ""

export function PrecoQueFecha({ linhas, calculo, comFaca, nomeCliente, kanban }: {
  linhas: LinhaOrcamento[]
  calculo: Calculo
  comFaca: boolean
  nomeCliente: string
  kanban: KanbanCard[]
}) {
  if (linhas.length < AMOSTRA_MINIMA) return null
  const tabela = calculo.tabela
  const ref = referenciaParaOrcamento(linhas, { nomeCliente, quantidade: tabela[0]?.quantidade ?? 0, kanban })
  const seg = ref.segmento
  const pouco = (n: number) => n < AMOSTRA_MINIMA

  // Markup que costuma fechar por faixa de quantidade (mediana dos ganhos)
  const refFaixa = (q: number) => {
    const ganhos = linhas.filter(l => l.faixaQtd === faixaQtd(q) && l.markup && l.desfecho === "ganho").map(l => l.markup!).sort((a, b) => a - b)
    if (!ganhos.length) return null
    const m = Math.floor(ganhos.length / 2)
    return { mediana: ganhos.length % 2 ? ganhos[m] : (ganhos[m - 1] + ganhos[m]) / 2, n: ganhos.length }
  }

  return (
    <Section title="Preço que fecha">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#898892] flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{ref.recorrente ? "Cliente que já comprou" : "Cliente novo"}</p>
          <p className="text-[24px] font-bold text-[#191625] mt-1 ds-num">{pct(seg.taxa)} <span className="text-[12.5px] font-medium text-[#898892]">fecham ({seg.ganhos} de {seg.total})</span></p>
          <p className="text-[12px] text-[#5e5c68] mt-1 leading-relaxed">
            {ref.recorrente
              ? "Quem já comprou fecha muito mais. Mantenha o preço do último pedido como referência."
              : `${pct(seg.total ? seg.semResposta / seg.total : null)} somem sem responder e só ${ref.porMotivoPreco} recusaram por preço: o acompanhamento depois do envio pesa mais que desconto.`}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#898892] flex items-center gap-1.5"><History className="w-3.5 h-3.5" />Último pedido</p>
          {ref.ultimoPedido ? <>
            <p className="text-[24px] font-bold text-[#191625] mt-1 ds-num">{brl(ref.ultimoPedido.unitario)} <span className="text-[12.5px] font-medium text-[#898892]">por unidade</span></p>
            <p className="text-[12px] text-[#5e5c68] mt-1">{ref.ultimoPedido.numero} · {ref.ultimoPedido.quantidade.toLocaleString("pt-BR")} un · {dataCurta(ref.ultimoPedido.data)}</p>
          </> : <p className="text-[12.5px] text-[#898892] mt-2">Primeira compra deste cliente.</p>}
        </div>
      </div>

      <div className="rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <p className="px-4 pt-3.5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-[#898892] flex items-center gap-1.5"><Scale className="w-3.5 h-3.5" />Preço sugerido × o que costuma fechar</p>
        <div className="divide-y divide-[rgba(60,60,67,0.06)]">
          {tabela.map(t => {
            const preco = comFaca && t.precoComFaca ? t.precoComFaca : t.precoSemFaca
            const markup = t.custoTotalSemFaca > 0 ? t.precoSemFaca / t.custoTotalSemFaca : null
            const r = refFaixa(t.quantidade)
            const leitura = !markup || !r ? null
              : markup > r.mediana * 1.15 ? { txt: "acima do que costuma fechar", cor: "#c57800" }
              : markup < r.mediana * 0.85 ? { txt: "abaixo do que costuma fechar", cor: "#2f7cf6" }
              : { txt: "na faixa que fecha", cor: "#009351" }
            return (
              <div key={t.quantidade} className="px-4 py-2.5 flex items-center gap-3 text-[12.5px]">
                <span className="w-24 font-semibold text-[#191625] ds-num">{t.quantidade.toLocaleString("pt-BR")} un</span>
                <span className="w-28 text-[#191625] ds-num">{brl(preco)}</span>
                <span className="w-16 text-[#5e5c68] ds-num">{markup ? x(markup) : "—"}</span>
                <span className="flex-1 text-[#898892] truncate">
                  {r ? <>fecharam em {x(r.mediana)} <span className="text-[11px]">({r.n} {r.n === 1 ? "venda" : "vendas"} de {ROTULO_QTD[faixaQtd(t.quantidade)].toLowerCase()}{pouco(r.n) ? ", pouca amostra" : ""})</span></> : "sem vendas nessa quantidade ainda"}
                </span>
                {leitura && <span className="text-[11.5px] font-semibold shrink-0" style={{ color: leitura.cor }}>{leitura.txt}</span>}
              </div>
            )
          })}
        </div>
        <p className="px-4 py-2.5 text-[11px] text-[#898892] border-t border-[rgba(60,60,67,0.06)]">Multiplicador = preço ÷ custo calculado pelo motor. Referência: mediana dos orçamentos que viraram pedido na mesma faixa de quantidade.</p>
      </div>
    </Section>
  )
}
