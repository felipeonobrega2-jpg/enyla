"use client"

import React from "react"
import { FileDown, TrendingUp, Megaphone, Layers, ArrowUpRight, ArrowDownRight, Minus, CalendarRange, Package } from "lucide-react"
import { KanbanCard, LancamentoFinanceiro, Cliente } from "../types"
import {
  Periodo, montarPedidos, vendasDoPeriodo, caixaDoPeriodo, conversao, orcamentosDoPeriodo, margemContribuicao,
  pipelineComercial, noPeriodo, nomeChave, isTerceirizado, recebiveis,
} from "../lib/negocio"
import { brl, num } from "../utils"
import { CabecalhoPagina, Segmentado, Botao, Cartao, TituloCartao, ColunasDuplas, Colunas, ListaBarras, Vazio } from "./ds"
import { gerarHtmlRelatorio } from "./DashboardView"

// Relatórios: comparações que nenhuma outra tela faz (período × anterior × ano passado),
// evolução mensal de venda e custo, origem dos clientes e materiais. Números de lib/negocio.

type Escala = "mes" | "trimestre" | "ano"

const ESCALAS: { v: Escala; nome: string }[] = [
  { v: "mes", nome: "Mês" },
  { v: "trimestre", nome: "Trimestre" },
  { v: "ano", nome: "Ano" },
]

// Período atual (até hoje), o anterior de mesmo tamanho e o mesmo período do ano passado
function periodos(escala: Escala, hoje: Date): { atual: Periodo; anterior: Periodo; anoPassado: Periodo; nome: string } {
  const y = hoje.getFullYear(), m = hoje.getMonth(), d = hoje.getDate()
  const fim = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 23, 59, 59)
  if (escala === "mes") {
    return {
      atual: { from: new Date(y, m, 1), to: fim(hoje) },
      anterior: { from: new Date(y, m - 1, 1), to: fim(new Date(y, m - 1, Math.min(d, new Date(y, m, 0).getDate()))) },
      anoPassado: { from: new Date(y - 1, m, 1), to: fim(new Date(y - 1, m, d)) },
      nome: hoje.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    }
  }
  if (escala === "trimestre") {
    const q = Math.floor(m / 3) * 3
    const dias = Math.round((hoje.getTime() - new Date(y, q, 1).getTime()) / 86_400_000)
    const ini = (yy: number, mm: number) => new Date(yy, mm, 1)
    const corte = (dt: Date) => fim(new Date(dt.getTime() + dias * 86_400_000))
    return {
      atual: { from: ini(y, q), to: fim(hoje) },
      anterior: { from: ini(y, q - 3), to: corte(ini(y, q - 3)) },
      anoPassado: { from: ini(y - 1, q), to: corte(ini(y - 1, q)) },
      nome: `${q / 3 + 1}º trimestre de ${y}`,
    }
  }
  return {
    atual: { from: new Date(y, 0, 1), to: fim(hoje) },
    anterior: { from: new Date(y - 1, 0, 1), to: fim(new Date(y - 1, m, d)) },
    anoPassado: { from: new Date(y - 1, 0, 1), to: fim(new Date(y - 1, m, d)) },
    nome: String(y),
  }
}

type Linha = { nome: string; formato: (n: number) => string; valores: [number | null, number | null, number | null]; menorMelhor?: boolean }

function Delta({ atual, base, menorMelhor }: { atual: number | null; base: number | null; menorMelhor?: boolean }) {
  if (atual == null || base == null) return <span className="text-[#c7c7cc]">—</span>
  if (base === 0) return atual === 0 ? <span className="text-[#898892]">0%</span> : <span className="text-[#898892]">novo</span>
  const pct = (atual - base) / Math.abs(base) * 100
  const bom = menorMelhor ? pct < 0 : pct > 0
  const Icone = Math.abs(pct) < 0.5 ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 ds-num font-semibold ${Math.abs(pct) < 0.5 ? "text-[#898892]" : bom ? "text-[#009351]" : "text-[#d33a3c]"}`}>
      <Icone className="w-3.5 h-3.5" />{num(Math.abs(pct), 0)}%
    </span>
  )
}

export function RelatoriosView({ kanban, lancamentos, clientes, onAbrirCliente }: {
  kanban: KanbanCard[]
  lancamentos: LancamentoFinanceiro[]
  clientes: Cliente[]
  onAbrirCliente: (nome: string) => void
}) {
  const [escala, setEscala] = React.useState<Escala>("mes")
  const hoje = React.useMemo(() => new Date(), [])
  const per = periodos(escala, hoje)
  const pedidos = React.useMemo(() => montarPedidos(kanban, lancamentos), [kanban, lancamentos])

  // Primeiro pedido de cada cliente (para contar clientes novos)
  const primeiroPedido = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const p of pedidos) {
      if (!p.dataFechamento) continue
      const k = nomeChave(p.nomeCliente)
      if (!m.has(k) || p.dataFechamento < m.get(k)!) m.set(k, p.dataFechamento)
    }
    return m
  }, [pedidos])

  const medir = (p: Periodo) => {
    const v = vendasDoPeriodo(pedidos, lancamentos, p)
    const cx = caixaDoPeriodo(lancamentos, p, hoje)
    const desp = lancamentos.filter(l => l.tipo === "despesa" && l.status === "pago" && l.formaPagamento !== "conta" && noPeriodo(l.dataPagamento ?? l.dataVencimento, p)).reduce((s, l) => s + l.valor, 0)
    const conv = conversao(orcamentosDoPeriodo(kanban, p))
    const mg = margemContribuicao(v.pedidos)
    const novos = [...primeiroPedido.values()].filter(d => noPeriodo(d, p)).length
    return {
      vendido: v.receita, pedidos: v.pedidos.length, ticket: v.ticketMedio, unidades: v.unidades, precoUnidade: v.precoMedioUnidade, recebido: cx.recebido, despesas: desp,
      caixa: cx.recebido - desp, orcamentos: conv.total, conversao: conv.decididos ? conv.taxa : null, margem: mg.pct, novos,
    }
  }
  const [a, b, c] = [medir(per.atual), medir(per.anterior), medir(per.anoPassado)]
  const linhas: Linha[] = [
    { nome: "Vendido", formato: brl, valores: [a.vendido, b.vendido, c.vendido] },
    { nome: "Pedidos fechados", formato: n => num(n), valores: [a.pedidos, b.pedidos, c.pedidos] },
    { nome: "Ticket médio", formato: brl, valores: [a.ticket, b.ticket, c.ticket] },
    { nome: "Unidades vendidas", formato: n => `${num(n)} un`, valores: [a.unidades, b.unidades, c.unidades] },
    { nome: "Preço médio por unidade", formato: brl, valores: [a.precoUnidade, b.precoUnidade, c.precoUnidade] },
    { nome: "Recebido", formato: brl, valores: [a.recebido, b.recebido, c.recebido] },
    { nome: "Despesas pagas", formato: brl, valores: [a.despesas, b.despesas, c.despesas], menorMelhor: true },
    { nome: "Geração de caixa", formato: brl, valores: [a.caixa, b.caixa, c.caixa] },
    { nome: "Orçamentos enviados", formato: n => num(n), valores: [a.orcamentos, b.orcamentos, c.orcamentos] },
    { nome: "Conversão", formato: n => `${num(n, 1)}%`, valores: [a.conversao, b.conversao, c.conversao] },
    { nome: "Margem de contribuição", formato: n => `${num(n, 1)}%`, valores: [a.margem, b.margem, c.margem] },
    { nome: "Clientes novos", formato: n => num(n), valores: [a.novos, b.novos, c.novos] },
  ]

  // 12 meses: vendido × custo direto lançado dos pedidos fechados no mês
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 11 + i, 1)
    const p: Periodo = { from: d, to: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59) }
    const doMes = pedidos.filter(x => noPeriodo(x.dataFechamento, p))
    return { rotulo: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), a: doMes.reduce((s, x) => s + x.venda, 0), b: doMes.reduce((s, x) => s + x.custoDireto, 0), destaque: i === 11,
      unidades: vendasDoPeriodo(pedidos, lancamentos, p).unidades }
  })

  // Origem dos clientes (campanha informada no cadastro) × valor comprado no período
  const origemDe = (nome: string) => clientes.find(cl => nomeChave(cl.nome) === nomeChave(nome))?.origemCampanhaNome || "Sem origem informada"
  const porOrigem = new Map<string, { valor: number; clientes: Set<string> }>()
  for (const p of pedidos.filter(x => noPeriodo(x.dataFechamento, per.atual))) {
    const o = origemDe(p.nomeCliente)
    const atual = porOrigem.get(o) ?? { valor: 0, clientes: new Set<string>() }
    atual.valor += p.valor; atual.clientes.add(nomeChave(p.nomeCliente))
    porOrigem.set(o, atual)
  }
  const origens = [...porOrigem.entries()].sort((x, y) => y[1].valor - x[1].valor)

  // Materiais dos pedidos fechados no período (para planejar compra de papel)
  const porMaterial = new Map<string, { qtd: number; valor: number }>()
  for (const p of pedidos.filter(x => noPeriodo(x.dataFechamento, per.atual))) {
    for (const card of p.cards.filter(cc => !isTerceirizado(cc))) {
      const nome = card.materialNome || "Sem material"
      const atual = porMaterial.get(nome) ?? { qtd: 0, valor: 0 }
      atual.qtd += card.quantidade; atual.valor += card.preco
      porMaterial.set(nome, atual)
    }
  }
  const materiais = [...porMaterial.entries()].sort((x, y) => y[1].valor - x[1].valor)

  function abrirPdf() {
    const v = vendasDoPeriodo(pedidos, lancamentos, per.atual)
    const conv = conversao(orcamentosDoPeriodo(kanban, per.atual))
    const rec = recebiveis(pedidos, lancamentos)
    const top = new Map<string, { nome: string; total: number; count: number }>()
    for (const p of v.pedidos) {
      const k = nomeChave(p.nomeCliente)
      const t = top.get(k) ?? { nome: p.nomeCliente, total: 0, count: 0 }
      t.total += p.valor; t.count += 1; top.set(k, t)
    }
    const html = gerarHtmlRelatorio({
      periodoLabel: per.nome,
      dreRec: a.recebido, dreDesp: a.despesas,
      kpisData: {
        receita: v.receita, vendas: v.pedidos.length, ticket: v.ticketMedio, conversao: conv.taxa,
        pipelineGlobal: pipelineComercial(kanban).valor, total: conv.total, clientesUnicos: new Set(v.pedidos.map(p => nomeChave(p.nomeCliente))).size,
      },
      topClientesData: [...top.values()].sort((x, y) => y.total - x.total).slice(0, 8),
      materiaisData: materiais.slice(0, 8).map(([nome, m]) => ({ nome, count: m.qtd, value: m.valor })),
      aReceber: rec.aReceber, aReceberCount: rec.comSaldo.length,
      vencidos: rec.vencido, vencidosCount: rec.comSaldo.filter(p => p.vencido > 0.5).length,
      dataGeracao: new Date().toLocaleString("pt-BR"),
    })
    const w = window.open("", "_blank")
    if (!w) return
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  const nomeAnterior = escala === "mes" ? "Mês anterior" : escala === "trimestre" ? "Trimestre anterior" : "Ano anterior"
  // Só compara com o ano passado quando há dados nele (o sistema começou em 2026)
  const temAnoPassado = escala !== "ano" && (c.vendido > 0 || c.orcamentos > 0 || c.recebido > 0)
  const nomeAtual = per.nome.charAt(0).toUpperCase() + per.nome.slice(1)

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-page)" }}>
      <div className="max-w-[1320px] mx-auto px-6 pt-6 pb-10 space-y-4">
        <CabecalhoPagina
          titulo="Relatórios"
          sub={`Comparação de ${per.nome} com o período anterior${temAnoPassado ? " e com o mesmo período do ano passado" : ""}, sempre até a data de hoje`}
          acoes={<>
            <Segmentado<Escala> valor={escala} onChange={setEscala} opcoes={ESCALAS} />
            <Botao variante="secundario" icone={<FileDown className="w-4 h-4" />} onClick={abrirPdf}>Relatório em PDF</Botao>
          </>}
        />

        <Cartao padding={false} className="ds-entrada">
          <div className="px-5 pt-5">
            <TituloCartao titulo="Comparação" icone={<CalendarRange className="w-4 h-4" />}
              sub={`Setas verdes melhoram, vermelhas pioram. Despesas menores contam como melhora.${escala !== "ano" && !temAnoPassado ? " A comparação com o ano passado aparece quando houver dados de um ano atrás." : ""}`} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[11px] text-[#898892]">
                  <th className="px-5 py-2.5 text-left font-medium">Indicador</th>
                  <th className="px-4 py-2.5 text-right font-medium">{nomeAtual}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{nomeAnterior}</th>
                  <th className="px-4 py-2.5 text-right font-medium w-[90px]">Variação</th>
                  {temAnoPassado && <>
                    <th className="px-4 py-2.5 text-right font-medium">Ano passado</th>
                    <th className="px-5 py-2.5 text-right font-medium w-[90px]">Variação</th>
                  </>}
                </tr>
              </thead>
              <tbody className="ds-escalonado">
                {linhas.map(l => (
                  <tr key={l.nome} className="border-t border-[rgba(60,60,67,0.06)] hover:bg-[rgba(116,116,128,0.03)] transition-colors">
                    <td className="px-5 py-3 font-medium text-[#191625]">{l.nome}</td>
                    <td className="px-4 py-3 text-right ds-num font-semibold text-[#191625]">{l.valores[0] == null ? "—" : l.formato(l.valores[0])}</td>
                    <td className="px-4 py-3 text-right ds-num text-[#5e5c68]">{l.valores[1] == null ? "—" : l.formato(l.valores[1])}</td>
                    <td className="px-4 py-3 text-right"><Delta atual={l.valores[0]} base={l.valores[1]} menorMelhor={l.menorMelhor} /></td>
                    {temAnoPassado && <>
                      <td className="px-4 py-3 text-right ds-num text-[#5e5c68]">{l.valores[2] == null ? "—" : l.formato(l.valores[2])}</td>
                      <td className="px-5 py-3 text-right"><Delta atual={l.valores[0]} base={l.valores[2]} menorMelhor={l.menorMelhor} /></td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>

        <Cartao className="ds-entrada">
          <TituloCartao titulo="Vendido e custo por mês" icone={<TrendingUp className="w-4 h-4" />}
            sub="Pedidos pela data de fechamento; custo = custos diretos lançados nesses pedidos. Passe o mouse para ver a diferença." />
          <ColunasDuplas formato={brl} nomes={["Vendido", "Custo lançado"]} itens={meses} />
        </Cartao>

        <Cartao className="ds-entrada">
          <TituloCartao titulo="Unidades vendidas por mês" icone={<Package className="w-4 h-4" />}
            sub={`Caixas dos pedidos fechados no mês, mais as sobras vendidas · ${num(meses.reduce((s, m) => s + m.unidades, 0))} un em 12 meses`} />
          <Colunas formato={n => `${num(n)} un`} itens={meses.map(m => ({ rotulo: m.rotulo, valor: m.unidades, destaque: m.destaque }))} />
        </Cartao>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          <Cartao className="ds-entrada">
            <TituloCartao titulo="De onde vêm os clientes" icone={<Megaphone className="w-4 h-4" />}
              sub={`Valor dos pedidos de ${per.nome} por origem informada no cadastro do cliente`} />
            {origens.length === 0
              ? <Vazio icone={<Megaphone className="w-8 h-8" />} titulo="Nenhum pedido no período" />
              : <ListaBarras formatoValor={brl} onClick={k => { const o = origens[Number(k)]; const nome = [...o[1].clientes][0]; if (nome) onAbrirCliente(pedidos.find(p => nomeChave(p.nomeCliente) === nome)?.nomeCliente ?? nome) }}
                  itens={origens.map(([nome, o], i) => ({ chave: i, rotulo: nome, qtd: o.clientes.size, valor: o.valor, peso: o.valor, tom: nome === "Sem origem informada" ? "neutro" as const : "acento" as const }))} />}
            {origens.some(([n]) => n === "Sem origem informada") && (
              <p className="text-[11px] text-[#898892] mt-3">Informe a origem no perfil do cliente para saber quais campanhas trazem venda. O número em negrito é a quantidade de clientes.</p>
            )}
          </Cartao>
          <Cartao className="ds-entrada">
            <TituloCartao titulo="Materiais vendidos" icone={<Layers className="w-4 h-4" />}
              sub={`Pedidos de ${per.nome}: valor por material; o número em negrito é a quantidade de unidades`} />
            {materiais.length === 0
              ? <Vazio icone={<Layers className="w-8 h-8" />} titulo="Nenhum pedido no período" />
              : <ListaBarras formatoValor={brl}
                  itens={materiais.map(([nome, m], i) => ({ chave: i, rotulo: nome, qtd: m.qtd, valor: m.valor, peso: m.valor }))} />}
          </Cartao>
        </div>
      </div>
    </div>
  )
}

