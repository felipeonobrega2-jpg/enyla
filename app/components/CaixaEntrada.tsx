"use client"

// Painel → Caixa de entrada: tudo o que pede você numa lista só, por prioridade (dinheiro e bom negócio primeiro).
// Junta o "Para resolver agora", o "Hoje" (orçar, responder, retomar), o "Precisa de você", as propostas prontas e as
// negociações do digital. Cada item: abrir, a ação dele, "resolvido" e "lembrar amanhã". Proposta e negociação
// abrem a decisão ali mesmo.

import React, { useEffect, useMemo, useState } from "react"
import { Sparkles, GraduationCap, Undo2, Loader2 } from "lucide-react"
import { Inbox, Check, AlarmClock, ShieldAlert, Wallet, Truck, FileText, MessageCircle, RotateCcw, CalendarClock, Handshake, FileCheck2, Flame, Gem, ChevronDown, CheckCircle2, ArrowRight } from "lucide-react"
import { Cartao, Vazio, Esqueleto, Selo } from "./ds"
import { ordenar, adiarAte, GRUPOS, type GrupoCaixa, type NivelCaixa, type PerfilCaixa } from "../lib/caixaEntrada"
import type { RegraCaixa, Ensinamento } from "../lib/aprendiz"
import type { Hoje, ItemHoje } from "../lib/hoje"
import type { DadosPedido } from "../lib/atendente"
import type { PropostaPronta } from "../lib/propostaPronta"
import { Proposta } from "./PropostasProntasCard"
import { ItemNegociacao, type PedidoNegociacao } from "./NegociacoesDigitalCard"

export type ItemExterno = {
  chave: string; tipo: string; nivel?: NivelCaixa; numero?: string | null; cardId?: string; jid?: string | null; perfil?: PerfilCaixa
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
  const [regras, setRegras] = useState<RegraCaixa[]>([])
  // Painel aberto embaixo de um item: o resumo da IA ou o Aprendiz
  const [painel, setPainel] = useState<{ chave: string; tipo: "resumo" | "ensinar" } | null>(null)
  const alternarPainel = (chave: string, tipo: "resumo" | "ensinar") => setPainel(p => p?.chave === chave && p.tipo === tipo ? null : { chave, tipo })

  const carregar = () => {
    fetch("/api/hoje").then(r => r.ok ? r.json() : null).then(x => { if (x) setHoje(x) }).catch(() => {})
    fetch("/api/proposta-pronta").then(r => r.json()).then(d => setPropostas((d.propostas ?? []).filter((p: PropostaPronta) => p.status === "aguardando" && p.manual))).catch(() => {})
    fetch("/api/digital").then(r => r.json()).then(d => setNegociacoes((d.pedidos ?? []).filter((p: PedidoNegociacao) => p.status === "aguardando_sinal" && p.negociacao?.status === "aguardando"))).catch(() => {})
    fetch("/api/caixa").then(r => r.json()).then(d => { setOcultos(d.ocultos ?? {}); setRegras(d.regras ?? []) }).catch(() => {})
  }
  useEffect(() => {
    carregar()
    const t = setInterval(() => { if (!document.hidden) carregar() }, 180_000)
    return () => clearInterval(t)
  }, [])

  const recarregarRegras = () => fetch("/api/caixa").then(r => r.json()).then(d => { setOcultos(d.ocultos ?? {}); setRegras(d.regras ?? []) }).catch(() => {})
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
        jid: x.jid ?? null, perfil: x.jid ? hoje.perfis?.[x.jid] : undefined,
        titulo: nome, sub: [numero, x.detalhe].filter(Boolean).join(" · "), valor: x.valor,
        icone: x.tipo === "sistema" ? <ShieldAlert className="w-4 h-4" /> : x.tipo === "pagamento" ? <Wallet className="w-4 h-4" /> : x.tipo === "atrasado" ? <Truck className="w-4 h-4" /> : x.tipo === "grande" ? <Gem className="w-4 h-4" /> : x.tipo === "esperando" ? <MessageCircle className="w-4 h-4" /> : <Flame className="w-4 h-4" />,
        onClick: x.jid ? () => onAbrirConversa(x.jid!, nome) : x.tipo === "sistema" ? () => onNavegar("config") : undefined,
        acao: x.tipo === "esperando" && x.jid ? <BotaoTexto onClick={() => fecharConversa(x.jid!, chave)} titulo="Não precisa de resposta: fecha a conversa (reabre se o cliente escrever)">Fechar</BotaoTexto> : undefined,
      })
    }
    // Hoje: orçar, MQL travado, responder, retomar
    const daConversa = (x: ItemHoje, tipo: string, nivel: NivelCaixa, sub: string): Item => ({
      chave: `${tipo}:${x.jid}:${x.desde}`, tipo, nivel, titulo: x.nome || x.jid.split("@")[0], sub, jid: x.jid, perfil: hoje.perfis?.[x.jid],
      icone: tipo === "orcar" ? <FileText className="w-4 h-4" /> : tipo === "retomar" ? <CalendarClock className="w-4 h-4" /> : x.retomada ? <RotateCcw className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />,
      onClick: () => onAbrirConversa(x.jid, x.nome || undefined, x.dados ?? undefined),
      acao: onOrcar && (tipo === "orcar" || tipo === "travado") ? <BotaoTexto onClick={() => onOrcar(x.cliente || x.nome || x.jid.split("@")[0], x.jid, x.dados ?? undefined)} titulo="Novo orçamento com o que o cliente já contou">Orçar</BotaoTexto> : undefined,
    })
    for (const x of hoje.orcar ?? []) lista.push(daConversa(x, "orcar", "alerta", `Esperando o seu orçamento ${haQuanto(x.desde)}${doPedido(x.dados) ? ` · ${doPedido(x.dados)}` : ""}`))
    // MQL ainda faltando dado é da IA (checklist antes de passar para você)
    for (const x of (hoje.meta?.travados ?? []).filter(x => !x.falta?.length)) lista.push(daConversa(x, "travado", "info", `MQL sem orçamento ${haQuanto(x.desde)}${x.falta?.length ? ` · falta ${x.falta.join(", ")}` : ""}`))
    for (const x of hoje.responder) lista.push(daConversa(x, "responder", x.retomada ? "sucesso" : "info", `${["ICP", "Oportunidade", "Lead médio"].includes(x.rotulo) ? "esperando" : x.rotulo} · ${haQuanto(x.desde)}${x.mensagem ? ` · “${x.mensagem}”` : ""}`))
    for (const x of hoje.retomar ?? []) lista.push(daConversa(x, "retomar", "info", x.nota ? `Lembrete: ${x.nota}` : `Sem resposta ${haQuanto(x.desde)}${doPedido(x.dados) ? ` · ${doPedido(x.dados)}` : ""}`))
    // Propostas prontas e negociações do digital: a decisão abre aqui mesmo
    for (const p of propostas) lista.push({
      chave: `prop:${p.id}`, tipo: "propostaPronta", nivel: "alerta", valor: p.preco, jid: p.jid, perfil: hoje.perfis?.[p.jid], titulo: `Proposta pronta · ${p.nome ?? "cliente"}`,
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
    lista.push(...extras.map(e => {
      const c = e.cardId ? hoje.cards?.[e.cardId] : undefined
      return c ? { ...e, jid: e.jid ?? c.jid, perfil: e.perfil ?? c.perfil } : e
    }))
    return ordenar(lista, ocultos, Date.now(), regras)
  }, [hoje, propostas, negociacoes, extras, ocultos, regras])   // eslint-disable-line react-hooks/exhaustive-deps

  if (!hoje) return <Esqueleto linhas={5} />
  // Alertas do sistema (saldo, crédito, WhatsApp) viram uma faixa no topo; o resto é a lista de trabalho
  const alertas = itens.filter(i => i.grupo === "sistema")
  const trabalho = itens.filter(i => i.grupo !== "sistema")
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
      <Linha i={i} aberto={aberto === i.chave} painel={painel?.chave === i.chave ? painel.tipo : null}
        onAbrir={i.expande ? () => setAberto(a => a === i.chave ? null : i.chave) : i.onClick}
        onResolvido={() => resolver(i)} onAmanha={() => amanha(i)}
        onResumo={i.jid ? () => alternarPainel(i.chave, "resumo") : undefined} onEnsinar={() => alternarPainel(i.chave, "ensinar")} />
      {aberto === i.chave && i.expande && <div className="px-3 pb-3 md:pl-14">{i.expande(() => setAberto(null))}</div>}
      {painel?.chave === i.chave && <div className="px-3 pb-3 md:pl-14">
        {painel.tipo === "resumo" && i.jid
          ? <ResumoIA jid={i.jid} onAbrir={i.onClick} />
          : <Aprendiz item={i} onAprendeu={recarregarRegras} onFechar={() => setPainel(null)} />}
      </div>}
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
              <BotaoIcone titulo="Ensinar o sistema sobre isso" onClick={() => alternarPainel(a.chave, "ensinar")}><GraduationCap className="w-4 h-4" /></BotaoIcone>
              <BotaoIcone titulo="Lembrar amanhã às 8 h" onClick={() => marcar(a.chave, adiarAte("amanha"))}><AlarmClock className="w-4 h-4" /></BotaoIcone>
            </div>
          ))}
          {alertas.filter(a => painel?.chave === a.chave).map(a => <div key={a.chave} className="px-3 pb-3"><Aprendiz item={a} onAprendeu={recarregarRegras} onFechar={() => setPainel(null)} /></div>)}
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
                  {g.id === "digital" && <span className="text-[11px] text-[#898892] truncate">a IA está cuidando; entre só se quiser</span>}
                  {g.id !== "vendas" && valorDe(g.itens) > 0 && <span className="text-[11.5px] font-semibold ds-num text-[#5e5c68]">{brl(valorDe(g.itens))}</span>}
                </div>
                {/* Digital fica recolhido no "Tudo": é da IA, você abre se quiser */}
                {g.itens.slice(0, g.id === "digital" ? 0 : POR_GRUPO).map(linha)}
                {g.itens.length > (g.id === "digital" ? 0 : POR_GRUPO) && (
                  <button onClick={() => setGrupo(g.id)} className="w-full text-left px-3 md:pl-14 py-2 text-[12px] font-medium text-[#8456e8] hover:bg-[#8456e8]/[0.04] rounded-lg transition-colors">
                    {g.id === "digital" ? `Ver os ${g.itens.length} do digital` : `Ver mais ${g.itens.length - POR_GRUPO} em ${g.nome.toLowerCase()}`}
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

// Linha: no computador, tudo numa linha (o que é · valor · ações); no celular, ações embaixo
const COR: Record<NivelCaixa, string> = { perigo: "#d33a3c", alerta: "#c57800", info: "#8456e8", sucesso: "#009351" }
function Linha({ i, aberto, painel, onAbrir, onResolvido, onAmanha, onResumo, onEnsinar }: {
  i: Item; aberto: boolean; painel: "resumo" | "ensinar" | null; onAbrir?: () => void; onResolvido: () => void; onAmanha: () => void; onResumo?: () => void; onEnsinar: () => void
}) {
  const icones = <>
    {onResumo && <BotaoIcone titulo="Resumo da IA: do que se trata e o próximo passo" ativo={painel === "resumo"} onClick={onResumo}><Sparkles className="w-4 h-4" /></BotaoIcone>}
    <BotaoIcone titulo="Ensinar o sistema sobre isso (ele aprende e se ajusta)" ativo={painel === "ensinar"} onClick={onEnsinar}><GraduationCap className="w-4 h-4" /></BotaoIcone>
  </>
  const cor = COR[i.nivel ?? "info"]
  const valor = (i.valorTexto || i.valor) ? <span className="text-[13.5px] font-bold ds-num shrink-0" style={{ color: cor }}>{i.valorTexto ?? brl(i.valor!)}</span> : null
  return (
    <div className="group flex items-start md:items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[rgba(116,116,128,0.05)] transition-colors">
      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 md:mt-0" style={{ background: `${cor}14`, color: cor }}>{i.icone}</span>
      <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
        <button onClick={onAbrir} disabled={!onAbrir} className="flex-1 min-w-0 text-left disabled:cursor-default">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 text-[13.5px] font-semibold text-[#191625] truncate">{i.titulo}</span>
            {(i.perfil === "icp" || i.perfil === "oportunidade") && <Selo tom={i.perfil === "icp" ? "acento" : "neutro"} className="shrink-0 self-center">{i.perfil === "icp" ? "ICP" : <><span className="md:hidden">Oport.</span><span className="hidden md:inline">Oportunidade</span></>}</Selo>}
            <span className="flex-1" />
            <span className="md:hidden">{valor}</span>
          </span>
          {i.sub && <span className="block text-[12px] text-[#5e5c68] leading-snug mt-0.5 line-clamp-2 md:line-clamp-1">{i.sub}</span>}
        </button>
        {!(i.expande || i.acao) && (
          <span className="flex md:hidden items-center justify-end -mt-1 -mb-1.5 -mr-1">
            {icones}
            <BotaoIcone titulo="Resolvido: tirar da caixa" onClick={onResolvido}><Check className="w-4 h-4" /></BotaoIcone>
            <BotaoIcone titulo="Lembrar amanhã às 8 h" onClick={onAmanha}><AlarmClock className="w-4 h-4" /></BotaoIcone>
          </span>
        )}
        <span className="hidden md:block w-[104px] text-right">{valor}</span>
        <div className={`items-center gap-0.5 -ml-2 md:ml-0 shrink-0 md:w-[252px] md:justify-end md:flex ${i.expande || i.acao ? "flex -mb-1" : "hidden"}`}>
          {i.expande && <BotaoTexto titulo="Ver e decidir" onClick={onAbrir ?? (() => {})}>{aberto ? "Fechar" : "Decidir"}<ChevronDown className={`inline w-3.5 h-3.5 ml-0.5 transition-transform ${aberto ? "rotate-180" : ""}`} /></BotaoTexto>}
          {i.acao}
          <span className="flex-1 md:hidden" />
          <span className={`flex items-center md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity ${painel ? "" : "md:opacity-0"}`}>
            {icones}
            <BotaoIcone titulo="Resolvido: tirar da caixa" onClick={onResolvido}><Check className="w-4 h-4" /></BotaoIcone>
            <BotaoIcone titulo="Lembrar amanhã às 8 h" onClick={onAmanha}><AlarmClock className="w-4 h-4" /></BotaoIcone>
          </span>
        </div>
      </div>
    </div>
  )
}

function BotaoIcone({ titulo, onClick, children, ativo }: { titulo: string; onClick: () => void; children: React.ReactNode; ativo?: boolean }) {
  return <button title={titulo} aria-label={titulo} aria-pressed={ativo} onClick={e => { e.stopPropagation(); onClick() }}
    style={ativo ? { color: "#8456e8", background: "rgba(132,86,232,0.10)" } : undefined}
    className="ds-toque w-8 h-8 rounded-lg flex items-center justify-center text-[#898892] hover:text-[#191625] hover:bg-[rgba(116,116,128,0.1)] transition-colors shrink-0">{children}</button>
}
function BotaoTexto({ titulo, onClick, children }: { titulo: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={titulo} onClick={e => { e.stopPropagation(); onClick() }}
    className="ds-toque h-8 px-2.5 rounded-lg text-[11.5px] font-semibold text-[#8456e8] hover:bg-[#8456e8]/[0.08] transition-colors shrink-0 whitespace-nowrap">{children}</button>
}

// Resumo da IA de uma conversa: do que se trata, em que pé está e o próximo passo
function ResumoIA({ jid, onAbrir }: { jid: string; onAbrir?: () => void }) {
  const [r, setR] = useState<{ assunto: string; situacao: string; proximo_passo: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    fetch(`/api/caixa/resumo?jid=${encodeURIComponent(jid)}`).then(async x => { const d = await x.json().catch(() => ({})); if (x.ok) setR(d); else setErro(d.erro ?? "Não deu para resumir agora.") })
      .catch(() => setErro("Sem conexão."))
  }, [jid])
  if (erro) return <p className="text-[12px] text-[#d33a3c]">{erro}</p>
  if (!r) return <p className="flex items-center gap-2 text-[12px] text-[#898892]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lendo a conversa…</p>
  return (
    <div className="rounded-xl p-3 space-y-1.5 text-[12.5px] leading-snug" style={{ background: "rgba(132,86,232,0.06)" }}>
      <p><span className="font-semibold text-[#191625]">Assunto: </span><span className="text-[#3c3a45]">{r.assunto}</span></p>
      <p><span className="font-semibold text-[#191625]">Situação: </span><span className="text-[#3c3a45]">{r.situacao}</span></p>
      <p><span className="font-semibold text-[#8456e8]">Próximo passo: </span><span className="text-[#3c3a45]">{r.proximo_passo}</span></p>
      {onAbrir && <button onClick={onAbrir} className="text-[12px] font-semibold text-[#8456e8] hover:underline pt-0.5">Abrir conversa</button>}
    </div>
  )
}

// Aprendiz: você ensina uma vez, a IA organiza (regra da caixa, atendente, outra IA, ideia) e mostra o que fez
function Aprendiz({ item, onAprendeu, onFechar }: { item: Item & { grupo?: GrupoCaixa }; onAprendeu: () => void; onFechar: () => void }) {
  const [texto, setTexto] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [feito, setFeito] = useState<Ensinamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const ensinar = async () => {
    if (texto.trim().length < 3 || enviando) return
    setEnviando(true); setErro(null)
    const r = await fetch("/api/aprendiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      texto, item: { tipo: item.tipo, titulo: item.titulo, sub: item.sub, grupo: item.grupo, perfil: item.perfil, jid: item.jid ?? null, numero: item.numero ?? null },
    }) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setEnviando(false)
    if (!r?.ok) { setErro(d.erro ?? "Não deu para aprender agora."); return }
    setFeito(d.ensinamento)   // a regra só entra na caixa no "Pronto": o item pode sumir com ela, e você precisa ver o que ele entendeu
  }
  const desfazer = async () => {
    if (!feito) return
    await fetch(`/api/aprendiz?id=${encodeURIComponent(feito.id)}`, { method: "DELETE" }).catch(() => null)
    setFeito(null)
  }
  const ONDE: Record<string, string> = { regra_caixa: "Caixa de entrada", agente: "Atendente do WhatsApp", ideia: "Banco de ideias", assistente: "Seu assistente", mensagens: "Mensagens sugeridas", marketing: "Marketing" }
  if (feito) return (
    <div className="rounded-xl p-3 text-[12.5px] leading-snug" style={{ background: "rgba(0,147,81,0.06)" }}>
      <p className="text-[#191625]"><span className="font-semibold">Entendi: </span>{feito.entendi}</p>
      <ul className="mt-1.5 space-y-1">
        {feito.feitos.map((f, n) => <li key={n} className="text-[#3c3a45]"><span className="font-semibold text-[#009351]">{ONDE[f.destino] ?? f.destino}: </span>{f.resumo}</li>)}
        {!feito.feitos.length && <li className="text-[#898892]">Nada para mudar com isso.</li>}
      </ul>
      <div className="flex items-center gap-3 mt-2">
        <button onClick={desfazer} className="flex items-center gap-1 text-[12px] font-semibold text-[#5e5c68] hover:text-[#191625]"><Undo2 className="w-3.5 h-3.5" /> Desfazer</button>
        <button onClick={() => { onAprendeu(); onFechar() }} className="text-[12px] font-semibold text-[#8456e8]">Pronto</button>
      </div>
    </div>
  )
  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(116,116,128,0.06)" }}>
      <p className="text-[12px] text-[#5e5c68] mb-1.5">Ensine uma vez, do seu jeito. O sistema organiza e se ajusta (o que aparece aqui, como o atendente age, ou vira ideia).</p>
      <textarea autoFocus value={texto} onChange={e => setTexto(e.target.value)} rows={2} maxLength={2000}
        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ensinar(); if (e.key === "Escape") onFechar() }}
        placeholder="Ex.: orçamento que vence sem resposta de lead médio não precisa aparecer aqui"
        className="w-full rounded-lg bg-white px-2.5 py-2 text-[13px] text-[#191625] ds-borda resize-none focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20" />
      {erro && <p className="text-[12px] text-[#d33a3c] mt-1">{erro}</p>}
      <div className="flex items-center justify-end gap-2 mt-1.5">
        <button onClick={onFechar} className="h-8 px-3 rounded-lg text-[12px] font-semibold text-[#5e5c68] hover:bg-black/5">Cancelar</button>
        <button onClick={ensinar} disabled={enviando || texto.trim().length < 3}
          className="h-8 px-3 rounded-lg text-[12px] font-semibold text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: "#8456e8" }}>
          {enviando ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Organizando…</> : <><GraduationCap className="w-3.5 h-3.5" /> Ensinar</>}
        </button>
      </div>
    </div>
  )
}
