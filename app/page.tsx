"use client"

import React, { useState, useCallback, useEffect, useRef } from "react"
import { useTheme } from "./components/ThemeProvider"
import { FormData, Calculo, PropostaCustom, Cliente, KanbanCard, COL_FECHADO, COL_PERDIDO, COLUNAS_KANBAN, Parceiro, NegocioParceiro, LancamentoFinanceiro, Lote } from "./types"
import DashboardView from "./components/DashboardView"
import { QUANTIDADES_PADRAO } from "./dados"
import { calcular } from "./calculos"
import { Configuracoes, CONFIG_PADRAO } from "./config"
import LayoutChapaVisual from "./LayoutChapaVisual"
import { gerarHtmlOrcamento, gerarHtmlOrcamentoCliente, gerarHtmlPropostaCustom } from "./pdf"
import FormaView from "./FormaView"
import { brl, num } from "./utils"
import { FormSection, Label, NumberInput, KpiCard, Section, TH, TabelaRow, AnaliseEstrategica, EmptyState } from "./components/ui"
import { HistoricoView } from "./components/HistoricoView"
import { ClientesView } from "./components/ClientesView"
import { ConfigView } from "./components/ConfigView"
import { KanbanView } from "./components/KanbanView"
import { ParceirosView } from "./components/ParceirosView"
import { FinanceiroView } from "./components/FinanceiroView"
import { ClienteCombobox, ClienteContactCard } from "./components/ClienteFields"
import { ModalPersonalizarProposta } from "./components/ModalPersonalizarProposta"
import { ModalPropostaCustom, BoxPreview3D } from "./components/ModalPropostaCustom"
import { ModalDetalhe, DetalheData } from "./components/ModalDetalhe"
import { ModalSobra } from "./components/ModalSobra"

const FORM_INICIAL: FormData = {
  nomeCliente: "", frente: 0, lateral: 0, alturaBox: 0, abaColagem: 1,
  incluirVerniz: false, comFaca: true, valorFaca: 0,
  numSKUs: 1, numArtes: 1, quantidades: [...QUANTIDADES_PADRAO], customPecasChapa: null,
  obsInterna: "", obsCliente: "", validadeDias: 7, materialId: "cartao300", materialNome: "Cartão 300g",
}

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
            ? "text-[#007AFF] font-semibold bg-[#007AFF]/[0.12] hover:bg-[#007AFF]/[0.18]"
            : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] font-medium"
      }`}>
      <span className={`shrink-0 transition-colors ${active ? "text-white" : accent ? "text-[#007AFF]" : "text-zinc-600"}`}>
        {icon}
      </span>
      <span className="flex-1 text-left truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-white/[0.07] text-zinc-500 tabular-nums min-w-[18px] text-center">
          {badge}
        </span>
      )}
    </button>
  )
}

function NavGroup({ label }: { label: string }) {
  return (
    <p className="text-[8.5px] font-semibold uppercase tracking-wide text-zinc-700 px-3 pt-4 pb-1.5 select-none">
      {label}
    </p>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [form, setForm]       = useState<FormData>(FORM_INICIAL)
  const [result, setResult]   = useState<Calculo | null>(null)
  const [novaQtd, setNovaQtd] = useState("")
  const [toast, setToast]     = useState("")
  const [historico, setHistorico] = useState<Array<{ form: FormData; calculo: Calculo; data: string; numero?: string }>>([])
  const [kanban, setKanban]   = useState<KanbanCard[]>([])
  const [contador, setContador] = useState<number>(0)
  const [view, setView]       = useState<"orcamento" | "historico" | "clientes" | "kanban" | "forma" | "config" | "dashboard" | "parceiros" | "financeiro">("dashboard")
  const [config, setConfig]   = useState<Configuracoes>(CONFIG_PADRAO)
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
  const { isDark, setTheme, theme } = useTheme()
  const expirySweepDone = useRef(false)

  // Persist main view across F5 — read on mount, write in navigate()
  useEffect(() => {
    const saved = sessionStorage.getItem("app:view")
    const valid = ["orcamento","historico","clientes","kanban","forma","config","dashboard","parceiros","financeiro"]
    if (saved && valid.includes(saved)) setView(saved as typeof view)
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
        if (d.kanban)                 setKanban(d.kanban)
        if (d.config)                 setConfig(d.config)
        if (d.parceiros)              setParceiros(d.parceiros)
        if (d.negocios)               setNegocios(d.negocios)
        if (d.lancamentos)            setLancamentos(d.lancamentos)
        if (d.lotes)                  setLotes(d.lotes)
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
      if (card.coluna !== 0) return false

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
          etapas: [{ coluna: 0, nome: "Orçamento realizado", dataHora: card.data }],
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

  async function salvarFornecedor(cardId: string, fornecedor: string | null, custoTerceiro: number | null) {
    setKanban(prev => prev.map(c => c.id === cardId ? { ...c, fornecedor: fornecedor ?? undefined, custoTerceiro: custoTerceiro ?? undefined } : c))
    await fetch(`/api/kanban/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fornecedor: fornecedor ?? null, custoTerceiro: custoTerceiro ?? null }),
    }).catch(() => {})
    showToast(fornecedor ? "Fornecedor salvo." : "Fornecedor removido.")
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
      const jatem = entry.etapas.some((e: { coluna: number }) => e.coluna === novaColuna)
      const etapas = jatem ? entry.etapas : [...entry.etapas, { coluna: novaColuna, nome: colNome, dataHora }]
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
    const historicoItem = { form: { ...form }, calculo: result, data, numero }
    setHistorico(prev => [historicoItem, ...prev])
    fetch("/api/historico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...historicoItem, contador: novoContador }),
    }).catch(() => {})
    const ideal = result.tabela.find(l => l.quantidade === result.sweetSpotIdealQtd) ?? result.tabela[result.tabela.length - 1]
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

  function abrirPdf(html: string) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url  = URL.createObjectURL(blob)
    const win  = window.open(url, "_blank")
    setTimeout(() => { win?.print(); URL.revokeObjectURL(url) }, 600)
  }

  function downloadPdf(item: { form: FormData; calculo: Calculo; data: string }) {
    abrirPdf(gerarHtmlOrcamento(item))
  }

  function downloadPdfCliente(item: { form: FormData; calculo: Calculo; data: string }) {
    abrirPdf(gerarHtmlOrcamentoCliente(item))
  }

  function compartilharWhatsApp(form: FormData, calculo: Calculo, numero?: string) {
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
      form.incluirVerniz ? `• Acabamento: Verniz UV` : null,
      form.comFaca && form.valorFaca > 0 ? `• Faca de corte inclusa` : null,
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
      ``,
      `Qualquer dúvida, é só falar! 😊`,
    ].filter(l => l !== null).join("\n")

    const clienteSalvo = clientes.find(c => c.nome.toLowerCase() === form.nomeCliente.trim().toLowerCase())
    const phone = clienteSalvo?.telefone?.replace(/\D/g, "")
    const base  = phone ? `https://wa.me/55${phone}` : `https://wa.me/`
    window.open(`${base}?text=${encodeURIComponent(linhas)}`, "_blank")
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
        if (d.config)         { setConfig(d.config); setResult(calcular(form, d.config)) }
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

  function addQtd() {
    const v = parseInt(novaQtd)
    if (!v || v <= 0 || form.quantidades.includes(v)) return
    set("quantidades", [...form.quantidades, v].sort((a, b) => a - b))
    setNovaQtd("")
  }

  const r = result
  const clienteAtual = clientes.find(c => c.nome.toLowerCase() === form.nomeCliente.trim().toLowerCase())

  return (
    <div className="h-screen flex bg-[#F2F2F7] overflow-hidden text-[13px]">

      {/* ── Left Navigation Sidebar ─────────────────────────────────────── */}
      <nav className="w-[220px] shrink-0 flex flex-col print:hidden z-20"
        style={{ background: "#09090b", borderRight: "1px solid rgba(255,255,255,0.05)" }}>

        {/* Brand */}
        <div className="px-4 pt-5 pb-4 shrink-0">
          <div className="flex items-center">
            <div className="min-w-0 flex-1">
              <p className="text-white font-semibold text-[16px] leading-none tracking-[-0.02em]">Enyla</p>
              <p className="text-zinc-600 text-[10px] font-medium mt-1">Gestão Gráfica</p>
            </div>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
              title={theme === "system" ? "Tema: sistema" : theme === "dark" ? "Tema: escuro" : "Tema: claro"}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors shrink-0"
            >
              {theme === "dark" ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg>
              ) : theme === "light" ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3" /></svg>
              )}
            </button>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 px-2 pb-2 overflow-y-auto" style={{ scrollbarWidth: "none" }}>

          <NavItem active={view === "dashboard"} onClick={() => navigate("dashboard")} label="Dashboard"
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>}
          />

          <NavGroup label="Orçamentos" />

          <NavItem active={view === "orcamento"} onClick={() => navigate("orcamento")} label="Novo orçamento" accent
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>}
          />
          <NavItem active={view === "historico"} onClick={() => navigate("historico")} label="Histórico"
            badge={historico.length + propostasCustom.length || undefined}
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
          />
          <NavItem active={view === "forma"} onClick={() => navigate("forma")} label="Forma IA"
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>}
          />

          <NavGroup label="Gestão" />

          <NavItem active={view === "kanban"} onClick={() => navigate("kanban")} label="Kanban"
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M3 8.25h3m0 0V6a.75.75 0 0 1 .75-.75H8.25m-5.25 3V18a.75.75 0 0 0 .75.75h2.25A.75.75 0 0 0 7 18V8.25m0 0H3m6.75-3.75H9m7.5 3.75h2.25m0 0V6a.75.75 0 0 0-.75-.75h-1.5A.75.75 0 0 0 15 6v2.25m3 0H15m0 9.75V8.25m0 9.75a.75.75 0 0 0 .75.75h1.5a.75.75 0 0 0 .75-.75V8.25m-3 9.75H15" /></svg>}
          />
          <NavItem active={view === "clientes"} onClick={() => navigate("clientes")} label="Clientes"
            badge={clientes.length || undefined}
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>}
          />
          <NavItem active={view === "parceiros"} onClick={() => navigate("parceiros")} label="Parceiros"
            badge={parceiros.length || undefined}
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" /></svg>}
          />
          <NavItem active={view === "financeiro"} onClick={() => navigate("financeiro")} label="Financeiro"
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>}
          />
        </div>

        {/* Bottom: Nova Proposta + Config */}
        <div className="px-2 py-3 shrink-0 space-y-1" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <button
            onClick={() => setModalPropostaCustom(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12.5px] font-semibold transition-all duration-100 text-white mb-1 bg-[#007AFF] hover:bg-[#0062CC] active:bg-[#004EA8]">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nova Proposta
          </button>
          <NavItem active={view === "config"} onClick={() => navigate("config")} label="Configurações"
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>}
          />
        </div>
      </nav>

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-[#1C1C1E] text-white text-[12.5px] font-medium px-4 py-3 rounded-xl shadow-lg border border-white/[0.08]">
          <span className="w-2 h-2 rounded-full bg-[#34C759] shrink-0" />
          {toast}
        </div>
      )}

      {/* ── Layout principal ────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ──── SIDEBAR ──────────────────────────────────────────────────────── */}
        {view === "orcamento" && (
        <aside className="w-72 shrink-0 bg-white border-r flex flex-col overflow-y-auto print:hidden" style={{ borderColor: "rgba(60,60,67,0.12)" }}>

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

          {/* Seção: Dimensões */}
          <FormSection label="Dimensões da caixa (cm)">
            <div className="grid grid-cols-3 gap-2">
              {(["frente","alturaBox","lateral"] as const).map(c => (
                <div key={c}>
                  <Label>{c === "frente" ? "Largura" : c === "alturaBox" ? "Altura" : "Profundidade"}</Label>
                  <NumberInput value={form[c]} onChange={v => set(c, v)} />
                </div>
              ))}
            </div>
            <div className="mt-2">
              <Label>Aba de colagem (cm)</Label>
              <NumberInput value={form.abaColagem} onChange={v => set("abaColagem", v)} min={0.5} max={2} />
            </div>
          </FormSection>

          {/* Seção: Material */}
          <FormSection label="Material / Gramatura">
            <div className="flex flex-col gap-1.5">
              {config.materiais.map(m => (
                <button key={m.id} type="button"
                  onClick={() => { set("materialId", m.id); set("materialNome", m.nome) }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border-2 text-left transition-all duration-150 ${
                    form.materialId === m.id
                      ? "border-[#007AFF]/30 bg-[#007AFF]/[0.04] shadow-sm"
                      : "border-[rgba(60,60,67,0.08)] hover:border-[rgba(60,60,67,0.12)] hover:bg-[rgba(116,116,128,0.04)]/50"
                  }`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-150 ${
                    form.materialId === m.id ? "border-[#007AFF] bg-[#007AFF]" : "border-slate-300"
                  }`}>
                    {form.materialId === m.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className={`text-[12.5px] font-medium transition-colors ${
                    form.materialId === m.id ? "text-[#007AFF]" : "text-[rgba(60,60,67,0.75)]"
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

            {/* Toggle Verniz */}
            <label className="flex items-center gap-2.5 py-1.5 cursor-pointer select-none group" onClick={() => set("incluirVerniz", !form.incluirVerniz)}>
              <div className={`w-8 h-4 rounded-full transition-colors relative ${form.incluirVerniz ? "bg-[#007AFF]" : "bg-slate-200"}`}>
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${form.incluirVerniz ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <span className="text-[12.5px] text-[rgba(60,60,67,0.6)] group-hover:text-slate-900 transition-colors duration-150">Verniz UV</span>
              <span className="ml-auto text-[#8E8E93] text-xs">{brl(config.custos.vernizPor2000)}/2k</span>
            </label>

            {/* Faca */}
            <div className="mt-3">
              <Label>Faca de corte</Label>
              <div className="flex rounded-xl border border-[rgba(60,60,67,0.12)] overflow-hidden mt-1">
                {([true, false] as const).map((v, i) => (
                  <button key={i} type="button"
                    onClick={() => { set("comFaca", v); if (!v) set("valorFaca", 0) }}
                    className={`flex-1 py-2 text-[12px] font-medium transition-colors ${
                      form.comFaca === v
                        ? "bg-[#1C1C1E] text-white"
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
                    className="w-full h-10 border border-[rgba(60,60,67,0.12)] rounded-xl pl-8 pr-3 py-2 text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] hover:border-slate-300 transition-all duration-150" />
                </div>
              )}
            </div>
          </FormSection>

          {/* Seção: Quantidades */}
          <FormSection label="Quantidades">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.quantidades.map(q => (
                <span key={q} className="inline-flex items-center gap-1 text-[11.5px] tabular-nums bg-[rgba(116,116,128,0.08)] hover:bg-slate-200 text-[rgba(60,60,67,0.75)] px-2.5 py-1 rounded-full font-medium transition-colors">
                  {num(q)}
                  <button onClick={() => set("quantidades", form.quantidades.filter(x => x !== q))}
                    className="text-[#8E8E93] hover:text-rose-500 leading-none transition-colors ml-0.5">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input type="number" value={novaQtd}
                onChange={e => setNovaQtd(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addQtd()}
                placeholder="Adicionar quantidade…"
                className="flex-1 border border-[rgba(60,60,67,0.12)] rounded-xl px-3 py-1.5 text-[13px] text-slate-900 placeholder:text-[rgba(60,60,67,0.3)] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF]" />
              <button onClick={addQtd}
                className="px-3 bg-[#007AFF] hover:bg-[#0062CC] text-white rounded-lg text-sm font-bold transition-colors">+</button>
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
                          ? "bg-[#1C1C1E] text-white border-slate-900"
                          : "border-[rgba(60,60,67,0.12)] text-[#8E8E93] hover:bg-[rgba(116,116,128,0.04)]"
                      }`}>
                      {d} dias
                    </button>
                  ))}
                  <input type="number" min={1} max={365}
                    value={form.validadeDias}
                    onChange={e => set("validadeDias", Math.max(1, Number(e.target.value)))}
                    className="w-20 border border-[rgba(60,60,67,0.12)] rounded-lg px-2 py-1.5 text-xs text-slate-900 text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF]"
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
                  className="w-full border border-[rgba(60,60,67,0.12)] rounded-xl px-3 py-2 text-[13px] text-slate-900 placeholder:text-[rgba(60,60,67,0.3)] resize-none focus:outline-none focus:ring-2 focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition"
                />
              </div>
              <div>
                <Label>Para o cliente</Label>
                <textarea
                  value={form.obsCliente}
                  onChange={e => set("obsCliente", e.target.value)}
                  placeholder="Aparece na proposta enviada ao cliente…"
                  rows={3}
                  className="w-full border border-[rgba(60,60,67,0.12)] rounded-xl px-3 py-2 text-[13px] text-slate-900 placeholder:text-[rgba(60,60,67,0.3)] resize-none focus:outline-none focus:ring-2 focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition"
                />
              </div>
            </div>
          </FormSection>

          {/* Ações */}
          <div className="p-5 mt-auto space-y-2 border-t border-[rgba(60,60,67,0.08)] bg-white">
            <button onClick={salvar} disabled={!r}
              className="w-full h-11 bg-[#007AFF] hover:bg-[#0062CC] active:bg-[#004EA8] active:scale-[0.99] disabled:opacity-30 disabled:cursor-not-allowed text-white text-[13px] font-bold rounded-xl transition-all duration-150 shadow-sm shadow-[#007AFF]/15 disabled:shadow-none">
              Salvar orçamento
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
                    className="flex-1 h-9 border border-[rgba(60,60,67,0.12)] hover:border-slate-300 hover:bg-[rgba(116,116,128,0.04)] text-[rgba(60,60,67,0.6)] text-[11.5px] font-medium rounded-xl transition-all duration-150">
                    PDF Gráfica
                  </button>
                  <button onClick={() => downloadPdfCliente({ form, calculo: r, data: new Date().toLocaleString("pt-BR") })}
                    className="flex-1 h-9 border border-[#007AFF]/25 hover:border-[#007AFF]/40 hover:bg-[#007AFF]/[0.04] text-[#007AFF] text-[11.5px] font-medium rounded-xl transition-all duration-150">
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
              <button onClick={() => { setForm(FORM_INICIAL); setResult(null) }}
                className="flex-1 h-9 border border-[rgba(60,60,67,0.12)] hover:bg-[rgba(116,116,128,0.04)] text-[#8E8E93] text-[11.5px] font-medium rounded-xl transition-all duration-150">
                Limpar
              </button>
            </div>
          </div>
        </aside>
        )}

        {/* ──── ÁREA PRINCIPAL ────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          {view === "dashboard" ? (
            <DashboardView
              historico={historico}
              kanban={kanban}
              propostasCustom={propostasCustom}
              clientes={clientes}
              config={config}
              lancamentos={lancamentos}
            />
          ) : view === "config" ? (
            <ConfigView
              config={config}
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
          ) : view === "forma" ? (
            <FormaView
              apiKey={config.apiKey}
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
              onReplicar={replicar}
              onWhatsApp={(item) => compartilharWhatsApp(item.form, item.calculo, item.numero)}
            />
          ) : view === "kanban" ? (
            <KanbanView
              cards={kanban}
              onMove={(id, coluna) => {
                const card = kanban.find(c => c.id === id)
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
              onDetalhes={(card) => {
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
            />
          ) : view === "historico" ? (
            <HistoricoView
              historico={historico}
              propostasCustom={propostasCustom}
              onReplicar={replicar}
              onDownloadPdf={downloadPdf}
              onDownloadPdfCliente={downloadPdfCliente}
              onExcluir={excluirHistorico}
              onWhatsApp={(item) => compartilharWhatsApp(item.form, item.calculo, item.numero)}
              onPdfCustom={(p) => abrirPdf(gerarHtmlPropostaCustom(p))}
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
                  setDetalheModal({ tipo: "proposta", proposta: item })
                } else {
                  setDetalheModal({ tipo: "historico", item })
                }
              }}
              onPersonalizar={(item) => {
                const cardId = kanban.find(c => c.numero === item.numero)?.id ?? `hist-${item.numero}`
                setModalSalvar({
                  form: item.form,
                  calculo: item.calculo,
                  numero: item.numero ?? "",
                  data: item.data,
                  cardId,
                })
              }}
            />
          ) : view === "financeiro" ? (
            <FinanceiroView
              lancamentos={lancamentos}
              kanban={kanban}
              negocios={negocios}
              lotes={lotes}
              onAdd={l => {
                setLancamentos(prev => [l, ...prev])
                fetch("/api/lancamentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(l) }).catch(() => {})
              }}
              onUpdate={(id, updates) => {
                setLancamentos(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x))
                fetch(`/api/lancamentos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) }).catch(() => {})
              }}
              onDelete={id => {
                setLancamentos(prev => prev.filter(x => x.id !== id))
                fetch(`/api/lancamentos/${id}`, { method: "DELETE" }).catch(() => {})
              }}
              onRegistrarSobra={abrirSobra}
            />
          ) : view === "parceiros" ? (
            <ParceirosView
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
          ) : !r ? (
            <EmptyState />
          ) : (
            <div className="max-w-6xl mx-auto px-6 py-5 space-y-5">

              {/* Header do orçamento */}
              {form.nomeCliente && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#007AFF] text-white text-xs font-bold flex items-center justify-center">
                    {form.nomeCliente[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-[#1C1C1E]">{form.nomeCliente}</p>
                    <p className="text-[#8E8E93] text-xs">{new Date().toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" })}</p>
                  </div>
                </div>
              )}

              {/* ── KPIs ── */}
              <div className="grid grid-cols-4 gap-3">
                <KpiCard label="Melhor formato" value={r.melhorFormato.formatoNome} sub={r.melhorFormato.orientacao} />
                <KpiCard label="Peças por folha" value={num(r.melhorFormato.pecasPorFolha)} sub={`${num(r.layoutChapa.pecasPorChapa)} por chapa`} />
                <KpiCard label="Chapas necessárias" value={num(r.numChapas)} sub={`${form.numArtes} arte${form.numArtes > 1 ? "s" : ""} · R$350/chapa`} accent />
                <KpiCard label="Custo impressão (fixo)" value={brl(r.custoImpressaoFixo)} sub="independe da tiragem" accent />
              </div>

              {/* ── Preview 3D ── */}
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

              {/* ── Dieline ── */}
              <Section title="Faca aberta — Dieline">
                <div className="flex flex-wrap gap-3">
                  {[
                    ["Largura aberta", `${(r.dieline.largura / 10).toFixed(1)} cm`, "2×frente + 2×lateral + cola"],
                    ["Altura aberta",  `${(r.dieline.altura / 10).toFixed(1)} cm`,  "caixa + aba sup + aba inf"],
                    ["Aba colagem",    `${(r.dieline.abaColagem / 10).toFixed(1)} cm`, ""],
                    ["Aba superior",   `${(r.dieline.abaSuperior / 10).toFixed(1)} cm`, "tuck flap"],
                    ["Aba inferior",   `${(r.dieline.abaInferior / 10).toFixed(1)} cm`, "fundo"],
                  ].map(([l, v, s]) => (
                    <div key={l} className="bg-[rgba(116,116,128,0.04)] border border-[rgba(60,60,67,0.08)] rounded-2xl px-4 py-2.5 min-w-[120px]">
                      <p className="text-[10px] uppercase tracking-wide text-[#8E8E93] font-semibold">{l}</p>
                      <p className="text-[#1C1C1E] font-bold text-lg leading-tight">{v}</p>
                      {s && <p className="text-[10px] text-[#8E8E93] mt-0.5">{s}</p>}
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── Comparação formatos ── */}
              <Section title="Comparação de formatos — 4 testes">
                <div className="rounded-xl overflow-hidden border border-[rgba(60,60,67,0.08)]">
                  <table className="w-full text-xs">
                    <thead className="bg-[rgba(116,116,128,0.04)]">
                      <tr>
                        {["Formato","Orient.","Col.","Lin.","Peças/folha","Aproveito.","R$/100 fls"].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-[rgba(0,0,0,0.04)]">
                      {r.formatos.map((f, i) => {
                        const best = f.formatoId === r.melhorFormato.formatoId && f.orientacao === r.melhorFormato.orientacao
                        return (
                          <tr key={i} className={best ? "bg-[#34C759]/[0.05]" : "hover:bg-[rgba(116,116,128,0.04)]"}>
                            <td className="px-3 py-2 font-medium text-[rgba(60,60,67,0.75)]">
                              {f.formatoNome}
                              {best && <span className="ml-2 text-[10px] bg-[#34C759]/[0.1] text-[#34C759] px-1.5 py-0.5 rounded-full font-semibold">✓ selecionado</span>}
                            </td>
                            <td className="px-3 py-2 text-[#8E8E93] capitalize">{f.orientacao}</td>
                            <td className="px-3 py-2 text-[rgba(60,60,67,0.6)]">{f.colunas}</td>
                            <td className="px-3 py-2 text-[rgba(60,60,67,0.6)]">{f.linhas}</td>
                            <td className={`px-3 py-2 font-bold ${best ? "text-[#34C759]" : "text-[rgba(60,60,67,0.75)]"}`}>{f.pecasPorFolha}</td>
                            <td className="px-3 py-2 text-[#8E8E93]">{num(f.aproveitamentoPct, 1)}%</td>
                            <td className="px-3 py-2 text-[#8E8E93]">{brl(f.precoPor100)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* ── Layout da chapa ── */}
              <Section title={`Layout da chapa — ${(r.layoutChapa.larguraChapa/10).toFixed(0)}×${(r.layoutChapa.alturaChapa/10).toFixed(0)} cm`}>
                <div className="bg-white rounded-xl border border-[rgba(60,60,67,0.08)] p-4">
                  <LayoutChapaVisual
                    layout={r.layoutChapa}
                    dieline={r.dieline}
                    formData={r.formData}
                    customPecas={form.customPecasChapa}
                    onCustomPecas={n => set("customPecasChapa", n)}
                  />
                  <div className="flex gap-5 mt-3 pt-3 border-t border-[rgba(60,60,67,0.06)] text-xs text-[#8E8E93]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 h-px bg-[#007AFF] block" /> linha de corte
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 border-t border-dashed border-red-500 block" /> vinco de dobra
                    </span>
                    <span className="flex items-center gap-1.5 ml-auto text-[rgba(60,60,67,0.3)]">
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
                      <table className="w-full text-xs whitespace-nowrap">
                        <thead>
                          <tr className="border-b border-[rgba(60,60,67,0.08)]">
                            <th className="sticky left-0 bg-[rgba(116,116,128,0.04)] px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold border-r border-[rgba(60,60,67,0.08)]">Qtd</th>
                            <th colSpan={3} className="px-3 py-2 text-center text-[10px] uppercase tracking-wider text-[rgba(60,60,67,0.3)] font-semibold border-r border-[rgba(60,60,67,0.06)]">Produção</th>
                            <th colSpan={form.incluirVerniz ? 6 : 5} className="px-3 py-2 text-center text-[10px] uppercase tracking-wider text-[rgba(60,60,67,0.3)] font-semibold border-r border-[rgba(60,60,67,0.06)]">Custos</th>
                            <th colSpan={form.comFaca ? 4 : 2} className="px-3 py-2 text-center text-[10px] uppercase tracking-wider text-[#007AFF]/70 font-semibold">Preços</th>
                          </tr>
                          <tr className="bg-[rgba(116,116,128,0.04)] border-b border-[rgba(60,60,67,0.08)]">
                            <th className="sticky left-0 bg-[rgba(116,116,128,0.04)] px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold border-r border-[rgba(60,60,67,0.08)]" />
                            <TH>Folhas</TH><TH>+10%</TH><TH br>Pacote</TH>
                            <TH>Papel</TH><TH>Impressão</TH><TH>Corte</TH>
                            {form.incluirVerniz && <TH>Verniz</TH>}
                            <TH>Colagem</TH><TH br>Arte</TH>
                            <TH blue>Custo s/faca</TH>
                            <TH blue>Preço s/faca</TH>
                            {form.comFaca && <><TH blue>Custo c/faca</TH><TH blue>Preço c/faca</TH></>}
                            <TH>Unit. s/f</TH>
                            {form.comFaca && <TH>Unit. c/f</TH>}
                            <TH>Margem s/f</TH>
                            {form.comFaca && <TH>Margem c/f</TH>}
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
                              incluirVerniz={form.incluirVerniz}
                              isMin={l.quantidade === r.sweetSpotMinimoQtd}
                              isIdeal={l.quantidade === r.sweetSpotIdealQtd}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Section>
              )}

              {/* ── Análise estratégica ── */}
              {r.tabela.length > 0 && <AnaliseEstrategica calculo={r} comFaca={form.comFaca} cliente={form.nomeCliente} />}

            </div>
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
            setKanban(prev => prev.map(c =>
              c.id === cid ? { ...c, ...updateData } : c
            ))
            fetch(`/api/kanban/${cid}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updateData),
            }).catch(() => {})
          }}
        />
      )}

      {/* ── Modal: detalhe ──────────────────────────────────────────────────── */}
      {detalheModal && (
        <ModalDetalhe
          data={detalheModal}
          parcFator={config.multiplicadores.parcelamento12x}
          onClose={() => setDetalheModal(null)}
          onEditar={(p) => { setDetalheModal(null); setEditandoProposta(p) }}
          onSaveDelivery={"card" in detalheModal && detalheModal.card ? salvarDataEntrega : undefined}
          onSaveDeliveryReal={"card" in detalheModal && detalheModal.card ? salvarDataEntregaReal : undefined}
          onSaveCloseDate={"card" in detalheModal && detalheModal.card ? salvarDataFechamento : undefined}
          onRegistrarSobra={"card" in detalheModal && detalheModal.card ? abrirSobra : undefined}
          onSaveFornecedor={"card" in detalheModal && detalheModal.card ? salvarFornecedor : undefined}
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
          }))}
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
          }))}
          onWhatsApp={(p) => compartilharWhatsAppCustom(p)}
          onUpsertCliente={(nome, updates) => {
            const existing = clientes.find(c => c.nome.toLowerCase() === nome.toLowerCase())
            existing ? atualizarCliente(existing.id, updates) : criarClienteComDados(nome, updates)
          }}
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
              <div className="w-10 h-10 rounded-xl bg-[#007AFF]/10 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-[#007AFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <p className="font-bold text-[#1C1C1E] text-[15px] leading-snug">Sinal de entrada?</p>
              <p className="text-[#8E8E93] text-[12.5px] mt-1">
                O cliente <span className="font-semibold text-[rgba(60,60,67,0.75)]">{nomeCliente}</span> deixou algum valor de entrada ao fechar o pedido de <span className="font-semibold text-[rgba(60,60,67,0.75)]">{brl(preco)}</span>?
              </p>
            </div>
            <div className="flex gap-2 px-6 pb-5">
              <button onClick={onClose}
                className="flex-1 py-2.5 text-[13px] text-[#8E8E93] hover:text-[rgba(60,60,67,0.75)] hover:bg-[rgba(116,116,128,0.04)] rounded-xl transition-colors font-medium border border-[rgba(60,60,67,0.12)]">
                Não, pular
              </button>
              <button onClick={() => setStep("form")}
                className="flex-1 py-2.5 text-[13px] font-bold text-white rounded-xl transition-colors"
                style={{ background: "#007AFF" }}>
                Sim, registrar
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Form */}
            <div className="px-6 pt-5 pb-2 border-b border-[rgba(60,60,67,0.08)]">
              <div className="flex items-center justify-between">
                <p className="font-bold text-[#1C1C1E] text-[15px]">Registrar sinal</p>
                <button onClick={onClose} className="text-[rgba(60,60,67,0.3)] hover:text-[#8E8E93] text-xl leading-none">×</button>
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
                    className="w-full h-11 border border-[rgba(60,60,67,0.12)] rounded-xl pl-9 pr-3 text-[14px] font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all"
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
                          ? "bg-[#007AFF] text-white border-[#007AFF] shadow-sm"
                          : "border-[rgba(60,60,67,0.12)] text-[rgba(60,60,67,0.6)] hover:border-slate-300 hover:bg-[rgba(116,116,128,0.04)]"
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
                style={{ background: "#007AFF" }}>
                Confirmar sinal
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
