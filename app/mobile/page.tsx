"use client"

// Enyla no celular: os mesmos números do computador (lib/negocio), pensados para o polegar.

import React, { useEffect, useMemo, useRef, useState } from "react"
import { enviarFotoProducao } from "../lib/imagem"
import Image from "next/image"
import {
  Home, Wallet, Factory, FileText, ChevronRight, MessageCircle, Copy, Check, X, Target, AlertTriangle,
  CircleCheck, CalendarX2, CalendarClock, Clock, Hourglass, Receipt, Link2, Truck, QrCode, Share2, Camera, Eye, MessageCircleHeart, Star,
} from "lucide-react"
import { KanbanCard, LancamentoFinanceiro, PropostaCustom, Cliente, FormData, COLUNAS_KANBAN, COL_HOT } from "../types"
import { Configuracoes, CONFIG_PADRAO } from "../config"
import {
  Periodo, Pedido, montarPedidos, vendasDoPeriodo, caixaDoPeriodo, recebiveis, producao, pipelineComercial,
  margemContribuicao, conversao, orcamentosDoPeriodo, parseData, nomeChave, isTerceirizado, isAberto,
} from "../lib/negocio"
import { pendencias, Pendencia, TipoPendencia, cardDoPedido, prazoTexto, linkWhatsApp } from "../lib/pendencias"
import { normalizarProducao, nomeServicos } from "../lib/producao"
import { normalizarMetas } from "../lib/metas"
import { ehDiaUtil, diasUteisEntre, definirFeriadosLocais } from "../lib/diasUteis"
import { brl, num } from "../utils"

type Aba = "inicio" | "cobrancas" | "producao" | "orcamentos"
type PeriodoId = "mes" | "mesPassado" | "90d" | "ano"
type HistItem = { form: FormData; numero?: string }

const PERIODOS: { v: PeriodoId; nome: string }[] = [
  { v: "mes", nome: "Este mês" }, { v: "mesPassado", nome: "Mês passado" }, { v: "90d", nome: "90 dias" }, { v: "ano", nome: "Ano" },
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

const curto = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `R$ ${num(n / 1_000_000, 1)} mi`
  : Math.abs(n) >= 10_000 ? `R$ ${num(n / 1000, n >= 100_000 ? 0 : 1)} mil`
  : brl(n)
const dataCurta = (iso?: string) => {
  const d = parseData(iso)
  return d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : "—"
}

const COR = { perigo: "#d33a3c", alerta: "#c57800", info: "#2f7cf6", sucesso: "#009351", acento: "#8456e8" } as const

const ICONE: Record<TipoPendencia, React.ReactNode> = {
  aprovado: <CircleCheck className="w-4 h-4" />, atrasado: <CalendarX2 className="w-4 h-4" />, fornecedor: <Factory className="w-4 h-4" />,
  cobrancaVencida: <Receipt className="w-4 h-4" />, semCobranca: <Receipt className="w-4 h-4" />, conferir: <Receipt className="w-4 h-4" />,
  entregaProxima: <CalendarClock className="w-4 h-4" />, orcamentoVencendo: <Hourglass className="w-4 h-4" />, semPrazo: <Clock className="w-4 h-4" />,
  abriuProposta: <Eye className="w-4 h-4" />, comoFicou: <MessageCircleHeart className="w-4 h-4" />, avaliado: <Star className="w-4 h-4" />,
}

// ── Peças ─────────────────────────────────────────────────────────────────────

function Cartao({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${className}`}>{children}</div>
}

function Titulo({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-1 mb-2 mt-1">
      <p className="text-[13px] font-semibold text-[#191625]">{children}</p>
      {extra && <span className="text-[11.5px] text-[#8E8E93]">{extra}</span>}
    </div>
  )
}

function Kpi({ rotulo, valor, sub, cor = "#191625", onClick, compacto }: { rotulo: string; valor: string; sub?: string; cor?: string; onClick?: () => void; compacto?: boolean }) {
  const Comp = onClick ? "button" : "div"
  return (
    <Comp onClick={onClick} className="bg-white rounded-2xl p-3.5 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] active:scale-[0.98] transition-transform">
      <p className="text-[11px] text-[#8E8E93] font-medium">{rotulo}</p>
      <p className={`${compacto ? "text-[15px]" : "text-[19px]"} font-semibold ds-num leading-tight mt-1 whitespace-nowrap`} style={{ color: cor }}>{valor}</p>
      {sub && <p className="text-[10.5px] text-[#8E8E93] mt-1 leading-snug">{sub}</p>}
    </Comp>
  )
}

function Linha({ titulo, sub, valor, valorSub, tom, icone, onClick, acao }: {
  titulo: string; sub?: string; valor?: string; valorSub?: string; tom?: keyof typeof COR
  icone?: React.ReactNode; onClick?: () => void; acao?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 active:bg-[rgba(116,116,128,0.06)] transition-colors">
      {icone && (
        <span className="w-8 h-8 rounded-xl grid place-items-center shrink-0" style={{ color: tom ? COR[tom] : "#5e5c68", background: tom ? `${COR[tom]}14` : "rgba(116,116,128,0.08)" }}>{icone}</span>
      )}
      <button onClick={onClick} disabled={!onClick} className="flex-1 min-w-0 text-left flex items-center gap-3">
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-medium text-[#191625] truncate">{titulo}</span>
          {sub && <span className="block text-[11.5px] text-[#8E8E93] truncate mt-0.5">{sub}</span>}
        </span>
        {valor && (
          <span className="text-right shrink-0">
            <span className="block text-[13.5px] font-semibold ds-num" style={{ color: tom && tom !== "info" ? COR[tom] : "#191625" }}>{valor}</span>
            {valorSub && <span className="block text-[10.5px] text-[#8E8E93]">{valorSub}</span>}
          </span>
        )}
        {onClick && !acao && <ChevronRight className="w-4 h-4 text-[#C7C7CC] shrink-0" />}
      </button>
      {acao}
    </div>
  )
}

function BotaoWhats({ href }: { href?: string }) {
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label="Mandar WhatsApp"
      className="w-9 h-9 rounded-xl grid place-items-center text-[#25a35a] bg-[#25a35a]/10 active:scale-95 transition-transform shrink-0">
      <MessageCircle className="w-4 h-4" />
    </a>
  )
}

function Barra({ pct, cor = COR.acento }: { pct: number; cor?: string }) {
  return (
    <div className="h-1.5 rounded-full bg-[rgba(116,116,128,0.12)] overflow-hidden">
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: cor }} />
    </div>
  )
}

function Vazio({ texto }: { texto: string }) {
  return <p className="px-4 py-6 text-center text-[12.5px] text-[#8E8E93]">{texto}</p>
}

// Folha que sobe de baixo com o detalhe e as ações
function Folha({ aberta, onFechar, children }: { aberta: boolean; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className={`fixed inset-0 z-40 transition-[visibility] duration-300 ${aberta ? "visible" : "invisible pointer-events-none"}`} aria-hidden={!aberta}>
      <div onClick={onFechar} className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${aberta ? "opacity-100" : "opacity-0"}`} />
      <div className={`absolute left-0 right-0 bottom-0 bg-[#F2F2F7] rounded-t-3xl max-h-[88vh] overflow-y-auto transition-transform duration-300 ease-[cubic-bezier(.3,.9,.3,1)] ${aberta ? "translate-y-0" : "translate-y-full"}`}
        style={{ paddingBottom: "max(env(safe-area-inset-bottom),16px)" }}>
        <div className="sticky top-0 bg-[#F2F2F7] pt-2.5 pb-1 flex justify-center"><span className="w-10 h-1.5 rounded-full bg-[rgba(60,60,67,0.2)]" /></div>
        {children}
      </div>
    </div>
  )
}

function useCopiar() {
  const [copiado, setCopiado] = useState<string | null>(null)
  const copiar = (id: string, texto: string) => {
    navigator.clipboard?.writeText(texto).then(() => { setCopiado(id); setTimeout(() => setCopiado(null), 1600) })
  }
  return { copiado, copiar }
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function MobilePage() {
  const [kanban, setKanban] = useState<KanbanCard[]>([])
  const [lancamentos, setLancamentos] = useState<LancamentoFinanceiro[]>([])
  const [historico, setHistorico] = useState<HistItem[]>([])
  const [propostas, setPropostas] = useState<PropostaCustom[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [config, setConfig] = useState<Configuracoes>(CONFIG_PADRAO)
  definirFeriadosLocais(config.feriados)
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<Aba>("inicio")
  const [periodoId, setPeriodoId] = useState<PeriodoId>("mes")
  const [aberto, setAberto] = useState<KanbanCard | null>(null)
  const [folhaAberta, setFolhaAberta] = useState(false)

  useEffect(() => {
    fetch("/api/data").then(r => r.json()).then(d => {
      if (d.kanban) setKanban(d.kanban)
      if (d.lancamentos) setLancamentos(d.lancamentos)
      if (d.historico) setHistorico(d.historico)
      if (d.propostasCustom) setPropostas(d.propostasCustom)
      if (d.clientes) setClientes(d.clientes)
      if (d.config) setConfig({ ...CONFIG_PADRAO, ...d.config })
    }).catch(() => {}).finally(() => setCarregando(false))
  }, [])

  const hoje = useMemo(() => new Date(), [])
  const pedidos = useMemo(() => montarPedidos(kanban, lancamentos), [kanban, lancamentos])
  const telefoneDe = (nome: string) => clientes.find(c => nomeChave(c.nome) === nomeChave(nome))?.telefone

  const abrir = (c?: KanbanCard) => { if (!c) return; setAberto(c); setFolhaAberta(true) }

  const pend = useMemo(() => pendencias({ pedidos, kanban, lancamentos, historico, propostasCustom: propostas, clientes, config, hoje }),
    [pedidos, kanban, lancamentos, historico, propostas, clientes, config, hoje])
  const rec = useMemo(() => recebiveis(pedidos, lancamentos), [pedidos, lancamentos])
  const urgentes = pend.filter(p => p.tom === "perigo").length

  const saudacao = (() => { const d = hoje.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }); return d.charAt(0).toUpperCase() + d.slice(1) })()

  return (
    <div className="min-h-screen bg-[#F2F2F7] pb-28">
      <header className="bg-white/90 backdrop-blur-xl border-b border-[rgba(60,60,67,0.1)] px-4 sticky top-0 z-20" style={{ paddingTop: "max(env(safe-area-inset-top),12px)" }}>
        <div className="flex items-center justify-between h-11">
          <Image src="/brand/enyla-wordmark-dark.png" alt="Enyla" width={1335} height={328} className="h-5 w-auto" priority />
          {urgentes > 0 && (
            <button onClick={() => setAba("inicio")} className="text-[11px] font-semibold text-white bg-[#d33a3c] rounded-full px-2.5 py-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {urgentes} {urgentes === 1 ? "urgente" : "urgentes"}
            </button>
          )}
        </div>
        {aba === "inicio" && (
          <div className="flex gap-1.5 overflow-x-auto pb-2.5 -mx-1 px-1 [&::-webkit-scrollbar]:hidden">
            {PERIODOS.map(p => (
              <button key={p.v} onClick={() => setPeriodoId(p.v)}
                className={`shrink-0 text-[12px] font-medium px-3.5 h-8 rounded-full transition-colors ${periodoId === p.v ? "bg-[#191625] text-white" : "bg-[rgba(116,116,128,0.1)] text-[#5e5c68]"}`}>{p.nome}</button>
            ))}
          </div>
        )}
      </header>

      <main key={aba} className="px-4 pt-4 space-y-4 animate-[apple-slide-up_.25s_ease-out]">
        {carregando ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-7 h-7 rounded-full border-2 border-[#8456e8] border-t-transparent animate-spin" />
            <p className="text-[12px] text-[#8E8E93]">Carregando…</p>
          </div>
        ) : aba === "inicio" ? (
          <Inicio saudacao={saudacao} hoje={hoje} periodo={periodoDe(periodoId, hoje)} nomePeriodo={PERIODOS.find(p => p.v === periodoId)!.nome.toLowerCase()}
            pedidos={pedidos} lancamentos={lancamentos} config={config} pend={pend} rec={rec}
            onAbrir={abrir} onAba={setAba} />
        ) : aba === "cobrancas" ? (
          <Cobrancas rec={rec} telefoneDe={telefoneDe} onAbrir={abrir} />
        ) : aba === "producao" ? (
          <Producao pedidos={pedidos} config={config} hoje={hoje} onAbrir={abrir} />
        ) : (
          <Orcamentos kanban={kanban} hoje={hoje} historico={historico} propostas={propostas} telefoneDe={telefoneDe} onAbrir={abrir} />
        )}
      </main>

      <Folha aberta={folhaAberta} onFechar={() => setFolhaAberta(false)}>
        {aberto && <Detalhe card={aberto} pedido={pedidos.find(p => p.cards.some(c => c.id === aberto.id))} telefone={telefoneDe(aberto.nomeCliente)} onFechar={() => setFolhaAberta(false)} />}
      </Folha>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-[rgba(60,60,67,0.1)] flex z-30"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom),6px)" }}>
        {([
          { id: "inicio", nome: "Início", icone: Home, badge: urgentes > 0 },
          { id: "cobrancas", nome: "Cobranças", icone: Wallet, badge: rec.vencido > 0.5 },
          { id: "producao", nome: "Produção", icone: Factory, badge: false },
          { id: "orcamentos", nome: "Orçamentos", icone: FileText, badge: false },
        ] as const).map(t => {
          const ativo = aba === t.id
          const Icone = t.icone
          return (
            <button key={t.id} onClick={() => { setAba(t.id); window.scrollTo({ top: 0 }) }}
              className={`flex-1 flex flex-col items-center pt-2 pb-1 gap-0.5 transition-colors ${ativo ? "text-[#8456e8]" : "text-[#8E8E93]"}`}>
              <span className="relative">
                <Icone className="w-[22px] h-[22px]" strokeWidth={ativo ? 2.2 : 1.8} />
                {t.badge && <span className="absolute -top-0.5 -right-1 w-2 h-2 bg-[#d33a3c] rounded-full ring-2 ring-white" />}
              </span>
              <span className="text-[10px] font-medium">{t.nome}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

// ── Início ────────────────────────────────────────────────────────────────────

function Inicio({ saudacao, hoje, periodo, nomePeriodo, pedidos, lancamentos, config, pend, rec, onAbrir, onAba }: {
  saudacao: string; hoje: Date; periodo: Periodo; nomePeriodo: string
  pedidos: Pedido[]; lancamentos: LancamentoFinanceiro[]; config: Configuracoes
  pend: Pendencia[]; rec: ReturnType<typeof recebiveis>
  onAbrir: (c?: KanbanCard) => void; onAba: (a: Aba) => void
}) {
  const [verTodas, setVerTodas] = useState(false)
  const vendas = vendasDoPeriodo(pedidos, lancamentos, periodo)
  const caixa = caixaDoPeriodo(lancamentos, periodo, hoje)
  const margem = margemContribuicao(vendas.pedidos)

  // Meta do mês: mesma conta do Painel
  const meta = config.metaMensal || 0
  const vendidoMes = vendasDoPeriodo(pedidos, lancamentos, periodoDe("mes", hoje)).receita
  const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
  let diasUteis = 0
  for (let d = hoje.getDate() + 1; d <= diasMes; d++) if (ehDiaUtil(new Date(hoje.getFullYear(), hoje.getMonth(), d, 12))) diasUteis++
  const projecao = vendidoMes / hoje.getDate() * diasMes
  const falta = Math.max(0, meta - vendidoMes)

  // Marco: faturamento acumulado (pedidos + sobras + anterior ao sistema)
  const acumulado = (config.baselineFaturamento || 0) + pedidos.reduce((s, p) => s + p.valor, 0)
    + vendasDoPeriodo(pedidos, lancamentos, { from: null, to: null }).sobras
  const marcos = normalizarMetas(config.metas).marcos
  const proximo = marcos.find(m => m.valor > acumulado)

  const lista = verTodas ? pend : pend.slice(0, 6)

  return <>
    <div className="px-1">
      <p className="text-[12px] text-[#8E8E93]">{saudacao}</p>
    </div>

    {meta > 0 && (
      <Cartao className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-[#8E8E93] font-medium flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> Meta do mês</p>
            <p className="text-[24px] font-semibold text-[#191625] ds-num leading-tight mt-1">{curto(vendidoMes)}</p>
            <p className="text-[11.5px] text-[#8E8E93] ds-num">de {curto(meta)}</p>
          </div>
          <span className={`text-[13px] font-semibold ds-num px-2.5 py-1 rounded-full ${vendidoMes >= meta ? "bg-[#009351]/10 text-[#009351]" : "bg-[#8456e8]/10 text-[#8456e8]"}`}>{num(Math.min(999, vendidoMes / meta * 100), 0)}%</span>
        </div>
        <div className="mt-3"><Barra pct={vendidoMes / meta * 100} cor={vendidoMes >= meta ? COR.sucesso : COR.acento} /></div>
        <p className="text-[11.5px] text-[#5e5c68] mt-2.5 leading-snug">
          {vendidoMes >= meta ? "Meta batida. " : diasUteis > 0 ? <>Faltam {brl(falta)}: <strong className="text-[#191625]">{brl(falta / diasUteis)}</strong> por dia útil. </> : <>Faltam {brl(falta)}. </>}
          No ritmo atual, o mês fecha em {curto(projecao)}.
        </p>
      </Cartao>
    )}

    <div className="grid grid-cols-2 gap-2.5">
      <Kpi rotulo={`Vendido · ${nomePeriodo}`} valor={curto(vendas.receita)} sub={`${vendas.pedidos.length} pedidos · ${num(vendas.unidades)} un`} />
      <Kpi rotulo={`Recebido · ${nomePeriodo}`} valor={curto(caixa.recebido)} cor={COR.sucesso} sub="entrou no caixa" />
      <Kpi rotulo="Clientes devem" valor={curto(rec.aReceber)} cor={rec.vencido > 0.5 ? COR.perigo : "#191625"}
        sub={rec.vencido > 0.5 ? `${curto(rec.vencido)} vencido` : rec.semCobranca > 0.5 ? `${curto(rec.semCobranca)} sem cobrança` : "tudo em dia"} onClick={() => onAba("cobrancas")} />
      <Kpi rotulo="Margem" valor={margem.pct == null ? "—" : `${num(margem.pct, 1)}%`}
        cor={margem.pct == null ? "#8E8E93" : margem.pct >= 45 ? COR.sucesso : margem.pct >= 30 ? COR.alerta : COR.perigo}
        sub={margem.pct == null ? "sem custos lançados" : `${margem.comCusto} de ${margem.total} com custo`} />
    </div>

    <div>
      <Titulo extra={pend.length ? `${pend.length} ${pend.length === 1 ? "item" : "itens"}` : undefined}>Precisa de você</Titulo>
      <Cartao className="overflow-hidden divide-y divide-[rgba(60,60,67,0.08)]">
        {pend.length === 0 && <Vazio texto="Nada pendente. Entregas no prazo e recebimentos em dia." />}
        {lista.map(p => (
          <Linha key={p.id} titulo={p.titulo} sub={p.sub} valor={p.valor != null ? curto(p.valor) : undefined} tom={p.tom} icone={ICONE[p.tipo]}
            onClick={p.card ? () => onAbrir(p.card) : p.tipo === "conferir" ? () => onAba("cobrancas") : undefined}
            acao={<BotaoWhats href={p.whatsapp} />} />
        ))}
        {pend.length > 6 && (
          <button onClick={() => setVerTodas(v => !v)} className="w-full py-3 text-[12.5px] font-medium text-[#8456e8]">
            {verTodas ? "Mostrar menos" : `Ver todos os ${pend.length}`}
          </button>
        )}
      </Cartao>
    </div>

    {proximo && (
      <Cartao className="p-4">
        <p className="text-[11px] text-[#8E8E93] font-medium">Próximo marco</p>
        <div className="flex items-baseline justify-between mt-1">
          <p className="text-[14px] font-semibold text-[#191625]">{proximo.nome}</p>
          <p className="text-[12px] text-[#8E8E93] ds-num">{curto(acumulado)} de {curto(proximo.valor)}</p>
        </div>
        <div className="mt-2.5"><Barra pct={acumulado / proximo.valor * 100} cor={COR.alerta} /></div>
      </Cartao>
    )}
  </>
}

// ── Cobranças ─────────────────────────────────────────────────────────────────

function Cobrancas({ rec, telefoneDe, onAbrir }: {
  rec: ReturnType<typeof recebiveis>; telefoneDe: (nome: string) => string | undefined; onAbrir: (c?: KanbanCard) => void
}) {
  const { copiado, copiar } = useCopiar()
  const lista = [...rec.comSaldo].sort((a, b) => b.vencido - a.vencido || b.aReceber - a.aReceber)
  return <>
    <div className="grid grid-cols-3 gap-2.5">
      <Kpi compacto rotulo="A receber" valor={curto(rec.aReceber)} />
      <Kpi compacto rotulo="Vencido" valor={curto(rec.vencido)} cor={rec.vencido > 0.5 ? COR.perigo : "#191625"} />
      <Kpi compacto rotulo="Sem cobrança" valor={curto(rec.semCobranca)} cor={rec.semCobranca > 0.5 ? COR.alerta : "#191625"} />
    </div>

    <div>
      <Titulo extra={`${lista.length} pedidos`}>Quem deve</Titulo>
      <Cartao className="overflow-hidden divide-y divide-[rgba(60,60,67,0.08)]">
        {lista.length === 0 && <Vazio texto="Ninguém devendo. Tudo recebido." />}
        {lista.map(p => {
          const valorPix = p.vencido > 0.5 ? p.vencido : p.aReceber
          const pix = `${window.location.origin}/pix/${encodeURIComponent(p.numero)}?v=${valorPix.toFixed(2)}&c=${encodeURIComponent(p.nomeCliente)}`
          const tom = p.vencido > 0.5 ? "perigo" : p.semCobranca > 0.5 ? "alerta" : undefined
          const msg = `Olá! Tudo bem? Segue o link para pagamento do pedido ${p.numero}, no valor de ${brl(valorPix)}: ${pix}`
          return (
            <Linha key={p.key} titulo={p.nomeCliente} tom={tom}
              sub={`${p.numero} · ${p.vencido > 0.5 ? `${brl(p.vencido)} vencido` : p.semCobranca > 0.5 ? "sem cobrança lançada" : "cobrança lançada"}`}
              valor={curto(p.aReceber)} onClick={() => onAbrir(cardDoPedido(p))}
              acao={<div className="flex gap-1.5 shrink-0">
                <button onClick={() => copiar(p.key, pix)} aria-label="Copiar link Pix"
                  className="w-9 h-9 rounded-xl grid place-items-center text-[#8456e8] bg-[#8456e8]/10 active:scale-95 transition-transform">
                  {copiado === p.key ? <Check className="w-4 h-4" /> : <QrCode className="w-4 h-4" />}
                </button>
                <BotaoWhats href={linkWhatsApp(telefoneDe(p.nomeCliente), msg)} />
              </div>} />
          )
        })}
      </Cartao>
      <p className="text-[11px] text-[#8E8E93] px-1 mt-2 leading-snug">O botão roxo copia o link Pix do valor vencido (ou do saldo). O verde manda o link pelo WhatsApp.</p>
    </div>

    {rec.aConferir.length > 0 && (
      <div>
        <Titulo extra={curto(rec.aConferir.reduce((s, l) => s + l.valor, 0))}>Para conferir</Titulo>
        <Cartao className="overflow-hidden divide-y divide-[rgba(60,60,67,0.08)]">
          {rec.aConferir.map(l => (
            <Linha key={l.id} titulo={l.nomeCliente || l.descricao} sub={`${l.descricao} · venc. ${dataCurta(l.dataVencimento)}`} valor={curto(l.valor)} tom="info" />
          ))}
        </Cartao>
        <p className="text-[11px] text-[#8E8E93] px-1 mt-2">Cobranças pendentes em pedidos já quitados ou fora do quadro: dê baixa no computador.</p>
      </div>
    )}
  </>
}

// ── Produção ──────────────────────────────────────────────────────────────────

function Producao({ pedidos, config, hoje, onAbrir }: { pedidos: Pedido[]; config: Configuracoes; hoje: Date; onAbrir: (c?: KanbanCard) => void }) {
  const prod = producao(pedidos, hoje)
  const prodCfg = normalizarProducao(config.producao)
  const hojeIso = hoje.toLocaleDateString("sv-SE")
  const noFornecedor = prodCfg.movimentos.filter(m => !m.recebidoEm).sort((a, b) => (a.prazoPrevisto ?? "9").localeCompare(b.prazoPrevisto ?? "9"))
  const maxEtapa = Math.max(1, ...prod.porEtapa.map(e => e.count))
  return <>
    <div className="grid grid-cols-3 gap-2.5">
      <Kpi compacto rotulo="Em produção" valor={String(prod.emProducao.length)} sub={curto(prod.valorEmProducao)} />
      <Kpi compacto rotulo="Atrasados" valor={String(prod.atrasados.length)} cor={prod.atrasados.length ? COR.perigo : "#191625"} />
      <Kpi compacto rotulo="Em 3 dias" valor={String(prod.vencendo3d.length)} cor={prod.vencendo3d.length ? COR.alerta : "#191625"} />
    </div>

    {prod.porEtapa.length > 0 && (
      <Cartao className="p-4 space-y-2.5">
        {prod.porEtapa.map(e => (
          <div key={e.coluna}>
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="text-[#191625] font-medium">{e.etapa}</span>
              <span className="text-[#8E8E93] ds-num">{e.count} · {curto(e.valor)}</span>
            </div>
            <div className="mt-1"><Barra pct={e.count / maxEtapa * 100} /></div>
          </div>
        ))}
      </Cartao>
    )}

    <div>
      <Titulo extra={`${prod.emProducao.length} pedidos`}>Pedidos</Titulo>
      <Cartao className="overflow-hidden divide-y divide-[rgba(60,60,67,0.08)]">
        {prod.emProducao.length === 0 && <Vazio texto="Nenhum pedido em produção." />}
        {[...prod.emProducao].sort((a, b) => (a.dataEntregaPrevista ?? "9").localeCompare(b.dataEntregaPrevista ?? "9")).map(p => {
          const atrasado = prod.atrasados.includes(p), logo = prod.vencendo3d.includes(p)
          return (
            <Linha key={p.key} titulo={`${p.numero} · ${p.nomeCliente}`} sub={`${p.etapa} · ${prazoTexto(p.dataEntregaPrevista, hoje)}`}
              valor={curto(p.valor)} tom={atrasado ? "perigo" : logo ? "alerta" : undefined} onClick={() => onAbrir(cardDoPedido(p))} />
          )
        })}
      </Cartao>
    </div>

    {noFornecedor.length > 0 && (
      <div>
        <Titulo extra={`${noFornecedor.length} ${noFornecedor.length === 1 ? "envio" : "envios"}`}>No fornecedor agora</Titulo>
        <Cartao className="overflow-hidden divide-y divide-[rgba(60,60,67,0.08)]">
          {noFornecedor.map(m => {
            const forn = prodCfg.fornecedores.find(f => f.id === m.fornecedorId)
            const dias = diasUteisEntre(m.enviadoEm, hojeIso)
            const atrasado = !!m.prazoPrevisto && hojeIso > m.prazoPrevisto
            return (
              <Linha key={m.id} titulo={m.pedidoLabel} icone={<Truck className="w-4 h-4" />} tom={atrasado ? "perigo" : undefined}
                sub={`${forn?.nome ?? "Fornecedor"} · ${nomeServicos(m)}`}
                valor={`${dias} ${dias === 1 ? "dia útil" : "dias úteis"}`} valorSub={m.prazoPrevisto ? `prazo ${dataCurta(m.prazoPrevisto)}` : undefined} />
            )
          })}
        </Cartao>
      </div>
    )}
  </>
}

// ── Orçamentos ────────────────────────────────────────────────────────────────

function Orcamentos({ kanban, hoje, historico, propostas, telefoneDe, onAbrir }: {
  kanban: KanbanCard[]; hoje: Date; historico: HistItem[]; propostas: PropostaCustom[]
  telefoneDe: (nome: string) => string | undefined; onAbrir: (c?: KanbanCard) => void
}) {
  const pipe = pipelineComercial(kanban)
  const conv = conversao(orcamentosDoPeriodo(kanban, periodoDe("90d", hoje)))
  const validade = (c: KanbanCard) => historico.find(h => h.numero === c.numero)?.form?.validadeDias ?? propostas.find(p => p.cardId === c.id)?.validadeDias ?? 30
  const lista = pipe.cards.map(c => {
    const d = parseData(c.data)
    const dias = d ? Math.ceil((d.getTime() + validade(c) * 86_400_000 - hoje.getTime()) / 86_400_000) : null
    return { c, dias }
  }).sort((a, b) => (a.dias ?? 999) - (b.dias ?? 999))

  return <>
    <div className="grid grid-cols-2 gap-2.5">
      <Kpi rotulo="Em negociação" valor={curto(pipe.valor)} sub={`${pipe.count} orçamentos abertos`} />
      <Kpi rotulo="Conversão · 90 dias" valor={conv.decididos ? `${num(conv.taxa, 0)}%` : "—"} sub={conv.decididos ? `${conv.ganhos} de ${conv.decididos} decididos` : "nenhum decidido"}
        cor={conv.decididos ? (conv.taxa >= 40 ? COR.sucesso : conv.taxa >= 25 ? COR.alerta : COR.perigo) : "#8E8E93"} />
    </div>

    <div>
      <Titulo extra="toque para enviar o link">Abertos</Titulo>
      <Cartao className="overflow-hidden divide-y divide-[rgba(60,60,67,0.08)]">
        {lista.length === 0 && <Vazio texto="Nenhum orçamento em aberto." />}
        {lista.map(({ c, dias }) => (
          <Linha key={c.id} titulo={c.nomeCliente} valor={curto(c.preco)}
            sub={`${c.numero} · ${dias == null ? "sem data" : dias < 0 ? "proposta vencida" : dias === 0 ? "vence hoje" : dias === 1 ? "vence amanhã" : `vence em ${dias} dias`}`}
            tom={dias != null && dias < 0 ? "perigo" : dias != null && dias <= 2 ? "alerta" : undefined}
            onClick={() => onAbrir(c)} acao={<BotaoWhats href={linkWhatsApp(telefoneDe(c.nomeCliente), `Olá! Tudo bem? Passando para saber se conseguiu avaliar o orçamento ${c.numero}. Posso ajudar em algo?`)} />} />
        ))}
      </Cartao>
    </div>
  </>
}

// ── Detalhe (folha) ───────────────────────────────────────────────────────────

function Detalhe({ card, pedido, telefone, onFechar }: { card: KanbanCard; pedido?: Pedido; telefone?: string; onFechar: () => void }) {
  const { copiado, copiar } = useCopiar()
  const camera = useRef<HTMLInputElement>(null)
  const [foto, setFoto] = useState<"enviando" | "ok" | "erro" | null>(null)
  async function mandarFoto(f?: File) {
    if (!f) return
    setFoto("enviando")
    setFoto(await enviarFotoProducao(card.id, card.numero, f) ? "ok" : "erro")
  }
  // Depois da foto: mensagem pronta para o cliente, com a página dele
  async function avisarCliente() {
    const r = await fetch(`/api/cliente/link?nome=${encodeURIComponent(card.nomeCliente)}`).catch(() => null)
    const url = r?.ok ? (await r.json()).url : ""
    const msg = `Olá, ${card.nomeCliente.split(" ")[0]}! Suas embalagens estão em produção. Separei uma foto para você acompanhar: ${url}`
    const href = linkWhatsApp(telefone, msg)
    if (href) window.open(href, "_blank")
  }
  const [linkAprov, setLinkAprov] = useState<string | null>(null)
  const orcamento = isAberto(card)
  const origem = typeof window !== "undefined" ? window.location.origin : ""
  const rastreio = `${origem}/track/${card.loteNumero ? `lote/${encodeURIComponent(card.loteNumero)}` : encodeURIComponent(card.numero)}`
  const [cardBase, setCardBase] = useState(card.id)
  if (cardBase !== card.id) { setCardBase(card.id); setLinkAprov(null) }

  useEffect(() => {
    if (!orcamento) return
    let vivo = true
    fetch(`/api/aprovacao/link?numero=${encodeURIComponent(card.numero)}`).then(r => r.ok ? r.json() : null).then(d => { if (vivo && d?.url) setLinkAprov(d.url) }).catch(() => {})
    return () => { vivo = false }
  }, [card.numero, orcamento])

  const compartilhar = async (titulo: string, url: string, id: string) => {
    if (navigator.share) { try { await navigator.share({ title: titulo, url }); return } catch { /* cancelado */ } }
    copiar(id, url)
  }

  const itens: [string, string][] = [
    ["Etapa", card.coluna === COL_HOT ? "Lead quente" : COLUNAS_KANBAN[card.coluna] ?? "—"],
    ["Quantidade", card.quantidade ? `${num(card.quantidade)} un` : "—"],
    [pedido ? "Valor do pedido" : "Valor", brl(pedido?.venda ?? card.preco)],
    ...(pedido ? [["Recebido", brl(pedido.recebido)], ["Falta receber", brl(pedido.aReceber)]] as [string, string][] : []),
    ...(card.dataEntregaPrevista ? [["Entrega prevista", `${dataCurta(card.dataEntregaPrevista)} · ${prazoTexto(card.dataEntregaPrevista)}`]] as [string, string][] : []),
    ...(card.materialNome ? [["Material", card.materialNome]] as [string, string][] : []),
  ]

  return (
    <div className="px-4 pt-2 space-y-3">
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-[12px] text-[#8E8E93] font-mono">{pedido?.numero ?? card.numero}</p>
          <p className="text-[19px] font-semibold text-[#191625] leading-tight truncate">{card.nomeCliente}</p>
        </div>
        <button onClick={onFechar} aria-label="Fechar" className="w-8 h-8 rounded-full grid place-items-center bg-[rgba(116,116,128,0.12)] text-[#5e5c68] shrink-0"><X className="w-4 h-4" /></button>
      </div>

      <Cartao className="divide-y divide-[rgba(60,60,67,0.08)]">
        {itens.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-4 py-3 text-[13.5px]">
            <span className="text-[#8E8E93]">{k}</span>
            <span className={`ds-num font-medium ${k === "Falta receber" && pedido && pedido.aReceber > 0.5 ? "text-[#d33a3c]" : "text-[#191625]"}`}>{v}</span>
          </div>
        ))}
      </Cartao>

      <div className="grid grid-cols-2 gap-2.5">
        {telefone && (
          <a href={linkWhatsApp(telefone, `Olá, ${card.nomeCliente.split(" ")[0]}! Tudo bem?`)} target="_blank" rel="noreferrer"
            className="h-12 rounded-2xl bg-[#25a35a] text-white font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </a>
        )}
        {orcamento ? (
          <button disabled={!linkAprov} onClick={() => linkAprov && compartilhar(`Proposta ${card.numero}`, linkAprov, "aprov")}
            className="h-12 rounded-2xl bg-[#8456e8] text-white font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40">
            {copiado === "aprov" ? <><Check className="w-4 h-4" /> Copiado</> : <><Link2 className="w-4 h-4" /> Link de aprovação</>}
          </button>
        ) : (
          <button onClick={async () => {
            const r = await fetch(`/api/cliente/link?nome=${encodeURIComponent(card.nomeCliente)}`).catch(() => null)
            const url = r?.ok ? (await r.json()).url : rastreio
            compartilhar(`Pedidos de ${card.nomeCliente}`, url, "track")
          }}
            className="h-12 rounded-2xl bg-[#8456e8] text-white font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            {copiado === "track" ? <><Check className="w-4 h-4" /> Copiado</> : <><Share2 className="w-4 h-4" /> Página do cliente</>}
          </button>
        )}
        {!telefone && (
          <button onClick={() => copiar("num", card.numero)}
            className="h-12 rounded-2xl bg-white text-[#191625] font-medium text-[14px] flex items-center justify-center gap-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {copiado === "num" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copiar número
          </button>
        )}
      </div>
      {!orcamento && (
        <div className="space-y-2">
          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { mandarFoto(e.target.files?.[0]); e.target.value = "" }} />
          <button onClick={() => camera.current?.click()} disabled={foto === "enviando"}
            className="h-12 w-full rounded-2xl bg-white text-[#191625] font-medium text-[14px] flex items-center justify-center gap-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)] active:scale-[0.98] transition-transform disabled:opacity-60">
            <Camera className="w-4 h-4 text-[#8456e8]" /> {foto === "enviando" ? "Enviando foto…" : "Foto da produção"}
          </button>
          {foto === "ok" && (
            <div className="rounded-2xl bg-[#009351]/[0.08] px-4 py-3 flex items-center gap-3 animate-[apple-slide-up_.25s_ease-out]">
              <Check className="w-4 h-4 text-[#009351] shrink-0" />
              <p className="flex-1 text-[12.5px] text-[#191625]">Foto na página do cliente.</p>
              {telefone && <button onClick={avisarCliente} className="text-[12.5px] font-semibold text-[#25a35a]">Avisar no WhatsApp</button>}
            </div>
          )}
          {foto === "erro" && <p className="text-[12px] text-[#d33a3c] px-1">Não deu para enviar a foto. Tente de novo.</p>}
        </div>
      )}
      {orcamento && <p className="text-[11.5px] text-[#8E8E93] px-1 leading-snug">O cliente abre o link, escolhe a quantidade e aprova. O pedido entra em Fechado sozinho.</p>}
      {pedido && isTerceirizado(card) && <p className="text-[11.5px] text-[#8E8E93] px-1">Item de revenda.</p>}
    </div>
  )
}
