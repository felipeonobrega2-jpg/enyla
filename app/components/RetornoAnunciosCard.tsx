"use client"

// Painel → Retorno dos anúncios: quanto foi para a Meta no período e o que isso virou em venda, dinheiro no caixa
// e margem (pedidos fechados por clientes que vieram de anúncio). A pergunta que manda na verba.

import { useEffect, useState } from "react"
import { Megaphone } from "lucide-react"
import { Cartao, TituloCartao, Selo } from "./ds"
import type { Pedido, Periodo } from "../lib/negocio"
import { noPeriodo } from "../lib/negocio"
import type { Cliente } from "../types"
import { retornoDoPeriodo, margemPorReal } from "../lib/retornoCampanhas"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const dia = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

function Valor({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="flex-1 min-w-[110px] rounded-xl px-3 py-2 bg-[rgba(116,116,128,0.06)]">
      <p className="text-[10.5px] font-medium text-[#898892] truncate">{rotulo}</p>
      <p className="text-[16px] font-semibold ds-num leading-tight" style={{ color: cor ?? "#191625" }}>{valor}</p>
    </div>
  )
}

export function RetornoAnunciosCard({ pedidos, clientes, periodo, nomePeriodo, onAbrir }: {
  pedidos: Pedido[]; clientes: Cliente[]; periodo: Periodo; nomePeriodo: string; onAbrir?: () => void
}) {
  const [gasto, setGasto] = useState<number | null>(null)
  const since = periodo.from ? dia(periodo.from) : null
  const until = dia(periodo.to ?? new Date())
  useEffect(() => {
    setGasto(null)
    fetch(since ? `/api/meta?since=${since}&until=${until}` : "/api/meta?preset=maximum")
      .then(r => r.json()).then(d => setGasto(d?.totals ? Number(d.totals.spend) || 0 : -1)).catch(() => setGasto(-1))
  }, [since, until])

  const r = retornoDoPeriodo(pedidos, clientes, d => noPeriodo(d, periodo))
  if (gasto === -1 || (gasto === 0 && !r.pedidos)) return null   // sem Meta ligada ou sem anúncio no período
  const porReal = gasto ? margemPorReal(r, gasto) : null
  const cor = porReal == null ? "#191625" : porReal >= 1 ? "#009351" : "#d92d20"

  return (
    <Cartao onClick={onAbrir}>
      <TituloCartao icone={<Megaphone size={16} />} titulo="Retorno dos anúncios"
        sub={`Pedidos fechados no ${nomePeriodo} por clientes que vieram de anúncio`}
        acao={porReal != null ? <Selo tom={porReal >= 1 ? "sucesso" : "perigo"}>{porReal >= 1 ? "Se pagou" : "Ainda não se pagou"}</Selo> : undefined} />
      <div className="flex flex-wrap gap-2">
        <Valor rotulo="Gasto na Meta" valor={gasto == null ? "…" : brl(gasto)} />
        <Valor rotulo={`Vendido · ${r.pedidos} pedido${r.pedidos === 1 ? "" : "s"}`} valor={brl(r.venda)} />
        <Valor rotulo="Já recebido" valor={brl(r.recebido)} />
        <Valor rotulo={`Margem${r.margemEstimada ? " (parte estimada)" : ""}`} valor={brl(r.margem)} />
      </div>
      {porReal != null && (
        <p className="text-[13px] mt-3 text-[#5d5b66]">
          Cada R$ 1 de anúncio virou <span className="font-semibold ds-num" style={{ color: cor }}>{porReal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span> de margem.
          {r.margemEstimada ? " Lance os custos dos pedidos para o número ficar exato." : ""}
        </p>
      )}
    </Cartao>
  )
}
