"use client"

// Saúde da empresa (Relatórios): quantos orçamentos para uma venda, pedidos por semana, tempo de entrega, ciclo de
// caixa (recebe x paga) e quanto do faturamento depende de poucos clientes. Janela móvel x a anterior.

import React from "react"
import { HeartPulse, ArrowUpRight, ArrowDownRight } from "lucide-react"
import type { KanbanCard } from "../types"
import type { Pedido } from "../lib/negocio"
import { saudeDoPeriodo, concentracao, janelas } from "../lib/saudeEmpresa"
import { Cartao, TituloCartao, Segmentado } from "./ds"
import { num, brl } from "../utils"

type Janela = "30" | "90" | "180"
const JANELAS: { v: Janela; nome: string }[] = [{ v: "30", nome: "30 dias" }, { v: "90", nome: "90 dias" }, { v: "180", nome: "180 dias" }]
const COR = { bom: "#009351", atencao: "#c57800", ruim: "#d33a3c", neutro: "#191625" }
type Tom = keyof typeof COR

const n1 = (v: number) => num(v, v < 10 && v % 1 !== 0 ? 1 : 0)
const diasTxt = (v: number) => { const t = n1(Math.abs(v)); return `${t} ${t === "1" ? "dia" : "dias"}` }

function Comparar({ atual, antes, formato, menorMelhor }: { atual: number | null; antes: number | null; formato: (n: number) => string; menorMelhor?: boolean }) {
  if (atual == null || antes == null) return <span className="text-[#898892]">sem período anterior para comparar</span>
  const dif = atual - antes
  if (Math.abs(dif) < Math.max(0.05, Math.abs(antes) * 0.03)) return <span className="text-[#898892]">igual ao período anterior ({formato(antes)})</span>
  const melhor = menorMelhor ? dif < 0 : dif > 0
  const Seta = dif > 0 ? ArrowUpRight : ArrowDownRight
  return <span className="inline-flex items-center gap-0.5" style={{ color: melhor ? COR.bom : COR.ruim }}><Seta className="w-3 h-3" />antes {formato(antes)}</span>
}

function Bloco({ rotulo, valor, tom = "neutro", detalhe, leitura, comparar }: { rotulo: string; valor: string; tom?: Tom; detalhe: React.ReactNode; leitura: React.ReactNode; comparar: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[rgba(116,116,128,0.05)] px-4 py-3.5 min-w-0 flex flex-col">
      <p className="text-[11px] font-medium text-[#898892]">{rotulo}</p>
      <p className="mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.02em] ds-num" style={{ color: COR[tom] }}>{valor}</p>
      <p className="mt-1.5 text-[11px] text-[#5e5c68] leading-snug">{detalhe}</p>
      <p className="mt-2 text-[11.5px] text-[#191625] leading-snug flex-1">{leitura}</p>
      <p className="mt-2 text-[10.5px] font-medium">{comparar}</p>
    </div>
  )
}

export function SaudeEmpresaCard({ kanban, pedidos }: { kanban: KanbanCard[]; pedidos: Pedido[] }) {
  const [janela, setJanela] = React.useState<Janela>("90")
  const { atual, anterior } = React.useMemo(() => janelas(Number(janela)), [janela])
  const a = React.useMemo(() => saudeDoPeriodo(kanban, pedidos, atual), [kanban, pedidos, atual])
  const b = React.useMemo(() => saudeDoPeriodo(kanban, pedidos, anterior), [kanban, pedidos, anterior])
  const doze = React.useMemo(() => janelas(365), [])
  const conc = React.useMemo(() => concentracao(pedidos, doze.atual), [pedidos, doze])
  const concAntes = React.useMemo(() => concentracao(pedidos, doze.anterior), [pedidos, doze])
  const antesTem = b.pedidos > 0 || b.orcamentos > 0

  const opv = a.orcamentosPorVenda
  const ciclo = a.cicloDias
  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Saúde da empresa" icone={<HeartPulse className="w-4 h-4" />}
        sub={`Últimos ${janela} dias comparados com os ${janela} dias antes deles. A concentração olha os últimos 12 meses.`}
        acao={<Segmentado<Janela> valor={janela} onChange={setJanela} opcoes={JANELAS} />} />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Bloco rotulo="Orçamentos para uma venda" valor={opv == null ? "—" : n1(opv)}
          tom={opv == null ? "neutro" : opv <= 4 ? "bom" : opv <= 7 ? "atencao" : "ruim"}
          detalhe={`${num(a.orcamentos)} orçamentos, ${num(a.pedidos)} ${a.pedidos === 1 ? "pedido fechado" : "pedidos fechados"}`}
          leitura={opv == null ? "Nenhum pedido fechado no período." : `A cada ${n1(opv)} orçamentos, 1 vira pedido.`}
          comparar={antesTem ? <Comparar atual={opv} antes={b.orcamentosPorVenda} formato={n1} menorMelhor /> : null} />
        <Bloco rotulo="Pedidos fechados por semana" valor={n1(a.pedidosPorSemana)}
          detalhe={`${num(a.pedidos)} em ${janela} dias`}
          leitura={a.pedidosPorSemana >= 1 ? `Ritmo de ${n1(a.pedidosPorSemana)} ${a.pedidosPorSemana < 1.5 ? "pedido" : "pedidos"} por semana.` : `Menos de 1 pedido por semana.`}
          comparar={antesTem ? <Comparar atual={a.pedidosPorSemana} antes={b.pedidosPorSemana} formato={n1} /> : null} />
        <Bloco rotulo="Tempo de entrega" valor={a.entregaDias == null ? "—" : diasTxt(a.entregaDias)}
          tom={a.entregaNoPrazoPct == null ? "neutro" : a.entregaNoPrazoPct >= 80 ? "bom" : a.entregaNoPrazoPct >= 60 ? "atencao" : "ruim"}
          detalhe={`${num(a.entregues)} ${a.entregues === 1 ? "entregue" : "entregues"}${a.entregaNoPrazoPct != null ? ` · ${Math.round(a.entregaNoPrazoPct)}% no prazo combinado` : ""}`}
          leitura={a.entregaDias == null ? "Nenhuma entrega com data marcada no período." : `Metade dos pedidos chega ao cliente em até ${diasTxt(a.entregaDias)} depois de fechar.`}
          comparar={b.entregues ? <Comparar atual={a.entregaDias} antes={b.entregaDias} formato={diasTxt} menorMelhor /> : null} />
        <Bloco rotulo="Ciclo de caixa" valor={ciclo == null ? "—" : ciclo > 0.5 ? `${diasTxt(ciclo)}` : ciclo < -0.5 ? `−${diasTxt(ciclo)}` : "0 dias"}
          tom={ciclo == null ? "neutro" : ciclo <= 0 ? "bom" : ciclo <= 10 ? "atencao" : "ruim"}
          detalhe={a.recebimentoDias == null || a.pagamentoDias == null ? "Faltam pagamentos lançados nos pedidos do período"
            : `Recebe em ${diasTxt(a.recebimentoDias)} · paga os custos em ${diasTxt(a.pagamentoDias)}`}
          leitura={ciclo == null ? "Lance os recebimentos e os custos dos pedidos para medir." : ciclo > 0.5 ? `Você banca cada pedido por uns ${diasTxt(ciclo)} até o dinheiro do cliente entrar.` : "O sinal do cliente paga os custos: você não banca o pedido."}
          comparar={<Comparar atual={ciclo} antes={b.cicloDias} formato={v => (v < 0 ? "−" : "") + diasTxt(v)} menorMelhor />} />
        <Bloco rotulo="Maior cliente (12 meses)" valor={conc.maior ? `${Math.round(conc.maior.pct)}%` : "—"}
          tom={!conc.maior ? "neutro" : conc.maior.pct <= 20 ? "bom" : conc.maior.pct <= 35 ? "atencao" : "ruim"}
          detalhe={conc.maior ? `${conc.maior.nome} · ${brl(conc.maior.valor)}` : "Sem vendas nos últimos 12 meses"}
          leitura={conc.maior ? `Os 3 maiores somam ${Math.round(conc.top3Pct)}% do vendido, entre ${num(conc.clientes)} clientes.${conc.maior.pct > 35 ? " Perder esse cliente pesa muito." : ""}` : ""}
          comparar={concAntes.maior ? <Comparar atual={conc.maior?.pct ?? null} antes={concAntes.maior.pct} formato={v => `${Math.round(v)}%`} menorMelhor /> : null} />
      </div>
    </Cartao>
  )
}
