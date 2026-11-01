"use client"

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { Ruler, Check, Factory, LayoutDashboard, FileText, Package, Users, Wallet, BarChart3, Handshake, Megaphone, MessageCircle, Box, Lightbulb } from "lucide-react"
import { IdeiasView } from "./components/IdeiasView"
import { signOut } from "next-auth/react"
import WhatsAppView from "./components/WhatsAppView"
import Image from "next/image"
import { useTheme } from "./components/ThemeProvider"
import { FormData, Calculo, PropostaCustom, Cliente, KanbanCard, CustoSnapshot, COL_FECHADO, COL_ENTREGUE, COL_PERDIDO, COL_HOT, COLUNAS_KANBAN, Parceiro, NegocioParceiro, LancamentoFinanceiro, Lote, TipoCaixa, PrazoEtapas, AprovacaoOnline } from "./types"

// Mapa de coluna → quais campos de prazo auto-preencher (só se ainda vazios)
const COLUNA_PRAZOS: Record<number, (keyof PrazoEtapas)[]> = {
  1: ["pedido_enviado"],
  2: ["inicio_arte"],
  3: ["arte_enviada"],
  4: ["arte_aprovada"],
  5: ["inicio_impressao"],
  6: ["fim_impressao", "inicio_verniz"],
  7: ["fim_verniz", "inicio_acabamento"],
  8: ["fim_acabamento", "expedicao"],
}

function autoSetPrazos(card: KanbanCard, novaColuna: number): PrazoEtapas | null {
  const keys = COLUNA_PRAZOS[novaColuna]
  if (!keys) return null
  const hoje = new Date().toISOString().slice(0, 10)
  const prazosAtuais = card.prazos ?? {}
  const novos: Partial<PrazoEtapas> = {}
  keys.forEach(k => { if (!prazosAtuais[k]) novos[k] = hoje })
  if (Object.keys(novos).length === 0) return null
  return { ...prazosAtuais, ...novos }
}
import { QUANTIDADES_PADRAO } from "./dados"
import { calcular, compactarCalculo } from "./calculos"
import { Configuracoes, CONFIG_PADRAO } from "./config"
import LayoutChapaVisual from "./LayoutChapaVisual"
import { RotasProducao } from "./components/RotasProducao"
import { FornecedoresView } from "./components/FornecedoresView"
import { PainelView } from "./components/PainelView"
import { ParceriasView } from "./components/ParceriasView"
import { RelatoriosView } from "./components/RelatoriosView"
import { normalizarProducao, movimentosPorEtapa, desfazerMovimentosAteColuna, Servico } from "./lib/producao"
import { somarDiasUteis, definirFeriadosLocais } from "./lib/diasUteis"
import { montarPedidos } from "./lib/negocio"
import { normalizarMetas } from "./lib/metas"
import { gerarHtmlOrcamento, gerarHtmlOrcamentoCliente, gerarHtmlPropostaCustom, gerarHtmlOS } from "./pdf"
import FormaView from "./FormaView"
import FormaBubble from "./components/FormaBubble"
import { brl, num } from "./utils"
import { FormSection, Label, NumberInput, Section, TH, TabelaRow, AnaliseEstrategica, EmptyState } from "./components/ui"
import { CabecalhoPagina, Kpi, Segmentado } from "./components/ds"
import { HistoricoView } from "./components/HistoricoView"
import { OrcamentosView } from "./components/OrcamentosView"
import { PedidosUnificadoView, OrderEntry } from "./components/PedidosUnificadoView"
import { ClientesView } from "./components/ClientesView"
import { ConfigView } from "./components/ConfigView"
import { KanbanView } from "./components/KanbanView"
import { ParceirosView } from "./components/ParceirosView"
import { FinanceiroView, ModalLancamento } from "./components/FinanceiroView"
import { ClienteCombobox, ClienteContactCard } from "./components/ClienteFields"
import { ModalPersonalizarProposta } from "./components/ModalPersonalizarProposta"
import { ModalPropostaCustom, BoxPreview3D } from "./components/ModalPropostaCustom"
import { ModalDetalhe, DetalheData } from "./components/ModalDetalhe"
import { OrcamentoDigitalView } from "./components/OrcamentoDigitalView"
import { ModalSobra } from "./components/ModalSobra"
import { GamificacaoView, SidebarGamificacao } from "./components/GamificacaoView"
import { TerceirizadosView } from "./components/TerceirizadosView"
import MetaAdsView from "./components/MetaAdsView"
import BuscaGlobal from "./components/BuscaGlobal"
import { parseDXF, DXFResult } from "./lib/dxf"
import type { DXFGeo } from "./LayoutChapaVisual"

function unpackTerceirizado(card: KanbanCard): KanbanCard {
  const raw = card as KanbanCard & { observacoes_os?: string }
  const unpacked: KanbanCard = {
    ...card,
    // Não existe coluna no banco — a flag só vivia em memória e se perdia ao recarregar
    isTerceirizado: card.isTerceirizado || card.materialNome === "Terceirizado",
    cores: card.cores,
    acabamentos: card.acabamentos,
    observacoesOS: card.observacoesOS ?? raw.observacoes_os,
  }
  const ops = card.opcoes as unknown as
    | { _items?: KanbanCard["opcoes"]; _x?: { fornecedor?: string; custoTerceiro?: number; projecaoCustos?: import("./types").ProjecaoCustos; prazos?: import("./types").PrazoEtapas; prazoRecebimentoInterno?: string } }
    | null
  if (!ops || Array.isArray(ops)) return unpacked
  // Wrapped format: { _items?, _x? }
  const items = ops._items
  const x = ops._x ?? {}
  return {
    ...unpacked,
    opcoes: items as KanbanCard["opcoes"] ?? (card.materialNome === "Terceirizado" ? undefined : unpacked.opcoes),
    fornecedor: x.fornecedor || card.fornecedor,
    custoTerceiro: x.custoTerceiro ?? card.custoTerceiro,
    projecaoCustos: x.projecaoCustos ?? card.projecaoCustos,
    prazos: x.prazos ?? card.prazos,
    prazoRecebimentoInterno: x.prazoRecebimentoInterno ?? card.prazoRecebimentoInterno,
  }
}

const FORM_INICIAL: FormData = {
  nomeCliente: "", tipoCaixa: "simples", frente: 0, lateral: 0, alturaBox: 0, abaColagem: 1,
  incluirVerniz: false, vernizTipo: "", laminacao: false, laminacaoTipo: "",
  acompanhamentos: [], outrosAcabamentos: [],
  comFaca: true, valorFaca: 0,
  numSKUs: 1, numArtes: 1, quantidades: [...QUANTIDADES_PADRAO], qualidades: {}, customPecasChapa: null, blankOverride: null,
  obsInterna: "", obsCliente: "", validadeDias: 7, materialId: "cartao300", materialNome: "Cartão 300g",
}

// Opções de acabamentos
const TIPOS_VERNIZ    = ["UV Total", "UV Localizado", "Resinado", "Holográfico"] as const
const TIPOS_LAMINACAO = ["Fosca", "Brilhante", "Soft Touch", "Holográfica"] as const
const ACOMPANHAMENTOS = ["Berço interno", "Tampa separada", "Divisória", "Calço", "Gaveta interna"] as const
const OUTROS_ACABAMENTOS = ["Hot Stamping", "Alto Relevo", "Baixo Relevo", "Janela PVC", "Vinco especial", "Corte e vinco"] as const

function NavItem({ active, onClick, icon, label, badge, accent }: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
  accent?: boolean
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[12.5px] transition-all duration-150 ${
        active
          ? "bg-white/[0.09] text-white font-semibold"
          : accent
            ? "text-[#8456e8] font-semibold bg-[#8456e8]/[0.12] hover:bg-[#8456e8]/[0.18]"
            : "text-white/[0.52] hover:text-white hover:bg-white/[0.05] font-medium"
      }`}>
      <span className="shrink-0 rounded-full transition-all"
        style={{
          width: 7, height: 7, minWidth: 7, minHeight: 7,
          background: active ? "#a582ff" : "transparent",
          border: active ? "1.5px solid #a582ff" : "1.5px solid rgba(255,255,255,0.2)",
        }} />
      <span className={`shrink-0 transition-colors ${active ? "text-white" : accent ? "text-[#8456e8]" : "text-white/40"}`}>
        {icon}
      </span>
      <span className="flex-1 text-left truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full ds-num min-w-[18px] text-center"
          style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
          {badge}
        </span>
      )}
    </button>
  )
}

function NavGroup({ label }: { label: string }) {
  return (
    <p className="text-[9px] font-bold uppercase px-3 pt-4 pb-1.5 select-none tracking-[0.6px]"
      style={{ color: "rgba(255,255,255,0.35)" }}>
      {label}
    </p>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [form, setForm]       = useState<FormData>(FORM_INICIAL)
  const [result, setResult]   = useState<Calculo | null>(null)
  const [dxfNome, setDxfNome]       = useState<string | null>(null)
  const [dxfGeo, setDxfGeo]         = useState<DXFGeo | null>(null)
  const [dxfPreview, setDxfPreview] = useState<{ result: DXFResult; nome: string } | null>(null)
  const [novaQtd, setNovaQtd] = useState("")
  const [toast, setToast]     = useState("")
  const [notifWA, setNotifWA] = useState<{ nomeCliente: string; numero: string; etapa: string; telefone: string; portal?: string } | null>(null)
  const [historico, setHistorico] = useState<Array<{ form: FormData; calculo: Calculo; data: string; numero?: string }>>([])
  const [editandoHistorico, setEditandoHistorico] = useState<string | null>(null)
  const [kanban, setKanban]   = useState<KanbanCard[]>([])
  const [contador, setContador] = useState<number>(0)
  const [view, setView]       = useState<"orcamento" | "orcamentos" | "historico" | "clientes" | "forma" | "config" | "dashboard" | "parceiros" | "financeiro" | "conquistas" | "terceirizados" | "pedidos" | "meta" | "whatsapp" | "fornecedores" | "painel" | "ideias">("painel")
  const [perfilClienteExterno, setPerfilClienteExterno] = useState<string | null>(null)
  const [config, setConfig]   = useState<Configuracoes>(CONFIG_PADRAO)
  definirFeriadosLocais(config.feriados)
  const configAtual = useRef<Configuracoes>(CONFIG_PADRAO)
  useEffect(() => { configAtual.current = config }, [config])
  const [modalSalvar, setModalSalvar] = useState<{ form: FormData; calculo: Calculo; numero: string; data: string; cardId: string } | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [propostasCustom, setPropostasCustom] = useState<PropostaCustom[]>([])
  const [contadorProp, setContadorProp] = useState<number>(0)
  const [modalPropostaCustom, setModalPropostaCustom] = useState(false)
  const [editandoProposta, setEditandoProposta] = useState<PropostaCustom | null>(null)
  const [detalheModal, setDetalheModal] = useState<DetalheData | null>(null)
  const [parceiros, setParceiros] = useState<Parceiro[]>([])
  const [negocios, setNegocios]   = useState<NegocioParceiro[]>([])
  const [lancamentos, setLancamentos] = useState<LancamentoFinanceiro[]>([])
  const [lotes, setLotes]         = useState<Lote[]>([])
  const [modalSinal, setModalSinal] = useState<{
    cardId: string; nomeCliente: string; cardNumero?: string
    loteId?: string; loteNumero?: string; preco: number
  } | null>(null)
  const [modalSobra, setModalSobra] = useState<{ card: KanbanCard; loteCards: KanbanCard[] } | null>(null)
  const [modalLancPedidos, setModalLancPedidos] = useState<Partial<LancamentoFinanceiro> | null>(null)
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [orcTab, setOrcTab] = useState<"padrao" | "digital">("padrao")
  type CampoCusto = "custoPapel" | "custoImpressao" | "custoCorte" | "custoVerniz" | "custoColagem" | "custoArte" | "custoUnitSF" | "custoUnitCF"
  const [customCustos, setCustomCustos] = useState<Record<number, Partial<Record<CampoCusto, number>>>>({})
  const [customPacotesMap, setCustomPacotesMap] = useState<Record<number, number>>({})
  // acabamento name → qty → cost
  const [customAcabamentoCustos, setCustomAcabamentoCustos] = useState<Record<string, Record<number, number>>>({})

  function handleCustoEdit(qtd: number, campo: CampoCusto, val: number | null) {
    setCustomCustos(prev => {
      const next = { ...prev }
      if (val === null) {
        const row = { ...next[qtd] }
        delete row[campo]
        if (Object.keys(row).length === 0) delete next[qtd]
        else next[qtd] = row
      } else {
        const isComponent = campo !== "custoUnitSF" && campo !== "custoUnitCF"
        const row = { ...next[qtd], [campo]: val }
        if (isComponent) {
          // Componente editado → unidade deve ser derivada dos componentes
          delete row.custoUnitSF
          delete row.custoUnitCF
        }
        next[qtd] = row
      }
      return next
    })
  }

  function handlePacoteEdit(qtd: number, numPacotes: number | null) {
    if (numPacotes === null) {
      setCustomPacotesMap(prev => { const n = { ...prev }; delete n[qtd]; return n })
      handleCustoEdit(qtd, "custoPapel", null)
      handleCustoEdit(qtd, "custoCorte",  null)
      return
    }
    setCustomPacotesMap(prev => ({ ...prev, [qtd]: numPacotes }))
    const r = result
    if (!r) return
    // Batidas de corte não dependem do papel comprado; só o papel muda
    const linha          = r.tabela.find(l => l.quantidade === qtd)
    const precoPor100    = linha?.precoPor100Papel ?? r.melhorFormato.precoPor100
    handleCustoEdit(qtd, "custoPapel", numPacotes * precoPor100)
  }

  function handleAcabamentoCustoEdit(nome: string, qtd: number, val: number | null) {
    setCustomAcabamentoCustos(prev => {
      const next = { ...prev }
      if (val === null) {
        const row = { ...(next[nome] ?? {}) }
        delete row[qtd]
        if (Object.keys(row).length === 0) delete next[nome]
        else next[nome] = row
      } else {
        next[nome] = { ...(next[nome] ?? {}), [qtd]: val }
      }
      return next
    })
  }

  const { isDark, setTheme, theme } = useTheme()
  const expirySweepDone = useRef(false)

  // Cmd+K global search shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setBuscaAberta(v => !v)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  // Persist main view across F5 — read on mount, write in navigate()
  useEffect(() => {
    const saved = sessionStorage.getItem("app:view")
    const valid = ["orcamento","orcamentos","historico","clientes","forma","config","dashboard","parceiros","financeiro","conquistas","terceirizados","pedidos","meta","whatsapp","fornecedores","painel","ideias"]
    // Conquistas virou o cartão "Meta do mês" do Painel
    if (saved === "conquistas") setView("painel")
    else if (saved && valid.includes(saved)) setView(saved as typeof view)
  }, [])

  function navigate(v: typeof view) {
    setView(v)
    sessionStorage.setItem("app:view", v)
  }

  useEffect(() => {
    fetch("/api/data")
      .then(r => r.json())
      .then(d => {
        if (d.historico)              setHistorico(d.historico)
        if (d.contador  !== undefined) setContador(d.contador)
        if (d.clientes)               setClientes(d.clientes)
        if (d.propostasCustom)        setPropostasCustom(d.propostasCustom)
        if (d.contadorProp !== undefined) setContadorProp(d.contadorProp)
        if (d.kanban)                 setKanban(d.kanban.map(unpackTerceirizado))
        if (d.config)                 setConfig(c => ({ ...CONFIG_PADRAO, ...c, ...d.config }))
        const novasAprovacoes = (d.config?.aprovacoesOnline ?? []).filter((a: AprovacaoOnline) => !a.visto && !a.desfeita).length
        if (novasAprovacoes) showToast(novasAprovacoes === 1 ? "Um cliente aprovou o orçamento online. Veja no Painel." : `${novasAprovacoes} orçamentos aprovados online. Veja no Painel.`)
        if (d.parceiros)              setParceiros(d.parceiros)
        if (d.negocios)               setNegocios(d.negocios)
        if (d.lancamentos)            setLancamentos(d.lancamentos)
        if (d.lotes)                  setLotes(d.lotes)

        // Auto-limpar cards órfãos: cards sem histórico correspondente
        if (d.kanban && d.historico && d.propostasCustom) {
          const historicoNums = new Set((d.historico as { numero?: string }[]).map(h => h.numero).filter(Boolean))
          const propostaCardIds = new Set((d.propostasCustom as { cardId: string }[]).map(p => p.cardId))
          const orfaos = (d.kanban as KanbanCard[]).map(unpackTerceirizado).filter(c => {
            if (c.materialNome === "Terceirizado") return false
            if (!c.numero) return false
            if (propostaCardIds.has(c.id)) return false
            return !historicoNums.has(c.numero)
          })
          // Só registra — apagar pedidos do banco automaticamente ao abrir a página é arriscado demais
          if (orfaos.length > 0) console.warn("Cards sem histórico correspondente:", orfaos.map(o => o.numero))
        }
      })
      .catch(() => {})
  }, [])

  // ── Auto-expire: move vencidos (col 0) para Perdido silenciosamente ──────────
  useEffect(() => {
    if (expirySweepDone.current) return
    if (kanban.length === 0) return
    expirySweepDone.current = true

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)

    const vencidos = kanban.filter(card => {
      if (card.coluna !== 0) return false // Hot (COL_HOT ≠ 0) nunca entra aqui

      // Busca validadeDias: historico → propostaCustom → default 30 dias
      let dias = 30
      const hist = historico.find(h => h.numero === card.numero)
      if (hist?.form?.validadeDias) dias = hist.form.validadeDias
      else {
        const prop = propostasCustom.find(p => p.cardId === card.id)
        if (prop?.validadeDias) dias = prop.validadeDias
      }

      // Parseia data do orçamento (formato "dd/mm/yyyy, hh:mm:ss" ou similar)
      const parts = card.data.split(",")[0].trim().split("/")
      if (parts.length !== 3) return false
      const [d, m, y] = parts
      const quoteDate = new Date(+y, +m - 1, +d)
      const expiry    = new Date(quoteDate.getTime() + dias * 86_400_000)

      return hoje > expiry
    })

    vencidos.forEach(card => {
      fetch(`/api/kanban/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coluna: COL_PERDIDO, motivoPerdido: "Orçamento sem conclusão" }),
      }).catch(() => {})
      setKanban(prev => prev.map(c =>
        c.id === card.id
          ? { ...c, coluna: COL_PERDIDO, motivoPerdido: "Orçamento sem conclusão" }
          : c
      ))
    })
  }, [kanban, historico, propostasCustom])

  const faturamentoPorCampanha = useMemo(() => {
    const map: Record<string, number> = {}
    for (const cliente of clientes) {
      if (!cliente.origemCampanhaId) continue
      const fat = kanban
        .filter(c =>
          c.nomeCliente?.trim().toLowerCase() === cliente.nome.trim().toLowerCase() &&
          c.coluna !== 0 && c.coluna !== COL_PERDIDO && c.coluna !== COL_HOT
        )
        .reduce((s, c) => s + c.preco, 0)
      if (fat > 0) map[cliente.origemCampanhaId] = (map[cliente.origemCampanhaId] ?? 0) + fat
    }
    return map
  }, [clientes, kanban])

  const clientesPorCampanha = useMemo(() => {
    const map: Record<string, number> = {}
    for (const cliente of clientes) {
      if (!cliente.origemCampanhaId) continue
      map[cliente.origemCampanhaId] = (map[cliente.origemCampanhaId] ?? 0) + 1
    }
    return map
  }, [clientes])

  const ltvPorCampanha = useMemo(() => {
    const map: Record<string, number> = {}
    const lancPagas = lancamentos.filter(l => l.tipo === "receita" && l.status === "pago")
    for (const cliente of clientes) {
      if (!cliente.origemCampanhaId) continue
      const cardsCliente = kanban.filter(c =>
        c.nomeCliente?.trim().toLowerCase() === cliente.nome.trim().toLowerCase()
      )
      const cardIds = new Set(cardsCliente.map(c => c.id))
      const loteIds = new Set(cardsCliente.map(c => c.loteId).filter(Boolean) as string[])
      const ltv = lancPagas
        .filter(l =>
          (l.cardId && cardIds.has(l.cardId)) ||
          (l.loteId && loteIds.has(l.loteId)) ||
          (!l.cardId && !l.loteId && l.nomeCliente?.trim().toLowerCase() === cliente.nome.trim().toLowerCase())
        )
        .reduce((s, l) => s + l.valor, 0)
      if (ltv > 0)
        map[cliente.origemCampanhaId] = (map[cliente.origemCampanhaId] ?? 0) + ltv
    }
    return map
  }, [clientes, kanban, lancamentos])

  function atualizarCliente(id: string, updates: Partial<Cliente>) {
    setClientes(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
    fetch(`/api/clientes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }).catch(() => {})
  }

  function criarClienteComDados(nome: string, updates: Partial<Cliente>) {
    if (clientes.some(c => c.nome.toLowerCase() === nome.toLowerCase())) return
    const novo = { id: Date.now().toString(), nome, criadoEm: new Date().toLocaleString("pt-BR"), ...updates }
    setClientes(prev => {
      if (prev.some(c => c.nome.toLowerCase() === nome.toLowerCase())) return prev
      return [...prev, novo]
    })
    fetch("/api/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(novo),
    }).catch(() => {})
  }

  const set = useCallback(<K extends keyof FormData>(campo: K, valor: FormData[K]) => {
    setForm(prev => {
      const next = { ...prev, [campo]: valor }
      setResult(calcular(next, config))
      return next
    })
  }, [config])

  // Campos que afetam a dieline (largura/altura) — resetam customPecasChapa
  const setDim = useCallback(<K extends "frente" | "alturaBox" | "lateral" | "abaColagem">(campo: K, valor: number) => {
    setForm(prev => {
      const next = { ...prev, [campo]: valor, customPecasChapa: null }
      setResult(calcular(next, config))
      return next
    })
  }, [config])

  // Atualiza o formulário e recalcula na mesma passada
  const mudarForm = useCallback((fn: (p: FormData) => FormData) => {
    setForm(prev => {
      const next = fn(prev)
      setResult(calcular(next, config))
      return next
    })
  }, [config])

  function salvarConfigTudo(cfg: Configuracoes) {
    configAtual.current = cfg
    setConfig(cfg)
    setResult(calcular(form, cfg))
    fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) }).catch(() => {})
  }

  function registrarFaca(rota: import("./lib/producao").Rota) {
    if (!result) return
    const prod = normalizarProducao(config.producao)
    const faca: import("./lib/producao").Ferramental = {
      id: Date.now().toString(),
      tipo: "faca",
      cliente: form.nomeCliente.trim(),
      produto: `${form.frente}×${form.alturaBox}×${form.lateral}`,
      blankLargura: result.dieline.largura,
      blankAltura: result.dieline.altura,
      cavidades: rota.facaCavidades,
      custo: rota.itens.find(i => i.etapa === "faca")?.valor ?? form.valorFaca,
      data: new Date().toISOString().slice(0, 10),
    }
    salvarConfigTudo({ ...config, producao: { ...prod, ferramentais: [...prod.ferramentais, faca] } })
    showToast(`Faca de ${faca.cavidades} registrada para ${faca.cliente}`)
  }

  // Abre o detalhe certo de um card (orçamento salvo, proposta personalizada ou card simples)
  function abrirDetalheCard(card: KanbanCard) {
    const histItem = historico.find(h => h.numero === card.numero)
    if (histItem) { setDetalheModal({ tipo: "historico", item: histItem, card }); return }
    const proposta = propostasCustom.find(p => p.cardId === card.id)
    if (proposta) { setDetalheModal({ tipo: "proposta", proposta, card }); return }
    setDetalheModal({ tipo: "kanban", card })
  }

  // Automações ao mudar a etapa de um pedido (data de entrega e prazo de fornecedores).
  // Lê configAtual para que várias chamadas seguidas (mudança em lote) acumulem.
  function automacoesDeEtapa(card: KanbanCard, coluna: number) {
    const config = configAtual.current
    const prod = normalizarProducao(config.producao)
    const hojeIso = new Date().toLocaleDateString("sv-SE")
    const avisos: string[] = []

    if (prod.automacoes.prazoEntrega && coluna >= COL_FECHADO && coluna < COL_ENTREGUE && !card.dataEntregaPrevista) {
      const dataEntregaPrevista = somarDiasUteis((card.dataFechamento ?? hojeIso).slice(0, 10), prod.prazoEntregaPadraoDias)
      setKanban(prev => prev.map(c => c.id === card.id ? { ...c, dataEntregaPrevista } : c))
      fetch(`/api/kanban/${card.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataEntregaPrevista }) }).catch(() => {})
      avisos.push(`entrega prevista para ${dataEntregaPrevista.split("-").reverse().join("/")} (${prod.prazoEntregaPadraoDias} dias úteis)`)
    }

    if (prod.automacoes.fornecedores && coluna >= 2 && coluna <= 9) {
      const hist = historico.find(h => h.numero === card.numero)
      const rotas = hist?.calculo?.rotas
      const rota = rotas?.find(q => q.quantidade === card.quantidade)?.melhor ?? rotas?.[rotas.length - 1]?.melhor
      const pedidoKey = card.loteId ? `lote-${card.loteId}` : `card-${card.id}`
      const label = `${card.loteNumero ?? card.numero} · ${card.nomeCliente}`
      // Serviços de acabamento pelo que o orçamento pediu
      const f = hist?.form
      const servicosAcab: Servico[] = [
        ...(f?.laminacao ? ["laminacao" as const] : []),
        ...(f?.incluirVerniz ? ["verniz" as const] : []),
        ...(f?.outrosAcabamentos?.includes("Hot Stamping") ? ["hotStamping" as const] : []),
        "corteVinco",
        ...((f?.rota?.colagemModo ?? (f?.tipoCaixa === "aviao" ? "nenhuma" : "fornecedor")) === "fornecedor" ? ["colagem" as const] : []),
      ]
      const movs = movimentosPorEtapa(prod, pedidoKey, label, coluna, rota?.impressorId ?? null, hojeIso, servicosAcab)
      if (movs) {
        salvarConfigTudo({ ...config, producao: { ...prod, movimentos: movs } })
        avisos.push(coluna === 2 ? "envio da arte registrado" : coluna <= 4 ? "arte recebida" : coluna === 5 ? "envio ao impressor registrado" : coluna <= 7 ? "impressão recebida e envio ao acabamento registrados" : "retorno dos fornecedores registrado")
      }
    }
    // Entregue: registra a data real da entrega (base de "entregue no prazo")
    if (coluna === COL_ENTREGUE && !card.dataEntregaReal) {
      setKanban(prev => prev.map(c => c.id === card.id ? { ...c, dataEntregaReal: hojeIso } : c))
      fetch(`/api/kanban/${card.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataEntregaReal: hojeIso }) }).catch(() => {})
      avisos.push("entrega registrada hoje")
    }
    if (avisos.length) showToast(`${card.loteNumero ?? card.numero}: ${avisos.join(" · ")}`)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(""), 2800)
  }

  async function criarTracking(card: KanbanCard) {
    try {
      await fetch(`/api/track/${encodeURIComponent(card.numero)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: card.numero,
          nomeCliente: card.nomeCliente,
          descricao: card.dimensoes || "",
          materialNome: card.materialNome || "",
          quantidade: card.quantidade,
          preco: card.preco,
          colunaAtual: 0,
          etapas: [{ coluna: 0, nome: "Orçamento criado", dataHora: card.data, tipo: "criacao" }],
          criadoEm: card.data,
        }),
      })
    } catch { /* silently fail */ }
  }

  async function criarLote(nomeCliente: string): Promise<{ id: string; numero: string }> {
    const res = await fetch("/api/lotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nomeCliente }),
    })
    const lote = await res.json()
    setLotes(prev => [lote, ...prev])
    return lote
  }

  function assignLote(cardId: string, loteId: string, loteNumero: string) {
    setKanban(prev => prev.map(c => c.id === cardId ? { ...c, loteId, loteNumero } : c))
    fetch(`/api/kanban/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loteId, loteNumero }),
    }).catch(() => {})
  }

  function removeLote(cardId: string) {
    setKanban(prev => prev.map(c => c.id === cardId ? { ...c, loteId: undefined, loteNumero: undefined } : c))
    fetch(`/api/kanban/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loteId: null, loteNumero: null }),
    }).catch(() => {})
  }

  async function mergeLote(sourceLoteId: string, targetLoteId: string, targetLoteNumero: string) {
    await fetch(`/api/lotes/${sourceLoteId}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLoteId, targetLoteNumero }),
    }).catch(() => {})
    setKanban(prev => prev.map(c =>
      c.loteId === sourceLoteId ? { ...c, loteId: targetLoteId, loteNumero: targetLoteNumero } : c
    ))
    setNegocios(prev => prev.map(n =>
      n.loteId === sourceLoteId ? { ...n, loteId: targetLoteId, loteNumero: targetLoteNumero } : n
    ))
    setLotes(prev => prev.filter(l => l.id !== sourceLoteId))
  }

  async function renameLote(loteId: string, newNumero: string): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`/api/lotes/${loteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numero: newNumero }),
    }).catch(() => null)
    if (!res) return { ok: false, error: "network" }
    const data = await res.json()
    if (res.ok) {
      const n = data.numero as string
      setKanban(prev => prev.map(c => c.loteId === loteId ? { ...c, loteNumero: n } : c))
      setNegocios(prev => prev.map(x => x.loteId === loteId ? { ...x, loteNumero: n } : x))
      setLotes(prev => prev.map(l => l.id === loteId ? { ...l, numero: n } : l))
      return { ok: true }
    }
    return { ok: false, error: data.error }
  }

  function criarLancamentoSinal(
    cardId: string, nomeCliente: string, cardNumero: string | undefined,
    loteId: string | undefined, loteNumero: string | undefined,
    valor: number, formaPagamento: string
  ) {
    const hoje = new Date().toISOString().slice(0, 10)
    const lancamento: LancamentoFinanceiro = {
      id: crypto.randomUUID(),
      tipo: "receita",
      descricao: `Sinal de entrada — ${nomeCliente}`,
      valor,
      dataVencimento: hoje,
      dataPagamento: hoje,
      status: "pago",
      cardId: cardId ?? null,
      cardNumero: cardNumero ?? null,
      nomeCliente,
      loteId: loteId ?? null,
      loteNumero: loteNumero ?? null,
      formaPagamento,
      criadoEm: new Date().toISOString(),
    } as unknown as LancamentoFinanceiro
    setLancamentos(prev => [lancamento, ...prev])
    fetch("/api/lancamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lancamento),
    }).catch(() => {})
  }

  async function copiarPedido(entry: OrderEntry) {
    const agora = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    const copias: KanbanCard[] = entry.cards.map(c => ({
      ...c,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      coluna: 0,
      data: agora,
      dataFechamento: undefined,
      dataEntregaPrevista: undefined,
      dataEntregaReal: undefined,
      prazoRecebimentoInterno: undefined,
      loteId: undefined,
      loteNumero: undefined,
      prazos: undefined,
      motivoPerdido: undefined,
    }))

    // Se era um lote com mais de 1 card, criar novo lote e associar as cópias
    if (entry.tipo === "lote" && copias.length > 1) {
      try {
        const lote = await criarLote(copias[0].nomeCliente)
        copias.forEach(c => { c.loteId = lote.id; c.loteNumero = lote.numero })
      } catch { /* continua sem lote se falhar */ }
    }

    setKanban(prev => [...copias, ...prev])
    await Promise.all(copias.map(c =>
      fetch("/api/kanban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      }).catch(() => {})
    ))
    showToast(`${copias.length === 1 ? "Pedido copiado" : `${copias.length} cards copiados`} para Orçamentos.`)
  }

  async function salvarDataFechamento(cardId: string, date: string) {
    setKanban(prev => prev.map(c => c.id === cardId ? { ...c, dataFechamento: date } : c))
    await fetch(`/api/kanban/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataFechamento: date }),
    }).catch(() => {})
    showToast("Data de fechamento atualizada.")
  }

  async function salvarDataEntrega(cardId: string, date: string | null) {
    setKanban(prev => prev.map(c => c.id === cardId ? { ...c, dataEntregaPrevista: date ?? undefined } : c))
    const card = kanban.find(c => c.id === cardId)
    if (!card) return
    await fetch(`/api/kanban/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataEntregaPrevista: date ?? null }),
    }).catch(() => {})
    if (card.numero) {
      const res = await fetch(`/api/track/${encodeURIComponent(card.numero)}`).catch(() => null)
      if (res?.ok) {
        const entry = await res.json()
        await fetch(`/api/track/${encodeURIComponent(card.numero)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...entry, dataEntregaPrevista: date ?? null }),
        }).catch(() => {})
      }
    }
    showToast(date ? "Data de entrega atualizada." : "Data de entrega removida.")
  }

  async function salvarDataEntregaReal(cardId: string, date: string | null) {
    setKanban(prev => prev.map(c => c.id === cardId ? { ...c, dataEntregaReal: date ?? undefined } : c))
    await fetch(`/api/kanban/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataEntregaReal: date ?? null }),
    }).catch(() => {})
    showToast(date ? "Entrega registrada." : "Data de entrega removida.")
  }

  async function salvarPrazoRecebimentoInterno(cardId: string, date: string | null) {
    setKanban(prev => prev.map(c => c.id === cardId ? { ...c, prazoRecebimentoInterno: date ?? undefined } : c))
    await fetch(`/api/kanban/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prazoRecebimentoInterno: date ?? null }),
    }).catch(() => {})
    showToast(date ? "Prazo de recebimento salvo." : "Prazo de recebimento removido.")
  }

  async function salvarFornecedor(cardId: string, fornecedor: string | null, custoTerceiro: number | null) {
    setKanban(prev => prev.map(c => c.id === cardId ? { ...c, fornecedor: fornecedor ?? undefined, custoTerceiro: custoTerceiro ?? undefined } : c))
    await fetch(`/api/kanban/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fornecedor: fornecedor ?? null, custoTerceiro: custoTerceiro ?? null }),
    }).catch(() => {})
    showToast(fornecedor ? "Fornecedor salvo." : "Fornecedor removido.")
  }

  async function salvarCardExtras(cardId: string, extras: { cores?: string; acabamentos?: string[]; observacoesOS?: string }) {
    setKanban(prev => prev.map(c => c.id === cardId ? { ...c, ...extras } : c))
    await fetch(`/api/kanban/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cores: extras.cores ?? null, acabamentos: extras.acabamentos ?? null, observacoesOS: extras.observacoesOS ?? null }),
    }).catch(() => {})
  }

  async function salvarProjecaoCustos(cardId: string, proj: import("./types").ProjecaoCustos) {
    setKanban(prev => prev.map(c => c.id === cardId ? { ...c, projecaoCustos: proj } : c))
    await fetch(`/api/kanban/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projecaoCustos: proj }),
    }).catch(() => {})
  }

  async function salvarPrazos(cardId: string, prazos: import("./types").PrazoEtapas) {
    setKanban(prev => prev.map(c => c.id === cardId ? { ...c, prazos } : c))
    await fetch(`/api/kanban/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prazos }),
    }).catch(() => {})
  }

  function abrirSobra(card: KanbanCard) {
    const loteCards = card.loteId ? kanban.filter(c => c.loteId === card.loteId) : []
    setModalSobra({ card, loteCards })
  }

  async function salvarSobras(lancamentos_: Omit<LancamentoFinanceiro, "id" | "criadoEm">[]) {
    const novos = lancamentos_.map(l => ({
      ...l,
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      criadoEm: new Date().toLocaleString("pt-BR"),
    } as LancamentoFinanceiro))
    setLancamentos(prev => [...novos, ...prev])
    await Promise.all(novos.map(l =>
      fetch("/api/lancamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(l),
      }).catch(() => {})
    ))
    showToast(novos.length === 1 ? "Sobra registrada." : `${novos.length} sobras registradas.`)
  }

  async function atualizarTracking(numero: string, novaColuna: number, preco?: number, quantidade?: number) {
    try {
      const res = await fetch(`/api/track/${encodeURIComponent(numero)}`)
      if (!res.ok) return
      const entry = await res.json()
      const dataHora = new Date().toLocaleString("pt-BR")
      const colNome = COLUNAS_KANBAN[novaColuna] ?? `Coluna ${novaColuna}`
      // Voltou no quadro: etapas depois da nova coluna ainda não aconteceram (perdido mantém o histórico)
      const limite = novaColuna === COL_HOT ? 0 : novaColuna
      const etapas = novaColuna === COL_PERDIDO ? [...entry.etapas]
        : entry.etapas.filter((e: { coluna: number }) => e.coluna <= limite)
      const jatem = etapas.some((e: { coluna: number; tipo?: string }) => e.coluna === novaColuna && (!e.tipo || e.tipo === "coluna"))
      if (!jatem) etapas.push({ coluna: novaColuna, nome: colNome, dataHora, tipo: "coluna" })
      if (preco !== undefined && entry.preco > 0 && entry.preco !== preco) {
        const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        etapas.push({ coluna: novaColuna, nome: "Preço atualizado", dataHora, tipo: "preco", detalhe: `${fmt(entry.preco)} → ${fmt(preco)}` })
      }
      await fetch(`/api/track/${encodeURIComponent(numero)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...entry,
          colunaAtual: novaColuna,
          etapas,
          ...(preco !== undefined ? { preco } : {}),
          ...(quantidade !== undefined ? { quantidade } : {}),
        }),
      })
    } catch { /* silently fail */ }
  }

  function salvar() {
    if (!result) return
    const data  = new Date().toLocaleString("pt-BR")
    const ano   = new Date().getFullYear()
    const novoContador = contador + 1
    const numero = `ORC-${ano}-${String(novoContador).padStart(3, "0")}`
    setContador(novoContador)
    const historicoItem = { form: { ...form }, calculo: compactarCalculo(result), data, numero }
    setHistorico(prev => [historicoItem, ...prev])
    fetch("/api/historico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...historicoItem, contador: novoContador }),
    }).catch(() => {})
    const ideal = result.tabela.find(l => l.quantidade === result.sweetSpotIdealQtd) ?? result.tabela[result.tabela.length - 1]

    const custosSnapshot: CustoSnapshot[] = result.tabela.map(l => {
      const cc      = customCustos[l.quantidade] ?? {}
      const papel   = cc.custoPapel     ?? l.custoPapel
      const impr    = cc.custoImpressao ?? l.custoImpressao
      const corte   = cc.custoCorte     ?? l.custoCorte
      const verniz  = cc.custoVerniz    ?? l.custoVerniz
      const colagem = cc.custoColagem   ?? l.custoColagem
      const arte    = cc.custoArte      ?? l.custoArte
      const temAcab = form.incluirVerniz || form.laminacao
      const extras  = (l.custoFrete ?? 0) + (l.custoHotStamping ?? 0) + (form.comFaca ? (l.custoTotalComFaca - l.custoTotalSemFaca) : 0)
      const total   = papel + impr + corte + (temAcab ? verniz : 0) + colagem + arte + extras
      const preco   = form.comFaca ? l.precoComFaca : l.precoSemFaca
      return {
        quantidade: l.quantidade,
        papel, impressao: impr, corte,
        verniz: temAcab ? verniz : 0,
        colagem, arte, total, preco,
        margem: preco > 0 ? (preco - total) / preco * 100 : 0,
      }
    })

    const idealSnap = custosSnapshot.find(s => s.quantidade === ideal.quantidade) ?? custosSnapshot[0]
    const projecaoCustos: import("./types").ProjecaoCustos | undefined = idealSnap ? {
      papel:     idealSnap.papel    > 0 ? idealSnap.papel    : undefined,
      impressao: idealSnap.impressao > 0 ? idealSnap.impressao : undefined,
      corte:     idealSnap.corte    > 0 ? idealSnap.corte    : undefined,
      verniz:    idealSnap.verniz   > 0 ? idealSnap.verniz   : undefined,
      colagem:   idealSnap.colagem  > 0 ? idealSnap.colagem  : undefined,
      arte:      idealSnap.arte     > 0 ? idealSnap.arte     : undefined,
      faca:      form.comFaca && ideal.custoTotalComFaca - ideal.custoTotalSemFaca > 0 ? ideal.custoTotalComFaca - ideal.custoTotalSemFaca : undefined,
    } : undefined

    const card: KanbanCard = {
      id: Date.now().toString(),
      numero,
      nomeCliente: form.nomeCliente || "Sem nome",
      dimensoes: `${form.frente}×${form.alturaBox}×${form.lateral}`,
      materialNome: form.materialNome,
      preco: form.comFaca ? ideal.precoComFaca : ideal.precoSemFaca,
      quantidade: ideal.quantidade,
      data,
      coluna: 0,
      opcoes: result.tabela.map(l => ({
        quantidade: l.quantidade,
        preco:     form.comFaca ? l.precoComFaca    : l.precoSemFaca,
        unitario:  form.comFaca ? l.unitarioComFaca : l.unitarioSemFaca,
      })),
      custosSnapshot,
      projecaoCustos,
    }
    setKanban(prev => [card, ...prev])
    fetch("/api/kanban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    }).catch(() => {})
    criarTracking(card)
    // Auto-create client silently if it's a new name
    const nomeClean = form.nomeCliente.trim()
    if (nomeClean && !clientes.some(c => c.nome.toLowerCase() === nomeClean.toLowerCase())) {
      const novoCliente = { id: (Date.now() + 1).toString(), nome: nomeClean, criadoEm: data }
      setClientes(prev => {
        if (prev.some(c => c.nome.toLowerCase() === nomeClean.toLowerCase())) return prev
        return [...prev, novoCliente]
      })
      fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novoCliente),
      }).catch(() => {})
    }
    showToast(`Orçamento ${numero} salvo.`)
    setModalSalvar({ form: { ...form }, calculo: result, numero, data, cardId: card.id })
  }

  function replicar(item: { form: FormData; calculo: Calculo }) {
    setForm(item.form)
    setResult(calcular(item.form, config))
    setView("orcamento")
    showToast("Orçamento replicado na mesa atual.")
  }

  function personalizarHistorico(item: { form: FormData; calculo: Calculo; numero?: string; data: string }) {
    const cardId = kanban.find(c => c.numero === item.numero)?.id ?? `hist-${item.numero}`
    setDetalheModal(null)
    setModalSalvar({
      form: item.form,
      calculo: item.calculo,
      numero: item.numero ?? "",
      data: item.data,
      cardId,
    })
  }

  function editarHistorico(item: { form: FormData; calculo: Calculo; numero?: string }) {
    if (!item.numero || !item.form) return
    const recalc = calcular(item.form, config)
    setForm({ ...item.form })
    setResult(recalc ?? item.calculo)
    setEditandoHistorico(item.numero)
    setView("orcamento")
    setDetalheModal(null)
  }

  function cancelarEdicaoHistorico() {
    setEditandoHistorico(null)
    setForm(FORM_INICIAL)
    setResult(null)
    setView("orcamentos")
  }

  function salvarEdicaoHistorico() {
    if (!result || !editandoHistorico) return
    const numero = editandoHistorico
    const original = historico.find(h => h.numero === numero)
    const data = original?.data ?? new Date().toLocaleString("pt-BR")
    const historicoItem = { form: { ...form }, calculo: compactarCalculo(result), data, numero }
    setHistorico(prev => prev.map(h => h.numero === numero ? historicoItem : h))
    fetch("/api/historico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(historicoItem),
    }).catch(() => {})

    // Sincroniza o card do kanban vinculado (se existir)
    const card = kanban.find(c => c.numero === numero)
    if (card) {
      const ideal = result.tabela.find(l => l.quantidade === result.sweetSpotIdealQtd) ?? result.tabela[result.tabela.length - 1]
      const aindaNaoFechado = card.coluna < COL_FECHADO
      const updates = {
        nomeCliente: form.nomeCliente || "Sem nome",
        dimensoes: `${form.frente}×${form.alturaBox}×${form.lateral}`,
        materialNome: form.materialNome,
        opcoes: result.tabela.map(l => ({
          quantidade: l.quantidade,
          preco:     form.comFaca ? l.precoComFaca    : l.precoSemFaca,
          unitario:  form.comFaca ? l.unitarioComFaca : l.unitarioSemFaca,
        })),
        ...(aindaNaoFechado ? {
          preco: form.comFaca ? ideal.precoComFaca : ideal.precoSemFaca,
          quantidade: ideal.quantidade,
        } : {}),
      }
      setKanban(prev => prev.map(c => c.id === card.id ? { ...c, ...updates } : c))
      fetch(`/api/kanban/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }).catch(() => {})
    }

    setEditandoHistorico(null)
    setForm(FORM_INICIAL)
    setResult(null)
    setView("orcamentos")
    showToast(`Orçamento ${numero} atualizado.`)
  }

  function abrirPdf(html: string) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url  = URL.createObjectURL(blob)
    const win  = window.open(url, "_blank")
    setTimeout(() => { win?.print(); URL.revokeObjectURL(url) }, 600)
  }

  function downloadPdf(item: { form: FormData; calculo: Calculo; data: string }) {
    abrirPdf(gerarHtmlOrcamento(item))
  }

  async function downloadPdfCliente(item: { form: FormData; calculo: Calculo; data: string }) {
    const telefone = clientes.find(c => c.nome.toLowerCase() === item.form.nomeCliente.trim().toLowerCase())?.telefone
    const { form } = item
    const previewUrl = `${window.location.origin}/box-preview?l=${form.frente}&a=${form.alturaBox}&p=${form.lateral}&v=${form.incluirVerniz ? 1 : 0}`
    let qrDataUrl: string | undefined
    try {
      const QRCode = (await import("qrcode")).default
      qrDataUrl = await QRCode.toDataURL(previewUrl, { width: 180, margin: 1, color: { dark: "#5009c4", light: "#ffffff" } })
    } catch {}
    abrirPdf(gerarHtmlOrcamentoCliente(item, telefone, qrDataUrl, previewUrl))
  }

  async function handleEmitirOS(card: KanbanCard) {
    const histItem = historico.find(h => h.numero === card.numero)
    const refAnterior = historico.find(
      h => h.numero !== card.numero &&
           h.form.nomeCliente.trim().toLowerCase() === card.nomeCliente.trim().toLowerCase()
    )
    const refStr = refAnterior
      ? `${refAnterior.numero} (${refAnterior.form.frente > 0 ? `${refAnterior.form.frente}×${refAnterior.form.lateral}×${refAnterior.form.alturaBox} cm · ` : ""}${refAnterior.data})`
      : null

    const publicUrl = `${window.location.origin}/pedido/${encodeURIComponent(card.numero)}`
    let qrDataUrl: string | undefined
    try {
      const QRCode = (await import("qrcode")).default
      qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 160, margin: 1 })
    } catch { /* sem QR se falhar */ }

    let arquivos: { nome: string; url: string; tipo: string }[] = []
    try {
      const res = await fetch(`/api/pedido/${card.id}/arquivos`)
      if (res.ok) arquivos = await res.json()
    } catch { /* sem arquivos se falhar */ }

    abrirPdf(gerarHtmlOS(card, histItem?.form ?? null, refStr, qrDataUrl, arquivos))
  }

  // Link público para o cliente aprovar o orçamento (o código vem do servidor)
  async function linkAprovacao(numero: string): Promise<string | null> {
    try {
      const r = await fetch(`/api/aprovacao/link?numero=${encodeURIComponent(numero)}`)
      return r.ok ? (await r.json()).url : null
    } catch { return null }
  }

  // Voltar um card no quadro desfaz o que o avanço gravou: datas de fechamento/entrega,
  // prazos das etapas seguintes, envios automáticos a fornecedor e aprovação online.
  // (O rastreio é ajustado em atualizarTracking; lote volta em removeLote.)
  function desfazerAoVoltar(card: KanbanCard, novaColuna: number) {
    const ordem = (c: number) => c === COL_HOT ? 0 : c
    if (card.coluna === COL_PERDIDO || novaColuna === COL_PERDIDO || ordem(novaColuna) >= ordem(card.coluna)) return
    const alvo = ordem(novaColuna)
    const patch: Partial<KanbanCard> = {}
    const desfeito: string[] = []
    if (alvo === 0) {
      if (card.dataFechamento) { patch.dataFechamento = undefined; desfeito.push("data de fechamento") }
      if (card.dataEntregaPrevista) { patch.dataEntregaPrevista = undefined; desfeito.push("entrega prevista") }
    }
    if (card.dataEntregaReal && alvo < COL_ENTREGUE) { patch.dataEntregaReal = undefined; desfeito.push("data de entrega") }
    const chavesDepois = Object.entries(COLUNA_PRAZOS).filter(([c]) => Number(c) > alvo).flatMap(([, ks]) => ks)
    if (card.prazos && chavesDepois.some(k => card.prazos?.[k])) {
      const prazos = { ...card.prazos }
      for (const k of chavesDepois) delete prazos[k]
      patch.prazos = prazos as PrazoEtapas
    }
    if (Object.keys(patch).length) {
      setKanban(prev => prev.map(c => c.id === card.id ? { ...c, ...patch } : c))
      // undefined vira null para apagar no banco
      const corpo: Record<string, unknown> = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? null]))
      fetch(`/api/kanban/${card.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => {})
    }
    // Envios automáticos a fornecedor de etapas que ainda não chegaram
    const config = configAtual.current
    const prod = normalizarProducao(config.producao)
    const movs = desfazerMovimentosAteColuna(prod, card.loteId ? `lote-${card.loteId}` : `card-${card.id}`, alvo)
    if (movs) { salvarConfigTudo({ ...config, producao: { ...prod, movimentos: movs } }); desfeito.push("envios a fornecedor") }
    // Aprovação online deixa de valer
    const aprov = (config.aprovacoesOnline ?? []).filter(a => a.cardId === card.id && !a.desfeita)
    if (alvo === 0 && aprov.length) {
      setConfig(c => ({ ...c, aprovacoesOnline: (c.aprovacoesOnline ?? []).map(a => a.cardId === card.id ? { ...a, visto: true, desfeita: true } : a) }))
      fetch("/api/aprovacao/visto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ numeros: aprov.map(a => a.numero), desfeita: true }) }).catch(() => {})
      desfeito.push("aprovação online")
    }
    if (desfeito.length) showToast(`${card.numero} voltou: desfeito ${desfeito.join(", ")}.`)
  }

  // Cliente aprovou online: o card já está em Fechado; falta lote e sinal (fluxo de sempre)
  function concluirAprovacaoOnline(a: AprovacaoOnline) {
    const card = kanban.find(c => c.id === a.cardId)
    if (!card) return
    // Recompra com outra quantidade: abre o pedido de origem para orçar
    if (a.tipo === "recompra_qtd") {
      setConfig(c => ({ ...c, aprovacoesOnline: (c.aprovacoesOnline ?? []).map(x => x.em === a.em ? { ...x, visto: true } : x) }))
      fetch("/api/aprovacao/visto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ numeros: [a.numero] }) }).catch(() => {})
      abrirDetalheCard(card)
      showToast(`${a.nomeCliente} quer ${a.quantidade.toLocaleString("pt-BR")} un de ${a.pedidoOrigem}. Faça o orçamento e mande o link de aprovação.`)
      return
    }
    const abrirSinal = (loteId?: string, loteNumero?: string) =>
      setModalSinal({ cardId: card.id, nomeCliente: card.nomeCliente, cardNumero: card.numero, loteId, loteNumero, preco: a.preco })
    if (card.loteId) abrirSinal(card.loteId, card.loteNumero)
    else criarLote(card.nomeCliente).then(l => { assignLote(card.id, l.id, l.numero); abrirSinal(l.id, l.numero) }).catch(() => abrirSinal())
    setConfig(c => ({ ...c, aprovacoesOnline: (c.aprovacoesOnline ?? []).map(x => x.numero === a.numero ? { ...x, visto: true } : x) }))
    fetch("/api/aprovacao/visto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ numeros: [a.numero] }) }).catch(() => {})
  }

  async function compartilharWhatsApp(form: FormData, calculo: Calculo, numero?: string) {
    // Abre a janela já no clique (navegadores bloqueiam janelas abertas depois de uma espera)
    const janela = window.open("", "_blank")
    const aprovar = numero ? await linkAprovacao(numero) : null
    const ideal = calculo.tabela.find(l => l.quantidade === calculo.sweetSpotIdealQtd) ?? calculo.tabela[calculo.tabela.length - 1]
    const min   = calculo.tabela.find(l => l.quantidade === calculo.sweetSpotMinimoQtd) ?? calculo.tabela[0]
    const preco = form.comFaca ? ideal.precoComFaca : ideal.precoSemFaca
    const unit  = form.comFaca ? ideal.unitarioComFaca : ideal.unitarioSemFaca
    const parc  = form.comFaca ? ideal.parcela12xComFaca : ideal.parcela12xSemFaca
    const precoMin = form.comFaca ? min.precoComFaca : min.precoSemFaca

    const linhas = [
      `Olá${form.nomeCliente ? `, ${form.nomeCliente}` : ""}! 👋`,
      ``,
      numero ? `Proposta *${numero}* — embalagem personalizada:` : `Segue a proposta para sua embalagem personalizada:`,
      ``,
      `📦 *Especificações*`,
      `• Dimensões: ${form.frente}×${form.alturaBox}×${form.lateral} cm (L×A×P)`,
      form.materialNome ? `• Material: ${form.materialNome}` : null,
      form.incluirVerniz && form.vernizTipo ? `• Verniz: ${form.vernizTipo}` : null,
      form.laminacao && form.laminacaoTipo ? `• Laminação: ${form.laminacaoTipo}` : null,
      form.acompanhamentos?.length ? `• Acompanhamentos: ${form.acompanhamentos.join(", ")}` : null,
      form.outrosAcabamentos?.length ? `• Outros: ${form.outrosAcabamentos.join(", ")}` : null,
      form.comFaca ? `• Faca de corte inclusa` : null,
      ``,
      `💰 *Proposta recomendada*`,
      `• Quantidade: ${num(ideal.quantidade)} unidades`,
      `• Total: *${brl(preco)}*`,
      `• Unitário: ${brl(unit)}/un`,
      `• Parcelado: ${brl(parc)}/mês em 12×`,
      ``,
      min.quantidade !== ideal.quantidade ? `📌 Pedido mínimo: ${num(min.quantidade)} un — ${brl(precoMin)}` : null,
      form.obsCliente ? `\n📝 ${form.obsCliente}` : null,
      ``,
      `⏳ Proposta válida por ${form.validadeDias} dias.`,
      aprovar ? `\n👉 *Veja sua proposta em 3D e aprove:* ${aprovar}` : null,
      ``,
      `Qualquer dúvida, é só falar! 😊`,
    ].filter(l => l !== null).join("\n")

    const clienteSalvo = clientes.find(c => c.nome.toLowerCase() === form.nomeCliente.trim().toLowerCase())
    const phone = clienteSalvo?.telefone?.replace(/\D/g, "")
    const base  = phone ? `https://wa.me/55${phone}` : `https://wa.me/`
    const url = `${base}?text=${encodeURIComponent(linhas)}`
    if (janela) janela.location.href = url
    else window.open(url, "_blank")
  }

  function excluirHistorico(index: number) {
    const item = historico[index]
    setHistorico(prev => prev.filter((_, i) => i !== index))
    if (item?.numero) {
      const card = kanban.find(c => c.numero === item.numero)
      setKanban(prev => prev.filter(c => c.numero !== item.numero))
      fetch(`/api/historico/${encodeURIComponent(item.numero)}`, { method: "DELETE" }).catch(() => {})
      if (card) fetch(`/api/kanban/${card.id}`, { method: "DELETE" }).catch(() => {})
    }
  }

  function exportarDados() {
    const payload = {
      versao: 1,
      exportadoEm: new Date().toISOString(),
      historico,
      contador,
      clientes,
      propostasCustom,
      contadorProp,
      kanban,
      config,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `enyla-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function importarDados(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const d = JSON.parse(e.target?.result as string)
        if (d.versao !== 1) { alert("Arquivo de backup inválido ou versão incompatível."); return }
        if (d.historico)      setHistorico(d.historico)
        if (d.contador)       setContador(d.contador)
        if (d.clientes)       setClientes(d.clientes)
        if (d.propostasCustom) setPropostasCustom(d.propostasCustom)
        if (d.contadorProp)   setContadorProp(d.contadorProp)
        if (d.kanban)         setKanban(d.kanban)
        if (d.config)         { const cfg = { ...CONFIG_PADRAO, ...d.config }; setConfig(cfg); setResult(calcular(form, cfg)) }
        showToast("Backup restaurado com sucesso!")
      } catch {
        alert("Erro ao ler o arquivo. Verifique se é um backup válido.")
      }
    }
    reader.readAsText(file)
  }

  function salvarPropostaCustom(draft: Omit<PropostaCustom, "id" | "numero" | "cardId">): PropostaCustom {
    const data = draft.data || new Date().toLocaleString("pt-BR")
    const ano  = new Date().getFullYear()
    const novoContador = contadorProp + 1
    const numero = `PRP-${ano}-${String(novoContador).padStart(3, "0")}`
    setContadorProp(novoContador)

    const cardId = `prop-${Date.now()}`
    const linhasAtivas = draft.linhas.filter(l => l.ativa && l.quantidade > 0 && l.unitario > 0)
    const idealLinha = linhasAtivas.find(l => l.isIdeal) ?? linhasAtivas[linhasAtivas.length - 1]

    const novaProposta: PropostaCustom = { ...draft, id: cardId, numero, data, cardId }
    setPropostasCustom(prev => [novaProposta, ...prev])
    fetch("/api/propostas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...novaProposta, contadorProp: novoContador }),
    }).catch(() => {})

    if (idealLinha) {
      const card: KanbanCard = {
        id: cardId,
        numero,
        nomeCliente: draft.nomeCliente || "Sem nome",
        dimensoes: draft.dimensoes || draft.descricao || "Proposta personalizada",
        materialNome: draft.material,
        preco: idealLinha.unitario * idealLinha.quantidade,
        quantidade: idealLinha.quantidade,
        data,
        coluna: 0,
        opcoes: linhasAtivas.map(l => ({
          quantidade: l.quantidade,
          preco: l.unitario * l.quantidade,
          unitario: l.unitario,
        })),
      }
      setKanban(prev => [card, ...prev])
      fetch("/api/kanban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card),
      }).catch(() => {})
      criarTracking(card)
    }

    // Criar cards para itens terceirizados
    const terceirs = (draft.terceirizados ?? []).filter(t => t.nome.trim())
    for (let i = 0; i < terceirs.length; i++) {
      const t = terceirs[i]
      const tContador = novoContador + 1 + i
      const tNumero = `PRP-${ano}-${String(tContador).padStart(3, "0")}`
      const tCardId = `prop-${Date.now()}-t${i}`
      const tCard: KanbanCard = {
        id: tCardId,
        numero: tNumero,
        nomeCliente: draft.nomeCliente || "Sem nome",
        dimensoes: t.descricao || t.nome,
        materialNome: "Terceirizado",
        preco: t.precoTotal,
        quantidade: t.quantidade,
        data,
        coluna: COL_FECHADO,
        loteId: t.loteId || undefined,
        loteNumero: t.loteNumero || undefined,
        fornecedor: t.fornecedor || undefined,
        custoTerceiro: t.custoTotal || undefined,
        isTerceirizado: true,
        dataFechamento: new Date().toISOString().slice(0, 10),
      }
      setKanban(prev => [...prev, tCard])
      fetch("/api/kanban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tCard),
      }).catch(() => {})
    }
    if (terceirs.length > 0) setContadorProp(novoContador + terceirs.length)

    const nomeClean = draft.nomeCliente.trim()
    if (nomeClean && !clientes.some(c => c.nome.toLowerCase() === nomeClean.toLowerCase())) {
      const novoCliente = { id: Date.now().toString(), nome: nomeClean, criadoEm: data }
      setClientes(prev => {
        if (prev.some(c => c.nome.toLowerCase() === nomeClean.toLowerCase())) return prev
        return [...prev, novoCliente]
      })
      fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novoCliente),
      }).catch(() => {})
    }
    return novaProposta
  }

  function compartilharWhatsAppCustom(p: PropostaCustom) {
    const linhasAtivas = p.linhas.filter(l => l.ativa && l.quantidade > 0)
    const ideal = linhasAtivas.find(l => l.isIdeal) ?? linhasAtivas[linhasAtivas.length - 1]
    const min   = linhasAtivas[0]
    if (!ideal) return

    const linhas = [
      `Olá${p.nomeCliente ? `, ${p.nomeCliente}` : ""}! 👋`,
      ``,
      `Proposta *${p.numero}* — embalagem personalizada:`,
      p.descricao ? `📦 ${p.descricao}` : null,
      p.dimensoes ? `📐 Dimensões: ${p.dimensoes}` : null,
      p.material  ? `🧾 Material: ${p.material}` : null,
      ``,
      `💰 *Proposta recomendada*`,
      `• Quantidade: ${num(ideal.quantidade)} unidades`,
      `• Total: *${brl(ideal.unitario * ideal.quantidade)}*`,
      `• Unitário: ${brl(ideal.unitario)}/un`,
      `• Parcelado: ${brl((ideal.unitario * ideal.quantidade * p.parcFator) / 12)}/mês em 12×`,
      min !== ideal ? `\n📌 Pedido mínimo: ${num(min.quantidade)} un — ${brl(min.unitario * min.quantidade)}` : null,
      p.obsCliente ? `\n📝 ${p.obsCliente}` : null,
      ``,
      `⏳ Proposta válida por ${p.validadeDias ?? 7} dias.`,
      ``,
      `Qualquer dúvida, é só falar! 😊`,
    ].filter(l => l !== null).join("\n")

    const clienteSalvo = clientes.find(c => c.nome.toLowerCase() === p.nomeCliente.trim().toLowerCase())
    const phone = clienteSalvo?.telefone?.replace(/\D/g, "")
    const base  = phone ? `https://wa.me/55${phone}` : `https://wa.me/`
    window.open(`${base}?text=${encodeURIComponent(linhas)}`, "_blank")
  }

  function qualDe(q: number): "Digital" | "Offset" {
    return (form.qualidades ?? {})[q] ?? (q < 1000 ? "Digital" : "Offset")
  }
  function toggleQual(q: number) {
    const cur = qualDe(q)
    set("qualidades", { ...(form.qualidades ?? {}), [q]: cur === "Digital" ? "Offset" : "Digital" })
  }

  function addQtd() {
    const v = parseInt(novaQtd)
    if (!v || v <= 0 || form.quantidades.includes(v)) return
    set("quantidades", [...form.quantidades, v].sort((a, b) => a - b))
    setNovaQtd("")
  }

  const r = result
  const clienteAtual = clientes.find(c => c.nome.toLowerCase() === form.nomeCliente.trim().toLowerCase())

  return (
    <div className="h-screen flex overflow-hidden text-[13px]" style={{ background: "var(--bg-page)" }}>

      {/* ── Left Navigation Sidebar ─────────────────────────────────────── */}
      <nav className="w-[220px] shrink-0 flex flex-col print:hidden z-20"
        style={{ background: "#080512", borderRight: "1px solid rgba(255,255,255,0.06)" }}>

        {/* Brand */}
        <div className="px-4 pt-5 pb-4 shrink-0">
          <div className="flex items-center">
            <div className="min-w-0 flex-1">
              <Image src="/brand/enyla-wordmark-light.png" alt="Enyla" width={1335} height={328}
                className="h-5 w-auto" priority />
            </div>
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              title={isDark ? "Mudar para claro" : "Mudar para escuro"}
              className="relative shrink-0 cursor-pointer border-none p-0"
              style={{ width: 44, height: 24, borderRadius: 12, background: "rgba(255,255,255,0.12)" }}
            >
              <div className="absolute top-[3px] w-[18px] h-[18px] rounded-full transition-all duration-150"
                style={{ left: isDark ? 23 : 3, background: "#a582ff" }} />
            </button>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 px-2 pb-2 overflow-y-auto" style={{ scrollbarWidth: "none" }}>

          {/* Search */}
          <button
            onClick={() => setBuscaAberta(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 mb-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors group"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <span className="flex-1 text-left text-[12px] font-medium">Buscar</span>
            <kbd className="text-[9px] bg-white/[0.07] text-zinc-500 group-hover:text-zinc-400 px-1.5 py-0.5 rounded font-medium shrink-0">⌘K</kbd>
          </button>

          <NavItem active={view === "painel"} onClick={() => navigate("painel")} label="Painel"
            icon={<LayoutDashboard className="w-4 h-4" strokeWidth={1.8} />} />

          <NavGroup label="Vendas" />
          <NavItem active={view === "orcamentos" || view === "historico" || view === "orcamento"} onClick={() => navigate("orcamentos")} label="Orçamentos"
            icon={<FileText className="w-4 h-4" strokeWidth={1.8} />} />
          <NavItem active={view === "pedidos"} onClick={() => navigate("pedidos")} label="Pedidos"
            icon={<Package className="w-4 h-4" strokeWidth={1.8} />} />
          <NavItem active={view === "clientes"} onClick={() => navigate("clientes")} label="Clientes"
            icon={<Users className="w-4 h-4" strokeWidth={1.8} />} />

          <NavGroup label="Produção" />
          <NavItem active={view === "fornecedores"} onClick={() => navigate("fornecedores")} label="Fornecedores"
            icon={<Factory className="w-4 h-4" strokeWidth={1.8} />} />

          <NavGroup label="Gestão" />
          <NavItem active={view === "financeiro"} onClick={() => navigate("financeiro")} label="Financeiro"
            icon={<Wallet className="w-4 h-4" strokeWidth={1.8} />} />
          <NavItem active={view === "dashboard"} onClick={() => navigate("dashboard")} label="Relatórios"
            icon={<BarChart3 className="w-4 h-4" strokeWidth={1.8} />} />
          <NavItem active={view === "parceiros" || view === "terceirizados"} onClick={() => navigate("parceiros")} label="Parceiros"
            icon={<Handshake className="w-4 h-4" strokeWidth={1.8} />} />

          <NavGroup label="Ferramentas" />
          <NavItem active={view === "meta"} onClick={() => navigate("meta")} label="Campanhas"
            icon={<Megaphone className="w-4 h-4" strokeWidth={1.8} />} />
          <NavItem active={view === "whatsapp"} onClick={() => navigate("whatsapp")} label="WhatsApp"
            icon={<MessageCircle className="w-4 h-4" strokeWidth={1.8} />} />
          <NavItem active={view === "forma"} onClick={() => navigate("forma")} label="Forma IA"
            icon={<Box className="w-4 h-4" strokeWidth={1.8} />} />
          <NavItem active={view === "ideias"} onClick={() => navigate("ideias")} label="Ideias"
            icon={<Lightbulb className="w-4 h-4" strokeWidth={1.8} />} badge={(config.ideias ?? []).filter(i => i.status !== "feita").length || undefined} />
        </div>

        {/* Sidebar gamificação widgets */}
        <div className="px-0 pt-2 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <SidebarGamificacao
            kanban={kanban}
            lancamentos={lancamentos}
            metaMensal={config.metaMensal}
            baselineFaturamento={config.baselineFaturamento}
            marcos={normalizarMetas(config.metas).marcos}
            onClick={() => navigate("painel")}
          />
        </div>

        {/* Bottom: Nova Proposta + Config */}
        <div className="px-2 py-3 shrink-0 space-y-1" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <button
            onClick={() => setModalPropostaCustom(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12.5px] font-semibold transition-all duration-100 text-white mb-1 bg-[#8456e8] hover:bg-[#7445d4] active:bg-[#6234bc]">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nova Proposta
          </button>
          <NavItem active={view === "config"} onClick={() => navigate("config")} label="Configurações"
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>}
          />
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-2 px-2.5 py-2 mt-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] transition-colors text-[13px] font-medium"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            Sair
          </button>
        </div>
      </nav>

      {/* ── Modal: pré-visualização DXF ─────────────────────────────────────── */}
      {dxfPreview && (() => {
        const { result, nome } = dxfPreview
        const { bounds, paths, largura, altura } = result
        const gW = bounds.maxX - bounds.minX
        const gH = bounds.maxY - bounds.minY
        const PW = 480, PH = 300, PP = 24
        const sg = Math.min((PW - PP * 2) / gW, (PH - PP * 2) / gH)
        const tx = PP + (PW - PP * 2 - gW * sg) / 2 - bounds.minX * sg
        const ty = PP + (PH - PP * 2 - gH * sg) / 2 + bounds.maxY * sg
        const geoTransform = `translate(${tx}, ${ty}) scale(${sg}, ${-sg})`
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDxfPreview(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-[rgba(60,60,67,0.1)]">
              {/* Header */}
              <div className="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-[rgba(60,60,67,0.08)]">
                <div className="w-8 h-8 rounded-xl bg-[#8456e8]/10 flex items-center justify-center shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8456e8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#1c1c1e] truncate">{nome}</p>
                  <p className="text-[11px] text-[#8E8E93]">
                    {(largura / 10).toFixed(1)} × {(altura / 10).toFixed(1)} cm — {result.source === "extents" ? "extents CAD" : "scan coords"}
                  </p>
                </div>
                <button onClick={() => setDxfPreview(null)}
                  className="text-[#8E8E93] hover:text-[#1c1c1e] transition-colors p-1">
                  ✕
                </button>
              </div>

              {/* SVG Preview */}
              <div className="bg-[#f2f2f7] mx-4 my-3 rounded-xl overflow-hidden">
                <svg width={PW} height={PH} viewBox={`0 0 ${PW} ${PH}`} className="block w-full">
                  {/* background */}
                  <rect x={0} y={0} width={PW} height={PH} fill="#f2f2f7" />
                  <g transform={geoTransform}>
                    <rect x={bounds.minX} y={bounds.minY}
                      width={gW} height={gH} fill="white" />
                    {paths.misc && <path d={paths.misc} fill="none"
                      stroke="#22c55e" strokeWidth={0.5}
                      vectorEffect="non-scaling-stroke" strokeOpacity={0.5} />}
                    {paths.folds && <path d={paths.folds} fill="none"
                      stroke="#dc2626" strokeWidth={0.65}
                      vectorEffect="non-scaling-stroke"
                      strokeDasharray="4 2" />}
                    {paths.cuts && <path d={paths.cuts} fill="none"
                      stroke="#8456e8" strokeWidth={0.9}
                      vectorEffect="non-scaling-stroke" />}
                  </g>
                </svg>
              </div>

              {/* Legend */}
              <div className="flex gap-4 px-5 pb-3 text-[10.5px] text-[#8E8E93]">
                <span className="flex items-center gap-1.5"><span className="w-4 h-px bg-[#8456e8] block" />corte</span>
                <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-red-500 block" />vinco</span>
                {paths.misc && <span className="flex items-center gap-1.5"><span className="w-4 h-px bg-green-500 block opacity-50" />sangria</span>}
              </div>

              {/* Actions */}
              <div className="flex gap-2 px-5 pb-5">
                <button onClick={() => setDxfPreview(null)}
                  className="flex-1 py-2.5 rounded-xl border border-[rgba(60,60,67,0.14)] text-[13px] font-medium text-[#5e5c68] hover:bg-[rgba(116,116,128,0.06)] transition-colors">
                  Cancelar
                </button>
                <button onClick={() => {
                  setDxfNome(nome)
                  setDxfGeo({ bounds: result.bounds, paths: result.paths })
                  setForm(p => {
                    const next = { ...p, blankOverride: { largura: result.largura, altura: result.altura } }
                    setResult(calcular(next, config))
                    return next
                  })
                  setDxfPreview(null)
                  showToast(`DXF importado: ${(largura / 10).toFixed(1)} × ${(altura / 10).toFixed(1)} cm`)
                }}
                  className="flex-1 py-2.5 rounded-xl bg-[#8456e8] text-white text-[13px] font-semibold hover:bg-[#7343d9] transition-colors">
                  Importar dieline
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-[#0b0914] text-white text-[12.5px] font-medium px-4 py-3 rounded-xl shadow-lg border border-white/[0.08]">
          <span className="w-2 h-2 rounded-full bg-[#009351] shrink-0" />
          {toast}
        </div>
      )}

      {notifWA && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-white border border-[rgba(0,0,0,0.1)] rounded-2xl shadow-2xl px-4 py-3 w-[340px]">
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-semibold text-[#191625] truncate">Notificar {notifWA.nomeCliente.split(" ")[0]}?</p>
            <p className="text-[11px] text-[#8E8E93] truncate">{notifWA.etapa} · {notifWA.numero}</p>
          </div>
          <a
            href={(() => {
              const firstName = notifWA.nomeCliente.split(" ")[0]
              const url = notifWA.portal ?? `${typeof window !== "undefined" ? window.location.origin : ""}/track/${encodeURIComponent(notifWA.numero)}`
              const msg = `Olá, ${firstName}! 🎉 Seu pedido *${notifWA.numero}* avançou para: *${notifWA.etapa}*.\n\nAcompanhe seus pedidos:\n${url}`
              return `https://wa.me/55${notifWA.telefone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`
            })()}
            target="_blank"
            rel="noreferrer"
            onClick={() => setNotifWA(null)}
            className="shrink-0 flex items-center gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white text-[11.5px] font-semibold px-3 py-1.5 rounded-xl transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.847L0 24l6.335-1.502A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.373l-.36-.214-3.724.882.897-3.63-.235-.374A9.817 9.817 0 0 1 2.182 12c0-5.42 4.398-9.818 9.818-9.818 5.42 0 9.818 4.398 9.818 9.818 0 5.42-4.398 9.818-9.818 9.818z"/></svg>
            Enviar
          </a>
          <button onClick={() => setNotifWA(null)} className="shrink-0 text-[#8E8E93] hover:text-[#191625] transition-colors p-0.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      {/* ── Layout principal ────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ──── SIDEBAR ──────────────────────────────────────────────────────── */}
        {view === "orcamento" && orcTab === "padrao" && (
        <aside className="w-72 shrink-0 border-r flex flex-col overflow-y-auto print:hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>

          {/* Seção: Cliente */}
          <FormSection label="Cliente">
            <ClienteCombobox
              value={form.nomeCliente}
              onChange={v => set("nomeCliente", v)}
              clientes={clientes}
            />
            {form.nomeCliente.trim() && (
              <ClienteContactCard
                key={clienteAtual?.id ?? `draft-${form.nomeCliente}`}
                cliente={clienteAtual ?? null}
                nome={form.nomeCliente.trim()}
                onUpdate={updates =>
                  clienteAtual
                    ? atualizarCliente(clienteAtual.id, updates)
                    : criarClienteComDados(form.nomeCliente.trim(), updates)
                }
              />
            )}
          </FormSection>

          {/* Seção: Dieline Pacdora */}
          <FormSection label="Dieline Pacdora">
            {form.blankOverride ? (
              <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 border-[#009351]/25 bg-[#009351]/[0.04]">
                <div className="flex-1 min-w-0">
                  <p className="text-[11.5px] font-semibold text-[#009351] truncate flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 shrink-0" /> {dxfNome ?? "dieline.dxf"}
                  </p>
                  <p className="text-[10px] text-[#8E8E93] mt-0.5">
                    Blank: {(form.blankOverride.largura / 10).toFixed(1)} × {(form.blankOverride.altura / 10).toFixed(1)} cm
                  </p>
                </div>
                <button type="button"
                  onClick={() => { setForm(p => { const next = { ...p, blankOverride: null }; setResult(calcular(next, config)); return next }); setDxfNome(null); setDxfGeo(null) }}
                  className="text-[#8E8E93] hover:text-rose-500 text-sm transition-colors shrink-0 px-1">
                  ✕
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-1.5 px-4 py-5 rounded-xl border-2 border-dashed border-[rgba(60,60,67,0.14)] hover:border-[#8456e8]/40 hover:bg-[#8456e8]/[0.02] cursor-pointer transition-all">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8456e8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span className="text-[12px] font-semibold text-[#8456e8]/80">Importar .dxf do Pacdora</span>
                <span className="text-[10px] text-[#8E8E93] text-center leading-relaxed">Blank size extraído automaticamente<br/>Calcula nesting e preço na hora</span>
                <input type="file" accept=".dxf,.DXF" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = ev => {
                      const text = ev.target?.result as string
                      const result = parseDXF(text)
                      if (!result) { showToast("Não foi possível ler o DXF — tente exportar em formato AutoCAD 2000 ou 2004."); return }
                      setDxfPreview({ result, nome: file.name })
                    }
                    reader.readAsText(file)
                    e.target.value = ""
                  }}
                />
              </label>
            )}
          </FormSection>

          {/* Seção: Tipo de caixa — só aparece sem DXF */}
          {!form.blankOverride && (
            <FormSection label="Tipo de caixa">
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["simples",          "Cartucho Simples",    "Tuck encaixe topo/fundo"],
                  ["aviao",            "Cartucho Avião",      "Tampa aba profunda"],
                  ["fundo-automatico", "Fundo Automático",    "Auto-lock bottom"],
                  ["americano",        "Americano",           "4 abas encaixadas"],
                ] as [TipoCaixa, string, string][]).map(([tipo, nome, desc]) => (
                  <button key={tipo} type="button"
                    onClick={() => setForm(p => { const next = { ...p, tipoCaixa: tipo }; setResult(calcular(next, config)); return next })}
                    className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border-2 text-left transition-all duration-150 ${
                      form.tipoCaixa === tipo
                        ? "border-[#8456e8]/30 bg-[#8456e8]/[0.04] shadow-sm"
                        : "border-[rgba(60,60,67,0.08)] hover:border-[rgba(60,60,67,0.12)] hover:bg-[rgba(116,116,128,0.04)]"
                    }`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        form.tipoCaixa === tipo ? "border-[#8456e8] bg-[#8456e8]" : "border-slate-300"
                      }`}>
                        {form.tipoCaixa === tipo && <div className="w-1 h-1 rounded-full bg-white" />}
                      </div>
                      <span className={`text-[12px] font-semibold ${form.tipoCaixa === tipo ? "text-[#8456e8]" : "text-[#5e5c68]"}`}>{nome}</span>
                    </div>
                    <span className="text-[10px] text-[#8E8E93] ml-5">{desc}</span>
                  </button>
                ))}
              </div>
            </FormSection>
          )}

          {/* Seção: Dimensões — só aparece sem DXF */}
          {!form.blankOverride && (
            <FormSection label="Dimensões da caixa (cm)">
              <div className="grid grid-cols-3 gap-2">
                {(["frente","alturaBox","lateral"] as const).map(c => (
                  <div key={c}>
                    <Label>{c === "frente" ? "Largura" : c === "alturaBox" ? "Altura" : "Profundidade"}</Label>
                    <NumberInput value={form[c]} onChange={v => setDim(c, v)} />
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <Label>Aba de colagem (cm)</Label>
                <NumberInput value={form.abaColagem} onChange={v => setDim("abaColagem", v)} min={0.5} max={2} />
              </div>
            </FormSection>
          )}

          {/* Seção: Material */}
          <FormSection label="Material / Gramatura">
            <div className="flex flex-col gap-1.5">
              {config.materiais.map(m => (
                <button key={m.id} type="button"
                  onClick={() => { set("materialId", m.id); set("materialNome", m.nome) }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border-2 text-left transition-all duration-150 ${
                    form.materialId === m.id
                      ? "border-[#8456e8]/30 bg-[#8456e8]/[0.04] shadow-sm"
                      : "border-[rgba(60,60,67,0.08)] hover:border-[rgba(60,60,67,0.12)] hover:bg-[rgba(116,116,128,0.04)]/50"
                  }`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-150 ${
                    form.materialId === m.id ? "border-[#8456e8] bg-[#8456e8]" : "border-slate-300"
                  }`}>
                    {form.materialId === m.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className={`text-[12.5px] font-medium transition-colors ${
                    form.materialId === m.id ? "text-[#8456e8]" : "text-[#5e5c68]"
                  }`}>{m.nome}</span>
                </button>
              ))}
            </div>
          </FormSection>

          {/* Seção: Produção */}
          <FormSection label="Produção">
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <Label>Nº SKUs</Label>
                <NumberInput value={form.numSKUs} min={1}
                  onChange={v => { const n = Math.max(1, v); setForm(p => { const next = {...p, numSKUs: n, numArtes: n}; setResult(calcular(next, config)); return next }) }} />
              </div>
              <div>
                <Label>Nº Artes</Label>
                <NumberInput value={form.numArtes} min={1} onChange={v => set("numArtes", Math.max(1, v))} />
              </div>
            </div>

            {/* ── Verniz: toggle + tipos na mesma linha ── */}
            <div className="flex items-center gap-2 min-h-[28px]">
              <label className="flex items-center gap-2 cursor-pointer select-none shrink-0"
                onClick={() => {
                  const on = !form.incluirVerniz
                  mudarForm(p => ({ ...p, incluirVerniz: on, vernizTipo: on ? (p.vernizTipo || "UV Total") : "" }))
                }}>
                <div className={`w-7 h-4 rounded-full transition-colors relative flex-shrink-0 ${form.incluirVerniz ? "bg-[#8456e8]" : "bg-slate-200"}`}>
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${form.incluirVerniz ? "translate-x-3" : "translate-x-0.5"}`} />
                </div>
                <span className="text-[12px] text-[#72707d] w-[62px]">Verniz</span>
              </label>
              {form.incluirVerniz ? (
                <div className="flex gap-1 flex-wrap">
                  {TIPOS_VERNIZ.map(t => (
                    <button key={t} type="button" onClick={() => mudarForm(p => ({ ...p, vernizTipo: t }))}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
                        form.vernizTipo === t ? "bg-[#8456e8] text-white border-[#8456e8]" : "border-[rgba(60,60,67,0.14)] text-[#8E8E93] hover:border-[#8456e8] hover:text-[#8456e8]"
                      }`}>{t}</button>
                  ))}
                </div>
              ) : (
                <span className="text-[#8E8E93] text-[11px] ml-auto">{brl(config.custos.vernizPor2000)}/2k</span>
              )}
            </div>

            {/* ── Laminação: toggle + tipos na mesma linha ── */}
            <div className="flex items-center gap-2 min-h-[28px]">
              <label className="flex items-center gap-2 cursor-pointer select-none shrink-0"
                onClick={() => {
                  const on = !form.laminacao
                  mudarForm(p => ({ ...p, laminacao: on, laminacaoTipo: on ? (p.laminacaoTipo || "Fosca") : "" }))
                }}>
                <div className={`w-7 h-4 rounded-full transition-colors relative flex-shrink-0 ${form.laminacao ? "bg-[#8456e8]" : "bg-slate-200"}`}>
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${form.laminacao ? "translate-x-3" : "translate-x-0.5"}`} />
                </div>
                <span className="text-[12px] text-[#72707d] w-[62px]">Laminação</span>
              </label>
              {form.laminacao && (
                <div className="flex gap-1 flex-wrap">
                  {TIPOS_LAMINACAO.map(t => (
                    <button key={t} type="button" onClick={() => mudarForm(p => ({ ...p, laminacaoTipo: t }))}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
                        form.laminacaoTipo === t ? "bg-[#8456e8] text-white border-[#8456e8]" : "border-[rgba(60,60,67,0.14)] text-[#8E8E93] hover:border-[#8456e8] hover:text-[#8456e8]"
                      }`}>{t}</button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Extras: todos os outros em um bloco compacto ── */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {([...OUTROS_ACABAMENTOS, ...ACOMPANHAMENTOS] as string[]).map(a => {
                const isAcomp = (ACOMPANHAMENTOS as readonly string[]).includes(a)
                const list: string[] = isAcomp ? form.acompanhamentos : form.outrosAcabamentos
                const on = list.includes(a)
                return (
                  <button key={a} type="button"
                    onClick={() => {
                      const field = isAcomp ? "acompanhamentos" : "outrosAcabamentos"
                      mudarForm(p => ({ ...p, [field]: on ? p[field].filter((x: string) => x !== a) : [...p[field], a] }))
                    }}
                    className={`px-3 py-1 rounded-full text-[11.5px] font-medium border transition-all ${
                      on ? "bg-[#0b0914] text-white border-[#0b0914]" : "border-[rgba(60,60,67,0.14)] text-[#72707d] hover:border-slate-400 hover:text-slate-700"
                    }`}>{a}</button>
                )
              })}
            </div>

            {/* Faca */}
            <div className="pt-1">
              <Label>Faca de corte</Label>
              <div className="flex rounded-xl border border-[rgba(60,60,67,0.12)] overflow-hidden mt-1">
                {([true, false] as const).map((v, i) => (
                  <button key={i} type="button"
                    onClick={() => { set("comFaca", v); if (!v) set("valorFaca", 0) }}
                    className={`flex-1 py-2 text-[12px] font-medium transition-colors ${
                      form.comFaca === v
                        ? "bg-[#0b0914] text-white"
                        : "text-[#8E8E93] hover:bg-[rgba(116,116,128,0.04)]"
                    }`}>
                    {v ? "Com faca" : "Sem faca"}
                  </button>
                ))}
              </div>
              {form.comFaca && (
                <div className="mt-2 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E93] text-xs">R$</span>
                  <input type="number" min={0}
                    value={form.valorFaca || ""}
                    onChange={e => set("valorFaca", Number(e.target.value))}
                    placeholder="Valor da faca"
                    className="w-full h-10 border border-[rgba(60,60,67,0.12)] rounded-xl pl-8 pr-3 py-2 text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] hover:border-slate-300 transition-all duration-150" />
                </div>
              )}
            </div>
          </FormSection>

          {/* Seção: Quantidades */}
          <FormSection label="Quantidades">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.quantidades.map(q => {
                const qual = qualDe(q)
                return (
                  <span key={q} className="inline-flex items-center gap-1 text-[11.5px] ds-num bg-[rgba(116,116,128,0.08)] text-[#5e5c68] px-2 py-1 rounded-full font-medium">
                    {num(q)}
                    <button
                      onClick={() => toggleQual(q)}
                      title="Clique para alternar Digital / Offset"
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full transition-colors ${
                        qual === "Digital"
                          ? "bg-[rgba(116,116,128,0.18)] text-[#64748b] hover:bg-[rgba(116,116,128,0.3)]"
                          : "bg-[#8456e8]/[0.12] text-[#8456e8] hover:bg-[#8456e8]/20"
                      }`}
                    >{qual}</button>
                    <button onClick={() => set("quantidades", form.quantidades.filter(x => x !== q))}
                      className="text-[#8E8E93] hover:text-rose-500 leading-none transition-colors">×</button>
                  </span>
                )
              })}
            </div>
            <div className="flex gap-1.5">
              <input type="number" value={novaQtd}
                onChange={e => setNovaQtd(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addQtd()}
                placeholder="Adicionar quantidade…"
                className="flex-1 border border-[rgba(60,60,67,0.12)] rounded-xl px-3 py-1.5 text-[13px] text-slate-900 placeholder:text-[#898892] focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8]" />
              <button onClick={addQtd}
                className="px-3 bg-[#8456e8] hover:bg-[#7445d4] text-white rounded-lg text-sm font-bold transition-colors">+</button>
            </div>
          </FormSection>

          {/* Seção: Observações */}
          <FormSection label="Observações">
            <div className="space-y-3">
              <div>
                <Label>Validade da proposta (dias)</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {[7, 15, 30].map(d => (
                    <button key={d} type="button"
                      onClick={() => set("validadeDias", d)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                        form.validadeDias === d
                          ? "bg-[#0b0914] text-white border-slate-900"
                          : "border-[rgba(60,60,67,0.12)] text-[#8E8E93] hover:bg-[rgba(116,116,128,0.04)]"
                      }`}>
                      {d} dias
                    </button>
                  ))}
                  <input type="number" min={1} max={365}
                    value={form.validadeDias}
                    onChange={e => set("validadeDias", Math.max(1, Number(e.target.value)))}
                    className="w-20 border border-[rgba(60,60,67,0.12)] rounded-lg px-2 py-1.5 text-xs text-slate-900 text-center focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8]"
                    title="Valor personalizado"
                  />
                </div>
              </div>
              <div>
                <Label>Interna (só na gráfica)</Label>
                <textarea
                  value={form.obsInterna}
                  onChange={e => set("obsInterna", e.target.value)}
                  placeholder="Notas internas, condições especiais, prazo…"
                  rows={3}
                  className="w-full border border-[rgba(60,60,67,0.12)] rounded-xl px-3 py-2 text-[13px] text-slate-900 placeholder:text-[#898892] resize-none focus:outline-none focus:ring-2 focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] transition"
                />
              </div>
              <div>
                <Label>Para o cliente</Label>
                <textarea
                  value={form.obsCliente}
                  onChange={e => set("obsCliente", e.target.value)}
                  placeholder="Aparece na proposta enviada ao cliente…"
                  rows={3}
                  className="w-full border border-[rgba(60,60,67,0.12)] rounded-xl px-3 py-2 text-[13px] text-slate-900 placeholder:text-[#898892] resize-none focus:outline-none focus:ring-2 focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] transition"
                />
              </div>
            </div>
          </FormSection>

          {/* Ações */}
          <div className="p-5 mt-auto space-y-2 border-t border-[rgba(60,60,67,0.08)] bg-white">
            {editandoHistorico && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#8456e8]/[0.06] border border-[#8456e8]/15">
                <p className="text-[11.5px] font-semibold text-[#8456e8]">Editando {editandoHistorico}</p>
                <button onClick={cancelarEdicaoHistorico}
                  className="text-[11px] font-medium text-[#8E8E93] hover:text-[#191625] transition-colors">
                  Cancelar
                </button>
              </div>
            )}
            <button onClick={editandoHistorico ? salvarEdicaoHistorico : salvar} disabled={!r}
              className="w-full h-11 bg-[#8456e8] hover:bg-[#7445d4] active:bg-[#6234bc] active:scale-[0.99] disabled:opacity-30 disabled:cursor-not-allowed text-white text-[13px] font-bold rounded-xl transition-all duration-150 shadow-sm shadow-[#8456e8]/15 disabled:shadow-none">
              {editandoHistorico ? "Salvar alterações" : "Salvar orçamento"}
            </button>
            {r && (
              <>
                <button onClick={() => compartilharWhatsApp(form, r)}
                  className="w-full h-10 bg-[#25D366] hover:bg-[#20bd5a] active:bg-[#1aaa4f] text-white text-[12.5px] font-semibold rounded-xl transition-all duration-150 flex items-center justify-center gap-2 shadow-sm shadow-green-600/10">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.847L0 24l6.335-1.502A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.373l-.36-.214-3.724.882.897-3.63-.235-.374A9.817 9.817 0 0 1 2.182 12c0-5.42 4.398-9.818 9.818-9.818 5.42 0 9.818 4.398 9.818 9.818 0 5.42-4.398 9.818-9.818 9.818z"/></svg>
                  Enviar via WhatsApp
                </button>
                <div className="flex gap-2">
                  <button onClick={() => downloadPdf({ form, calculo: r, data: new Date().toLocaleString("pt-BR") })}
                    className="flex-1 h-9 border border-[rgba(60,60,67,0.12)] hover:border-slate-300 hover:bg-[rgba(116,116,128,0.04)] text-[#72707d] text-[11.5px] font-medium rounded-xl transition-all duration-150">
                    PDF Gráfica
                  </button>
                  <button onClick={() => downloadPdfCliente({ form, calculo: r, data: new Date().toLocaleString("pt-BR") })}
                    className="flex-1 h-9 border border-[#8456e8]/25 hover:border-[#8456e8]/40 hover:bg-[#8456e8]/[0.04] text-[#8456e8] text-[11.5px] font-medium rounded-xl transition-all duration-150">
                    PDF Cliente
                  </button>
                </div>
              </>
            )}
            <div className="flex gap-2">
              <button onClick={() => window.print()}
                className="flex-1 h-9 border border-[rgba(60,60,67,0.12)] hover:bg-[rgba(116,116,128,0.04)] text-[#8E8E93] text-[11.5px] font-medium rounded-xl transition-all duration-150">
                Imprimir
              </button>
              <button onClick={() => { setForm(FORM_INICIAL); setResult(null); setDxfNome(null) }}
                className="flex-1 h-9 border border-[rgba(60,60,67,0.12)] hover:bg-[rgba(116,116,128,0.04)] text-[#8E8E93] text-[11.5px] font-medium rounded-xl transition-all duration-150">
                Limpar
              </button>
            </div>
          </div>
        </aside>
        )}

        {/* ──── ÁREA PRINCIPAL ────────────────────────────────────────────────── */}
        <main key={view} className="flex-1 overflow-y-auto ds-troca-tela">
          {view === "painel" ? (
            <PainelView
              kanban={kanban}
              lancamentos={lancamentos}
              historico={historico}
              propostasCustom={propostasCustom}
              clientes={clientes}
              config={config}
              onAbrirCard={abrirDetalheCard}
              onAbrirCliente={nome => { navigate("clientes"); setPerfilClienteExterno(nome) }}
              onNavegar={v => navigate(v)}
              onNovoOrcamento={() => navigate("orcamento")}
              onLancarCobranca={prefill => setModalLancPedidos(prefill)}
              onSalvarMeta={metaMensal => salvarConfigTudo({ ...configAtual.current, metaMensal })}
              onAprovacaoOnline={concluirAprovacaoOnline}
            />
          ) : view === "dashboard" ? (
            <RelatoriosView kanban={kanban} lancamentos={lancamentos} clientes={clientes}
              onAbrirCliente={nome => { navigate("clientes"); setPerfilClienteExterno(nome) }} />
          ) : view === "config" ? (
            <ConfigView
              config={config}
              clientes={[...new Set([...clientes.map(c => c.nome), ...kanban.map(c => c.nomeCliente)].filter(Boolean))].sort()}
              onSave={cfg => {
              setConfig(cfg)
              setResult(calcular(form, cfg))
              fetch("/api/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cfg),
              }).catch(() => {})
            }}
              onExportar={exportarDados}
              onImportar={importarDados}
            />
          ) : view === "ideias" ? (
            <IdeiasView config={config} onSalvar={salvarConfigTudo} />
          ) : view === "forma" ? (
            <FormaView
              apiKey={config.apiKey}
              materiais={config.materiais.map(m => ({ id: m.id, nome: m.nome }))}
              onUsarLayout={layout => {
                const mat = config.materiais.find(m => m.id === layout.materialId)
                setForm(prev => {
                  const next = {
                    ...prev,
                    frente: layout.largura,
                    alturaBox: layout.altura,
                    lateral: layout.profundidade,
                    abaColagem: layout.abaColagem,
                    materialId: layout.materialId,
                    materialNome: mat?.nome ?? layout.materialNome,
                  }
                  setResult(calcular(next, config))
                  return next
                })
                setView("orcamento")
                showToast("Layout da Forma aplicado ao orçamento.")
              }}
            />
          ) : view === "clientes" ? (
            <ClientesView
              historico={historico}
              kanban={kanban}
              propostasCustom={propostasCustom}
              lancamentos={lancamentos}
              cadastro={clientes}
              onReplicar={replicar}
              onWhatsApp={(item) => compartilharWhatsApp(item.form, item.calculo, item.numero)}
              onSaveCliente={atualizarCliente}
              initialPerfil={perfilClienteExterno}
            />
          ) : view === "pedidos" ? (
            <PedidosUnificadoView
              isDark={isDark}
              kanban={kanban}
              historico={historico}
              lancamentos={lancamentos}
              onDetalhes={card => setDetalheModal({ tipo: "kanban", card })}
              onNovoLancamento={prefill => setModalLancPedidos(prefill)}
              onSalvarData={(cardId, data) => {
                setKanban(prev => prev.map(c => c.id === cardId ? { ...c, dataFechamento: data } : c))
                fetch(`/api/kanban/${cardId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataFechamento: data }) }).catch(() => {})
              }}
              onSavePrazos={(cardId, prazos) => {
                setKanban(prev => prev.map(c => c.id === cardId ? { ...c, prazos } : c))
                fetch(`/api/kanban/${cardId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prazos }) }).catch(() => {})
              }}
              onSalvarPrazoRecebimentoInterno={salvarPrazoRecebimentoInterno}
              onCopiarPedido={copiarPedido}
              onBulkUpdate={(cardIds, updates) => {
                cardIds.forEach(cardId => {
                  const patch: Record<string, unknown> = {}
                  if (updates.dataEntregaPrevista !== undefined) patch.dataEntregaPrevista = updates.dataEntregaPrevista
                  if (updates.dataFechamento !== undefined) patch.dataFechamento = updates.dataFechamento
                  if (updates.coluna !== undefined) patch.coluna = updates.coluna
                  setKanban(prev => prev.map(c => c.id === cardId ? { ...c, ...patch } : c))
                  const cardAlvo = kanban.find(c => c.id === cardId)
                  if (cardAlvo && updates.coluna !== undefined) automacoesDeEtapa(cardAlvo, updates.coluna)
                  fetch(`/api/kanban/${cardId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(patch),
                  }).catch(() => {})
                })
                showToast(`${cardIds.length} pedido${cardIds.length > 1 ? "s" : ""} atualizado${cardIds.length > 1 ? "s" : ""}.`)
              }}
              onMove={(id, coluna) => {
                const card = kanban.find(c => c.id === id)
                if (card) desfazerAoVoltar(card, coluna)
                const hoje = new Date().toISOString().slice(0, 10)
                const dataFechamento = (coluna === COL_FECHADO && !card?.dataFechamento) ? hoje : undefined
                setKanban(prev => prev.map(c => c.id === id ? { ...c, coluna, ...(dataFechamento ? { dataFechamento } : {}) } : c))
                fetch(`/api/kanban/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ coluna }),
                }).catch(() => {})
                if (dataFechamento) {
                  fetch(`/api/kanban/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dataFechamento }),
                  }).catch(() => {})
                }
                if (card?.numero) atualizarTracking(card.numero, coluna)
                if (card) automacoesDeEtapa({ ...card, ...(dataFechamento ? { dataFechamento } : {}) }, coluna)
                if (card?.numero && coluna >= 2 && coluna <= 8) {
                  const telefone = clientes.find(c => c.nome.toLowerCase() === card.nomeCliente.toLowerCase())?.telefone
                  if (telefone) {
                    setNotifWA({ nomeCliente: card.nomeCliente, numero: card.numero, etapa: COLUNAS_KANBAN[coluna] ?? `Etapa ${coluna}`, telefone })
                    // A mensagem leva a página do cliente (todos os pedidos dele), não só o rastreio deste
                    fetch(`/api/cliente/link?nome=${encodeURIComponent(card.nomeCliente)}`).then(r => r.ok ? r.json() : null)
                      .then(d => { if (d?.url) setNotifWA(n => n && n.numero === card.numero ? { ...n, portal: d.url } : n) }).catch(() => {})
                  }
                }
                // Auto-preencher datas de prazo ao entrar na etapa
                if (card) {
                  const novosPrazos = autoSetPrazos(card, coluna)
                  if (novosPrazos) {
                    setKanban(prev => prev.map(c => c.id === id ? { ...c, prazos: novosPrazos } : c))
                    fetch(`/api/kanban/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prazos: novosPrazos }) }).catch(() => {})
                  }
                }
                // Voltar para col 0 → remover lote
                if (coluna === 0 && card?.loteId) {
                  removeLote(id)
                }
                // Fechar → criar lote se necessário e mostrar modal de sinal
                if (coluna === COL_FECHADO && card) {
                  if (!card.loteId) {
                    criarLote(card.nomeCliente).then(lote => {
                      assignLote(id, lote.id, lote.numero)
                      setModalSinal({ cardId: id, nomeCliente: card.nomeCliente, cardNumero: card.numero, loteId: lote.id, loteNumero: lote.numero, preco: card.preco })
                    }).catch(() => {
                      setModalSinal({ cardId: id, nomeCliente: card.nomeCliente, cardNumero: card.numero, preco: card.preco })
                    })
                  } else {
                    setModalSinal({ cardId: id, nomeCliente: card.nomeCliente, cardNumero: card.numero, loteId: card.loteId, loteNumero: card.loteNumero, preco: card.preco })
                  }
                }
              }}
              onDelete={id => {
                const card = kanban.find(c => c.id === id)
                const proposta = propostasCustom.find(p => p.cardId === id)
                setKanban(prev => prev.filter(c => c.id !== id))
                fetch(`/api/kanban/${id}`, { method: "DELETE" }).catch(() => {})
                if (card?.numero) {
                  setHistorico(prev => prev.filter(h => h.numero !== card.numero))
                  fetch(`/api/historico/${encodeURIComponent(card.numero)}`, { method: "DELETE" }).catch(() => {})
                }
                setPropostasCustom(prev => prev.filter(p => p.cardId !== id))
                if (proposta) fetch(`/api/propostas/${proposta.id}`, { method: "DELETE" }).catch(() => {})
              }}
              onSetMotivo={(id, motivo) => {
                setKanban(prev => prev.map(c => c.id === id ? { ...c, motivoPerdido: motivo } : c))
                fetch(`/api/kanban/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ motivoPerdido: motivo }),
                }).catch(() => {})
              }}
              onFechamento={(id, opcao) => {
                const card = kanban.find(c => c.id === id)
                const hoje = new Date().toISOString().slice(0, 10)
                const dataFechamento = card?.dataFechamento ?? hoje
                setKanban(prev => prev.map(c => c.id === id ? { ...c, coluna: COL_FECHADO, preco: opcao.preco, quantidade: opcao.quantidade, dataFechamento } : c))
                fetch(`/api/kanban/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ coluna: COL_FECHADO, preco: opcao.preco, quantidade: opcao.quantidade }),
                }).catch(() => {})
                fetch(`/api/kanban/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ dataFechamento }),
                }).catch(() => {})
                if (card?.numero) atualizarTracking(card.numero, COL_FECHADO, opcao.preco, opcao.quantidade)
                if (card) automacoesDeEtapa({ ...card, dataFechamento, quantidade: opcao.quantidade }, COL_FECHADO)
                // Auto-assign lote + mostrar modal sinal
                if (card && !card.loteId) {
                  criarLote(card.nomeCliente).then(lote => {
                    assignLote(id, lote.id, lote.numero)
                    setModalSinal({ cardId: id, nomeCliente: card.nomeCliente, cardNumero: card.numero, loteId: lote.id, loteNumero: lote.numero, preco: opcao.preco })
                  }).catch(() => {
                    setModalSinal({ cardId: id, nomeCliente: card.nomeCliente, cardNumero: card.numero, preco: opcao.preco })
                  })
                } else if (card) {
                  setModalSinal({ cardId: id, nomeCliente: card.nomeCliente, cardNumero: card.numero, loteId: card.loteId, loteNumero: card.loteNumero, preco: opcao.preco })
                }
              }}
              onHotOpcao={(id, opcao) => {
                setKanban(prev => prev.map(c => c.id === id ? { ...c, coluna: COL_HOT, preco: opcao.preco, quantidade: opcao.quantidade } : c))
                fetch(`/api/kanban/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ coluna: COL_HOT, preco: opcao.preco, quantidade: opcao.quantidade }),
                }).catch(() => {})
              }}
              onKanbanDetalhes={(card) => {
                const histItem = historico.find(h => h.numero === card.numero)
                if (histItem) { setDetalheModal({ tipo: "historico", item: histItem, card }); return }
                const proposta = propostasCustom.find(p => p.cardId === card.id)
                if (proposta) { setDetalheModal({ tipo: "proposta", proposta, card }); return }
                setDetalheModal({ tipo: "kanban", card })
              }}
              lotes={lotes}
              onLoteCreate={criarLote}
              onLoteAssign={assignLote}
              onLoteRemove={removeLote}
              onLoteMerge={mergeLote}
              onLoteRename={renameLote}
              negocios={negocios}
              onUpdateNegocio={n => {
                setNegocios(prev => prev.map(x => x.id === n.id ? n : x))
                fetch(`/api/negocios/${n.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ...n, loteId: n.loteId ?? null, loteNumero: n.loteNumero ?? null, statusLote: n.statusLote ?? null }),
                }).catch(() => {})
              }}
              onAddLancamento={l => {
                if (l.categoria === "pix_link" && l.loteId) {
                  const obsoletos = lancamentos.filter(x =>
                    x.categoria === "pix_link" && x.loteId === l.loteId && x.status !== "pago"
                  )
                  obsoletos.forEach(o => fetch(`/api/lancamentos/${o.id}`, { method: "DELETE" }).catch(() => {}))
                  const obsoletoIds = new Set(obsoletos.map(o => o.id))
                  setLancamentos(prev => [l, ...prev.filter(x => !obsoletoIds.has(x.id))])
                } else {
                  setLancamentos(prev => [l, ...prev])
                }
              }}
            />
          ) : (view === "orcamentos" || view === "historico") ? (
            <OrcamentosView
              historico={historico}
              propostasCustom={propostasCustom}
              kanban={kanban}
              onNovoOrcamento={() => navigate("orcamento")}
              onReplicar={replicar}
              onDownloadPdf={downloadPdf}
              onDownloadPdfCliente={downloadPdfCliente}
              onExcluir={excluirHistorico}
              onWhatsApp={(item) => compartilharWhatsApp(item.form, item.calculo, item.numero)}
              onPdfCustom={(p) => abrirPdf(gerarHtmlPropostaCustom(p, clientes.find(c => c.nome.toLowerCase() === p.nomeCliente.trim().toLowerCase())?.telefone))}
              onWhatsAppCustom={compartilharWhatsAppCustom}
              onExcluirCustom={(id) => {
                const p = propostasCustom.find(p => p.id === id)
                setPropostasCustom(prev => prev.filter(p => p.id !== id))
                fetch(`/api/propostas/${id}`, { method: "DELETE" }).catch(() => {})
                if (p?.cardId) {
                  setKanban(prev => prev.filter(c => c.id !== p.cardId))
                  fetch(`/api/kanban/${p.cardId}`, { method: "DELETE" }).catch(() => {})
                }
              }}
              onEditarCustom={(p) => { /* futuro */ }}
              onDetalhes={(item) => {
                if ("linhas" in item) {
                  const card = "cardId" in item ? kanban.find(c => c.id === (item as { cardId?: string }).cardId) : undefined
                  setDetalheModal({ tipo: "proposta", proposta: item, ...(card ? { card } : {}) })
                } else {
                  const card = item.numero ? kanban.find(c => c.numero === item.numero) : undefined
                  setDetalheModal({ tipo: "historico", item, ...(card ? { card } : {}) })
                }
              }}
              onPersonalizar={personalizarHistorico}
            />
          ) : view === "financeiro" ? (
            <FinanceiroView
              historico={historico}
              lancamentos={lancamentos}
              kanban={kanban}
              negocios={negocios}
              lotes={lotes}
              config={config}
              onAdd={l => {
                setLancamentos(prev => [l, ...prev])
                fetch("/api/lancamentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(l) })
                  .then(r => r.json().then(d => {
                    if (!r.ok) alert(`Erro ao salvar lançamento: ${d.error ?? r.status}\n${JSON.stringify(d.details ?? "")}`)
                    else console.log("Lançamento salvo:", d)
                  }))
                  .catch(e => alert(`Erro de rede ao salvar lançamento: ${e}`))
              }}
              onUpdate={(id, updates) => {
                setLancamentos(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x))
                fetch(`/api/lancamentos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) })
                  .then(r => { if (!r.ok) r.json().then(d => { alert(`Erro ao atualizar lançamento: ${d.error ?? r.status}`) }) })
                  .catch(() => {})
              }}
              onDelete={id => {
                setLancamentos(prev => prev.filter(x => x.id !== id))
                fetch(`/api/lancamentos/${id}`, { method: "DELETE" }).catch(() => {})
              }}
              onUpdateConfig={cfg => {
                setConfig(cfg)
                fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) }).catch(() => {})
              }}
              onRegistrarSobra={abrirSobra}
              onDeleteCard={id => {
                const card = kanban.find(c => c.id === id)
                setKanban(prev => prev.filter(c => c.id !== id))
                fetch(`/api/kanban/${id}`, { method: "DELETE" }).catch(() => {})
                if (card?.numero) {
                  setHistorico(prev => prev.filter(h => h.numero !== card.numero))
                  fetch(`/api/historico/${encodeURIComponent(card.numero)}`, { method: "DELETE" }).catch(() => {})
                }
              }}
              onDetalhesCard={card => setDetalheModal({ tipo: "kanban", card })}
              onAbrirPerfil={nome => { navigate("clientes"); setPerfilClienteExterno(nome) }}
            />
          ) : view === "parceiros" || view === "terceirizados" ? (
            <ParceriasView
              parceiros={parceiros}
              negocios={negocios}
              kanban={kanban}
              lancamentos={lancamentos}
              clientes={clientes}
              abaInicial={view === "terceirizados" ? "revendas" : "visao"}
              onAbrirCliente={nome => { navigate("clientes"); setPerfilClienteExterno(nome) }}
              cadastro={
            <ParceirosView
              embutido
              parceiros={parceiros}
              negocios={negocios}
              lotes={lotes}
              onAddParceiro={p => {
                setParceiros(prev => [...prev, p])
                fetch("/api/parceiros", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) }).catch(() => {})
              }}
              onUpdateParceiro={p => {
                setParceiros(prev => prev.map(x => x.id === p.id ? p : x))
                fetch(`/api/parceiros/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) }).catch(() => {})
              }}
              onDeleteParceiro={id => {
                setParceiros(prev => prev.filter(x => x.id !== id))
                fetch(`/api/parceiros/${id}`, { method: "DELETE" }).catch(() => {})
              }}
              onAddNegocio={n => {
                setNegocios(prev => [n, ...prev])
                fetch("/api/negocios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(n) }).catch(() => {})
              }}
              onUpdateNegocio={n => {
                setNegocios(prev => prev.map(x => x.id === n.id ? n : x))
                fetch(`/api/negocios/${n.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(n) }).catch(() => {})
              }}
              onDeleteNegocio={id => {
                setNegocios(prev => prev.filter(x => x.id !== id))
                fetch(`/api/negocios/${id}`, { method: "DELETE" }).catch(() => {})
              }}
            />
              }
              itensRevenda={<TerceirizadosView
                embutido
              kanban={kanban}
              onMove={(id, coluna) => {
                setKanban(prev => prev.map(c => c.id === id ? { ...c, coluna } : c))
                fetch(`/api/kanban/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ coluna }),
                }).catch(() => {})
              }}
              onEdit={(id, fields) => {
                setKanban(prev => prev.map(c => c.id === id ? { ...c, ...fields } : c))
                fetch(`/api/kanban/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(fields),
                }).catch(() => {})
              }}
              onDelete={id => {
                const card = kanban.find(c => c.id === id)
                setKanban(prev => prev.filter(c => c.id !== id))
                fetch(`/api/kanban/${id}`, { method: "DELETE" }).catch(() => {})
                if (card?.numero) {
                  setHistorico(prev => prev.filter(h => h.numero !== card.numero))
                  fetch(`/api/historico/${encodeURIComponent(card.numero)}`, { method: "DELETE" }).catch(() => {})
                }
              }}
            />}
            />
          ) : view === "meta" ? (
            <MetaAdsView
                isDark={isDark}
                faturamentoPorCampanha={faturamentoPorCampanha}
                clientesPorCampanha={clientesPorCampanha}
                ltvPorCampanha={ltvPorCampanha}
              />
          ) : view === "whatsapp" ? (
            <WhatsAppView
              onCriarCard={(nome, _jid) => {
                navigate("pedidos")
                // Salva nome do lead WA para pré-preencher o próximo card
                sessionStorage.setItem("wa:lead_nome", nome)
              }}
            />
          ) : view === "conquistas" ? (
            <GamificacaoView
              kanban={kanban}
              lancamentos={lancamentos}
              metaMensal={config.metaMensal}
              baselineFaturamento={config.baselineFaturamento}
              onSaveConfig={updates => {
                const next = { ...config, ...updates }
                setConfig(next)
                fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {})
              }}
            />
          ) : view === "fornecedores" ? (
            <FornecedoresView config={config} kanban={kanban} lancamentos={lancamentos} historico={historico} onSave={salvarConfigTudo}
              onCategorizar={(id, subcategoria) => {
                setLancamentos(prev => prev.map(x => x.id === id ? { ...x, subcategoria } : x))
                fetch(`/api/lancamentos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subcategoria }) }).catch(() => {})
                showToast(`Custo classificado como ${subcategoria}.`)
              }} />

          ) : (
            <>
              {/* ── Tab bar: Padrão / Digital Rápido ──────────────────────── */}
              <div className="sticky top-0 z-10 flex items-center gap-3 px-6 py-3 print:hidden backdrop-blur-md" style={{ background: "color-mix(in srgb, var(--bg-page) 88%, transparent)", borderBottom: "1px solid rgba(60,60,67,0.08)" }}>
                <Segmentado<"padrao" | "digital"> valor={orcTab} onChange={setOrcTab}
                  opcoes={[{ v: "padrao", nome: "Caixa (offset)" }, { v: "digital", nome: "Digital rápido" }]} />
                <span className="text-[11.5px] text-[#898892]">{orcTab === "padrao" ? "Medidas ou DXF à esquerda; rotas, tabela e análise aqui." : "Proposta rápida para impressão digital."}</span>
              </div>

              {orcTab === "digital" ? (
                <OrcamentoDigitalView
                  onSalvar={salvarPropostaCustom}
                  onVerKanban={() => navigate("pedidos")}
                />
              ) : !r ? (
                <EmptyState />
              ) : (
            <div className="max-w-6xl mx-auto px-6 py-5 space-y-5">

              {/* Resumo do orçamento na tiragem ideal */}
              {(() => {
                const ideal = r.tabela.find(l => l.quantidade === r.sweetSpotIdealQtd) ?? r.tabela[r.tabela.length - 1]
                const rotaIdeal = r.rotas?.find(q => q.quantidade === ideal.quantidade)?.melhor
                const preco = form.comFaca ? ideal.precoComFaca : ideal.precoSemFaca
                const unit = form.comFaca ? ideal.unitarioComFaca : ideal.unitarioSemFaca
                const ml = ideal.margemLiquida
                return (
                  <>
                    <CabecalhoPagina
                      titulo={form.nomeCliente || "Novo orçamento"}
                      sub={`${form.blankOverride ? "Dieline importado" : `${form.frente}×${form.alturaBox}×${form.lateral} cm`} · ${form.materialNome}${r.alertas?.length ? ` · ${r.alertas.length} ${r.alertas.length === 1 ? "aviso" : "avisos"} nas rotas` : ""}`}
                    />
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 ds-escalonado">
                      <Kpi rotulo={`Preço em ${num(ideal.quantidade)} un`} tom="acento" destaque valor={preco} formato={brl}
                        sub={`${brl(unit)} por unidade · tiragem ideal`} />
                      <Kpi rotulo="Rota mais barata" valor={rotaIdeal ? rotaIdeal.pecasPorFolhaPapel : r.melhorFormato.pecasPorFolha} formato={n => `${num(Math.round(n))} por folha`}
                        sub={rotaIdeal ? `${rotaIdeal.impressorNome} · ${rotaIdeal.divisaoNome.toLowerCase()} ${rotaIdeal.formatoNome}` : r.melhorFormato.formatoNome} />
                      <Kpi rotulo="Custo de produção" valor={form.comFaca ? ideal.custoTotalComFaca : ideal.custoTotalSemFaca} formato={brl}
                        sub={ideal.estimado ? "tem valores estimados" : "com preços cadastrados"} tom={ideal.estimado ? "alerta" : "neutro"} />
                      <Kpi rotulo="Margem líquida" valor={ml ?? null} formato={n => `${num(n, 1)}%`}
                        tom={ml == null ? "neutro" : ml >= 40 ? "sucesso" : ml >= 30 ? "alerta" : "perigo"}
                        sub={ideal.lucroLiquido != null ? `${brl(ideal.lucroLiquido)} de lucro após impostos` : undefined} />
                    </div>
                  </>
                )
              })()}

              {/* ── Preview 3D ── */}
              {form.frente > 0 && form.alturaBox > 0 && form.lateral > 0 ? (
                <Section title="Preview 3D — caixa">
                  <div className="bg-white rounded-xl border border-[rgba(60,60,67,0.08)] p-4">
                    <BoxPreview3D
                      largura={form.frente}
                      altura={form.alturaBox}
                      profundidade={form.lateral}
                      materialNome={form.materialNome}
                      incluirVerniz={form.incluirVerniz}
                    />
                  </div>
                </Section>
              ) : form.blankOverride ? (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[rgba(116,116,128,0.04)] border border-[rgba(60,60,67,0.08)]">
                  <Ruler className="w-4 h-4 text-[#8E8E93] shrink-0" />
                  <p className="text-[12px] text-[#8E8E93]">Preencha as dimensões da caixa para ver o preview 3D e a dieline planificada.</p>
                </div>
              ) : null}

              {/* ── Dieline ── */}
              <Section title={`Faca aberta — ${
                form.tipoCaixa === "aviao" ? "Cartucho Avião" :
                form.tipoCaixa === "fundo-automatico" ? "Fundo Automático" :
                form.tipoCaixa === "americano" ? "Americano" : "Cartucho Simples"
              }${form.blankOverride ? " · Pacdora ✓" : ""}`}>
                <div className="flex flex-wrap gap-3">
                  {(form.blankOverride && !(form.frente > 0) ? [
                    ["Largura aberta", `${(r.dieline.largura / 10).toFixed(1)} cm`, "do arquivo DXF"],
                    ["Altura aberta",  `${(r.dieline.altura / 10).toFixed(1)} cm`,  "do arquivo DXF"],
                  ] : [
                    ["Largura aberta", `${(r.dieline.largura / 10).toFixed(1)} cm`, "2×frente + 2×lateral + cola"],
                    ["Altura aberta",  `${(r.dieline.altura / 10).toFixed(1)} cm`,  "caixa + aba sup + aba inf"],
                    ["Aba colagem",    `${(r.dieline.abaColagem / 10).toFixed(1)} cm`, ""],
                    ["Aba superior",   `${(r.dieline.abaSuperior / 10).toFixed(1)} cm`,
                      form.tipoCaixa === "aviao" ? "aba avião profunda" : "tuck flap"],
                    ["Aba inferior",   `${(r.dieline.abaInferior / 10).toFixed(1)} cm`,
                      form.tipoCaixa === "fundo-automatico" ? "auto-lock + gussets" :
                      form.tipoCaixa === "americano" ? "4 abas (L/2)" : "fundo tuck"],
                  ]).map(([l, v, s]) => (
                    <div key={l} className="bg-[rgba(116,116,128,0.04)] border border-[rgba(60,60,67,0.08)] rounded-2xl px-4 py-2.5 min-w-[120px]">
                      <p className="text-[10px] text-[#8E8E93] font-semibold">{l}</p>
                      <p className="text-[#191625] font-bold text-lg leading-tight">{v}</p>
                      {s && <p className="text-[10px] text-[#8E8E93] mt-0.5">{s}</p>}
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── Rotas de produção ── */}
              <RotasProducao
                calculo={r}
                form={form}
                producao={normalizarProducao(config.producao)}
                multiplicadorPadrao={config.multiplicadores.semFaca || 2}
                comFaca={form.comFaca}
                onOpcoes={o => mudarForm(p => ({ ...p, rota: o }))}
                onRegistrarFaca={registrarFaca}
              />

              {/* ── Layout da chapa ── */}
              <Section title={`Layout na meia folha — ${(r.layoutChapa.larguraChapa/10).toFixed(0)}×${(r.layoutChapa.alturaChapa/10).toFixed(0)} cm`}>
                <div className="bg-white rounded-xl border border-[rgba(60,60,67,0.08)] p-4">
                  <LayoutChapaVisual
                    key={`${r.dieline.largura}-${r.dieline.altura}`}
                    layout={r.layoutChapa}
                    dieline={r.dieline}
                    formData={r.formData}
                    customPecas={form.customPecasChapa}
                    onCustomPecas={n => set("customPecasChapa", n)}
                    dielineGeo={dxfGeo}
                  />
                  <div className="flex gap-5 mt-3 pt-3 border-t border-[rgba(60,60,67,0.06)] text-xs text-[#8E8E93]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 h-px bg-[#8456e8] block" /> linha de corte
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 border-t border-dashed border-red-500 block" /> vinco de dobra
                    </span>
                    <span className="flex items-center gap-1.5 ml-auto text-[#898892]">
                      Clique em ↻ para rotacionar individualmente
                    </span>
                  </div>
                </div>
              </Section>

              {/* ── Tabela de orçamento ── */}
              {r.tabela.length > 0 && (
                <Section title="Tabela de orçamento">
                  <div className="bg-white rounded-xl border border-[rgba(60,60,67,0.08)] overflow-hidden">
                    <div className="overflow-x-auto">
                      {(() => {
                          const acabamentos = [
                            ...(form.outrosAcabamentos ?? []),
                            ...(form.acompanhamentos ?? []),
                          ]
                          const nAcab = acabamentos.length
                          const temAcab = form.incluirVerniz || form.laminacao
                          const temFrete = r.tabela.some(l => (l.custoFrete ?? 0) > 0)
                          const custosColSpan = (temAcab ? 6 : 5) + (temFrete ? 1 : 0) + nAcab
                          return (
                      <table className="w-full text-xs whitespace-nowrap">
                        <thead>
                          <tr className="border-b border-[rgba(60,60,67,0.08)]">
                            <th className="sticky left-0 bg-[rgba(116,116,128,0.04)] px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold border-r border-[rgba(60,60,67,0.08)]">Qtd</th>
                            <th colSpan={3} className="px-3 py-2 text-center text-[10px] uppercase tracking-wider text-[#898892] font-semibold border-r border-[rgba(60,60,67,0.06)]">Produção</th>
                            <th colSpan={custosColSpan} className="px-3 py-2 text-center text-[10px] uppercase tracking-wider text-[#898892] font-semibold border-r border-[rgba(60,60,67,0.06)]">Custos</th>
                            <th colSpan={form.comFaca ? 4 : 2} className="px-3 py-2 text-center text-[10px] uppercase tracking-wider text-[#8456e8]/70 font-semibold">Preços</th>
                          </tr>
                          <tr className="bg-[rgba(116,116,128,0.04)] border-b border-[rgba(60,60,67,0.08)]">
                            <th className="sticky left-0 bg-[rgba(116,116,128,0.04)] px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold border-r border-[rgba(60,60,67,0.08)]" />
                            <TH>Folhas</TH><TH>+10%</TH><TH br>Pacote</TH>
                            <TH>Papel</TH><TH>Impressão</TH><TH>Corte</TH>
                            {temAcab && <TH>Lamin./verniz</TH>}
                            <TH>Colagem</TH>{temFrete && <TH>Frete</TH>}<TH>Arte</TH>
                            {acabamentos.map((a, i) => (
                              <TH key={a} br={i === nAcab - 1}>{a}</TH>
                            ))}
                            <TH blue>Custo s/faca</TH>
                            <TH blue>Preço s/faca</TH>
                            {form.comFaca && <><TH blue>Custo c/faca</TH><TH blue>Preço c/faca</TH></>}
                            <TH>Unit. s/f</TH>
                            {form.comFaca && <TH>Unit. c/f</TH>}
                            <TH>Margem líq. s/f</TH>
                            {form.comFaca && <TH>Margem líq. c/f</TH>}
                            <TH>12× s/faca</TH>
                            {form.comFaca && <TH>12× c/faca</TH>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {r.tabela.map(l => (
                            <TabelaRow
                              key={l.quantidade}
                              linha={l}
                              comFaca={form.comFaca}
                              incluirVerniz={temAcab}
                              mostrarFrete={temFrete}
                              impostoPct={normalizarProducao(config.producao).impostoPct}
                              isMin={l.quantidade === r.sweetSpotMinimoQtd}
                              isIdeal={l.quantidade === r.sweetSpotIdealQtd}
                              custosCustom={customCustos[l.quantidade]}
                              onCustoEdit={handleCustoEdit}
                              customPacotes={customPacotesMap[l.quantidade]}
                              onPacoteEdit={handlePacoteEdit}
                              acabamentos={acabamentos}
                              acabamentoCustos={Object.fromEntries(
                                acabamentos.map(a => [a, customAcabamentoCustos[a]?.[l.quantidade] ?? (a === "Hot Stamping" ? l.custoHotStamping ?? 0 : 0)])
                              )}
                              onAcabamentoCustoEdit={handleAcabamentoCustoEdit}
                            />
                          ))}
                        </tbody>
                      </table>
                          )
                        })()}
                    </div>
                  </div>
                </Section>
              )}

              {/* ── Análise estratégica ── */}
              {r.tabela.length > 0 && <AnaliseEstrategica calculo={r} comFaca={form.comFaca} cliente={form.nomeCliente} />}

            </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ── Modal: personalizar proposta ──────────────────────────────────── */}
      {modalSalvar && (
        <ModalPersonalizarProposta
          data={modalSalvar}
          config={config}
          onClose={() => setModalSalvar(null)}
          onAbrirPdf={abrirPdf}
          onWhatsApp={compartilharWhatsApp}
          clientes={clientes}
          lotes={lotes}
          cardLoteNumero={kanban.find(c => c.id === modalSalvar.cardId)?.loteNumero}
          onLoteCreate={criarLote}
          onLoteAssign={assignLote}
          onSyncOpcoes={(cardId, opcoes) => {
            setKanban(prev => prev.map(c => c.id === cardId ? { ...c, opcoes } : c))
            fetch(`/api/kanban/${cardId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ opcoes }),
            }).catch(() => {})
          }}
          onSalvar={(customCalculo, opcoes) => {
            const { numero: num, cardId: cid } = modalSalvar
            setHistorico(prev => prev.map(h =>
              h.numero === num ? { ...h, calculo: customCalculo } : h
            ))
            fetch(`/api/historico/${encodeURIComponent(num)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ calculo: customCalculo }),
            }).catch(() => {})
            const ideal = opcoes.find(o => o.quantidade === customCalculo.sweetSpotIdealQtd) ?? opcoes[opcoes.length - 1]
            const updateData = { opcoes, ...(ideal ? { preco: ideal.preco, quantidade: ideal.quantidade } : {}) }
            const cardAtual = kanban.find(c => c.id === cid)
            setKanban(prev => prev.map(c =>
              c.id === cid ? { ...c, ...updateData } : c
            ))
            fetch(`/api/kanban/${cid}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updateData),
            }).catch(() => {})
            if (num && ideal && cardAtual) atualizarTracking(num, cardAtual.coluna, ideal.preco, ideal.quantidade)
          }}
        />
      )}

      {/* ── Modal: detalhe ──────────────────────────────────────────────────── */}
      {detalheModal && (
        <ModalDetalhe
          data={detalheModal}
          pedido={"card" in detalheModal && detalheModal.card ? montarPedidos(kanban, lancamentos).find(p => p.cards.some(c => c.id === detalheModal.card!.id)) : undefined}
          parcFator={config.multiplicadores.parcelamento12x}
          onClose={() => setDetalheModal(null)}
          onEditar={(p) => { setDetalheModal(null); setEditandoProposta(p) }}
          onEditarHistorico={editarHistorico}
          onPersonalizarHistorico={personalizarHistorico}
          onSaveDelivery={"card" in detalheModal && detalheModal.card ? salvarDataEntrega : undefined}
          onSaveDeliveryReal={"card" in detalheModal && detalheModal.card ? salvarDataEntregaReal : undefined}
          onSaveCloseDate={"card" in detalheModal && detalheModal.card ? salvarDataFechamento : undefined}
          onRegistrarSobra={"card" in detalheModal && detalheModal.card ? abrirSobra : undefined}
          onSaveFornecedor={"card" in detalheModal && detalheModal.card ? salvarFornecedor : undefined}
          onEmitirOS={"card" in detalheModal && detalheModal.card ? handleEmitirOS : undefined}
          onSaveCardExtras={"card" in detalheModal && detalheModal.card ? salvarCardExtras : undefined}
          onSaveProjecao={"card" in detalheModal && detalheModal.card ? salvarProjecaoCustos : undefined}
          onSavePrazos={"card" in detalheModal && detalheModal.card ? salvarPrazos : undefined}
          onMoveEtapa={"card" in detalheModal && detalheModal.card ? (id, coluna) => {
            const card = kanban.find(c => c.id === id)
            if (card) desfazerAoVoltar(card, coluna)
            const hoje = new Date().toISOString().slice(0, 10)
            const dataFechamento = (coluna === COL_FECHADO && !card?.dataFechamento) ? hoje : undefined
            setKanban(prev => prev.map(c => c.id === id ? { ...c, coluna, ...(dataFechamento ? { dataFechamento } : {}) } : c))
            fetch(`/api/kanban/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coluna }) }).catch(() => {})
            if (dataFechamento) fetch(`/api/kanban/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataFechamento }) }).catch(() => {})
            if (card?.numero) atualizarTracking(card.numero, coluna)
            if (card) automacoesDeEtapa({ ...card, ...(dataFechamento ? { dataFechamento } : {}) }, coluna)
          } : undefined}
          onSavePreco={"card" in detalheModal && detalheModal.card ? (cardId, preco) => {
            setKanban(prev => prev.map(c => c.id === cardId ? { ...c, preco } : c))
            setDetalheModal(prev => {
              if (!prev || !("card" in prev) || !prev.card || prev.card.id !== cardId) return prev
              return { ...prev, card: { ...prev.card, preco } }
            })
            fetch(`/api/kanban/${cardId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preco }) }).catch(() => {})
            showToast("Valor atualizado.")
          } : undefined}
          lancamentos={lancamentos}
        />
      )}

      {/* ── Modal: novo lançamento (via Pedidos) ────────────────────────────── */}
      {modalLancPedidos && (
        <ModalLancamento
          inicial={modalLancPedidos}
          kanban={kanban}
          onSave={l => {
            setLancamentos(prev => [l, ...prev])
            fetch("/api/lancamentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(l) })
              .then(r => { if (!r.ok) r.json().then(d => { alert(`Erro ao salvar lançamento: ${d.error ?? r.status}`) }) })
              .catch(e => alert(`Erro de rede: ${e}`))
            setModalLancPedidos(null)
          }}
          onClose={() => setModalLancPedidos(null)}
        />
      )}

      {/* ── Modal: sobras ───────────────────────────────────────────────────── */}
      {modalSobra && (
        <ModalSobra
          card={modalSobra.card}
          loteCards={modalSobra.loteCards}
          onClose={() => setModalSobra(null)}
          onSave={salvarSobras}
        />
      )}

      {/* ── Modal: proposta personalizada ──────────────────────────────────── */}
      {modalPropostaCustom && (
        <ModalPropostaCustom
          clientes={clientes}
          lotes={lotes}
          parceiros={parceiros}
          materiais={config.materiais}
          parcFator={config.multiplicadores.parcelamento12x}
          onClose={() => setModalPropostaCustom(false)}
          onSalvar={(draft) => {
            const p = salvarPropostaCustom(draft)
            showToast(`Proposta ${p.numero} salva.`)
            setModalPropostaCustom(false)
          }}
          onPdf={(draft) => abrirPdf(gerarHtmlPropostaCustom({
            ...draft,
            id: "preview",
            numero: "PRÉVIA",
            data: new Date().toLocaleString("pt-BR"),
            cardId: "preview",
          }, clientes.find(c => c.nome.toLowerCase() === draft.nomeCliente.trim().toLowerCase())?.telefone))}
          onWhatsApp={(p) => compartilharWhatsAppCustom(p)}
          onUpsertCliente={(nome, updates) => {
            const existing = clientes.find(c => c.nome.toLowerCase() === nome.toLowerCase())
            existing ? atualizarCliente(existing.id, updates) : criarClienteComDados(nome, updates)
          }}
        />
      )}

      {/* ── Modal: editar proposta existente ───────────────────────────────── */}
      {editandoProposta && (
        <ModalPropostaCustom
          clientes={clientes}
          materiais={config.materiais}
          parcFator={config.multiplicadores.parcelamento12x}
          initialData={editandoProposta}
          onClose={() => setEditandoProposta(null)}
          onSalvar={(draft) => {
            const atualizada: PropostaCustom = {
              ...editandoProposta,
              ...draft,
            }
            // Compute new ideal price from updated lines
            const ativas = atualizada.linhas.filter(l => l.ativa && l.quantidade > 0)
            const idealLinha = ativas.find(l => l.isIdeal) ?? ativas[ativas.length - 1]
            const novoPreco = idealLinha ? idealLinha.unitario * idealLinha.quantidade : 0
            const novaQtd   = idealLinha?.quantidade ?? 0
            setPropostasCustom(prev => prev.map(p => p.id === atualizada.id ? atualizada : p))
            setKanban(prev => prev.map(c => c.id === atualizada.cardId
              ? { ...c,
                  nomeCliente: atualizada.nomeCliente,
                  dimensoes: atualizada.descricao,
                  materialNome: atualizada.material,
                  preco: novoPreco,
                  quantidade: novaQtd,
                }
              : c
            ))
            fetch(`/api/propostas/${atualizada.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(draft),
            }).catch(() => {})
            fetch(`/api/kanban/${atualizada.cardId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nomeCliente: atualizada.nomeCliente, dimensoes: atualizada.descricao, materialNome: atualizada.material, preco: novoPreco, quantidade: novaQtd }),
            }).catch(() => {})
            showToast(`Proposta ${atualizada.numero} atualizada.`)
            setEditandoProposta(null)
          }}
          onPdf={(draft) => abrirPdf(gerarHtmlPropostaCustom({
            ...draft,
            id: editandoProposta.id,
            numero: editandoProposta.numero,
            data: editandoProposta.data,
            cardId: editandoProposta.cardId,
          }, clientes.find(c => c.nome.toLowerCase() === draft.nomeCliente.trim().toLowerCase())?.telefone))}
          onWhatsApp={(p) => compartilharWhatsAppCustom(p)}
          onUpsertCliente={(nome, updates) => {
            const existing = clientes.find(c => c.nome.toLowerCase() === nome.toLowerCase())
            existing ? atualizarCliente(existing.id, updates) : criarClienteComDados(nome, updates)
          }}
        />
      )}

      {/* ── Busca global ────────────────────────────────────────────────────── */}
      {buscaAberta && (
        <BuscaGlobal
          historico={historico}
          kanban={kanban}
          clientes={clientes}
          lancamentos={lancamentos}
          onClose={() => setBuscaAberta(false)}
          onNavigate={v => navigate(v as typeof view)}
        />
      )}

      {/* ── Modal: sinal de entrada ─────────────────────────────────────────── */}
      {modalSinal && (
        <ModalSinalEntrada
          nomeCliente={modalSinal.nomeCliente}
          preco={modalSinal.preco}
          onClose={() => setModalSinal(null)}
          onConfirm={(valor, forma) => {
            criarLancamentoSinal(modalSinal.cardId, modalSinal.nomeCliente, modalSinal.cardNumero, modalSinal.loteId, modalSinal.loteNumero, valor, forma)
            showToast(`Sinal de R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} registrado.`)
            setModalSinal(null)
          }}
        />
      )}

      {/* ── Forma — assistente flutuante ────────────────────────────────────── */}
      <FormaBubble apiKey={config.apiKey} />
    </div>
  )
}

// ── Modal Sinal de Entrada ────────────────────────────────────────────────────

const FORMAS = ["pix", "dinheiro", "cartão de crédito", "cartão de débito", "boleto", "transferência"]

function ModalSinalEntrada({
  nomeCliente, preco, onClose, onConfirm,
}: {
  nomeCliente: string
  preco: number
  onClose: () => void
  onConfirm: (valor: number, forma: string) => void
}) {
  const [step, setStep]   = useState<"ask" | "form">("ask")
  const [valor, setValor] = useState("")
  const [forma, setForma] = useState("pix")

  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  const valorNum = parseFloat(valor.replace(",", ".")) || 0

  function confirmar() {
    if (valorNum <= 0) return
    onConfirm(valorNum, forma)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-[6px] px-4 apple-backdrop-enter"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden apple-modal-enter">

        {step === "ask" ? (
          <>
            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <div className="w-10 h-10 rounded-xl bg-[#8456e8]/10 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-[#8456e8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <p className="font-bold text-[#191625] text-[15px] leading-snug">Sinal de entrada?</p>
              <p className="text-[#8E8E93] text-[12.5px] mt-1">
                O cliente <span className="font-semibold text-[#5e5c68]">{nomeCliente}</span> deixou algum valor de entrada ao fechar o pedido de <span className="font-semibold text-[#5e5c68]">{brl(preco)}</span>?
              </p>
            </div>
            <div className="flex gap-2 px-6 pb-5">
              <button onClick={onClose}
                className="flex-1 py-2.5 text-[13px] text-[#8E8E93] hover:text-[#5e5c68] hover:bg-[rgba(116,116,128,0.04)] rounded-xl transition-colors font-medium border border-[rgba(60,60,67,0.12)]">
                Não, pular
              </button>
              <button onClick={() => setStep("form")}
                className="flex-1 py-2.5 text-[13px] font-bold text-white rounded-xl transition-colors"
                style={{ background: "#8456e8" }}>
                Sim, registrar
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Form */}
            <div className="px-6 pt-5 pb-2 border-b border-[rgba(60,60,67,0.08)]">
              <div className="flex items-center justify-between">
                <p className="font-bold text-[#191625] text-[15px]">Registrar sinal</p>
                <button onClick={onClose} className="text-[#898892] hover:text-[#8E8E93] text-xl leading-none">×</button>
              </div>
              <p className="text-[#8E8E93] text-[12px] mt-0.5">{nomeCliente} · pedido de {brl(preco)}</p>
            </div>

            <div className="px-6 py-4 space-y-3">
              {/* Valor */}
              <div>
                <p className="text-[10px] uppercase tracking-wide font-semibold text-[#8E8E93] mb-1.5">Valor recebido</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E93] text-sm">R$</span>
                  <input
                    type="number" min={0} step="0.01"
                    value={valor}
                    onChange={e => setValor(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && confirmar()}
                    placeholder="0,00"
                    autoFocus
                    className="w-full h-11 border border-[rgba(60,60,67,0.12)] rounded-xl pl-9 pr-3 text-[14px] font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] transition-all"
                  />
                </div>
              </div>

              {/* Forma de pagamento */}
              <div>
                <p className="text-[10px] uppercase tracking-wide font-semibold text-[#8E8E93] mb-1.5">Forma de pagamento</p>
                <div className="flex flex-wrap gap-1.5">
                  {FORMAS.map(f => (
                    <button key={f} onClick={() => setForma(f)}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all capitalize ${
                        forma === f
                          ? "bg-[#8456e8] text-white border-[#8456e8] shadow-sm"
                          : "border-[rgba(60,60,67,0.12)] text-[#72707d] hover:border-slate-300 hover:bg-[rgba(116,116,128,0.04)]"
                      }`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 px-6 pb-5">
              <button onClick={() => setStep("ask")}
                className="flex-1 py-2.5 text-[13px] text-[#8E8E93] hover:bg-[rgba(116,116,128,0.04)] rounded-xl transition-colors font-medium">
                Voltar
              </button>
              <button onClick={confirmar} disabled={valorNum <= 0}
                className="flex-1 py-2.5 text-[13px] font-bold text-white rounded-xl transition-all disabled:opacity-40"
                style={{ background: "#8456e8" }}>
                Confirmar sinal
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
