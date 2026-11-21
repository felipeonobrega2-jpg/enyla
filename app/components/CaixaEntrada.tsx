"use client"

// Painel → Caixa de entrada: tudo o que pede você numa lista só, por prioridade (dinheiro e bom negócio primeiro).
// Junta o "Para resolver agora", o "Hoje" (orçar, responder, retomar), o "Precisa de você", as propostas prontas e as
// negociações do digital. Cada item: abrir, a ação dele, "resolvido" e "lembrar amanhã". Proposta e negociação
// abrem a decisão ali mesmo.

import React, { useEffect, useMemo, useState } from "react"
import { Inbox, Check, AlarmClock, ShieldAlert, Wallet, Truck, FileText, MessageCircle, RotateCcw, CalendarClock, Handshake, FileCheck2, Flame, Gem, ChevronDown, CheckCircle2, ArrowRight } from "lucide-react"
import { Cartao, Vazio, Esqueleto } from "./ds"
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
    fetch("/api/proposta-pronta").then(r => r.json()).then(d => setPropostas((d.propostas ?? []).filter((p: PropostaPronta) => p.status === "aguardando" && p.manual))).catch(() => {})
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
    // MQL ainda faltando dado é da IA (checklist antes de passar para você)
    for (const x of (hoje.meta?.travados ?? []).filter(x => !x.falta?.length)) lista.push(daConversa(x, "travado", "info", `MQL sem orçamento ${haQuanto(x.desde)}${x.falta?.length ? ` · falta ${x.falta.join(", ")}` : ""}`))
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
  // Alertas do sistema (saldo, crédito, WhatsApp) viram uma faixa no topo; o resto é a lista de trabalho
  const alertas = itens.filter(i => i.grupo === "sistema")
  const trabalho = juntarMesmoPedido(itens.filter(i => i.grupo !== "sistema"))
  const doGrupo = (g: GrupoCaixa) => trabalho.filter(i => i.grupo === g)
  const valorDe = (l: typeof trabalho) => l.reduce((t, i) => t + (i.valor ?? 0), 0)
  const emJogo = valorDe(trabalho.filter(i => i.grupo === "dinheiro" || i.grupo === "vendas"))
  const m = hoje.meta?.resumo
  const metaMql = m && m.total > 0 ? (
    <span>MQL orçado em 24 h · 7 dias: <span className="font-semibold" style={{ color: m.orcados / m.total >= 0.8 ? "#009351" : m.orcados / m.total >= 0.5 ? "#c57800" : "#d33a3c" }}>{m.orcados} de {m.total}</span></span>
  ) : null
  const resolver = (i: Item & { chaves?: string[] }) => (i.chaves ?? [i.chave]).forEach(c => marcar(c, "sempre"))
  const amanha = (i: Item & { chaves?: string[] }) => (i.chaves ?? [i.chave]).forEach(c => marcar(c, adiarAte("amanha")))
  const linha = (i: Item & { chaves?: string[] }) => (
    <div key={i.chave}>
      <Linha i={i} aberto={aberto === i.chave}
        onAbrir={i.expande ? () => setAberto(a => a === i.chave ? null : i.chave) : i.onClick}
        onResolvido={() => resolver(i)} onAmanha={() => amanha(i)} />
      {aberto === i.chave && i.expande && <div className="px-3 pb-3 md:pl-14">{i.expande(() => setAberto(null))}</div>}
    </div>
  )
  const grupos = GRUPOS.filter(g => g.id !== "sistema").map(g => ({ ...g, itens: doGrupo(g.id) })).filter(g => g.itens.length)
  const POR_GRUPO = 4

  return (
    <Cartao padding={false} className="ds-entrada">
      <div className="px-5 pt-5">
        <div className="flex items-start gap-3">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#8456e814", color: "#8456e8" }}><Inbox className="w-4 h-4" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-[#191625] leading-tight">Caixa de entrada</p>
            <p className="text-[12px] text-[#898892] mt-0.5">
              {trabalho.length ? <>{trabalho.length} {trabalho.length === 1 ? "coisa pede" : "coisas pedem"} você{emJogo ? <> · <span className="font-semibold text-[#191625]">{brl(emJogo)}</span> em jogo</> : null}</> : "Nada pedindo você agora"}
            </p>
          </div>
        </div>
        {trabalho.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 mt-3" style={{ scrollbarWidth: "none" }}>
            {[{ id: "tudo" as const, nome: "Tudo", n: trabalho.length }, ...grupos.map(g => ({ id: g.id, nome: g.nome, n: g.itens.length }))].map(g => (
              <button key={g.id} onClick={() => { setGrupo(g.id); setVerTodos(false) }}
                className={`ds-toque shrink-0 h-7 px-3 rounded-full text-[12px] font-semibold transition-colors ${grupo === g.id ? "bg-[#191625] text-white" : "bg-[rgba(116,116,128,0.08)] text-[#5e5c68] hover:bg-[rgba(116,116,128,0.14)]"}`}>
                {g.nome} <span className={grupo === g.id ? "text-white/70" : "text-[#898892]"}>{g.n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {alertas.length > 0 && (
        <div className="mx-5 mt-3 rounded-xl divide-y divide-[#d33a3c]/10" style={{ background: "rgba(211,58,60,0.06)" }}>
          {alertas.map(a => (
            <div key={a.chave} className="flex items-center gap-2.5 pl-3 pr-1.5 py-1.5">
              <ShieldAlert className="w-4 h-4 shrink-0" style={{ color: COR[a.nivel ?? "perigo"] }} />
              <button onClick={a.onClick} disabled={!a.onClick} className="flex-1 min-w-0 text-left text-[12.5px] leading-snug py-1 disabled:cursor-default">
                <span className="font-semibold text-[#191625]">{a.titulo}</span>
                {a.sub && <span className="text-[#5e5c68]"> · {a.sub}</span>}
              </button>
              {a.onClick && <span className="hidden md:inline"><BotaoTexto titulo="Abrir" onClick={a.onClick}>Resolver</BotaoTexto></span>}
              <BotaoIcone titulo="Lembrar amanhã às 8 h" onClick={() => marcar(a.chave, adiarAte("amanha"))}><AlarmClock className="w-4 h-4" /></BotaoIcone>
            </div>
          ))}
        </div>
      )}

      <div className="px-2 pb-2 pt-1">
        {trabalho.length === 0
          ? <Vazio icone={<CheckCircle2 className="w-9 h-9" />} titulo="Tudo em dia" sub="Nenhum bom negócio esperando, nenhuma cobrança vencida e nada atrasado." />
          : grupo === "tudo"
            ? grupos.map(g => (
              <section key={g.id} className="ds-escalonado">
                <div className="flex items-baseline gap-2 px-3 pt-4 pb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#898892]">{g.nome}</span>
                  <span className="text-[11px] text-[#aeadb5]">{g.itens.length}</span>
                  <span className="flex-1" />
                  {g.id === "vendas" && metaMql && <span className="text-[11px] text-[#898892] truncate">{metaMql}</span>}
                  {g.id !== "vendas" && valorDe(g.itens) > 0 && <span className="text-[11.5px] font-semibold ds-num text-[#5e5c68]">{brl(valorDe(g.itens))}</span>}
                </div>
                {g.itens.slice(0, POR_GRUPO).map(linha)}
                {g.itens.length > POR_GRUPO && (
                  <button onClick={() => setGrupo(g.id)} className="w-full text-left px-3 md:pl-14 py-2 text-[12px] font-medium text-[#8456e8] hover:bg-[#8456e8]/[0.04] rounded-lg transition-colors">
                    Ver mais {g.itens.length - POR_GRUPO} em {g.nome.toLowerCase()}
                  </button>
                )}
              </section>
            ))
            : (() => {
              const lista = doGrupo(grupo), mostrados = verTodos ? lista : lista.slice(0, MOSTRAR)
              return <div className="pt-2 ds-escalonado">
                {grupo === "vendas" && metaMql && <p className="px-3 pb-1 text-[11.5px] text-[#898892]">{metaMql}</p>}
                {mostrados.map(linha)}
                {lista.length > MOSTRAR && (
                  <button onClick={() => setVerTodos(v => !v)} className="w-full py-2.5 text-[12px] font-medium text-[#8456e8] hover:bg-[#8456e8]/[0.04] rounded-lg transition-colors">
                    {verTodos ? "Mostrar menos" : `Ver todos (${lista.length})`}
                  </button>
                )}
              </div>
            })()}
        {hoje.outrosEsperando > 0 && (
          <button onClick={() => onNavegar("whatsapp")} className="w-full flex items-center justify-between px-3 py-2.5 mt-1 text-[11.5px] text-[#898892] hover:bg-[rgba(116,116,128,0.06)] rounded-lg transition-colors border-t border-[rgba(60,60,67,0.08)]">
            <span>Mais {hoje.outrosEsperando} {hoje.outrosEsperando === 1 ? "conversa" : "conversas"} com a IA, sem precisar de você</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </Cartao>
  )
}

// O mesmo pedido em dois itens do mesmo grupo (ex.: cobrança vencida e saldo sem cobrança) vira uma linha só:
// fica o mais importante, o valor soma (no dinheiro) e "resolvido" tira os dois
function juntarMesmoPedido<T extends Item & { grupo: GrupoCaixa; peso: number }>(itens: T[]): (T & { chaves?: string[] })[] {
  const saida: (T & { chaves?: string[] })[] = []
  const porNumero = new Map<string, T & { chaves?: string[] }>()
  for (const i of itens) {
    const k = i.numero ? `${i.grupo}|${i.numero}` : null
    const ja = k ? porNumero.get(k) : undefined
    if (!ja) { const novo = { ...i, chaves: [i.chave] }; if (k) porNumero.set(k, novo); saida.push(novo); continue }
    ja.chaves!.push(i.chave)
    if (i.grupo !== "dinheiro" || !i.valor) continue
    ja.valor = (ja.valor ?? 0) + i.valor; ja.valorTexto = undefined
    // Junta a explicação só se ela já não estiver dita ("mais R$ 4.470,00 sem cobrança")
    const inteiro = Math.round(i.valor).toLocaleString("pt-BR")
    if (i.sub && !(ja.sub ?? "").includes(inteiro)) ja.sub = [ja.sub, i.sub].filter(Boolean).join(" · ")
  }
  return saida
}

// Linha: no computador, tudo numa linha (o que é · valor · ações); no celular, ações embaixo
const COR: Record<NivelCaixa, string> = { perigo: "#d33a3c", alerta: "#c57800", info: "#8456e8", sucesso: "#009351" }
function Linha({ i, aberto, onAbrir, onResolvido, onAmanha }: { i: Item; aberto: boolean; onAbrir?: () => void; onResolvido: () => void; onAmanha: () => void }) {
  const cor = COR[i.nivel ?? "info"]
  const valor = (i.valorTexto || i.valor) ? <span className="text-[13.5px] font-bold ds-num shrink-0" style={{ color: cor }}>{i.valorTexto ?? brl(i.valor!)}</span> : null
  return (
    <div className="group flex items-start md:items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[rgba(116,116,128,0.05)] transition-colors">
      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 md:mt-0" style={{ background: `${cor}14`, color: cor }}>{i.icone}</span>
      <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
        <button onClick={onAbrir} disabled={!onAbrir} className="flex-1 min-w-0 text-left disabled:cursor-default">
          <span className="flex items-baseline gap-2">
            <span className="flex-1 min-w-0 text-[13.5px] font-semibold text-[#191625] truncate">{i.titulo}</span>
            <span className="md:hidden">{valor}</span>
          </span>
          {i.sub && <span className="block text-[12px] text-[#5e5c68] leading-snug mt-0.5 line-clamp-2 md:line-clamp-1">{i.sub}</span>}
        </button>
        {!(i.expande || i.acao) && (
          <span className="flex md:hidden items-center justify-end -mt-1 -mb-1.5 -mr-1">
            <BotaoIcone titulo="Resolvido: tirar da caixa" onClick={onResolvido}><Check className="w-4 h-4" /></BotaoIcone>
            <BotaoIcone titulo="Lembrar amanhã às 8 h" onClick={onAmanha}><AlarmClock className="w-4 h-4" /></BotaoIcone>
          </span>
        )}
        <span className="hidden md:block w-[104px] text-right">{valor}</span>
        <div className={`items-center gap-0.5 -ml-2 md:ml-0 shrink-0 md:w-[188px] md:justify-end md:flex ${i.expande || i.acao ? "flex -mb-1" : "hidden"}`}>
          {i.expande && <BotaoTexto titulo="Ver e decidir" onClick={onAbrir ?? (() => {})}>{aberto ? "Fechar" : "Decidir"}<ChevronDown className={`inline w-3.5 h-3.5 ml-0.5 transition-transform ${aberto ? "rotate-180" : ""}`} /></BotaoTexto>}
          {i.acao}
          <span className="flex-1 md:hidden" />
          <span className="flex items-center md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
            <BotaoIcone titulo="Resolvido: tirar da caixa" onClick={onResolvido}><Check className="w-4 h-4" /></BotaoIcone>
            <BotaoIcone titulo="Lembrar amanhã às 8 h" onClick={onAmanha}><AlarmClock className="w-4 h-4" /></BotaoIcone>
          </span>
        </div>
      </div>
    </div>
  )
}

function BotaoIcone({ titulo, onClick, children }: { titulo: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={titulo} aria-label={titulo} onClick={e => { e.stopPropagation(); onClick() }}
    className="ds-toque w-8 h-8 rounded-lg flex items-center justify-center text-[#898892] hover:text-[#191625] hover:bg-[rgba(116,116,128,0.1)] transition-colors shrink-0">{children}</button>
}
function BotaoTexto({ titulo, onClick, children }: { titulo: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={titulo} onClick={e => { e.stopPropagation(); onClick() }}
    className="ds-toque h-8 px-2.5 rounded-lg text-[11.5px] font-semibold text-[#8456e8] hover:bg-[#8456e8]/[0.08] transition-colors shrink-0 whitespace-nowrap">{children}</button>
}
