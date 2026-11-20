"use client"

// Painel → Caixa de entrada: tudo o que pede você numa lista só, por prioridade (dinheiro e bom negócio primeiro).
// Junta o "Para resolver agora", o "Hoje" (orçar, responder, retomar), o "Precisa de você", as propostas prontas e as
// negociações do digital. Cada item: abrir, a ação dele, "resolvido" e "lembrar amanhã". Proposta e negociação
// abrem a decisão ali mesmo.

import React, { useEffect, useMemo, useState } from "react"
import { Inbox, Check, AlarmClock, ShieldAlert, Wallet, Truck, FileText, MessageCircle, RotateCcw, CalendarClock, Handshake, FileCheck2, Flame, Gem, ChevronDown, CheckCircle2, ArrowRight } from "lucide-react"
import { Cartao, TituloCartao, Selo, Vazio, Esqueleto } from "./ds"
import { ordenar, adiarAte, GRUPOS, type GrupoCaixa, type NivelCaixa } from "../lib/caixaEntrada"
import type { Hoje, ItemHoje } from "../lib/hoje"
import type { DadosPedido } from "../lib/atendente"
import type { PropostaPronta } from "../lib/propostaPronta"
import { Proposta } from "./PropostasProntasCard"
import { ItemNegociacao, type PedidoNegociacao } from "./NegociacoesDigitalCard"

export type ItemExterno = {
  chave: string; tipo: string; nivel?: NivelCaixa; numero?: string | null
  titulo: string; sub?: string; valor?: number | null; valorTexto?: string; icone: React.ReactNode
  onClick?: () => void; acao?: React.ReactNode
}
type Item = ItemExterno & { expande?: (fechar: () => void) => React.ReactNode }

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const haQuanto = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000); return m < 60 ? `há ${Math.max(1, m)} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d` }
const doPedido = (d: DadosPedido | null) => d ? [d.quantidade ? `${d.quantidade.toLocaleString("pt-BR")} un` : null, d.produto].filter(Boolean).join(" · ") : ""
const MOSTRAR = 8

export function CaixaEntrada({ extras, onAbrirConversa, onOrcar, onNavegar, onPropostaPronta }: {
  extras: ItemExterno[]
  onAbrirConversa: (jid: string, nome?: string, dados?: DadosPedido) => void
  onOrcar?: (nome: string, jid: string, dados?: DadosPedido) => void
  onNavegar: (view: "whatsapp" | "meta" | "config" | "gastos" | "digital") => void
  onPropostaPronta?: (p: PropostaPronta, enviar: boolean) => void
}) {
  const [hoje, setHoje] = useState<Hoje | null>(null)
  const [propostas, setPropostas] = useState<PropostaPronta[]>([])
  const [negociacoes, setNegociacoes] = useState<PedidoNegociacao[]>([])
  const [ocultos, setOcultos] = useState<Record<string, string>>({})
  const [grupo, setGrupo] = useState<GrupoCaixa | "tudo">("tudo")
  const [verTodos, setVerTodos] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)

  const carregar = () => {
    fetch("/api/hoje").then(r => r.ok ? r.json() : null).then(x => { if (x) setHoje(x) }).catch(() => {})
    fetch("/api/proposta-pronta").then(r => r.json()).then(d => setPropostas((d.propostas ?? []).filter((p: PropostaPronta) => p.status === "aguardando"))).catch(() => {})
    fetch("/api/digital").then(r => r.json()).then(d => setNegociacoes((d.pedidos ?? []).filter((p: PedidoNegociacao) => p.status === "aguardando_sinal" && p.negociacao?.status === "aguardando"))).catch(() => {})
    fetch("/api/caixa").then(r => r.json()).then(d => setOcultos(d.ocultos ?? {})).catch(() => {})
  }
  useEffect(() => {
    carregar()
    const t = setInterval(() => { if (!document.hidden) carregar() }, 180_000)
    return () => clearInterval(t)
  }, [])

  const marcar = (chave: string, ate: string) => {
    setOcultos(o => ({ ...o, [chave]: ate }))
    fetch("/api/caixa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave, ate }) }).catch(() => {})
  }
  const fecharConversa = (jid: string, chave: string) => {
    marcar(chave, "sempre")
    fetch("/api/whatsapp/conversas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid, fechar: true }) }).catch(() => {})
  }

  const itens = useMemo(() => {
    if (!hoje) return []
    const lista: Item[] = []
    const numerosExtras = new Set(extras.map(e => e.numero).filter(Boolean))
    // Saldo de IA ou anúncios acabando
    for (const a of hoje.gastos?.alertas ?? []) lista.push({ chave: `gasto:${a.tipo}:${a.nivel}`, tipo: "sistema", nivel: a.nivel, titulo: a.tipo === "ia" ? "Saldo da IA" : "Saldo dos anúncios da Meta", sub: a.texto, icone: <ShieldAlert className="w-4 h-4" />, onClick: () => onNavegar("gastos") })
    // Para resolver agora
    for (const x of hoje.resolver ?? []) {
      if (x.tipo === "digital") continue
      if (x.numero && numerosExtras.has(x.numero)) continue   // o mesmo pedido já está nas pendências do Painel
      const [nome, numero] = x.titulo.split(" · ")
      const chave = `r:${x.tipo}:${x.numero ?? x.jid ?? x.titulo}:${x.desde ?? ""}`
      lista.push({
        chave, tipo: x.tipo, nivel: x.nivel === "perigo" ? "perigo" : x.nivel === "alerta" ? "alerta" : "info", numero: x.numero,
        titulo: nome, sub: [numero, x.detalhe].filter(Boolean).join(" · "), valor: x.valor,
        icone: x.tipo === "sistema" ? <ShieldAlert className="w-4 h-4" /> : x.tipo === "pagamento" ? <Wallet className="w-4 h-4" /> : x.tipo === "atrasado" ? <Truck className="w-4 h-4" /> : x.tipo === "grande" ? <Gem className="w-4 h-4" /> : x.tipo === "esperando" ? <MessageCircle className="w-4 h-4" /> : <Flame className="w-4 h-4" />,
        onClick: x.jid ? () => onAbrirConversa(x.jid!, nome) : x.tipo === "sistema" ? () => onNavegar("config") : undefined,
        acao: x.tipo === "esperando" && x.jid ? <BotaoTexto onClick={() => fecharConversa(x.jid!, chave)} titulo="Não precisa de resposta: fecha a conversa (reabre se o cliente escrever)">Fechar</BotaoTexto> : undefined,
      })
    }
    // Hoje: orçar, MQL travado, responder, retomar
    const daConversa = (x: ItemHoje, tipo: string, nivel: NivelCaixa, sub: string): Item => ({
      chave: `${tipo}:${x.jid}:${x.desde}`, tipo, nivel, titulo: x.nome || x.jid.split("@")[0], sub,
      icone: tipo === "orcar" ? <FileText className="w-4 h-4" /> : tipo === "retomar" ? <CalendarClock className="w-4 h-4" /> : x.retomada ? <RotateCcw className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />,
      onClick: () => onAbrirConversa(x.jid, x.nome || undefined, x.dados ?? undefined),
      acao: onOrcar && (tipo === "orcar" || tipo === "travado") ? <BotaoTexto onClick={() => onOrcar(x.cliente || x.nome || x.jid.split("@")[0], x.jid, x.dados ?? undefined)} titulo="Novo orçamento com o que o cliente já contou">Orçar</BotaoTexto> : undefined,
    })
    for (const x of hoje.orcar ?? []) lista.push(daConversa(x, "orcar", "alerta", `Esperando o seu orçamento ${haQuanto(x.desde)}${doPedido(x.dados) ? ` · ${doPedido(x.dados)}` : ""}`))
    for (const x of hoje.meta?.travados ?? []) lista.push(daConversa(x, "travado", "info", `MQL sem orçamento ${haQuanto(x.desde)}${x.falta?.length ? ` · falta ${x.falta.join(", ")}` : ""}`))
    for (const x of hoje.responder) lista.push(daConversa(x, "responder", x.retomada ? "sucesso" : "info", `${x.rotulo} · ${haQuanto(x.desde)}${x.mensagem ? ` · “${x.mensagem}”` : ""}`))
    for (const x of hoje.retomar ?? []) lista.push(daConversa(x, "retomar", "info", x.nota ? `Lembrete: ${x.nota}` : `Sem resposta ${haQuanto(x.desde)}${doPedido(x.dados) ? ` · ${doPedido(x.dados)}` : ""}`))
    // Propostas prontas e negociações do digital: a decisão abre aqui mesmo
    for (const p of propostas) lista.push({
      chave: `prop:${p.id}`, tipo: "propostaPronta", nivel: "alerta", valor: p.preco, titulo: `Proposta pronta · ${p.nome ?? "cliente"}`,
      sub: `${p.quantidade.toLocaleString("pt-BR")} un · o agente montou, falta você aprovar e enviar`, icone: <FileCheck2 className="w-4 h-4" />,
      expande: fechar => onPropostaPronta ? <Proposta p={p} onAbrir={(pp, enviar) => { fechar(); setPropostas(l => l.filter(x => x.id !== pp.id)); onPropostaPronta(pp, enviar) }}
        onDescartar={() => { fechar(); setPropostas(l => l.filter(x => x.id !== p.id)); fetch("/api/proposta-pronta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, acao: "descartar" }) }).catch(() => {}) }}
        onAbrirConversa={onAbrirConversa} /> : null,
    })
    for (const p of negociacoes) lista.push({
      chave: `neg:${p.id}:${p.negociacao?.em ?? ""}`, tipo: "negociacao", nivel: "alerta", valor: p.negociacao?.pedidoTotal ?? p.total,
      titulo: `Negociação no digital · ${p.nome ?? "cliente"}`, sub: `${p.quantidade.toLocaleString("pt-BR")} caixinhas · está ${brl(p.total)}${p.negociacao?.pedidoTotal ? `, pediu ${brl(p.negociacao.pedidoTotal)}` : ""}`,
      icone: <Handshake className="w-4 h-4" />,
      expande: fechar => <ItemNegociacao p={p} onAbrirConversa={onAbrirConversa} onFeito={() => { fechar(); setNegociacoes(l => l.filter(x => x.id !== p.id)) }} />,
    })
    // Pendências do Painel (entregas, cobranças, aprovações online, propostas vencendo...)
    lista.push(...extras)
    return ordenar(lista, ocultos)
  }, [hoje, propostas, negociacoes, extras, ocultos])   // eslint-disable-line react-hooks/exhaustive-deps

  if (!hoje) return <Esqueleto linhas={5} />
  const porGrupo = (g: GrupoCaixa) => itens.filter(i => i.grupo === g).length
  const visiveis = grupo === "tudo" ? itens : itens.filter(i => i.grupo === grupo)
  const mostrados = verTodos ? visiveis : visiveis.slice(0, MOSTRAR)
  const emJogo = itens.reduce((t, i) => t + (i.grupo === "dinheiro" || i.grupo === "vendas" ? i.valor ?? 0 : 0), 0)
  const m = hoje.meta?.resumo

  return (
    <Cartao padding={false} className="ds-entrada">
      <div className="px-5 pt-5">
        <TituloCartao titulo="Caixa de entrada" icone={<Inbox className="w-4 h-4" />}
          sub={itens.length ? [`${itens.length} ${itens.length === 1 ? "item" : "itens"} por prioridade`, emJogo ? `${brl(emJogo)} em jogo` : ""].filter(Boolean).join(" · ") : undefined}
          acao={itens.length ? <Selo tom={itens.some(i => i.nivel === "perigo") ? "perigo" : "alerta"}>{itens.length}</Selo> : undefined} />
        {itens.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 mt-1" style={{ scrollbarWidth: "none" }}>
            {[{ id: "tudo" as const, nome: "Tudo", n: itens.length }, ...GRUPOS.map(g => ({ ...g, n: porGrupo(g.id) })).filter(g => g.n)].map(g => (
              <button key={g.id} onClick={() => { setGrupo(g.id); setVerTodos(false) }}
                className={`ds-toque shrink-0 h-8 px-3 rounded-full text-[12.5px] font-semibold transition-colors ${grupo === g.id ? "bg-[#191625] text-white" : "bg-[rgba(116,116,128,0.08)] text-[#5e5c68] hover:bg-[rgba(116,116,128,0.14)]"}`}>
                {g.nome} <span className={grupo === g.id ? "text-white/70" : "text-[#898892]"}>{g.n}</span>
              </button>
            ))}
          </div>
        )}
        {m && m.total > 0 && (
          <p className="text-[11.5px] text-[#898892] mt-2">
            Meta: orçar todo MQL em 24 h · 7 dias: <span className="font-semibold" style={{ color: m.orcados / m.total >= 0.8 ? "#009351" : m.orcados / m.total >= 0.5 ? "#c57800" : "#d33a3c" }}>{m.orcados} de {m.total}</span> orçados
          </p>
        )}
      </div>
      <div className="px-2 pb-2 pt-1 ds-escalonado">
        {visiveis.length === 0
          ? <Vazio icone={<CheckCircle2 className="w-9 h-9" />} titulo="Tudo em dia" sub="Nenhum bom negócio esperando, nenhuma cobrança vencida e nada atrasado." />
          : mostrados.map(i => (
            <div key={i.chave}>
              <Linha i={i} aberto={aberto === i.chave}
                onAbrir={i.expande ? () => setAberto(a => a === i.chave ? null : i.chave) : i.onClick}
                onResolvido={() => marcar(i.chave, "sempre")} onAmanha={() => marcar(i.chave, adiarAte("amanha"))} />
              {aberto === i.chave && i.expande && <div className="px-3 pb-3">{i.expande(() => setAberto(null))}</div>}
            </div>
          ))}
        {visiveis.length > MOSTRAR && (
          <button onClick={() => setVerTodos(v => !v)} className="w-full py-2.5 text-[12px] font-medium text-[#8456e8] hover:bg-[#8456e8]/[0.04] rounded-lg transition-colors">
            {verTodos ? "Mostrar menos" : `Ver todos (${visiveis.length})`}
          </button>
        )}
        {hoje.outrosEsperando > 0 && (
          <button onClick={() => onNavegar("whatsapp")} className="w-full flex items-center justify-between px-3 py-2 text-[11.5px] text-[#898892] hover:bg-[rgba(116,116,128,0.06)] rounded-lg transition-colors">
            <span>Mais {hoje.outrosEsperando} {hoje.outrosEsperando === 1 ? "conversa esperando" : "conversas esperando"} com a IA</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </Cartao>
  )
}

// Linha em duas camadas (cabe no celular): nome e valor em cima; o que é e as ações embaixo
const COR: Record<NivelCaixa, string> = { perigo: "#d33a3c", alerta: "#c57800", info: "#8456e8", sucesso: "#009351" }
function Linha({ i, aberto, onAbrir, onResolvido, onAmanha }: { i: Item; aberto: boolean; onAbrir?: () => void; onResolvido: () => void; onAmanha: () => void }) {
  const cor = COR[i.nivel ?? "info"]
  return (
    <div className="flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-[rgba(116,116,128,0.05)] transition-colors">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${cor}14`, color: cor }}>{i.icone}</span>
      <div className="flex-1 min-w-0">
        <button onClick={onAbrir} disabled={!onAbrir} className="w-full text-left disabled:cursor-default">
          <span className="flex items-baseline gap-2">
            <span className="flex-1 min-w-0 text-[14px] font-semibold text-[#191625] truncate">{i.titulo}</span>
            {(i.valorTexto || i.valor) ? <span className="text-[13.5px] font-bold ds-num shrink-0" style={{ color: cor }}>{i.valorTexto ?? brl(i.valor!)}</span> : null}
          </span>
          {i.sub && <span className="block text-[12.5px] text-[#5e5c68] leading-snug mt-0.5 line-clamp-2">{i.sub}</span>}
        </button>
        <div className="flex items-center gap-0.5 mt-1 -ml-2">
          {i.expande && <BotaoTexto titulo="Ver e decidir" onClick={onAbrir ?? (() => {})}>{aberto ? "Fechar" : "Decidir"}<ChevronDown className={`inline w-3.5 h-3.5 ml-0.5 transition-transform ${aberto ? "rotate-180" : ""}`} /></BotaoTexto>}
          {i.acao}
          <span className="flex-1" />
          <BotaoIcone titulo="Resolvido: tirar da caixa" onClick={onResolvido}><Check className="w-4 h-4" /></BotaoIcone>
          <BotaoIcone titulo="Lembrar amanhã às 8 h" onClick={onAmanha}><AlarmClock className="w-4 h-4" /></BotaoIcone>
        </div>
      </div>
    </div>
  )
}

function BotaoIcone({ titulo, onClick, children }: { titulo: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={titulo} aria-label={titulo} onClick={e => { e.stopPropagation(); onClick() }}
    className="ds-toque w-9 h-9 rounded-lg flex items-center justify-center text-[#898892] hover:text-[#191625] hover:bg-[rgba(116,116,128,0.1)] transition-colors shrink-0">{children}</button>
}
function BotaoTexto({ titulo, onClick, children }: { titulo: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={titulo} onClick={e => { e.stopPropagation(); onClick() }}
    className="ds-toque h-8 px-2.5 rounded-lg text-[11.5px] font-semibold text-[#8456e8] hover:bg-[#8456e8]/[0.08] transition-colors shrink-0 whitespace-nowrap">{children}</button>
}
