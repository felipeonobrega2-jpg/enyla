"use client"

import { useState, useMemo } from "react"
import {
  FileText, CheckCircle2, XCircle, Target, Clock, BarChart3, Plus, Users, Search, X, Hourglass, MessageSquareX,
} from "lucide-react"
import { KanbanCard, PropostaCustom } from "../types"
import { conversao, orcamentosDoPeriodo, nomeChave, isAberto, isGanho, isPerdido, isExpirado, parseData, SEM_PERIODO } from "../lib/negocio"
import { brl, num } from "../utils"
import { HistoricoView, HistItem, OrdemHistorico, SituacaoOrc, situacaoDoCard } from "./HistoricoView"
import { CabecalhoPagina, Kpi, GradeKpis, Segmentado, Botao, Cartao, TituloCartao, Colunas, ListaBarras, Gaveta, LinhaLista, Vazio, Selo } from "./ds"

type OrcTab = "lista" | "visao"

type Props = {
  historico: HistItem[]
  propostasCustom: PropostaCustom[]
  kanban: KanbanCard[]
  onNovoOrcamento: () => void
  // histórico passthrough
  onReplicar: (item: HistItem) => void
  onDownloadPdf: (item: HistItem) => void
  onDownloadPdfCliente: (item: HistItem) => void
  onExcluir: (index: number) => void
  onWhatsApp: (item: HistItem) => void
  onPdfCustom: (p: PropostaCustom) => void
  onWhatsAppCustom: (p: PropostaCustom) => void
  onExcluirCustom: (id: string) => void
  onEditarCustom: (p: PropostaCustom) => void
  onPersonalizar?: (item: HistItem) => void
  onDetalhes?: (item: HistItem | PropostaCustom) => void
}

const inteiro = (n: number) => num(Math.round(n))

export function OrcamentosView(props: Props) {
  const { historico, propostasCustom, kanban, onNovoOrcamento, onDetalhes } = props

  const [tab, setTab] = useState<OrcTab>("lista")
  const [situacao, setSituacao] = useState<SituacaoOrc>("todos")
  const [busca, setBusca] = useState("")
  const [ordem, setOrdem] = useState<OrdemHistorico>("recente")
  const [gaveta, setGaveta] = useState<{ titulo: string; sub: string; cards: KanbanCard[] } | null>(null)

  // Definições canônicas (lib/negocio): unidade = orçamento (card), exclui terceirizados
  const base = useMemo(() => orcamentosDoPeriodo(kanban, SEM_PERIODO), [kanban])
  const conv = conversao(base)
  const soma = (cs: KanbanCard[]) => cs.reduce((s, c) => s + c.preco, 0)
  const abertos = base.filter(isAberto)
  const fechados = base.filter(isGanho)
  const recusados = base.filter(isPerdido)
  const semResposta = base.filter(isExpirado)

  const filtrar = (s: SituacaoOrc) => {
    setSituacao(atual => atual === s ? "todos" : s)
    setTab("lista")
  }

  // Abre o orçamento salvo (ou a proposta personalizada) de um card
  const abrirCard = (c: KanbanCard) => {
    const h = historico.find(x => x.numero === c.numero)
    const p = propostasCustom.find(x => x.cardId === c.id)
    const alvo = h ?? p
    if (alvo) { setGaveta(null); onDetalhes?.(alvo) }
  }
  const abrir = (titulo: string, cards: KanbanCard[]) =>
    setGaveta({ titulo, sub: `${cards.length} ${cards.length === 1 ? "orçamento" : "orçamentos"} · ${brl(soma(cards))}`, cards })

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-page)" }}>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[1320px] mx-auto px-6 pt-6 pb-10 space-y-4">
          <CabecalhoPagina
            titulo="Orçamentos"
            sub={`${conv.total} orçamentos · ${conv.ganhos} fechados · ${num(conv.taxa, 0)}% de conversão desde o início`}
            acoes={<>
              <Segmentado<OrcTab> valor={tab} onChange={setTab} opcoes={[{ v: "lista", nome: "Lista" }, { v: "visao", nome: "Visão geral" }]} />
              <Botao variante="primario" icone={<Plus className="w-4 h-4" />} onClick={onNovoOrcamento}>Novo orçamento</Botao>
            </>}
          />

          <GradeKpis>
            <Kpi rotulo="Em aberto" icone={<Hourglass className="w-3.5 h-3.5" />} tom="info" destaque={situacao === "aberto"}
              valor={abertos.length} formato={inteiro} onClick={() => filtrar("aberto")}
              sub={abertos.length ? `${brl(soma(abertos))} em negociação` : "nenhum aguardando resposta"} />
            <Kpi rotulo="Fechados" icone={<CheckCircle2 className="w-3.5 h-3.5" />} tom="sucesso" destaque={situacao === "fechado"}
              valor={fechados.length} formato={inteiro} onClick={() => filtrar("fechado")} sub={brl(soma(fechados))} />
            <Kpi rotulo="Recusados" icone={<XCircle className="w-3.5 h-3.5" />} tom="perigo" destaque={situacao === "recusado"}
              valor={recusados.length} formato={inteiro} onClick={() => filtrar("recusado")} sub="o cliente disse não" />
            <Kpi rotulo="Sem resposta" icone={<Clock className="w-3.5 h-3.5" />} tom="alerta" destaque={situacao === "semResposta"}
              valor={semResposta.length} formato={inteiro} onClick={() => filtrar("semResposta")} sub="venceram sem decisão" />
            <Kpi rotulo="Conversão" icone={<Target className="w-3.5 h-3.5" />} tom="acento"
              valor={conv.decididos > 0 ? conv.taxa : null} formato={n => `${num(n, 1)}%`}
              sub={`${conv.ganhos} de ${conv.decididos} decididos`} onClick={() => setTab("visao")} />
          </GradeKpis>

          {tab === "lista" ? <>
            <div className="flex items-center gap-2 flex-wrap">
              <Segmentado<SituacaoOrc> valor={situacao} onChange={setSituacao} opcoes={[
                { v: "todos", nome: "Todos" },
                { v: "aberto", nome: `Em aberto ${abertos.length}` },
                { v: "fechado", nome: `Fechados ${fechados.length}` },
                { v: "recusado", nome: `Recusados ${recusados.length}` },
                { v: "semResposta", nome: `Sem resposta ${semResposta.length}` },
              ]} />
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#898892] pointer-events-none" />
                <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, número ou data"
                  className="w-full h-9 rounded-lg pl-9 pr-8 text-[12.5px] text-[#191625] placeholder:text-[#898892] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] transition-all ds-borda" />
                {busca && (
                  <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-[#898892] hover:text-[#191625]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <select value={ordem} onChange={e => setOrdem(e.target.value as OrdemHistorico)}
                className="h-9 rounded-lg px-3 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 cursor-pointer ds-borda">
                <option value="recente">Mais recentes</option>
                <option value="antigo">Mais antigos</option>
                <option value="maior">Maior valor</option>
                <option value="menor">Menor valor</option>
                <option value="nome">Cliente A–Z</option>
              </select>
            </div>
            <HistoricoView {...props} busca={busca} ordem={ordem} situacao={situacao} />
          </> : (
            <VisaoGeral base={base} abrir={abrir} />
          )}
        </div>
      </div>

      <Gaveta aberta={!!gaveta} titulo={gaveta?.titulo ?? ""} sub={gaveta?.sub} onFechar={() => setGaveta(null)}>
        {gaveta?.cards.length === 0 && <Vazio icone={<FileText className="w-8 h-8" />} titulo="Nenhum orçamento" />}
        {gaveta?.cards.map(c => {
          const sit = situacaoDoCard(c)
          return (
            <LinhaLista key={c.id} titulo={`${c.numero} · ${c.nomeCliente}`}
              sub={`${parseData(c.data)?.toLocaleDateString("pt-BR") ?? ""}${c.motivoPerdido && isPerdido(c) ? ` · ${c.motivoPerdido}` : ""}`}
              valor={brl(c.preco)} valorSub={<Selo tom={sit.tom}>{sit.nome}</Selo>}
              onClick={historico.some(h => h.numero === c.numero) || propostasCustom.some(p => p.cardId === c.id) ? () => abrirCard(c) : undefined} />
          )
        })}
      </Gaveta>
    </div>
  )
}

function VisaoGeral({ base, abrir }: { base: KanbanCard[]; abrir: (titulo: string, cards: KanbanCard[]) => void }) {
  const conv = conversao(base)
  const hoje = new Date()
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 11 + i, 1)
    const doMes = base.filter(c => { const x = parseData(c.data); return !!x && x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() })
    return { chave: String(i), rotulo: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), valor: doMes.length, destaque: i === 11, cards: doMes, nome: d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) }
  })
  const comOrc = meses.filter(m => m.valor > 0)
  const mediaMes = comOrc.length ? comOrc.reduce((s, m) => s + m.valor, 0) / comOrc.length : 0
  const valorMedio = base.length ? base.reduce((s, c) => s + c.preco, 0) / base.length : 0
  const clientes = new Set(base.map(c => nomeChave(c.nomeCliente)).filter(Boolean)).size

  // Motivos de recusa (só quem disse não; vencidos ficam de fora)
  const motivos = new Map<string, KanbanCard[]>()
  for (const c of base.filter(isPerdido)) {
    const m = (c.motivoPerdido || "Sem motivo informado").trim()
    motivos.set(m, [...(motivos.get(m) ?? []), c])
  }
  const listaMotivos = [...motivos.entries()].sort((a, b) => b[1].length - a[1].length)

  if (!base.length) return <Vazio icone={<FileText className="w-9 h-9" />} titulo="Nenhum orçamento ainda" sub='Clique em "Novo orçamento" para começar.' />

  const pct = (n: number) => conv.decididos > 0 ? (n / conv.decididos) * 100 : 0
  return (
    <div className="space-y-4 ds-escalonado">
      <Cartao>
        <TituloCartao titulo="Orçamentos enviados por mês" icone={<BarChart3 className="w-4 h-4" />}
          sub={`${meses[11].valor} neste mês · média de ${num(mediaMes, 1)} por mês · clique num mês para ver a lista`} />
        <Colunas itens={meses} formato={n => `${Math.round(n)} ${Math.round(n) === 1 ? "orçamento" : "orçamentos"}`}
          onClick={k => { const m = meses[Number(k)]; abrir(`Orçamentos de ${m.nome}`, m.cards) }} />
      </Cartao>

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4 items-start">
        <Cartao>
          <TituloCartao titulo="Para onde vão os orçamentos" icone={<Target className="w-4 h-4" />}
            sub={`${conv.decididos} decididos · ${conv.abertos} ainda em aberto`} />
          <div className="h-3 rounded-full overflow-hidden flex gap-0.5 bg-[rgba(116,116,128,0.08)]">
            <div className="h-full ds-cresce-x bg-[#009351]" style={{ width: `${pct(conv.ganhos)}%` }} />
            <div className="h-full ds-cresce-x bg-[#d33a3c]" style={{ width: `${pct(conv.perdidos)}%`, animationDelay: "80ms" }} />
            <div className="h-full ds-cresce-x bg-[#c57800]/60" style={{ width: `${pct(conv.expirados)}%`, animationDelay: "160ms" }} />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { nome: "Fechados", n: conv.ganhos, cor: "#009351", lista: base.filter(isGanho) },
              { nome: "Recusados", n: conv.perdidos, cor: "#d33a3c", lista: base.filter(isPerdido) },
              { nome: "Sem resposta", n: conv.expirados, cor: "#c57800", lista: base.filter(isExpirado) },
            ].map(x => (
              <button key={x.nome} onClick={() => abrir(x.nome, x.lista)}
                className="text-left rounded-lg px-3 py-2.5 hover:bg-[rgba(116,116,128,0.06)] transition-colors">
                <p className="text-[11px] text-[#898892] flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: x.cor }} />{x.nome}</p>
                <p className="text-[18px] font-semibold text-[#191625] ds-num mt-1">{x.n} <span className="text-[12px] font-medium text-[#898892]">{num(pct(x.n), 0)}%</span></p>
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-[#898892] mt-3 leading-relaxed">
            {conv.expirados > conv.perdidos
              ? `A maior perda não é recusa: ${conv.expirados} orçamentos venceram sem resposta. Um retorno antes do vencimento recupera parte deles.`
              : `Conversão de ${num(conv.taxa, 1)}% sobre os orçamentos decididos.`}
          </p>
        </Cartao>

        <Cartao>
          <TituloCartao titulo="Por que recusaram" icone={<MessageSquareX className="w-4 h-4" />} sub={`${conv.perdidos} recusas com motivo informado`} />
          {listaMotivos.length === 0
            ? <Vazio icone={<CheckCircle2 className="w-8 h-8" />} titulo="Nenhuma recusa registrada" />
            : <ListaBarras onClick={k => { const m = listaMotivos[Number(k)]; abrir(`Recusados: ${m[0]}`, m[1]) }}
                itens={listaMotivos.slice(0, 6).map(([nome, cs], i) => ({ chave: i, rotulo: nome, qtd: cs.length, tom: "perigo" as const }))} />}
        </Cartao>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Kpi rotulo="Valor médio orçado" icone={<BarChart3 className="w-3.5 h-3.5" />} valor={valorMedio} formato={brl} sub="por orçamento enviado" />
        <Kpi rotulo="Orçamentos por mês" icone={<Clock className="w-3.5 h-3.5" />} valor={mediaMes} formato={n => num(n, 1)} sub="nos meses com envio" />
        <Kpi rotulo="Por cliente" icone={<Users className="w-3.5 h-3.5" />} valor={clientes ? base.length / clientes : 0} formato={n => num(n, 1)} sub={`${clientes} clientes diferentes`} />
      </div>
    </div>
  )
}
