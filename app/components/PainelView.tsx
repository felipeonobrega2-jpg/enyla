"use client"

import React from "react"
import {
  AlertTriangle, CalendarClock, CalendarX2, CircleDollarSign, Clock, Factory, FileText, Hourglass,
  MessageCircle, Percent, Plus, Receipt, TrendingUp, Truck, Users, Wallet, CheckCircle2, ArrowRight, Target, Trophy,
} from "lucide-react"
import { KanbanCard, LancamentoFinanceiro, PropostaCustom, Cliente, FormData, COL_HOT } from "../types"
import { Configuracoes } from "../config"
import {
  Periodo, montarPedidos, vendasDoPeriodo, caixaDoPeriodo, conversao, orcamentosDoPeriodo, producao,
  pipelineComercial, margemContribuicao, isTerceirizado, isAberto, isGanho, isPerdido, isExpirado,
  parseData, diasAte, nomeChave, noPeriodo, Pedido, recebiveis, pedidoEntregue,
} from "../lib/negocio"
import { normalizarProducao } from "../lib/producao"
import { MARCOS } from "./GamificacaoView"
import { brl, num } from "../utils"
import {
  Pagina, CabecalhoPagina, Cartao, TituloCartao, Kpi, GradeKpis, Segmentado, Botao, LinhaLista,
  ListaBarras, Colunas, Vazio, Gaveta, Selo, Tom,
} from "./ds"

type PeriodoId = "mes" | "mesPassado" | "90d" | "ano"

const PERIODOS: { v: PeriodoId; nome: string }[] = [
  { v: "mes", nome: "Este mês" },
  { v: "mesPassado", nome: "Mês passado" },
  { v: "90d", nome: "90 dias" },
  { v: "ano", nome: "Ano" },
]

function periodoDe(id: PeriodoId, hoje: Date): Periodo {
  const y = hoje.getFullYear(), m = hoje.getMonth()
  const fim = new Date(y, m, hoje.getDate(), 23, 59, 59)
  switch (id) {
    case "mes":        return { from: new Date(y, m, 1), to: fim }
    case "mesPassado": return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0, 23, 59, 59) }
    case "90d":        return { from: new Date(y, m, hoje.getDate() - 89), to: fim }
    case "ano":        return { from: new Date(y, 0, 1), to: fim }
  }
}

const brlCurto = (n: number) =>
  Math.abs(n) >= 100_000 ? `R$ ${num(n / 1000, 0)} mil`
  : Math.abs(n) >= 10_000 ? `R$ ${num(n / 1000, 1)} mil`
  : brl(n)
const pct = (n: number) => `${num(n, 1)}%`
const dataCurta = (iso?: string) => {
  const d = parseData(iso)
  return d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : "—"
}
const prazoTexto = (iso?: string) => {
  if (!iso) return "sem prazo"
  const d = diasAte(iso)
  if (d < 0) return `atrasado ${-d} ${-d === 1 ? "dia" : "dias"}`
  if (d === 0) return "entrega hoje"
  if (d === 1) return "entrega amanhã"
  return `entrega em ${d} dias`
}

type HistItem = { form: FormData; numero?: string }

type Detalhe = { titulo: string; sub?: string; linhas: React.ReactNode; destino?: { nome: string; ir: () => void } }

export function PainelView({
  kanban, lancamentos, historico, propostasCustom, clientes, config,
  onAbrirCard, onAbrirCliente, onNavegar, onNovoOrcamento, onLancarCobranca, onSalvarMeta,
}: {
  kanban: KanbanCard[]
  lancamentos: LancamentoFinanceiro[]
  historico: HistItem[]
  propostasCustom: PropostaCustom[]
  clientes: Cliente[]
  config: Configuracoes
  onAbrirCard: (card: KanbanCard) => void
  onAbrirCliente: (nome: string) => void
  onNavegar: (view: "orcamentos" | "pedidos" | "financeiro" | "fornecedores" | "clientes") => void
  onNovoOrcamento: () => void
  onLancarCobranca?: (prefill: Partial<LancamentoFinanceiro>) => void
  onSalvarMeta?: (metaMensal: number) => void
}) {
  const [periodoId, setPeriodoId] = React.useState<PeriodoId>("mes")
  const [detalhe, setDetalhe] = React.useState<Detalhe | null>(null)
  const fechar = React.useCallback(() => setDetalhe(null), [])

  const hoje = React.useMemo(() => new Date(), [])
  const periodo = React.useMemo(() => periodoDe(periodoId, hoje), [periodoId, hoje])
  const nomePeriodo = PERIODOS.find(p => p.v === periodoId)!.nome.toLowerCase()

  const pedidos = React.useMemo(() => montarPedidos(kanban, lancamentos), [kanban, lancamentos])
  const vendas = vendasDoPeriodo(pedidos, lancamentos, periodo)
  const caixa = caixaDoPeriodo(lancamentos, periodo, hoje)
  const orcs = orcamentosDoPeriodo(kanban, periodo)
  const conv = conversao(orcs)
  const pipe = pipelineComercial(kanban)
  const margem = margemContribuicao(vendas.pedidos)
  const prod = producao(pedidos, hoje)
  const rec = recebiveis(pedidos, lancamentos)

  const cardDoPedido = (p: Pedido) => p.cards.find(c => !isTerceirizado(c)) ?? p.cards[0]
  const telefoneDe = (nome: string) => clientes.find(c => nomeChave(c.nome) === nomeChave(nome))?.telefone

  // ── O que precisa de ação ──────────────────────────────────────────────────
  const validadeDe = (card: KanbanCard) =>
    historico.find(h => h.numero === card.numero)?.form?.validadeDias
    ?? propostasCustom.find(p => p.cardId === card.id)?.validadeDias
    ?? 30
  const vencendo = kanban
    .filter(c => c.coluna === 0 && !isTerceirizado(c))
    .map(c => {
      const d = parseData(c.data)
      if (!d) return null
      const vence = new Date(d.getTime() + validadeDe(c) * 86_400_000)
      const dias = Math.ceil((vence.getTime() - hoje.getTime()) / 86_400_000)
      return { card: c, dias }
    })
    .filter((x): x is { card: KanbanCard; dias: number } => !!x && x.dias >= 0 && x.dias <= 3)
    .sort((a, b) => a.dias - b.dias)

  const cobrancaVencida = rec.comSaldo.filter(p => p.vencido > 0.5)
  const entregueSemCobranca = rec.comSaldo.filter(p => pedidoEntregue(p) && p.semCobranca > 0.5)

  const prodCfg = normalizarProducao(config.producao)
  const hojeIso = hoje.toLocaleDateString("sv-SE")
  const fornecedorAtrasado = prodCfg.movimentos.filter(m => !m.recebidoEm && m.prazoPrevisto && m.prazoPrevisto < hojeIso)
  const leadsQuentes = kanban.filter(c => c.coluna === COL_HOT)

  type Acao = { id: string; tom: Tom; icone: React.ReactNode; titulo: string; sub: string; valor?: string; ir: () => void; whatsapp?: string; cobrar?: Partial<LancamentoFinanceiro> }
  const acoes: Acao[] = [
    ...prod.atrasados.map(p => ({
      id: `atr-${p.key}`, tom: "perigo" as Tom, icone: <CalendarX2 className="w-4 h-4" />,
      titulo: `${p.numero} · ${p.nomeCliente}`, sub: `${prazoTexto(p.dataEntregaPrevista)} · ${p.etapa}`,
      valor: brl(p.valor), ir: () => onAbrirCard(cardDoPedido(p)),
    })),
    ...fornecedorAtrasado.map(m => ({
      id: `forn-${m.id}`, tom: "perigo" as Tom, icone: <Factory className="w-4 h-4" />,
      titulo: `${m.pedidoLabel}`, sub: `fornecedor passou do prazo (${dataCurta(m.prazoPrevisto)})`,
      ir: () => onNavegar("fornecedores"),
    })),
    ...cobrancaVencida.map(p => ({
      id: `rec-${p.key}`, tom: "perigo" as Tom, icone: <Receipt className="w-4 h-4" />,
      titulo: `${p.numero} · ${p.nomeCliente}`,
      sub: `cobrança vencida${p.semCobranca > 0.5 ? ` · mais ${brl(p.semCobranca)} sem cobrança` : ""}`,
      valor: brl(p.vencido), ir: () => onAbrirCard(cardDoPedido(p)),
    })),
    ...entregueSemCobranca.map(p => ({
      id: `sc-${p.key}`, tom: "alerta" as Tom, icone: <Receipt className="w-4 h-4" />,
      titulo: `${p.numero} · ${p.nomeCliente}`, sub: "entregue e sem cobrança lançada",
      valor: brl(p.semCobranca), ir: () => onAbrirCard(cardDoPedido(p)),
      cobrar: (() => {
        const c = cardDoPedido(p)
        return {
          tipo: "receita" as const, valor: Math.round(p.semCobranca * 100) / 100, descricao: `Saldo ${p.numero} — ${p.nomeCliente}`,
          categoria: "saldo-final", nomeCliente: p.nomeCliente, dataVencimento: hoje.toLocaleDateString("sv-SE"),
          ...(c.loteId ? { loteId: c.loteId, loteNumero: c.loteNumero } : { cardId: c.id, cardNumero: c.numero }),
        }
      })(),
    })),
    ...(rec.aConferir.length ? [{
      id: "conferir", tom: "info" as Tom, icone: <Receipt className="w-4 h-4" />,
      titulo: `${rec.aConferir.length} ${rec.aConferir.length === 1 ? "cobrança para conferir" : "cobranças para conferir"}`,
      sub: "pendentes em pedidos já quitados ou fora do quadro: confira e dê baixa",
      valor: brl(rec.aConferir.reduce((s, l) => s + l.valor, 0)), ir: () => abrirCaixa(),
    }] : []),
    ...prod.vencendo3d.map(p => ({
      id: `ven-${p.key}`, tom: "alerta" as Tom, icone: <CalendarClock className="w-4 h-4" />,
      titulo: `${p.numero} · ${p.nomeCliente}`, sub: `${prazoTexto(p.dataEntregaPrevista)} · ${p.etapa}`,
      valor: brl(p.valor), ir: () => onAbrirCard(cardDoPedido(p)),
    })),
    ...vencendo.map(({ card, dias }) => {
      const tel = telefoneDe(card.nomeCliente)?.replace(/\D/g, "")
      return {
        id: `orc-${card.id}`, tom: "alerta" as Tom, icone: <Hourglass className="w-4 h-4" />,
        titulo: `${card.numero} · ${card.nomeCliente}`,
        sub: `orçamento ${dias === 0 ? "vence hoje" : dias === 1 ? "vence amanhã" : `vence em ${dias} dias`} sem resposta`,
        valor: brl(card.preco), ir: () => onAbrirCard(card),
        whatsapp: tel ? `https://wa.me/${tel.length <= 11 ? "55" + tel : tel}?text=${encodeURIComponent(`Olá! Tudo bem? Passando para saber se conseguiu avaliar o orçamento ${card.numero}. Ele vale até ${dias === 0 ? "hoje" : dias === 1 ? "amanhã" : `daqui a ${dias} dias`}. Posso ajudar em algo?`)}` : undefined,
      }
    }),
    ...prod.semPrazo.map(p => ({
      id: `sem-${p.key}`, tom: "info" as Tom, icone: <Clock className="w-4 h-4" />,
      titulo: `${p.numero} · ${p.nomeCliente}`, sub: `em produção sem data de entrega · ${p.etapa}`,
      valor: brl(p.valor), ir: () => onAbrirCard(cardDoPedido(p)),
    })),
  ]
  const [verTodas, setVerTodas] = React.useState(false)
  const acoesVisiveis = verTodas ? acoes : acoes.slice(0, 7)

  // ── Série mensal (últimos 6 meses) ─────────────────────────────────────────
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 5 + i, 1)
    const p: Periodo = { from: d, to: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59) }
    return {
      rotulo: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      valor: vendasDoPeriodo(pedidos, lancamentos, p).receita,
      destaque: i === 5,
    }
  })

  // ── Melhores clientes do período ───────────────────────────────────────────
  const porCliente = new Map<string, { nome: string; valor: number; pedidos: number }>()
  for (const p of vendas.pedidos) {
    const k = nomeChave(p.nomeCliente)
    const atual = porCliente.get(k) ?? { nome: p.nomeCliente, valor: 0, pedidos: 0 }
    atual.valor += p.valor; atual.pedidos += 1
    porCliente.set(k, atual)
  }
  const topClientes = [...porCliente.values()].sort((a, b) => b.valor - a.valor).slice(0, 5)

  // ── Gavetas de detalhe ─────────────────────────────────────────────────────
  const linhaPedido = (p: Pedido) => (
    <LinhaLista key={p.key} titulo={`${p.numero} · ${p.nomeCliente}`}
      sub={`${p.etapa}${p.dataFechamento ? ` · fechado ${dataCurta(p.dataFechamento)}` : ""}`}
      valor={brl(p.valor)} valorSub={p.aReceber > 0.5 ? `falta ${brl(p.aReceber)}` : "pago"}
      onClick={() => { fechar(); onAbrirCard(cardDoPedido(p)) }} />
  )
  const linhaOrcamento = (c: KanbanCard) => (
    <LinhaLista key={c.id} titulo={`${c.numero} · ${c.nomeCliente}`}
      sub={`${c.dimensoes || c.materialNome} · ${dataCurta(c.data)}`}
      valor={brl(c.preco)}
      valorSub={isGanho(c) ? "fechado" : isPerdido(c) ? "recusado" : isExpirado(c) ? "sem resposta" : c.coluna === COL_HOT ? "lead quente" : "aberto"}
      tom={isGanho(c) ? "sucesso" : isPerdido(c) ? "perigo" : undefined}
      onClick={() => { fechar(); onAbrirCard(c) }} />
  )

  const abrirVendas = () => setDetalhe({
    titulo: `Vendido — ${nomePeriodo}`,
    sub: `${vendas.pedidos.length} pedidos fechados${vendas.sobras > 0 ? ` + ${brl(vendas.sobras)} em sobras` : ""}`,
    linhas: vendas.pedidos.length ? [...vendas.pedidos].sort((a, b) => b.valor - a.valor).map(linhaPedido)
      : <Vazio icone={<TrendingUp className="w-8 h-8" />} titulo="Nenhum pedido fechado no período" />,
    destino: { nome: "Abrir Pedidos", ir: () => onNavegar("pedidos") },
  })
  function abrirCaixa() {
    const recebidos = lancamentos.filter(l => l.tipo === "receita" && l.status === "pago" && noPeriodo(l.dataPagamento ?? l.dataVencimento, periodo))
    const titulo = (t: string) => <p className="px-3 pt-3 pb-1 text-[11px] font-semibold text-[#898892]">{t}</p>
    setDetalhe({
      titulo: "Dinheiro",
      sub: `${brl(caixa.recebido)} recebidos ${nomePeriodo} · clientes devem ${brl(rec.aReceber)}`,
      linhas: <>
        {rec.comSaldo.length > 0 && titulo(`Clientes devem ${brl(rec.aReceber)}`)}
        {[...rec.comSaldo].sort((a, b) => b.vencido - a.vencido || b.aReceber - a.aReceber).map(p => (
          <LinhaLista key={p.key} titulo={`${p.numero} · ${p.nomeCliente}`}
            sub={p.vencido > 0.5 ? `${brl(p.vencido)} com cobrança vencida` : p.semCobranca > 0.5 ? `${brl(p.semCobranca)} sem cobrança lançada · ${p.etapa}` : `cobrança lançada · ${p.etapa}`}
            valor={brl(p.aReceber)} tom={p.vencido > 0.5 ? "perigo" : p.semCobranca > 0.5 ? "alerta" : undefined}
            onClick={() => { fechar(); onAbrirCard(cardDoPedido(p)) }} />
        ))}
        {rec.aConferir.length > 0 && titulo("Cobranças para conferir (pedido já quitado ou fora do quadro)")}
        {rec.aConferir.map(l => (
          <LinhaLista key={l.id} titulo={l.nomeCliente || l.descricao} sub={`${l.descricao} · venc. ${dataCurta(l.dataVencimento)}`}
            valor={brl(l.valor)} valorSub="conferir" tom="info" />
        ))}
        {titulo(`Recebido ${nomePeriodo}`)}
        {recebidos.length === 0 && <Vazio icone={<Wallet className="w-8 h-8" />} titulo="Nada recebido no período" />}
        {[...recebidos].sort((a, b) => (b.dataPagamento ?? "").localeCompare(a.dataPagamento ?? "")).map(l => (
          <LinhaLista key={l.id} titulo={l.nomeCliente || l.descricao} sub={`${l.loteNumero ?? l.cardNumero ?? l.descricao} · ${dataCurta(l.dataPagamento ?? l.dataVencimento)}`}
            valor={brl(l.valor)} tom="sucesso" />
        ))}
      </>,
      destino: { nome: "Abrir Financeiro", ir: () => onNavegar("financeiro") },
    })
  }
  const abrirConversao = () => {
    const decididos = orcs.filter(c => !isAberto(c))
    setDetalhe({
      titulo: `Orçamentos — ${nomePeriodo}`,
      sub: `${conv.ganhos} fechados · ${conv.perdidos} recusados · ${conv.expirados} sem resposta · ${conv.abertos} em aberto`,
      linhas: orcs.length ? [...decididos, ...orcs.filter(isAberto)].map(linhaOrcamento)
        : <Vazio icone={<FileText className="w-8 h-8" />} titulo="Nenhum orçamento no período" />,
      destino: { nome: "Abrir Orçamentos", ir: () => onNavegar("orcamentos") },
    })
  }
  const abrirPipeline = () => setDetalhe({
    titulo: "Em negociação",
    sub: `${pipe.count} orçamentos abertos somando ${brl(pipe.valor)}`,
    linhas: pipe.cards.length ? [...pipe.cards].sort((a, b) => b.preco - a.preco).map(linhaOrcamento)
      : <Vazio icone={<FileText className="w-8 h-8" />} titulo="Nenhum orçamento em aberto" />,
    destino: { nome: "Abrir Orçamentos", ir: () => onNavegar("orcamentos") },
  })
  const abrirMargem = () => setDetalhe({
    titulo: "Margem de contribuição",
    sub: margem.pct != null ? `${pct(margem.pct)} sobre ${brl(margem.valor)} vendidos com custo lançado` : "Nenhum pedido do período tem custo lançado",
    linhas: vendas.pedidos.length ? [...vendas.pedidos].sort((a, b) => (a.custoDireto > 0 ? (a.valor - a.custoDireto) / a.valor : 2) - (b.custoDireto > 0 ? (b.valor - b.custoDireto) / b.valor : 2)).map(p => {
      const m = p.custoDireto > 0 && p.valor > 0 ? (p.valor - p.custoDireto) / p.valor * 100 : null
      return <LinhaLista key={p.key} titulo={`${p.numero} · ${p.nomeCliente}`}
        sub={p.custoDireto > 0 ? `venda ${brl(p.valor)} · custo ${brl(p.custoDireto)}` : "sem custo lançado"}
        valor={m == null ? "—" : pct(m)} tom={m == null ? undefined : m < 30 ? "perigo" : m < 45 ? "alerta" : "sucesso"}
        onClick={() => { fechar(); onAbrirCard(cardDoPedido(p)) }} />
    }) : <Vazio icone={<Percent className="w-8 h-8" />} titulo="Nenhum pedido no período" />,
  })
  const abrirEtapa = (coluna: number) => {
    const lista = prod.emProducao.filter(p => p.coluna === coluna)
    setDetalhe({
      titulo: lista[0]?.etapa ?? "Produção",
      sub: `${lista.length} pedidos · ${brl(lista.reduce((s, p) => s + p.valor, 0))}`,
      linhas: lista.map(p => (
        <LinhaLista key={p.key} titulo={`${p.numero} · ${p.nomeCliente}`} sub={prazoTexto(p.dataEntregaPrevista)}
          valor={brl(p.valor)} tom={p.dataEntregaPrevista && diasAte(p.dataEntregaPrevista, hoje) < 0 ? "perigo" : undefined}
          onClick={() => { fechar(); onAbrirCard(cardDoPedido(p)) }} />
      )),
      destino: { nome: "Abrir Pedidos", ir: () => onNavegar("pedidos") },
    })
  }

  const dataLonga = hoje.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
  const saudacao = dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1)

  // ── Meta do mês e marcos de faturamento ────────────────────────────────────
  const meta = config.metaMensal || 0
  const vendidoMes = vendasDoPeriodo(pedidos, lancamentos, periodoDe("mes", hoje)).receita
  const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
  const diasUteisRestantes = (() => {
    let n = 0
    for (let d = hoje.getDate() + 1; d <= diasMes; d++) {
      const dia = new Date(hoje.getFullYear(), hoje.getMonth(), d).getDay()
      if (dia !== 0 && dia !== 6) n++
    }
    return n
  })()
  const projecao = vendidoMes / hoje.getDate() * diasMes
  const faltaMeta = Math.max(0, meta - vendidoMes)
  const faturamentoTotal = (config.baselineFaturamento || 0) + pedidos.reduce((s, p) => s + p.valor, 0)
    + vendasDoPeriodo(pedidos, lancamentos, { from: null, to: null }).sobras
  const proximoMarco = MARCOS.find(m => m.threshold > faturamentoTotal) ?? null
  const marcoAnterior = [...MARCOS].reverse().find(m => m.threshold <= faturamentoTotal)
  const [editandoMeta, setEditandoMeta] = React.useState(false)
  const [rascunhoMeta, setRascunhoMeta] = React.useState("")

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Painel"
        sub={saudacao}
        acoes={<>
          <Segmentado valor={periodoId} opcoes={PERIODOS} onChange={setPeriodoId} />
          <Botao variante="primario" icone={<Plus className="w-4 h-4" />} onClick={onNovoOrcamento}>Novo orçamento</Botao>
        </>}
      />

      <GradeKpis>
        <Kpi rotulo="Vendido" icone={<TrendingUp className="w-3.5 h-3.5" />} tom="acento" destaque
          valor={vendas.receita} formato={brlCurto} onClick={abrirVendas}
          sub={`${vendas.pedidos.length} ${vendas.pedidos.length === 1 ? "pedido" : "pedidos"} · ticket ${brlCurto(vendas.ticketMedio)}`} />
        <Kpi rotulo="Recebido" icone={<Wallet className="w-3.5 h-3.5" />} tom="sucesso"
          valor={caixa.recebido} formato={brlCurto} onClick={abrirCaixa}
          sub={<>{brlCurto(rec.aReceber)} a receber{rec.vencido > 0.5 && <span className="text-[#d33a3c]"> · {`R$ ${num(rec.vencido, 0)}`} vencido</span>}</>} />
        <Kpi rotulo="Conversão" icone={<Percent className="w-3.5 h-3.5" />}
          valor={conv.decididos > 0 ? conv.taxa : null} formato={pct} onClick={abrirConversao}
          sub={conv.decididos > 0 ? `${conv.ganhos} de ${conv.decididos} decididos` : `${conv.total} orçamentos, nenhum decidido`} />
        <Kpi rotulo="Em negociação" icone={<CircleDollarSign className="w-3.5 h-3.5" />}
          valor={pipe.valor} formato={brlCurto} onClick={abrirPipeline}
          sub={`${pipe.count} orçamentos abertos${leadsQuentes.length ? ` · ${leadsQuentes.length} quentes` : ""}`} />
        <Kpi rotulo="Margem de contribuição" icone={<Percent className="w-3.5 h-3.5" />}
          tom={margem.pct == null ? "neutro" : margem.pct < 30 ? "perigo" : margem.pct < 45 ? "alerta" : "sucesso"}
          valor={margem.pct} formato={pct} onClick={abrirMargem}
          sub={margem.total > 0 ? `${margem.comCusto} de ${margem.total} pedidos com custo` : "sem pedidos no período"} />
      </GradeKpis>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <Cartao padding={false} className="ds-entrada">
          <div className="px-5 pt-5">
            <TituloCartao titulo="Precisa de você" icone={<AlertTriangle className="w-4 h-4" />}
              sub={acoes.length ? `${acoes.length} ${acoes.length === 1 ? "item" : "itens"} em ordem de urgência` : undefined}
              acao={acoes.length > 0 ? <Selo tom={acoes.some(a => a.tom === "perigo") ? "perigo" : "alerta"}>{acoes.length}</Selo> : undefined} />
          </div>
          <div className="px-2 pb-2 -mt-1 ds-escalonado">
            {acoes.length === 0
              ? <Vazio icone={<CheckCircle2 className="w-9 h-9" />} titulo="Nada pendente" sub="Entregas no prazo, recebimentos em dia e nenhum orçamento vencendo." />
              : acoesVisiveis.map(a => (
                <LinhaLista key={a.id} titulo={a.titulo} sub={a.sub} valor={a.valor} tom={a.tom} icone={a.icone} onClick={a.ir}
                  acao={a.cobrar && onLancarCobranca ? (
                    <button onClick={() => onLancarCobranca(a.cobrar!)} title="Lançar a cobrança deste saldo"
                      className="h-8 px-2.5 mr-1 rounded-lg text-[11.5px] font-semibold text-[#8456e8] hover:bg-[#8456e8]/[0.08] transition-colors shrink-0 whitespace-nowrap">
                      Lançar cobrança
                    </button>
                  ) : a.whatsapp ? (
                    <a href={a.whatsapp} target="_blank" rel="noreferrer" title="Mandar mensagem no WhatsApp"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[#25a35a] hover:bg-[#25a35a]/10 transition-colors shrink-0 mr-1">
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  ) : undefined} />
              ))}
          </div>
          {acoes.length > 7 && (
            <button onClick={() => setVerTodas(v => !v)}
              className="w-full py-2.5 text-[12px] font-medium text-[#8456e8] hover:bg-[#8456e8]/[0.04] transition-colors"
              style={{ borderTop: "1px solid rgba(60,60,67,0.06)" }}>
              {verTodas ? "Mostrar menos" : `Ver todos (${acoes.length})`}
            </button>
          )}
        </Cartao>

        <div className="space-y-4">
        <Cartao className="ds-entrada">
          <TituloCartao titulo={`Meta de ${hoje.toLocaleDateString("pt-BR", { month: "long" })}`} icone={<Target className="w-4 h-4" />}
            sub={meta > 0 ? `${brl(vendidoMes)} de ${brl(meta)}` : "Defina uma meta mensal de vendas"}
            acao={onSalvarMeta && !editandoMeta ? (
              <Botao variante="fantasma" className="h-7 px-2 text-[11.5px]" onClick={() => { setRascunhoMeta(String(meta || "")); setEditandoMeta(true) }}>Ajustar meta</Botao>
            ) : undefined} />
          {editandoMeta && onSalvarMeta && (
            <div className="flex items-center gap-2 mb-4 apple-slide-up">
              <span className="text-[12px] text-[#898892]">R$</span>
              <input autoFocus type="number" min={0} value={rascunhoMeta} onChange={e => setRascunhoMeta(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { onSalvarMeta(Math.max(0, Number(rascunhoMeta) || 0)); setEditandoMeta(false) } if (e.key === "Escape") setEditandoMeta(false) }}
                className="flex-1 h-9 rounded-lg px-3 text-[13px] ds-num bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 ds-borda" />
              <Botao variante="primario" className="h-9" onClick={() => { onSalvarMeta(Math.max(0, Number(rascunhoMeta) || 0)); setEditandoMeta(false) }}>Salvar</Botao>
            </div>
          )}
          {meta > 0 && (
            <>
              <div className="flex items-end justify-between mb-2">
                <p className={`text-[26px] font-semibold ds-num leading-none ${vendidoMes >= meta ? "text-[#009351]" : "text-[#191625]"}`}>{num(vendidoMes / meta * 100, 0)}%</p>
                <p className="text-[11.5px] text-[#898892] text-right">
                  {vendidoMes >= meta
                    ? <>meta batida · <span className="text-[#009351] font-semibold">+{brl(vendidoMes - meta)}</span></>
                    : diasUteisRestantes > 0 ? <>faltam {brl(faltaMeta)} · <span className="font-semibold text-[#191625]">{brl(faltaMeta / diasUteisRestantes)}</span> por dia útil</> : <>faltam {brl(faltaMeta)}</>}
                </p>
              </div>
              <div className="h-2 rounded-full bg-[rgba(116,116,128,0.1)] overflow-hidden relative">
                <div className="h-full rounded-full ds-cresce-x" style={{ width: `${Math.min(100, vendidoMes / meta * 100)}%`, background: vendidoMes >= meta ? "#009351" : "#8456e8" }} />
                {projecao > vendidoMes && projecao < meta * 1.5 && (
                  <div className="absolute top-0 bottom-0 w-0.5 bg-[#191625]/30" style={{ left: `${Math.min(100, projecao / meta * 100)}%` }} title="Projeção no ritmo atual" />
                )}
              </div>
              <p className="text-[11.5px] text-[#898892] mt-2">
                No ritmo atual, o mês fecha em <span className={`font-semibold ds-num ${projecao >= meta ? "text-[#009351]" : "text-[#c57800]"}`}>{brl(projecao)}</span>
                {vendidoMes >= meta * 2 && <> · a meta está baixa para o seu ritmo; vale subir</>}
              </p>
            </>
          )}
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(60,60,67,0.06)" }}>
            <div className="flex items-center justify-between text-[11.5px] mb-1.5">
              <span className="text-[#5e5c68]"><Trophy className="w-3.5 h-3.5 inline -mt-0.5 mr-1 text-[#c57800]" />{brlCurto(faturamentoTotal)} faturados desde o início</span>
              {proximoMarco && <span className="text-[#898892]">próximo: {proximoMarco.label} ({proximoMarco.sub})</span>}
            </div>
            {proximoMarco && (
              <div className="h-1.5 rounded-full bg-[rgba(116,116,128,0.1)] overflow-hidden">
                <div className="h-full rounded-full bg-[#c57800] ds-cresce-x"
                  style={{ width: `${Math.min(100, (faturamentoTotal - (marcoAnterior?.threshold ?? 0)) / (proximoMarco.threshold - (marcoAnterior?.threshold ?? 0)) * 100)}%` }} />
              </div>
            )}
          </div>
        </Cartao>

        <Cartao className="ds-entrada">
          <TituloCartao titulo="Produção agora" icone={<Truck className="w-4 h-4" />}
            sub={`${prod.emProducao.length} pedidos · ${brl(prod.valorEmProducao)}`}
            acao={<Botao variante="fantasma" className="h-7 px-2 text-[11.5px]" onClick={() => onNavegar("pedidos")}>Pedidos <ArrowRight className="w-3.5 h-3.5" /></Botao>} />
          {prod.emProducao.length === 0
            ? <Vazio icone={<Factory className="w-8 h-8" />} titulo="Nenhum pedido em produção" />
            : <>
              <ListaBarras formatoValor={brlCurto} onClick={k => abrirEtapa(Number(k))}
                itens={prod.porEtapa.map(e => ({ chave: e.coluna, rotulo: e.etapa, qtd: e.count, valor: e.valor }))} />
              <div className="flex flex-wrap gap-1.5 mt-4 pt-4" style={{ borderTop: "1px solid rgba(60,60,67,0.06)" }}>
                <Selo tom={prod.atrasados.length ? "perigo" : "sucesso"}>{prod.atrasados.length} {prod.atrasados.length === 1 ? "atrasado" : "atrasados"}</Selo>
                <Selo tom={prod.vencendo3d.length ? "alerta" : "neutro"}>{prod.vencendo3d.length} {prod.vencendo3d.length === 1 ? "entrega" : "entregam"} em 3 dias</Selo>
                {prod.semPrazo.length > 0 && <Selo tom="info">{prod.semPrazo.length} sem prazo</Selo>}
              </div>
            </>}
        </Cartao>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <Cartao className="ds-entrada">
          <TituloCartao titulo="Vendido por mês" icone={<TrendingUp className="w-4 h-4" />}
            sub={`Pedidos pela data de fechamento, mais sobras · ${brl(meses[5].valor)} neste mês`} />
          <Colunas itens={meses} formato={brlCurto} />
        </Cartao>

        <Cartao className="ds-entrada">
          <TituloCartao titulo="Melhores clientes" icone={<Users className="w-4 h-4" />} sub={`Pedidos fechados ${nomePeriodo}`} />
          <div className="-mx-3 -mb-2">
            {topClientes.length === 0
              ? <Vazio icone={<Users className="w-8 h-8" />} titulo="Nenhuma venda no período" />
              : topClientes.map((c, i) => (
                <LinhaLista key={c.nome} titulo={c.nome} sub={`${c.pedidos} ${c.pedidos === 1 ? "pedido" : "pedidos"}`}
                  valor={brl(c.valor)} icone={<span className="text-[11px] font-bold">{i + 1}</span>} tom="acento"
                  onClick={() => onAbrirCliente(c.nome)} />
              ))}
          </div>
        </Cartao>
      </div>

      <Gaveta aberta={!!detalhe} titulo={detalhe?.titulo ?? ""} sub={detalhe?.sub} onFechar={fechar}
        rodape={detalhe?.destino ? <Botao variante="secundario" onClick={() => { const ir = detalhe.destino!.ir; fechar(); ir() }}>{detalhe.destino.nome} <ArrowRight className="w-3.5 h-3.5" /></Botao> : undefined}>
        {detalhe?.linhas}
      </Gaveta>
    </Pagina>
  )
}
