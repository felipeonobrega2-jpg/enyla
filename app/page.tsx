"use client"

import React, { useState, useCallback, useEffect } from "react"
import { FormData, Calculo, PropostaCustom, Cliente, KanbanCard, COL_FECHADO, COLUNAS_KANBAN } from "./types"
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
import { ClienteCombobox, ClienteContactCard } from "./components/ClienteFields"
import { ModalPersonalizarProposta } from "./components/ModalPersonalizarProposta"
import { ModalPropostaCustom, BoxPreview3D } from "./components/ModalPropostaCustom"
import { ModalDetalhe, DetalheData } from "./components/ModalDetalhe"

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
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] transition-all ${
        active
          ? "bg-white/10 text-white font-semibold"
          : accent
            ? "text-white font-semibold bg-white/7 hover:bg-white/12 ring-1 ring-inset ring-white/10"
            : "text-slate-400 hover:text-slate-200 hover:bg-white/5 font-medium"
      }`}>
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-slate-400 tabular-nums">
          {badge}
        </span>
      )}
    </button>
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
  const [view, setView]       = useState<"orcamento" | "historico" | "clientes" | "kanban" | "forma" | "config" | "dashboard">("orcamento")
  const [config, setConfig]   = useState<Configuracoes>(CONFIG_PADRAO)
  const [modalSalvar, setModalSalvar] = useState<{ form: FormData; calculo: Calculo; numero: string; data: string; cardId: string } | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [propostasCustom, setPropostasCustom] = useState<PropostaCustom[]>([])
  const [contadorProp, setContadorProp] = useState<number>(0)
  const [modalPropostaCustom, setModalPropostaCustom] = useState(false)
  const [editandoProposta, setEditandoProposta] = useState<PropostaCustom | null>(null)
  const [detalheModal, setDetalheModal] = useState<DetalheData | null>(null)

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
      })
      .catch(() => {})
  }, [])

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
    const linhasAtivas = draft.linhas.filter(l => l.ativa && l.quantidade > 0)
    const idealLinha = linhasAtivas.find(l => l.isIdeal) ?? linhasAtivas[linhasAtivas.length - 1]

    const novaProposta: PropostaCustom = { ...draft, id: cardId, numero, data, cardId }
    setPropostasCustom(prev => [novaProposta, ...prev])
    fetch("/api/propostas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...novaProposta, contadorProp: novoContador }),
    }).catch(() => {})

    const card: KanbanCard = {
      id: cardId,
      numero,
      nomeCliente: draft.nomeCliente || "Sem nome",
      dimensoes: draft.dimensoes || draft.descricao || "Proposta personalizada",
      materialNome: draft.material,
      preco: idealLinha ? idealLinha.unitario * idealLinha.quantidade : 0,
      quantidade: idealLinha?.quantidade ?? 0,
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
    <div className="h-screen flex bg-slate-50 overflow-hidden text-[13px]">

      {/* ── Left Navigation Sidebar ─────────────────────────────────────── */}
      <nav className="w-[220px] shrink-0 flex flex-col border-r border-white/5 print:hidden z-20"
        style={{ background: "#0f172a" }}>

        {/* Brand */}
        <div className="px-4 py-[18px] border-b border-white/5 shrink-0">
          <div className="flex items-center gap-0 leading-none min-w-0">
            <p className="text-white font-black tracking-tight text-[15px]">ENYLA</p>
            <p className="text-slate-500 text-[10px] mt-auto mb-0.5 ml-2">Orçamentista</p>
          </div>
        </div>

        {/* Nav items */}
        <div className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto scrollbar-none">

          <NavItem active={view === "dashboard"} onClick={() => setView("dashboard")} label="Dashboard"
            icon={<svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>}
          />

          <div className="h-px bg-white/5 my-2 mx-1" />

          <NavItem active={view === "orcamento"} onClick={() => setView("orcamento")} label="Novo orçamento" accent
            icon={<svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>}
          />

          <NavItem active={view === "historico"} onClick={() => setView("historico")} label="Histórico"
            badge={historico.length + propostasCustom.length || undefined}
            icon={<svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
          />

          <NavItem active={view === "clientes"} onClick={() => setView("clientes")} label="Clientes"
            badge={clientes.length || undefined}
            icon={<svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>}
          />

          <NavItem active={view === "kanban"} onClick={() => setView("kanban")} label="Kanban"
            icon={<svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M3 8.25h3m0 0V6a.75.75 0 0 1 .75-.75H8.25m-5.25 3V18a.75.75 0 0 0 .75.75h2.25A.75.75 0 0 0 7 18V8.25m0 0H3m6.75-3.75H9m7.5 3.75h2.25m0 0V6a.75.75 0 0 0-.75-.75h-1.5A.75.75 0 0 0 15 6v2.25m3 0H15m0 9.75V8.25m0 9.75a.75.75 0 0 0 .75.75h1.5a.75.75 0 0 0 .75-.75V8.25m-3 9.75H15" /></svg>}
          />

          <div className="h-px bg-white/5 my-2 mx-1" />

          <NavItem active={view === "forma"} onClick={() => setView("forma")} label="Forma ✦"
            icon={<svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>}
          />
        </div>

        {/* Bottom: Nova Proposta + Config */}
        <div className="px-2 py-3 border-t border-white/5 shrink-0 space-y-1">
          <button
            onClick={() => setModalPropostaCustom(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[12.5px] font-semibold transition-all shadow-sm shadow-blue-900/30 mb-2">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nova Proposta
          </button>
          <NavItem active={view === "config"} onClick={() => setView("config")} label="Configurações"
            icon={<svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>}
          />
        </div>
      </nav>

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-slate-900 text-white text-[12.5px] font-medium px-4 py-3 rounded-xl shadow-2xl border border-white/10">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
          {toast}
        </div>
      )}

      {/* ── Layout principal ────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ──── SIDEBAR ──────────────────────────────────────────────────────── */}
        {view === "orcamento" && (
        <aside className="w-72 shrink-0 bg-white border-r border-slate-100/80 flex flex-col overflow-y-auto print:hidden">

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
                      ? "border-blue-500/40 bg-blue-50/50 shadow-sm"
                      : "border-slate-100 hover:border-slate-200 hover:bg-slate-50/50"
                  }`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-150 ${
                    form.materialId === m.id ? "border-blue-600 bg-blue-600" : "border-slate-300"
                  }`}>
                    {form.materialId === m.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className={`text-[12.5px] font-medium transition-colors ${
                    form.materialId === m.id ? "text-blue-900" : "text-slate-700"
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
              <div className={`w-8 h-4 rounded-full transition-colors relative ${form.incluirVerniz ? "bg-blue-600" : "bg-slate-200"}`}>
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${form.incluirVerniz ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <span className="text-[12.5px] text-slate-600 group-hover:text-slate-900 transition-colors duration-150">Verniz UV</span>
              <span className="ml-auto text-slate-400 text-xs">{brl(config.custos.vernizPor2000)}/2k</span>
            </label>

            {/* Faca */}
            <div className="mt-3">
              <Label>Faca de corte</Label>
              <div className="flex rounded-xl border border-slate-200 overflow-hidden mt-1">
                {([true, false] as const).map((v, i) => (
                  <button key={i} type="button"
                    onClick={() => { set("comFaca", v); if (!v) set("valorFaca", 0) }}
                    className={`flex-1 py-2 text-[12px] font-medium transition-colors ${
                      form.comFaca === v
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:bg-slate-50"
                    }`}>
                    {v ? "Com faca" : "Sem faca"}
                  </button>
                ))}
              </div>
              {form.comFaca && (
                <div className="mt-2 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">R$</span>
                  <input type="number" min={0}
                    value={form.valorFaca || ""}
                    onChange={e => set("valorFaca", Number(e.target.value))}
                    placeholder="Valor da faca"
                    className="w-full h-10 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:border-slate-300 transition-all duration-150" />
                </div>
              )}
            </div>
          </FormSection>

          {/* Seção: Quantidades */}
          <FormSection label="Quantidades">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.quantidades.map(q => (
                <span key={q} className="inline-flex items-center gap-1 text-[11.5px] tabular-nums bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full font-medium transition-colors">
                  {num(q)}
                  <button onClick={() => set("quantidades", form.quantidades.filter(x => x !== q))}
                    className="text-slate-400 hover:text-rose-500 leading-none transition-colors ml-0.5">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input type="number" value={novaQtd}
                onChange={e => setNovaQtd(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addQtd()}
                placeholder="Adicionar quantidade…"
                className="flex-1 border border-slate-200 rounded-xl px-3 py-1.5 text-[13px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <button onClick={addQtd}
                className="px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors">+</button>
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
                          ? "bg-slate-900 text-white border-slate-900"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}>
                      {d} dias
                    </button>
                  ))}
                  <input type="number" min={1} max={365}
                    value={form.validadeDias}
                    onChange={e => set("validadeDias", Math.max(1, Number(e.target.value)))}
                    className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <Label>Para o cliente</Label>
                <textarea
                  value={form.obsCliente}
                  onChange={e => set("obsCliente", e.target.value)}
                  placeholder="Aparece na proposta enviada ao cliente…"
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </div>
          </FormSection>

          {/* Ações */}
          <div className="p-5 mt-auto space-y-2 border-t border-slate-100 bg-white">
            <button onClick={salvar} disabled={!r}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.99] disabled:opacity-30 disabled:cursor-not-allowed text-white text-[13px] font-bold rounded-xl transition-all duration-150 shadow-md shadow-blue-600/20 disabled:shadow-none">
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
                    className="flex-1 h-9 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 text-[11.5px] font-medium rounded-xl transition-all duration-150">
                    PDF Gráfica
                  </button>
                  <button onClick={() => downloadPdfCliente({ form, calculo: r, data: new Date().toLocaleString("pt-BR") })}
                    className="flex-1 h-9 border border-blue-200 hover:border-blue-300 hover:bg-blue-50/50 text-blue-600 text-[11.5px] font-medium rounded-xl transition-all duration-150">
                    PDF Cliente
                  </button>
                </div>
              </>
            )}
            <div className="flex gap-2">
              <button onClick={() => window.print()}
                className="flex-1 h-9 border border-slate-200 hover:bg-slate-50 text-slate-500 text-[11.5px] font-medium rounded-xl transition-all duration-150">
                Imprimir
              </button>
              <button onClick={() => { setForm(FORM_INICIAL); setResult(null) }}
                className="flex-1 h-9 border border-slate-200 hover:bg-slate-50 text-slate-500 text-[11.5px] font-medium rounded-xl transition-all duration-150">
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
                setKanban(prev => prev.map(c => c.id === id ? { ...c, coluna } : c))
                fetch(`/api/kanban/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ coluna }),
                }).catch(() => {})
                if (card?.numero) atualizarTracking(card.numero, coluna)
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
                setKanban(prev => prev.map(c =>
                  c.id === id ? { ...c, coluna: COL_FECHADO, preco: opcao.preco, quantidade: opcao.quantidade } : c
                ))
                fetch(`/api/kanban/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ coluna: COL_FECHADO, preco: opcao.preco, quantidade: opcao.quantidade }),
                }).catch(() => {})
                if (card?.numero) atualizarTracking(card.numero, COL_FECHADO, opcao.preco, opcao.quantidade)
              }}
              onDetalhes={(card) => {
                const histItem = historico.find(h => h.numero === card.numero)
                if (histItem) { setDetalheModal({ tipo: "historico", item: histItem, card }); return }
                const proposta = propostasCustom.find(p => p.cardId === card.id)
                if (proposta) { setDetalheModal({ tipo: "proposta", proposta, card }); return }
                setDetalheModal({ tipo: "kanban", card })
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
          ) : !r ? (
            <EmptyState />
          ) : (
            <div className="max-w-6xl mx-auto px-6 py-5 space-y-5">

              {/* Header do orçamento */}
              {form.nomeCliente && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                    {form.nomeCliente[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{form.nomeCliente}</p>
                    <p className="text-slate-400 text-xs">{new Date().toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" })}</p>
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
                <div className="bg-white rounded-xl border border-slate-100 p-4">
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
                    <div key={l} className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5 min-w-[120px]">
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{l}</p>
                      <p className="text-slate-800 font-bold text-lg leading-tight">{v}</p>
                      {s && <p className="text-[10px] text-slate-400 mt-0.5">{s}</p>}
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── Comparação formatos ── */}
              <Section title="Comparação de formatos — 4 testes">
                <div className="rounded-xl overflow-hidden border border-slate-100">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        {["Formato","Orient.","Col.","Lin.","Peças/folha","Aproveito.","R$/100 fls"].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-50">
                      {r.formatos.map((f, i) => {
                        const best = f.formatoId === r.melhorFormato.formatoId && f.orientacao === r.melhorFormato.orientacao
                        return (
                          <tr key={i} className={best ? "bg-emerald-50" : "hover:bg-slate-50"}>
                            <td className="px-3 py-2 font-medium text-slate-700">
                              {f.formatoNome}
                              {best && <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">✓ selecionado</span>}
                            </td>
                            <td className="px-3 py-2 text-slate-400 capitalize">{f.orientacao}</td>
                            <td className="px-3 py-2 text-slate-600">{f.colunas}</td>
                            <td className="px-3 py-2 text-slate-600">{f.linhas}</td>
                            <td className={`px-3 py-2 font-bold ${best ? "text-emerald-700" : "text-slate-700"}`}>{f.pecasPorFolha}</td>
                            <td className="px-3 py-2 text-slate-500">{num(f.aproveitamentoPct, 1)}%</td>
                            <td className="px-3 py-2 text-slate-500">{brl(f.precoPor100)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* ── Layout da chapa ── */}
              <Section title={`Layout da chapa — ${(r.layoutChapa.larguraChapa/10).toFixed(0)}×${(r.layoutChapa.alturaChapa/10).toFixed(0)} cm`}>
                <div className="bg-white rounded-xl border border-slate-100 p-4">
                  <LayoutChapaVisual
                    layout={r.layoutChapa}
                    dieline={r.dieline}
                    formData={r.formData}
                    customPecas={form.customPecasChapa}
                    onCustomPecas={n => set("customPecasChapa", n)}
                  />
                  <div className="flex gap-5 mt-3 pt-3 border-t border-slate-50 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 h-px bg-blue-700 block" /> linha de corte
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 border-t border-dashed border-red-500 block" /> vinco de dobra
                    </span>
                    <span className="flex items-center gap-1.5 ml-auto text-slate-300">
                      Clique em ↻ para rotacionar individualmente
                    </span>
                  </div>
                </div>
              </Section>

              {/* ── Tabela de orçamento ── */}
              {r.tabela.length > 0 && (
                <Section title="Tabela de orçamento">
                  <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs whitespace-nowrap">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="sticky left-0 bg-slate-50 px-4 py-3 text-left text-[10px] uppercase tracking-wider text-slate-400 font-semibold border-r border-slate-100">Qtd</th>
                            <th colSpan={3} className="px-3 py-2 text-center text-[10px] uppercase tracking-wider text-slate-300 font-semibold border-r border-slate-50">Produção</th>
                            <th colSpan={form.incluirVerniz ? 6 : 5} className="px-3 py-2 text-center text-[10px] uppercase tracking-wider text-slate-300 font-semibold border-r border-slate-50">Custos</th>
                            <th colSpan={form.comFaca ? 4 : 2} className="px-3 py-2 text-center text-[10px] uppercase tracking-wider text-blue-400 font-semibold">Preços</th>
                          </tr>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="sticky left-0 bg-slate-50 px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-slate-400 font-semibold border-r border-slate-100" />
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
        />
      )}

      {/* ── Modal: proposta personalizada ──────────────────────────────────── */}
      {modalPropostaCustom && (
        <ModalPropostaCustom
          clientes={clientes}
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
            setPropostasCustom(prev => prev.map(p => p.id === atualizada.id ? atualizada : p))
            setKanban(prev => prev.map(c => c.id === atualizada.cardId
              ? { ...c,
                  nomeCliente: atualizada.nomeCliente,
                  dimensoes: atualizada.descricao,
                  materialNome: atualizada.material,
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
              body: JSON.stringify({ nomeCliente: atualizada.nomeCliente, dimensoes: atualizada.descricao, materialNome: atualizada.material }),
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
        />
      )}
    </div>
  )
}
