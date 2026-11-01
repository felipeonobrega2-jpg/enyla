"use client"

import { useState, useMemo, useEffect } from "react"
import {
  Users, TrendingUp, DollarSign, Target, Star, BarChart3, UserCheck, UserPlus, Search, X,
  ChevronDown, MessageCircle, Copy, RotateCcw, PieChart,
} from "lucide-react"
import { KanbanCard, PropostaCustom, Cliente, LancamentoFinanceiro } from "../types"
import { montarPedidos, resumoClientes, conversao, orcamentosDoPeriodo, nomeChave, parseData, SEM_PERIODO } from "../lib/negocio"
import { brl, num } from "../utils"
import { HistItem, situacaoDoCard } from "./HistoricoView"
import { ClientePerfilModal } from "./ClientePerfilModal"
import { CabecalhoPagina, Kpi, GradeKpis, Segmentado, Selo, Cartao, TituloCartao, ListaBarras, Vazio, Botao } from "./ds"

type Tab = "clientes" | "leads" | "visao"
type Ordem = "ltv" | "valor" | "nome" | "orcamentos" | "recente"

const DIAS_REATIVAR = 90

// Com ritmo conhecido: passou bem da data (1,3× o intervalo). Sem ritmo (1 compra): o corte fixo de dias
const precisaReativar = (r: RitmoCliente | undefined, dias: number | null) =>
  r?.intervalo ? (r.status === "atrasado" || r.status === "sumido") && !r.emAndamento : (dias ?? 0) > DIAS_REATIVAR
const diasDesde = (d?: string) => { const x = parseData(d); return x ? Math.floor((Date.now() - x.getTime()) / 86_400_000) : null }

import { origemDoCliente, textoOrigem, OrigensClientes, OrigemCliente } from "../lib/coleta"
import { ritmoDosClientes, RitmoCliente } from "../lib/ritmo"

export function ClientesView({
  historico, kanban, propostasCustom, lancamentos, cadastro,
  onReplicar, onWhatsApp, onSaveCliente, initialPerfil, origens, onSalvarOrigem,
}: {
  historico: HistItem[]
  kanban: KanbanCard[]
  propostasCustom: PropostaCustom[]
  lancamentos: LancamentoFinanceiro[]
  cadastro: Cliente[]
  onReplicar: (item: HistItem) => void
  onWhatsApp: (item: HistItem) => void
  onSaveCliente?: (id: string, updates: Partial<Cliente>) => void
  initialPerfil?: string | null
  origens?: OrigensClientes
  onSalvarOrigem?: (nome: string, origem: OrigemCliente | null) => void
}) {
  const [tab, setTab]         = useState<Tab>("clientes")
  const [soReativar, setSoReativar] = useState(false)
  const [busca, setBusca]     = useState("")
  const [ordem, setOrdem]     = useState<Ordem>("ltv")
  const [expandido, setExpandido] = useState<string | null>(null)
  const [perfilAberto, setPerfilAberto] = useState<string | null>(initialPerfil ?? null)

  useEffect(() => {
    if (initialPerfil) setPerfilAberto(initialPerfil)
  }, [initialPerfil])

  const pedidos = useMemo(() => montarPedidos(kanban, lancamentos), [kanban, lancamentos])
  const ritmos = useMemo(() => new Map(ritmoDosClientes(pedidos, kanban).map(r => [r.chave, r])), [pedidos, kanban])

  const { clientes, listaClientes, listaLeads } = useMemo(() => {
    // Contagens vêm da camada canônica (kanban); histórico/propostas só alimentam ações e o perfil
    const itensPorNome = new Map<string, HistItem[]>()
    historico.forEach(item => {
      const k = nomeChave(item.form.nomeCliente) || "sem nome"
      itensPorNome.set(k, [...(itensPorNome.get(k) ?? []), item])
    })
    const propsPorNome = new Map<string, PropostaCustom[]>()
    propostasCustom.forEach(p => {
      const k = nomeChave(p.nomeCliente) || "sem nome"
      propsPorNome.set(k, [...(propsPorNome.get(k) ?? []), p])
    })

    const all = resumoClientes(kanban, pedidos).map((r, firstIdx) => ({
      nome: r.nome,
      itens: itensPorNome.get(r.chave) ?? [],
      propostas: propsPorNome.get(r.chave) ?? [],
      firstIdx,
      numOrcamentos: r.orcamentos.length,
      numPedidos: r.pedidos.length,
      fechados: r.conversao.ganhos,
      perdidos: r.conversao.perdidos,
      expirados: r.conversao.expirados,
      decididos: r.conversao.decididos,
      taxa: r.conversao.taxa,
      totalValor: r.orcamentos.reduce((s, c) => s + c.preco, 0),
      valorFechado: r.ltv,
      ultimaData: r.ultimaData,
      ultimoPedido: r.pedidos.map(p => p.dataFechamento ?? "").filter(Boolean).sort().pop() ?? "",
      ltv: r.ltv,
      ehCliente: r.ehCliente,
    }))

    return {
      clientes: all,
      listaClientes: all.filter(c => c.ehCliente),
      listaLeads: all.filter(c => !c.ehCliente),
    }
  }, [historico, propostasCustom, kanban, pedidos])

  const metrics = useMemo(() => {
    const totalLtv       = listaClientes.reduce((s, c) => s + c.ltv, 0)
    const ltvMedio       = listaClientes.length > 0 ? totalLtv / listaClientes.length : 0
    const conv           = conversao(orcamentosDoPeriodo(kanban, SEM_PERIODO))
    const totalPedidos   = pedidos.length
    const ticketMedio    = totalPedidos > 0 ? pedidos.reduce((s, p) => s + p.valor, 0) / totalPedidos : 0
    const topClientes    = [...listaClientes].sort((a, b) => b.ltv - a.ltv).slice(0, 5)
    const totalOrcamentos = conv.total
    const leadParaCliente = clientes.length > 0 ? (listaClientes.length / clientes.length) * 100 : 0
    const concentracao = topClientes[0] && totalLtv > 0
      ? { topNome: topClientes[0].nome, pct: (topClientes[0].ltv / totalLtv) * 100 }
      : null
    return {
      totalLtv, ltvMedio, totalFechados: conv.ganhos, totalPerdidos: conv.perdidos, totalExpirados: conv.expirados,
      totalPedidos, taxaConv: conv.taxa, ticketMedio, topClientes, totalOrcamentos, leadParaCliente, concentracao,
    }
  }, [clientes, listaClientes, kanban, pedidos])

  const sortList = (list: typeof clientes) =>
    [...list]
      .filter(c => !busca.trim() || c.nome.toLowerCase().includes(busca.toLowerCase()))
      .sort((a, b) => {
        if (ordem === "ltv")        return b.ltv - a.ltv
        if (ordem === "valor")      return b.totalValor - a.totalValor
        if (ordem === "orcamentos") return b.numOrcamentos - a.numOrcamentos
        if (ordem === "nome")       return a.nome.localeCompare(b.nome, "pt-BR")
        if (ordem === "recente")    return a.firstIdx - b.firstIdx
        return 0
      })

  const paraReativar = listaClientes.filter(c => precisaReativar(ritmos.get(nomeChave(c.nome)), diasDesde(c.ultimoPedido)))
  const listaAtiva = sortList(tab === "clientes" ? (soReativar ? paraReativar : listaClientes) : listaLeads)

  const irPara = (t: Tab, reativar = false) => { setTab(t); setSoReativar(reativar); setBusca("") }
  const conc = metrics.concentracao

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-page)" }}>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[1320px] mx-auto px-6 pt-6 pb-10 space-y-4">
          <CabecalhoPagina
            titulo="Clientes"
            sub={`${listaClientes.length} clientes · ${listaLeads.length} leads · ${metrics.totalOrcamentos} orçamentos`}
            acoes={<Segmentado<Tab> valor={tab} onChange={t => irPara(t)}
              opcoes={[{ v: "clientes", nome: `Clientes ${listaClientes.length}` }, { v: "leads", nome: `Leads ${listaLeads.length}` }, { v: "visao", nome: "Visão geral" }]} />}
          />

          <GradeKpis>
            <Kpi rotulo="Clientes" icone={<UserCheck className="w-3.5 h-3.5" />} tom="acento" destaque={tab === "clientes" && !soReativar}
              valor={listaClientes.length} formato={n => num(Math.round(n))} onClick={() => irPara("clientes")}
              sub={`${num(metrics.leadParaCliente, 0)}% dos contatos viraram cliente`} />
            <Kpi rotulo="Valor por cliente" icone={<Star className="w-3.5 h-3.5" />}
              valor={metrics.ltvMedio} formato={brl} sub={`${brl(metrics.totalLtv)} contratados no total`} />
            <Kpi rotulo="Para reativar" icone={<RotateCcw className="w-3.5 h-3.5" />} tom={paraReativar.length ? "alerta" : "sucesso"} destaque={soReativar}
              valor={paraReativar.length} formato={n => num(Math.round(n))} onClick={() => irPara("clientes", !soReativar)}
              sub="passaram do ritmo de compra" />
            <Kpi rotulo="Leads" icone={<UserPlus className="w-3.5 h-3.5" />} tom="info" destaque={tab === "leads"}
              valor={listaLeads.length} formato={n => num(Math.round(n))} onClick={() => irPara("leads")}
              sub="orçaram e ainda não compraram" />
            <Kpi rotulo="Concentração" icone={<PieChart className="w-3.5 h-3.5" />}
              tom={!conc ? "neutro" : conc.pct >= 60 ? "perigo" : conc.pct >= 40 ? "alerta" : "sucesso"}
              valor={conc?.pct ?? null} formato={n => `${num(n, 0)}%`} onClick={() => irPara("visao")}
              sub={conc ? `do faturamento vem de ${conc.topNome}` : "sem pedidos ainda"} />
          </GradeKpis>

          {tab !== "visao" && (
            <div className="flex items-center gap-2 flex-wrap">
              {tab === "clientes" && (
                <Segmentado<"todos" | "reativar"> valor={soReativar ? "reativar" : "todos"} onChange={v => setSoReativar(v === "reativar")}
                  opcoes={[{ v: "todos", nome: "Todos" }, { v: "reativar", nome: `Para reativar ${paraReativar.length}` }]} />
              )}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#898892] pointer-events-none" />
                <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder={tab === "clientes" ? "Buscar cliente" : "Buscar lead"}
                  className="w-full h-9 rounded-lg pl-9 pr-8 text-[12.5px] text-[#191625] placeholder:text-[#898892] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] transition-all ds-borda" />
                {busca && (
                  <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-[#898892] hover:text-[#191625]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <select value={ordem} onChange={e => setOrdem(e.target.value as Ordem)}
                className="h-9 rounded-lg px-3 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 cursor-pointer ds-borda">
                <option value="ltv">Mais compraram</option>
                <option value="valor">Mais orçaram (R$)</option>
                <option value="orcamentos">Mais orçamentos</option>
                <option value="nome">Nome A–Z</option>
                <option value="recente">Mais recentes</option>
              </select>
            </div>
          )}

          {tab === "visao" ? (
            <DashboardTab metrics={metrics} listaClientes={listaClientes} onPerfil={setPerfilAberto} />
          ) : (
            <ListaTab
              lista={listaAtiva}
              busca={busca}
              isLeads={tab === "leads"}
              expandido={expandido}
              setExpandido={setExpandido}
              setPerfilAberto={setPerfilAberto}
              kanban={kanban}
              cadastro={cadastro}
              origens={origens}
              ritmos={ritmos}
              onReplicar={onReplicar}
              onWhatsApp={onWhatsApp}
            />
          )}
        </div>
      </div>

      {perfilAberto && (() => {
        const c = clientes.find(c => c.nome === perfilAberto)
        if (!c) return null
        return (
          <ClientePerfilModal
            nome={c.nome}
            cadastro={cadastro.find(cl => cl.nome.trim().toLowerCase() === c.nome.toLowerCase()) ?? null}
            itens={c.itens}
            propostas={c.propostas}
            kanban={kanban}
            lancamentos={lancamentos}
            onClose={() => setPerfilAberto(null)}
            onReplicar={onReplicar}
            onWhatsApp={onWhatsApp}
            origem={origemDoCliente(c.nome, origens, cadastro)}
            onSalvarOrigem={onSalvarOrigem ? o => onSalvarOrigem(c.nome, o) : undefined}
            onSave={onSaveCliente
              ? updates => {
                  const cad = cadastro.find(cl => cl.nome.trim().toLowerCase() === c.nome.toLowerCase())
                  if (cad) onSaveCliente(cad.id, updates)
                }
              : undefined}
          />
        )
      })()}
    </div>
  )
}

// ── Visão geral ────────────────────────────────────────────────────────────────

type ClienteItem = {
  nome: string; itens: unknown[]; propostas: unknown[]
  numOrcamentos: number; numPedidos: number
  fechados: number; perdidos: number; expirados: number; decididos: number; taxa: number
  totalValor: number; valorFechado: number; ultimaData: string; ultimoPedido: string; ltv: number
}

function DashboardTab({ metrics, listaClientes, onPerfil }: {
  metrics: {
    totalLtv: number; ltvMedio: number; totalFechados: number; totalPerdidos: number; totalExpirados: number; totalPedidos: number
    taxaConv: number; ticketMedio: number; topClientes: ClienteItem[]; totalOrcamentos: number; leadParaCliente: number
    concentracao: { topNome: string; pct: number } | null
  }
  listaClientes: ClienteItem[]
  onPerfil: (nome: string) => void
}) {
  const { totalLtv, totalFechados, totalPerdidos, totalExpirados, totalPedidos, taxaConv, ticketMedio, totalOrcamentos } = metrics
  if (listaClientes.length === 0) return <Vazio icone={<UserCheck className="w-9 h-9" />} titulo="Nenhum cliente ainda" sub="Feche orçamentos para construir sua base." />

  const ranking = [...listaClientes].sort((a, b) => b.ltv - a.ltv).slice(0, 10)
  const dec = totalFechados + totalPerdidos + totalExpirados
  const pct = (n: number) => dec > 0 ? (n / dec) * 100 : 0
  const recorrentes = listaClientes.filter(c => c.numPedidos > 1).length

  return (
    <div className="space-y-4 ds-escalonado">
      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4 items-start">
        <Cartao>
          <TituloCartao titulo="Quem mais compra" icone={<Star className="w-4 h-4" />}
            sub={`Valor contratado em pedidos · ${brl(totalLtv)} no total · clique para abrir o perfil`} />
          <ListaBarras formatoValor={brl} onClick={k => onPerfil(ranking[Number(k)].nome)}
            itens={ranking.map((c, i) => ({ chave: i, rotulo: c.nome, qtd: c.numPedidos, valor: c.ltv, peso: c.ltv, tom: i === 0 ? "alerta" as const : "acento" as const }))} />
          <p className="text-[11px] text-[#898892] mt-3">A barra mostra o valor comprado; o número em negrito é a quantidade de pedidos.</p>
        </Cartao>
        <div className="space-y-4">
          <Cartao>
            <TituloCartao titulo="Conversão dos orçamentos" icone={<Target className="w-4 h-4" />} sub={`${num(taxaConv, 1)}% dos decididos viraram pedido`} />
            <div className="h-3 rounded-full overflow-hidden flex gap-0.5 bg-[rgba(116,116,128,0.08)]">
              <div className="h-full ds-cresce-x bg-[#009351]" style={{ width: `${pct(totalFechados)}%` }} />
              <div className="h-full ds-cresce-x bg-[#d33a3c]" style={{ width: `${pct(totalPerdidos)}%`, animationDelay: "80ms" }} />
              <div className="h-full ds-cresce-x bg-[#c57800]/60" style={{ width: `${pct(totalExpirados)}%`, animationDelay: "160ms" }} />
            </div>
            <div className="flex justify-between mt-3 text-[11.5px] text-[#5e5c68]">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#009351]" />{totalFechados} fechados</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#d33a3c]" />{totalPerdidos} recusados</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#c57800]/60" />{totalExpirados} sem resposta</span>
            </div>
          </Cartao>
          <div className="grid grid-cols-2 gap-3">
            <Kpi rotulo="Ticket médio" icone={<TrendingUp className="w-3.5 h-3.5" />} valor={ticketMedio} formato={brl} sub={`${totalPedidos} pedidos`} />
            <Kpi rotulo="Recorrência" icone={<RotateCcw className="w-3.5 h-3.5" />} valor={listaClientes.length ? recorrentes / listaClientes.length * 100 : 0}
              formato={n => `${num(n, 0)}%`} sub={`${recorrentes} clientes compraram mais de uma vez`} />
            <Kpi rotulo="Orçamentos" icone={<BarChart3 className="w-3.5 h-3.5" />} valor={totalOrcamentos} formato={n => num(Math.round(n))} sub="emitidos no total" />
            <Kpi rotulo="Pedidos por cliente" icone={<DollarSign className="w-3.5 h-3.5" />} valor={listaClientes.length ? totalPedidos / listaClientes.length : 0}
              formato={n => num(n, 1)} sub="média" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Lista ──────────────────────────────────────────────────────────────────────

function ListaTab({ lista, busca, isLeads, expandido, setExpandido, setPerfilAberto, kanban, cadastro, origens, ritmos, onReplicar, onWhatsApp }: {
  lista: ClienteItem[]
  busca: string
  isLeads: boolean
  expandido: string | null
  setExpandido: (n: string | null) => void
  setPerfilAberto: (n: string | null) => void
  kanban: KanbanCard[]
  cadastro: Cliente[]
  origens?: OrigensClientes
  ritmos: Map<string, RitmoCliente>
  onReplicar: (item: HistItem) => void
  onWhatsApp: (item: HistItem) => void
}) {
  if (lista.length === 0) return (
    <Vazio icone={isLeads ? <UserPlus className="w-8 h-8" /> : <Users className="w-8 h-8" />}
      titulo={busca ? `Nenhum resultado para "${busca}"` : isLeads ? "Nenhum lead" : "Nenhum cliente neste filtro"} />
  )

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-[#898892] px-1 pb-1">{lista.length} {isLeads ? (lista.length === 1 ? "lead" : "leads") : (lista.length === 1 ? "cliente" : "clientes")}</p>
      <div className="space-y-2 ds-escalonado">
      {lista.map(({ nome, itens, propostas, numOrcamentos, numPedidos, fechados, perdidos, expirados, decididos, taxa, totalValor, ultimaData, ultimoPedido, ltv }) => {
        const conv   = decididos > 0 ? Math.round(taxa) : null
        const aberto = expandido === nome
        const cad    = cadastro.find(cl => cl.nome.trim().toLowerCase() === nome.toLowerCase())
        const dias   = diasDesde(numPedidos > 0 ? ultimoPedido : ultimaData)
        const ritmo = ritmos.get(nomeChave(nome))
        const reativar = numPedidos > 0 && precisaReativar(ritmo, dias)

        return (
          <div key={nome} className={`rounded-xl overflow-hidden bg-white ds-cartao ${aberto ? "shadow-[0_8px_24px_rgba(25,22,37,0.07)]" : "hover:shadow-[0_4px_14px_rgba(25,22,37,0.06)]"}`}>
            <div className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-[rgba(116,116,128,0.03)] transition-colors" onClick={() => setExpandido(aberto ? null : nome)}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[12px] font-semibold"
                style={{ background: numPedidos > 0 ? "rgba(132,86,232,0.1)" : "rgba(116,116,128,0.1)", color: numPedidos > 0 ? "#8456e8" : "#5e5c68" }}>
                {nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[13.5px] font-semibold text-[#191625] leading-snug">{nome}</span>
                  {ritmo?.curva && <Selo tom={ritmo.curva === "A" ? "sucesso" : "neutro"}>{ritmo.curva}</Selo>}
                  {reativar ? <Selo tom="alerta">{ritmo?.intervalo ? `passou do ritmo · ${dias} dias` : `sem pedir há ${dias} dias`}</Selo>
                    : ritmo?.status === "perto" && !ritmo.emAndamento ? <Selo tom="info">hora de lembrar</Selo> : null}
                  {(() => { const o = origemDoCliente(nome, origens, cadastro); if (!o) return null; const t = textoOrigem(o); return <Selo tom="acento">{t.length > 28 ? t.slice(0, 28) + "…" : t}</Selo> })()}
                </div>
                <p className="text-[11px] text-[#898892] mt-1 truncate">
                  {numPedidos > 0 ? `${numPedidos} ${numPedidos === 1 ? "pedido" : "pedidos"}` : `${numOrcamentos} ${numOrcamentos === 1 ? "orçamento" : "orçamentos"}`}
                  {numOrcamentos > 0 && ` · ${fechados} fechados`}
                  {perdidos > 0 && ` · ${perdidos} recusados`}
                  {expirados > 0 && ` · ${expirados} sem resposta`}
                  {dias != null ? ` · último ${numPedidos > 0 ? "pedido" : "orçamento"} há ${dias} dias` : ""}
                  {ritmo?.intervalo ? ` · pede a cada ~${ritmo.intervalo} dias` : ""}
                </p>
              </div>
              {conv !== null && (
                <div className="text-right shrink-0 w-[70px] hidden sm:block">
                  <p className="text-[13px] font-semibold ds-num" style={{ color: conv >= 50 ? "#009351" : conv >= 30 ? "#c57800" : "#d33a3c" }}>{conv}%</p>
                  <p className="text-[10.5px] text-[#898892]">conversão</p>
                </div>
              )}
              <div className="text-right shrink-0 w-[130px]">
                <p className="text-[13.5px] font-semibold ds-num text-[#191625]">{brl(ltv > 0 ? ltv : totalValor)}</p>
                <p className="text-[10.5px] text-[#898892]">{ltv > 0 ? "comprado" : "orçado"}</p>
              </div>
              <Botao variante="secundario" className="h-8 px-3 text-[12px]" onClick={() => setPerfilAberto(nome)}>Perfil</Botao>
              <ChevronDown className={`w-4 h-4 text-[#898892] transition-transform duration-200 shrink-0 ${aberto ? "rotate-180" : ""}`} />
            </div>

            {aberto && (
              <div className="apple-slide-up border-t border-[rgba(60,60,67,0.06)] divide-y divide-[rgba(60,60,67,0.05)] bg-[rgba(116,116,128,0.03)]">
                {(itens as HistItem[]).map((item, i) => {
                  const ideal = item.calculo.tabela.find(l => l.quantidade === item.calculo.sweetSpotIdealQtd) ?? item.calculo.tabela[0]
                  const preco = item.form.comFaca ? (ideal?.precoComFaca ?? 0) : (ideal?.precoSemFaca ?? 0)
                  const card  = kanban.find(c => item.numero && c.numero === item.numero)
                  const sit   = situacaoDoCard(card)
                  return (
                    <div key={i} className="group flex items-center gap-3 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.numero && <Selo tom="acento">{item.numero}</Selo>}
                          <Selo tom={sit.tom}>{sit.nome}</Selo>
                          <span className="text-[11.5px] text-[#5e5c68]">
                            {item.form.frente > 0 ? `${item.form.frente}×${item.form.alturaBox}×${item.form.lateral} cm` : "Dieline importado"} · {item.form.materialNome}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#898892] mt-1">{parseData(item.data)?.toLocaleDateString("pt-BR") ?? item.data}{card?.motivoPerdido && sit.id === "recusado" ? ` · “${card.motivoPerdido}”` : ""}</p>
                      </div>
                      <p className="text-[12.5px] font-semibold text-[#191625] ds-num shrink-0">{brl(preco)}</p>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => onWhatsApp(item)} title="Enviar no WhatsApp"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#009351] hover:bg-[#009351]/[0.08] transition-colors"><MessageCircle className="w-3.5 h-3.5" /></button>
                        <button onClick={() => onReplicar(item)} title="Replicar orçamento"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5e5c68] hover:bg-[rgba(116,116,128,0.1)] transition-colors"><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  )
                })}
                {(propostas as PropostaCustom[]).map(p => {
                  const ativas = p.linhas.filter(l => l.ativa && l.quantidade > 0)
                  const ideal  = ativas.find(l => l.isIdeal) ?? ativas[ativas.length - 1]
                  const card   = p.cardId ? kanban.find(c => c.id === p.cardId) : undefined
                  const sit    = situacaoDoCard(card)
                  const preco  = ideal ? ideal.unitario * ideal.quantidade : card?.preco ?? 0
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Selo tom="acento">{p.numero}</Selo>
                          <Selo tom="neutro">Personalizada</Selo>
                          <Selo tom={sit.tom}>{sit.nome}</Selo>
                          <span className="text-[11.5px] text-[#5e5c68]">{[p.descricao, p.dimensoes, p.material].filter(Boolean).join(" · ") || "—"}</span>
                        </div>
                        <p className="text-[11px] text-[#898892] mt-1">{parseData(p.data)?.toLocaleDateString("pt-BR") ?? p.data}</p>
                      </div>
                      <p className="text-[12.5px] font-semibold text-[#191625] ds-num shrink-0">{preco > 0 ? brl(preco) : "—"}</p>
                      <div className="w-[68px] shrink-0" />
                    </div>
                  )
                })}
                {(itens as HistItem[]).length === 0 && (propostas as PropostaCustom[]).length === 0 && (
                  <p className="px-5 py-3 text-[11.5px] text-[#898892]">Nenhum orçamento salvo com este nome.</p>
                )}
              </div>
            )}
          </div>
        )
      })}
      </div>
    </div>
  )
}
