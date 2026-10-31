"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Palette, Scissors, Package, Paperclip, FileText, Factory, User, Home, Building2, Megaphone, Wrench, ClipboardList, Printer, Star, Square, MessageCircle, Link2 } from "lucide-react"
import type { FormData, Calculo, PropostaCustom, KanbanCard, LancamentoFinanceiro, PedidoArquivo, ProjecaoCustos, PrazoEtapas } from "../types"
import { COLUNAS_KANBAN, COL_FECHADO, COL_EXPEDICAO, COL_PERDIDO } from "../types"
import { brl, num } from "../utils"

const CORES_RAPIDAS = ["4x0", "4x4", "2x0", "1x0", "1x1"]
const ACABAMENTOS_OPCOES = ["Verniz UV", "Laminação fosca", "Laminação brilho", "Hot stamp", "Relevo seco", "Corte e vinco"]
const TIPO_ARQUIVO_ICON: Record<string, React.ElementType> = { arte: Palette, faca: Scissors, mockup: Package, referencia: Paperclip, outro: FileText }
const TIPO_LABEL = { arte: "Arte", faca: "Faca", mockup: "Mockup", referencia: "Ref.", outro: "Outro" } as const

type HistItem = { form: FormData; calculo: Calculo; data: string; numero?: string }

export type DetalheData =
  | { tipo: "historico"; item: HistItem;         card?: KanbanCard }
  | { tipo: "proposta";  proposta: PropostaCustom; card?: KanbanCard }
  | { tipo: "kanban";    card: KanbanCard }

export function ModalDetalhe({
  data, parcFator, onClose, onEditar, onEditarHistorico, onPersonalizarHistorico,
  onSaveDelivery, onSaveDeliveryReal, onSaveCloseDate,
  onRegistrarSobra, onSaveFornecedor, onEmitirOS, onSaveCardExtras, onSaveProjecao, onSavePrazos, onMoveEtapa, onSavePreco, lancamentos,
}: {
  data: DetalheData
  parcFator: number
  onClose: () => void
  onEditar?: (p: PropostaCustom) => void
  onEditarHistorico?: (item: HistItem) => void
  onPersonalizarHistorico?: (item: HistItem) => void
  onSaveDelivery?: (cardId: string, date: string | null) => void
  onSaveDeliveryReal?: (cardId: string, date: string | null) => void
  onSaveCloseDate?: (cardId: string, date: string) => void
  onRegistrarSobra?: (card: KanbanCard) => void
  onSaveFornecedor?: (cardId: string, fornecedor: string | null, custo: number | null) => void
  onEmitirOS?: (card: KanbanCard) => void
  onSaveCardExtras?: (cardId: string, extras: { cores?: string; acabamentos?: string[]; observacoesOS?: string }) => void
  onSaveProjecao?: (cardId: string, proj: ProjecaoCustos) => void
  onSavePrazos?: (cardId: string, prazos: PrazoEtapas) => void
  onMoveEtapa?: (cardId: string, coluna: number) => void
  onSavePreco?: (cardId: string, preco: number) => void
  lancamentos?: LancamentoFinanceiro[]
}) {
  const isH = data.tipo === "historico"
  const isP = data.tipo === "proposta"
  const isK = data.tipo === "kanban"
  const card = isK ? data.card : data.card

  // ── Editable state ──────────────────────────────────────────────────────────
  const [closeDate,         setCloseDate]         = useState(card?.dataFechamento       ?? "")
  const [deliveryDate,      setDeliveryDate]      = useState(card?.dataEntregaPrevista  ?? "")
  const [deliveryRealDate,  setDeliveryRealDate]  = useState(card?.dataEntregaReal      ?? "")
  const [fornecedor,        setFornecedor]        = useState(card?.fornecedor            ?? "")
  const [custoTerceiro,     setCustoTerceiro]     = useState(card?.custoTerceiro?.toString() ?? "")
  const [coluna, setColuna]               = useState(card?.coluna ?? 0)
  const [saving, setSaving]               = useState(false)
  const [pixCopied, setPixCopied]         = useState(false)
  const [pedidoOpen, setPedidoOpen]       = useState(false)
  const [openSections, setOpenSections]   = useState<Set<string>>(new Set(["financeiro", "opcoes", "prazos"]))
  const [arquivos, setArquivos]           = useState<PedidoArquivo[]>([])
  const [uploading, setUploading]         = useState(false)
  const [linkCopied, setLinkCopied]       = useState(false)
  const [cores, setCores]                 = useState(card?.cores ?? "")
  const [acabamentos, setAcabamentos]     = useState<string[]>(card?.acabamentos ?? [])
  const [obsOS, setObsOS]                 = useState(card?.observacoesOS ?? "")
  const fileInputRef = useRef<HTMLInputElement>(null)
  type Etapa = { coluna: number; nome: string; dataHora: string; tipo?: string; detalhe?: string }
  const [etapasLog, setEtapasLog]         = useState<Etapa[] | null>(null)
  const [obsInput, setObsInput]           = useState("")
  const [savingObs, setSavingObs]         = useState(false)
  const [editingPreco, setEditingPreco]   = useState(false)
  const [precoInput, setPrecoInput]       = useState((card?.preco ?? 0).toFixed(2))

  // ── Prazos state ─────────────────────────────────────────────────────────
  const [prazos, setPrazos] = useState<PrazoEtapas>(card?.prazos ?? {})

  function setPrazoEtapa(key: keyof PrazoEtapas, value: string) {
    const next = { ...prazos }
    if (value) next[key] = value
    else delete next[key]
    setPrazos(next)
    if (card) onSavePrazos?.(card.id, next)
  }

  // ── Projeção de Custos state ─────────────────────────────────────────────
  const [proj, setProj] = useState<ProjecaoCustos>(card?.projecaoCustos ?? {})
  const [savingProj, setSavingProj] = useState(false)
  const projTotal = (proj.papel ?? 0) + (proj.impressao ?? 0) + (proj.corte ?? 0) +
    (proj.verniz ?? 0) + (proj.colagem ?? 0) + (proj.arte ?? 0) +
    (proj.faca ?? 0) + (proj.hotstamping ?? 0) + (proj.corteVinco ?? 0) + (proj.outros ?? 0)
  const projMargem = isK && card && card.preco > 0 && projTotal > 0
    ? ((card.preco - projTotal) / card.preco) * 100 : null

  function setField(k: keyof ProjecaoCustos, v: string) {
    if (k === "obs") { setProj(p => ({ ...p, obs: v })); return }
    const n = v === "" ? undefined : parseFloat(v)
    setProj(p => ({ ...p, [k]: isNaN(n as number) ? undefined : n }))
  }

  async function saveProjecao() {
    if (!card || !onSaveProjecao) return
    setSavingProj(true)
    await onSaveProjecao(card.id, proj)
    setSavingProj(false)
  }

  const trackingNumero = card?.numero ?? (isH ? (data as { tipo: "historico"; item: { numero?: string } }).item.numero : undefined)

  const fetchHistorico = useCallback(async () => {
    if (!trackingNumero) { setEtapasLog([]); return }
    try {
      const res = await fetch(`/api/track/${encodeURIComponent(trackingNumero)}`)
      if (res.ok) { const d = await res.json(); setEtapasLog(d.etapas ?? []) }
      else setEtapasLog([])
    } catch { setEtapasLog([]) }
  }, [trackingNumero])

  async function addObservacao() {
    const text = obsInput.trim()
    if (!text || !trackingNumero) return
    setSavingObs(true)
    const now = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    const novaEtapa: Etapa = { coluna: card?.coluna ?? 0, nome: "Observação", tipo: "observacao", detalhe: text, dataHora: now }
    const novasEtapas = [...(etapasLog ?? []), novaEtapa]
    setEtapasLog(novasEtapas)
    setObsInput("")
    await fetch(`/api/track/${encodeURIComponent(trackingNumero)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nomeCliente:  card?.nomeCliente ?? "",
        descricao:    card?.dimensoes  ?? "",
        materialNome: card?.materialNome ?? "",
        quantidade:   card?.quantidade ?? 0,
        preco:        card?.preco ?? 0,
        colunaAtual:  card?.coluna ?? 0,
        etapas:       novasEtapas,
        criadoEm:     card?.data ?? "",
      }),
    }).catch(() => {})
    setSavingObs(false)
  }

  // history auto-loaded on mount via fetchHistorico effect below

  const fetchArquivos = useCallback(async () => {
    if (!card?.id) return
    const res = await fetch(`/api/pedido/${card.id}/arquivos`)
    if (res.ok) setArquivos(await res.json())
  }, [card?.id])

  useEffect(() => { if (pedidoOpen) fetchArquivos() }, [pedidoOpen, fetchArquivos])

  async function handleUpload(files: FileList | null) {
    if (!files || !card) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("cardNumero", card.numero)
      const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
      const tipo = ["pdf", "ai", "psd", "eps", "png", "jpg", "jpeg", "svg", "tiff"].includes(ext) ? "arte"
                 : ["dxf", "cdr"].includes(ext) ? "faca" : "outro"
      fd.append("tipo", tipo)
      await fetch(`/api/pedido/${card.id}/arquivos`, { method: "POST", body: fd })
    }
    setUploading(false)
    fetchArquivos()
  }

  async function handleDeleteArquivo(id: string) {
    if (!card) return
    await fetch(`/api/pedido/${card.id}/arquivos/${id}`, { method: "DELETE" })
    setArquivos(prev => prev.filter(a => a.id !== id))
  }

  function saveExtras() {
    if (!card || !onSaveCardExtras) return
    onSaveCardExtras(card.id, { cores: cores.trim() || undefined, acabamentos, observacoesOS: obsOS.trim() || undefined })
  }

  const isTerceirizado = card?.materialNome === "Terceirizado"

  const despesasVinculadas = useMemo(() => {
    if (!card || !lancamentos) return []
    return lancamentos.filter(l => l.tipo === "despesa" && l.cardId === card.id && (l.status === "pago" || l.formaPagamento === "conta"))
  }, [card, lancamentos])
  const totalDespesas = despesasVinculadas.reduce((s, l) => s + l.valor, 0)
  const margemContrib = (card?.preco ?? 0) - totalDespesas

  // Financeiro detalhado — igual PedidosView, inclui lote se aplicável
  const finReceitasCard  = useMemo(() => lancamentos?.filter(l => l.tipo === "receita" && (l.cardId === card?.id || (card?.loteId && l.loteId === card?.loteId))) ?? [], [lancamentos, card?.id, card?.loteId])
  const finDespesasCard  = useMemo(() => lancamentos?.filter(l => l.tipo === "despesa" && (l.cardId === card?.id || (card?.loteId && l.loteId === card?.loteId))) ?? [], [lancamentos, card?.id, card?.loteId])
  const finReceitasPagas = useMemo(() => finReceitasCard.filter(l => l.status === "pago"), [finReceitasCard])
  const finDespesasPagas = useMemo(() => finDespesasCard.filter(l => l.status === "pago" || l.formaPagamento === "conta"), [finDespesasCard])
  const finTotalRecebido = useMemo(() => finReceitasPagas.reduce((s, l) => s + l.valor, 0), [finReceitasPagas])
  const finTotalDesp     = useMemo(() => finDespesasCard.reduce((s, l) => s + l.valor, 0), [finDespesasCard])
  // base para margem: valor orçado + sobras lançadas (o custo já inclui as unidades extras), pagas ou não
  const finSobras        = useMemo(() => finReceitasCard.filter(l => l.categoria === "sobra").reduce((s, l) => s + l.valor, 0), [finReceitasCard])
  const finBase          = (card?.preco ?? 0) + finSobras
  const finResultado     = finBase - finTotalDesp
  const finSemDados      = finReceitasCard.length === 0 && finDespesasCard.length === 0
  const finMargemPct     = !finSemDados && finBase > 0 ? ((finBase - finTotalDesp) / finBase) * 100 : null
  const finPercPagoBruto = finBase > 0 ? (finTotalRecebido / finBase) * 100 : 0
  const finPercPago      = Math.min(100, finPercPagoBruto)
  const finCmvUnit       = finTotalDesp > 0 && (card?.quantidade ?? 0) > 0 ? finTotalDesp / (card?.quantidade ?? 1) : null

  // Dirty check — only relevant fields
  const isDirty = useMemo(() => {
    if (!card) return false
    if (onSaveCloseDate && card.coluna !== COL_PERDIDO
        && closeDate !== (card.dataFechamento ?? "") && closeDate) return true
    if (onSaveDelivery     && deliveryDate     !== (card.dataEntregaPrevista  ?? "")) return true
    if (onSaveDeliveryReal && deliveryRealDate !== (card.dataEntregaReal      ?? "")) return true
    if (onSaveFornecedor && isTerceirizado &&
        (fornecedor    !== (card.fornecedor        ?? "") ||
         custoTerceiro !== (card.custoTerceiro?.toString() ?? ""))) return true
    return false
  }, [card, closeDate, deliveryDate, deliveryRealDate, fornecedor, custoTerceiro,
      onSaveCloseDate, onSaveDelivery, onSaveDeliveryReal, onSaveFornecedor, isTerceirizado])

  function handleSave() {
    if (!card || !isDirty) return
    setSaving(true)
    if (onSaveCloseDate && closeDate && closeDate !== (card.dataFechamento ?? ""))
      onSaveCloseDate(card.id, closeDate)
    if (onSaveDelivery && deliveryDate !== (card.dataEntregaPrevista ?? ""))
      onSaveDelivery(card.id, deliveryDate || null)
    if (onSaveDeliveryReal && deliveryRealDate !== (card.dataEntregaReal ?? ""))
      onSaveDeliveryReal(card.id, deliveryRealDate || null)
    if (onSaveFornecedor && isTerceirizado)
      onSaveFornecedor(card.id, fornecedor.trim() || null, custoTerceiro ? parseFloat(custoTerceiro) : null)
    setSaving(false)
    onClose()
  }

  const numero    = isH ? (data.item.numero ?? "")        : isP ? data.proposta.numero     : data.card.numero
  const nome      = isH ? data.item.form.nomeCliente       : isP ? data.proposta.nomeCliente : (data.card.loteNumero ?? data.card.nomeCliente)
  const nomeSecundario = isK && data.card.loteNumero ? data.card.nomeCliente : null
  const dataStr   = isH ? data.item.data                   : isP ? data.proposta.data        : data.card.data


  const pixPreco  = card?.preco ?? 0
  const pixNumero = numero
  const pixCliente = nome
  const showPix   = (isK || isP) && pixPreco > 0

  const showSobra = card && onRegistrarSobra &&
    card.coluna >= COL_EXPEDICAO && card.coluna !== COL_PERDIDO

  function fmtDate(iso: string) {
    return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })
  }

  // ── Font + history auto-load ─────────────────────────────────────────────
  useEffect(() => {
    if (!document.getElementById('jb-mono-font')) {
      const l = document.createElement('link')
      l.id = 'jb-mono-font'; l.rel = 'stylesheet'
      l.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap'
      document.head.appendChild(l)
    }
  }, [])
  useEffect(() => { fetchHistorico() }, [fetchHistorico])
  useEffect(() => { if (card?.id) fetchArquivos() }, [card?.id, fetchArquivos])

  // Fonte do sistema; números usam dígitos tabulares (ver .ds-num) em vez de fonte mono
  const MONO = "inherit"
  const INTER = "inherit"
  const FIN_FORMA_PAG: Record<string, string> = { pix: "Pix", boleto: "Boleto", cartao_credito: "Crédito", cartao_debito: "Débito", dinheiro: "Dinheiro", transferencia: "Transf.", outro: "Outro" }
  const FIN_CAT_ICO: Record<string, React.ElementType> = { fornecedor: Factory, materiais: Package, salarios: User, aluguel: Home, impostos: Building2, marketing: Megaphone, servicos: Wrench, outros: ClipboardList }
  const colHdr: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, letterSpacing: '0.06em', color: '#898892', textTransform: 'none' }

  const stageStyle = card ? (() => {
    const label = COLUNAS_KANBAN[coluna] ?? "—"
    if (coluna === COL_PERDIDO)    return { bg: 'rgba(211,58,60,0.08)', text: '#d33a3c', dot: '#d33a3c', label }
    if (coluna >= COL_EXPEDICAO)   return { bg: 'rgba(58,132,202,0.1)', text: '#3a84ca', dot: '#3a84ca', label }
    if (coluna >= COL_FECHADO)     return { bg: 'rgba(0,147,81,0.08)', text: '#009351', dot: '#009351', label }
    return { bg: 'rgba(116,116,128,0.1)', text: '#5e5c68', dot: '#898892', label }
  })() : null

  // Field row: icon + label (110px) + value
  function FR({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f4f4f5' }}>
        <span style={{ width: 110, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#898892', fontFamily: INTER }}>
          {icon}{label}
        </span>
        {children}
      </div>
    )
  }

  // Collapsible section header
  function SecHdr({ sectionKey, label, badge }: { sectionKey: string; label: string; badge?: string | number }) {
    const open = openSections.has(sectionKey)
    return (
      <button
        onClick={() => setOpenSections(prev => { const n = new Set(prev); n.has(sectionKey) ? n.delete(sectionKey) : n.add(sectionKey); return n })}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#898892" strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s', flexShrink: 0 }}>
          <path d="m9 6 6 6-6 6"/>
        </svg>
        <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.01em', color: open ? '#191625' : '#5e5c68', fontFamily: INTER }}>{label}</span>
        {badge !== undefined && (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#898892', background: '#f3f4f6', borderRadius: 999, padding: '1px 7px', fontFamily: MONO }}>{badge}</span>
        )}
      </button>
    )
  }

  // Quick field chip for the kanban quick-edit bar
  function QF({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: '#fff', border: '1px solid #e5e7eb' }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.05em', color: '#898892', textTransform: 'none', fontFamily: INTER, whiteSpace: 'nowrap' }}>{label}</span>
        {children}
      </div>
    )
  }

  // Kanban section with optional action button
  function KSec({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={colHdr}>{label}</span>
          {action}
        </div>
        {children}
      </div>
    )
  }

  // KPI metric card
  function KpiCard({ label, value, sub, color, bg }: { label: string; value: string; sub?: string; color: string; bg: string }) {
    return (
      <div style={{ flex: '1 1 120px', minWidth: 0, background: bg, borderRadius: 10, padding: '10px 14px' }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: '#898892', fontFamily: INTER }}>{label}</p>
        <p style={{ margin: '3px 0 0', fontFamily: MONO, fontSize: 16, fontWeight: 700, color }}>{value}</p>
        {sub && <p style={{ margin: '2px 0 0', fontSize: 12, color, opacity: 0.75, fontFamily: MONO }}>{sub}</p>}
      </div>
    )
  }

  return (
    <div
      className="apple-backdrop-enter"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(25,22,37,0.38)', backdropFilter: 'blur(6px)', padding: '24px 16px', fontFamily: INTER }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="apple-modal-enter ds-num"
        style={{ width: '100%', maxWidth: 1180, height: 'min(820px, 92vh)', overflow: 'hidden', background: '#ffffff', borderRadius: 16, boxShadow: '0 24px 64px -16px rgba(25,22,37,0.35), 0 0 0 1px rgba(60,60,67,0.08)', display: 'flex', flexDirection: 'column' }}
      >

        {/* ── HEADER ──────────────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, padding: '28px 40px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {stageStyle && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: stageStyle.text, background: stageStyle.bg, padding: '5px 12px', borderRadius: 999 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: stageStyle.dot, flexShrink: 0 }} />{stageStyle.label}
                </span>
              )}
              {numero && (
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: '0.03em', color: '#8456e8', background: 'rgba(132,86,232,0.08)', border: '1px solid rgba(132,86,232,0.16)', padding: '5px 12px', borderRadius: 999 }}>{numero}</span>
              )}
              <span style={{ fontSize: 13, color: '#898892' }}>{dataStr}</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: isK && data.card.loteNumero ? '#8456e8' : '#191625', lineHeight: 1.15 }}>{nome || "Sem nome"}</h1>
            {nomeSecundario && (
              <p style={{ margin: '-6px 0 0', fontSize: 14, fontWeight: 500, color: '#5e5c68', fontFamily: INTER }}>{nomeSecundario}</p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {isH && <>
                {data.item.form.frente > 0 && <SPill>{data.item.form.frente}×{data.item.form.alturaBox}×{data.item.form.lateral} cm</SPill>}
                {data.item.form.materialNome && <SPill>{data.item.form.materialNome}</SPill>}
                <SPill>{data.item.form.comFaca ? "Com faca" : "Sem faca"}</SPill>
                {data.item.form.incluirVerniz && <SPill>Verniz UV</SPill>}
                {data.item.form.validadeDias > 0 && <SPill>Válido {data.item.form.validadeDias} dias</SPill>}
              </>}
              {isP && <>
                {data.proposta.descricao && <SPill>{data.proposta.descricao}</SPill>}
                {data.proposta.dimensoes  && <SPill>{data.proposta.dimensoes}</SPill>}
                {data.proposta.material   && <SPill>{data.proposta.material}</SPill>}
                {data.proposta.incluirVerniz && <SPill>Verniz UV</SPill>}
                {data.proposta.comFaca    && <SPill>Com faca</SPill>}
                {data.proposta.validadeDias > 0 && <SPill>Válido {data.proposta.validadeDias} dias</SPill>}
              </>}
              {isK && <>
                {data.card.dimensoes && !isTerceirizado && <SPill>{data.card.dimensoes} cm</SPill>}
                {data.card.materialNome && <SPill>{data.card.materialNome}</SPill>}
                {data.card.motivoPerdido && <SPill red>"{data.card.motivoPerdido}"</SPill>}
              </>}
            </div>
          </div>
          <HoverBtn onClick={onClose} baseStyle={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#5e5c68', flexShrink: 0 }} hoverStyle={{ background: '#e5e7eb' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </HoverBtn>
        </div>

        <div style={{ flexShrink: 0, height: 1, background: '#eef0f2', margin: '0 40px' }} />

        {/* ══════════════════════════════════════════════════════════════
            LAYOUT UNIFICADO — kanban + pedidos (quando há card)
        ══════════════════════════════════════════════════════════════ */}
        {card ? (<>

          {/* ── CAMPO COMPACTO (2 colunas) ───────────────────────────────── */}
          <div style={{ flexShrink: 0, padding: '0 32px', borderBottom: '1px solid #eef0f2' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 32 }}>

              {/* Etapa */}
              {stageStyle ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #f4f4f5' }}>
                  <span style={{ width: 110, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#898892', fontFamily: INTER }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.75" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
                    Etapa
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: stageStyle.dot, flexShrink: 0 }} />
                    <select value={coluna} onChange={e => { const v = +e.target.value; setColuna(v); onMoveEtapa?.(card.id, v) }}
                      style={{ appearance: 'none', WebkitAppearance: 'none', background: 'none', border: 'none', outline: 'none', fontSize: 13, fontWeight: 700, color: stageStyle.text, cursor: 'pointer', fontFamily: INTER, padding: 0 }}>
                      {(COLUNAS_KANBAN as readonly string[]).map((n, i) => <option key={i} value={i}>{n}</option>)}
                    </select>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={stageStyle.text} strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              ) : <div />}

              {/* Valor */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #f4f4f5' }}>
                <span style={{ width: 110, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#898892', fontFamily: INTER }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.75" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  Valor
                </span>
                {editingPreco && onSavePreco ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: MONO, fontSize: 13, color: '#898892' }}>R$</span>
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      step="0.01"
                      value={precoInput}
                      onChange={e => setPrecoInput(e.target.value)}
                      onBlur={() => {
                        const v = parseFloat(precoInput)
                        if (!isNaN(v) && v >= 0 && card) onSavePreco(card.id, v)
                        setEditingPreco(false)
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                        if (e.key === "Escape") { setPrecoInput((card?.preco ?? 0).toFixed(2)); setEditingPreco(false) }
                      }}
                      style={{ border: '1px solid #8456e8', borderRadius: 6, outline: 'none', padding: '2px 6px', fontFamily: MONO, fontSize: 14, fontWeight: 700, color: '#191625', width: 110, background: '#f9f7ff' }}
                    />
                  </div>
                ) : (
                  <span
                    onClick={() => { if (onSavePreco) { setPrecoInput((card?.preco ?? 0).toFixed(2)); setEditingPreco(true) } }}
                    title={onSavePreco ? "Clique para editar" : undefined}
                    style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: '#191625', cursor: onSavePreco ? 'pointer' : 'default', borderRadius: 4, padding: '1px 3px', transition: 'background 0.15s' }}
                    onMouseEnter={e => { if (onSavePreco) (e.currentTarget as HTMLElement).style.background = '#f3f0ff' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    {brl(card.preco)}
                  </span>
                )}
              </div>

              {/* Fechamento / Data do pedido */}
              {onSaveCloseDate && coluna !== COL_PERDIDO ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #f4f4f5' }}>
                  <span style={{ width: 110, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#898892', fontFamily: INTER }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.75" strokeLinecap="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>
                    Data do pedido
                  </span>
                  <input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)}
                    style={{ border: 'none', outline: 'none', background: 'none', fontFamily: MONO, fontSize: 13, fontWeight: 600, color: closeDate ? '#191625' : '#c4c8ce', cursor: 'pointer', padding: 0 }} />
                </div>
              ) : <div style={{ borderBottom: '1px solid #f4f4f5' }} />}

              {/* Entrega prev. */}
              {onSaveDelivery ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #f4f4f5' }}>
                  <span style={{ width: 110, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#898892', fontFamily: INTER }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.75" strokeLinecap="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>
                    Entrega prev.
                  </span>
                  <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                    style={{ border: 'none', outline: 'none', background: 'none', fontFamily: MONO, fontSize: 13, fontWeight: 600, color: deliveryDate ? '#191625' : '#c4c8ce', cursor: 'pointer', padding: 0 }} />
                </div>
              ) : <div style={{ borderBottom: '1px solid #f4f4f5' }} />}

              {/* Entrega real */}
              {onSaveDeliveryReal ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #f4f4f5' }}>
                  <span style={{ width: 110, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#898892', fontFamily: INTER }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.75" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                    Entrega real
                  </span>
                  <input type="date" value={deliveryRealDate} onChange={e => setDeliveryRealDate(e.target.value)}
                    style={{ border: 'none', outline: 'none', background: 'none', fontFamily: MONO, fontSize: 13, fontWeight: 600, color: deliveryRealDate ? '#009351' : '#c4c8ce', cursor: 'pointer', padding: 0 }} />
                </div>
              ) : <div style={{ borderBottom: '1px solid #f4f4f5' }} />}

              {/* Fornecedor + Custo 3º (terceirizado) */}
              {isTerceirizado && onSaveFornecedor && <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #f4f4f5' }}>
                  <span style={{ width: 110, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#898892', fontFamily: INTER }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.75" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    Fornecedor
                  </span>
                  <input value={fornecedor} onChange={e => setFornecedor(e.target.value)} placeholder="—"
                    style={{ border: 'none', outline: 'none', background: 'none', fontFamily: INTER, fontSize: 13, fontWeight: 600, color: '#191625', flex: 1, padding: 0 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #f4f4f5' }}>
                  <span style={{ width: 110, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#898892', fontFamily: INTER }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.75" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    Custo 3º
                  </span>
                  <input type="number" value={custoTerceiro} onChange={e => setCustoTerceiro(e.target.value)} placeholder="0,00" min={0} step={0.01}
                    style={{ border: 'none', outline: 'none', background: 'none', fontFamily: MONO, fontSize: 13, fontWeight: 600, color: '#191625', width: 100, padding: 0 }} />
                </div>
              </>}
            </div>

            {/* Salvar (dirty) */}
            {isDirty && (
              <div style={{ padding: '8px 0 10px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleSave} disabled={saving}
                  style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', background: '#8456e8', border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontFamily: INTER, opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>
            )}
          </div>

          {/* ── BODY (main + side) ───────────────────────────────────────── */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>

            {/* MAIN — scrollable */}
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '6px 28px 32px' }}>

              {/* ══ Seção: Financeiro ══════════════════════════════════════ */}
              <div style={{ borderBottom: '1px solid #f0f1f3' }}>
                <SecHdr sectionKey="financeiro" label="Financeiro"
                  badge={finTotalRecebido > 0 ? `${brl(finTotalRecebido)} recebido` : brl(card.preco)} />
                {openSections.has('financeiro') && (
                  <div style={{ paddingBottom: 16 }}>

                    {/* KPI grid 3 colunas */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7, marginBottom: 10 }}>
                      <KpiCard label="Valor" value={brl(finBase)} color="#191625" sub={finSobras > 0 ? `inclui ${brl(finSobras)} de sobras` : undefined} bg="rgba(116,116,128,0.05)" />
                      <KpiCard label="Recebido" value={brl(finTotalRecebido)} color="#009351"
                        sub={`${num(finPercPagoBruto, 0)}% pago`} bg="rgba(116,116,128,0.05)" />
                      <KpiCard label="Custos" value={brl(finTotalDesp)}
                        color={finTotalDesp > 0 ? '#d33a3c' : '#898892'}
                        sub={finDespesasPagas.length > 0 ? `${finDespesasPagas.length} lanç.` : "Sem despesas"}
                        bg="rgba(116,116,128,0.05)" />
                      <KpiCard label="Margem de contribuição" value={finSemDados || finMargemPct == null ? "—" : `${num(finMargemPct, 1)}%`}
                        color={finSemDados || finMargemPct == null ? '#898892' : finMargemPct >= 45 ? '#009351' : finMargemPct >= 30 ? '#c57800' : '#d33a3c'}
                        sub={finSemDados ? "lance os custos para ver" : `${brl(finResultado)} sobre a venda`}
                        bg="rgba(116,116,128,0.05)" />
                      <KpiCard label="Quantidade (com sobras)"
                        value={(card.quantidade ?? 0) > 0 ? num(card.quantidade) : "—"}
                        color="#191625" sub="unidades"
                        bg="rgba(116,116,128,0.05)" />
                      <KpiCard label="Custo por unidade"
                        value={finCmvUnit != null ? brl(finCmvUnit) : "—"}
                        color={finCmvUnit != null ? '#191625' : '#898892'}
                        sub={finCmvUnit != null ? "por unidade" : "Sem custos"}
                        bg="rgba(116,116,128,0.05)" />
                    </div>

                    {/* Progress bar */}
                    <div style={{ height: 4, borderRadius: 999, background: '#f0f1f3', overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ height: '100%', borderRadius: 999, width: `${finPercPago}%`, background: finPercPago >= 100 ? '#009351' : finPercPago >= 50 ? '#8456e8' : '#c57800', transition: 'width .4s' }} />
                    </div>

                    {/* Sobras */}
                    {showSobra && (
                      <HoverBtn onClick={() => { onRegistrarSobra!(card); onClose() }}
                        baseStyle={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'none', border: '1px dashed #fcd34d', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#c57800', fontFamily: INTER, width: '100%' }}
                        hoverStyle={{ background: '#fffbeb' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>
                        Registrar sobras
                      </HoverBtn>
                    )}

                    {/* Entradas */}
                    {finReceitasPagas.length > 0 && (
                      <div style={{ marginTop: 4, borderRadius: 10, overflow: 'hidden', border: '1px solid #f0f1f3' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#f9fafb' }}>
                          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'none', color: '#009351' }}>Entradas</span>
                          <span style={{ fontSize: 11, fontWeight: 600, fontFamily: MONO, color: '#009351' }}>{brl(finTotalRecebido)} recebido</span>
                        </div>
                        {finReceitasPagas.map(l => (
                          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderTop: '1px solid #f5f5f5' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#009351', flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 12, color: '#3f3d4a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.descricao || "Recebimento"}</span>
                            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: '#009351', flexShrink: 0 }}>{brl(l.valor)}</span>
                            {l.dataPagamento && <span style={{ fontSize: 10.5, color: '#898892', flexShrink: 0 }}>{new Date(l.dataPagamento + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}</span>}
                            {l.formaPagamento && <span style={{ fontSize: 10.5, color: '#898892', flexShrink: 0 }}>{FIN_FORMA_PAG[l.formaPagamento] ?? ""}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Saídas */}
                    {finDespesasPagas.length > 0 && (
                      <div style={{ marginTop: 7, borderRadius: 10, overflow: 'hidden', border: '1px solid #f0f1f3' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#f9fafb' }}>
                          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'none', color: '#d33a3c' }}>Saídas / Custos</span>
                          <span style={{ fontSize: 11, fontWeight: 600, fontFamily: MONO, color: '#d33a3c' }}>{brl(finDespesasPagas.reduce((s, l) => s + l.valor, 0))} pago</span>
                        </div>
                        {finDespesasPagas.map(l => (
                          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderTop: '1px solid #f5f5f5' }}>
                            {(() => { const I = FIN_CAT_ICO[l.categoria ?? ""] ?? ClipboardList; return <I style={{ width: 13, height: 13, flexShrink: 0, color: '#898892' }} /> })()}
                            <span style={{ flex: 1, fontSize: 12, color: '#3f3d4a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.descricao || "Despesa"}</span>
                            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: '#d33a3c', flexShrink: 0 }}>−{brl(l.valor)}</span>
                            {l.formaPagamento === "conta"
                              ? <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: '#fef3c7', color: '#d97706', flexShrink: 0 }}>conta</span>
                              : l.dataPagamento && <span style={{ fontSize: 10.5, color: '#898892', flexShrink: 0 }}>{new Date(l.dataPagamento + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}</span>
                            }
                          </div>
                        ))}
                      </div>
                    )}

                    {finReceitasCard.length === 0 && finDespesasCard.length === 0 && (
                      <p style={{ fontSize: 12.5, color: '#898892', margin: '8px 0 0', fontStyle: 'italic' }}>Nenhum lançamento registrado.</p>
                    )}
                  </div>
                )}
              </div>

              {/* ══ Seção: Ordem de Serviço ════════════════════════════════ */}
              <div style={{ borderBottom: '1px solid #f0f1f3' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <SecHdr sectionKey="os" label="Ordem de Serviço" badge={arquivos.length > 0 ? `${arquivos.length} arquivo${arquivos.length > 1 ? 's' : ''}` : undefined} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    style={{ fontSize: 11.5, fontWeight: 600, color: '#8456e8', background: 'rgba(132,86,232,0.08)', border: 'none', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontFamily: INTER, flexShrink: 0 }}>
                    {uploading ? '…' : '+ Arquivo'}
                  </button>
                </div>
                <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />

                {openSections.has('os') && (
                  <div style={{ paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* Obs */}
                    <div>
                      <p style={{ margin: '0 0 6px', ...colHdr }}>Observações para a gráfica</p>
                      <textarea value={obsOS} onChange={e => setObsOS(e.target.value)} onBlur={saveExtras}
                        placeholder="Instruções especiais, referências, cuidados…" rows={4}
                        style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none', fontFamily: INTER, color: '#3f3d4a', background: '#fff' }} />
                    </div>

                    {/* Cores */}
                    <div>
                      <p style={{ margin: '0 0 6px', ...colHdr }}>Cores de impressão</p>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                        {CORES_RAPIDAS.map(c => (
                          <button key={c} onClick={() => { setCores(c); setTimeout(saveExtras, 0) }}
                            style={{ padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${cores === c ? '#8456e8' : '#e5e7eb'}`, background: cores === c ? '#8456e8' : 'white', color: cores === c ? 'white' : '#5e5c68', cursor: 'pointer', fontFamily: INTER }}>
                            {c}
                          </button>
                        ))}
                      </div>
                      <input value={cores} onChange={e => setCores(e.target.value)} onBlur={saveExtras}
                        placeholder="Ex: 4x0, Pantone 485…"
                        style={{ width: '100%', height: 32, border: '1px solid #e5e7eb', borderRadius: 7, padding: '0 10px', fontSize: 13, outline: 'none', fontFamily: INTER, color: '#191625' }} />
                    </div>

                    {/* Acabamentos */}
                    <div>
                      <p style={{ margin: '0 0 8px', ...colHdr }}>Acabamentos</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                        {ACABAMENTOS_OPCOES.map(op => (
                          <label key={op} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                            <div onClick={() => setAcabamentos(prev => {
                              const next = prev.includes(op) ? prev.filter(a => a !== op) : [...prev, op]
                              setTimeout(() => onSaveCardExtras?.(card.id, { cores: cores.trim() || undefined, acabamentos: next, observacoesOS: obsOS.trim() || undefined }), 0)
                              return next
                            })}
                              style={{ width: 15, height: 15, borderRadius: 4, border: `2px solid ${acabamentos.includes(op) ? '#8456e8' : '#d1d5db'}`, background: acabamentos.includes(op) ? '#8456e8' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
                              {acabamentos.includes(op) && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round"><path d="m4.5 12.75 6 6 9-13.5"/></svg>}
                            </div>
                            <span style={{ fontSize: 13, color: '#3f3d4a', fontFamily: INTER }}>{op}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Arquivos */}
                    {arquivos.length === 0 ? (
                      <div style={{ border: '2px dashed #e5e7eb', borderRadius: 9, padding: '14px', textAlign: 'center', cursor: 'pointer' }}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files) }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(132,86,232,0.16)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}>
                        <p style={{ margin: 0, fontSize: 12.5, color: '#898892' }}>Arraste ou clique · Arte, faca, mockup…</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {arquivos.map(a => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 8, background: '#fafafa' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#fafafa')}>
                            {(() => { const I = TIPO_ARQUIVO_ICON[a.tipo] ?? FileText; return <I style={{ width: 15, height: 15, flexShrink: 0, color: '#5e5c68' }} /> })()}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#191625', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</p>
                              <p style={{ margin: '1px 0 0', fontSize: 11, color: '#898892' }}>{TIPO_LABEL[a.tipo]}{a.tamanho ? ` · ${(a.tamanho/1024).toFixed(0)} KB` : ''}</p>
                            </div>
                            <a href={a.url} target="_blank" rel="noreferrer" style={{ flexShrink: 0, padding: 5, borderRadius: 5, color: '#8456e8', textDecoration: 'none' }}
                              onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'rgba(132,86,232,0.08)')}
                              onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'transparent')}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
                            </a>
                            <button onClick={() => handleDeleteArquivo(a.id)} style={{ flexShrink: 0, padding: 5, borderRadius: 5, border: 'none', color: '#ef4444', background: 'transparent', cursor: 'pointer' }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        ))}
                        <div style={{ border: '1px dashed #e5e7eb', borderRadius: 8, padding: '5px', textAlign: 'center', cursor: 'pointer', marginTop: 1 }}
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files) }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(132,86,232,0.16)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}>
                          <span style={{ fontSize: 12, color: '#c4c8ce' }}>+ mais arquivos</span>
                        </div>
                      </div>
                    )}

                    {/* Links */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => {
                        const url = `${window.location.origin}/pedido/${encodeURIComponent(card.numero)}`
                        navigator.clipboard.writeText(url).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) })
                      }} style={{ flex: 1, height: 32, fontSize: 12.5, fontWeight: 600, borderRadius: 7, border: `1px solid ${linkCopied ? '#dcfce7' : '#e5e7eb'}`, background: linkCopied ? '#f0fdf4' : 'white', color: linkCopied ? '#009351' : '#5e5c68', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontFamily: INTER }}>
                        {linkCopied ? '✓ Copiado!' : <><Link2 style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Link da gráfica</>}
                      </button>
                      <a href={`/pedido/${encodeURIComponent(card.numero)}`} target="_blank" rel="noreferrer"
                        style={{ height: 32, padding: '0 10px', fontSize: 13, borderRadius: 7, border: '1px solid #e5e7eb', color: '#5e5c68', background: 'white', display: 'flex', alignItems: 'center', textDecoration: 'none' }}>↗</a>
                    </div>
                  </div>
                )}
              </div>

              {/* ══ Seção: Opções / Orçamento ════════════════════════════ */}
              <div>
                <SecHdr sectionKey="opcoes" label={isH ? "Orçamento calculado" : isP ? "Proposta" : "Opções de quantidade"}
                  badge={isK && card.opcoes?.length ? `${card.opcoes.length} opç${card.opcoes.length > 1 ? 'ões' : 'ão'}` : undefined} />
                {openSections.has('opcoes') && (
                  <div style={{ paddingBottom: 16 }}>
                    {/* ── Historico: tabela calculada (com/sem faca, 12x) ── */}
                    {isH && (<>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr', gap: 8, padding: '6px 0', borderBottom: '1px solid #eef0f2' }}>
                        <span style={colHdr}>Qtd</span>
                        <span style={{ ...colHdr, textAlign: 'right' }}>Unitário</span>
                        <span style={{ ...colHdr, textAlign: 'right' }}>Total</span>
                        <span style={{ ...colHdr, textAlign: 'right' }}>12×/mês</span>
                      </div>
                      {data.item.calculo.tabela.map(l => {
                        const cf = data.item.form.comFaca
                        const unit  = cf ? l.unitarioComFaca   : l.unitarioSemFaca
                        const total = cf ? l.precoComFaca      : l.precoSemFaca
                        const parc  = cf ? l.parcela12xComFaca : l.parcela12xSemFaca
                        const isIdeal = l.quantidade === data.item.calculo.sweetSpotIdealQtd
                        const isMin   = l.quantidade === data.item.calculo.sweetSpotMinimoQtd
                        return (
                          <div key={l.quantidade} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr', gap: 8, alignItems: 'center', padding: '9px 12px', marginTop: 5, background: isIdeal ? '#f7fdf9' : isMin ? '#fffbf0' : '#fafafa', border: `1px solid ${isIdeal ? '#e3f6ea' : isMin ? '#fde68a' : '#f0f1f3'}`, borderRadius: 9 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: '#191625' }}>{num(l.quantidade)} <span style={{ fontSize: 11, color: '#898892' }}>un</span></span>
                              {isIdeal && <span style={{ fontSize: 9, fontWeight: 700, color: '#009351', background: '#dcfce7', padding: '2px 6px', borderRadius: 999 }}>IDEAL</span>}
                              {isMin && !isIdeal && <span style={{ fontSize: 9, fontWeight: 700, color: '#c57800', background: '#fef3c7', padding: '2px 6px', borderRadius: 999 }}>MÍN</span>}
                            </div>
                            <span style={{ fontFamily: MONO, fontSize: 13, color: '#5e5c68', textAlign: 'right' }}>{brl(unit)}</span>
                            <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: '#8456e8', textAlign: 'right' }}>{brl(total)}</span>
                            <span style={{ fontFamily: MONO, fontSize: 12, color: '#898892', textAlign: 'right' }}>{brl(parc)}/mês</span>
                          </div>
                        )
                      })}
                      {(data.item.form.obsCliente || data.item.form.obsInterna) && (
                        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #eef0f2' }}>
                          {data.item.form.obsCliente && <p style={{ margin: '0 0 6px', fontSize: 13, color: '#3f3d4a' }}><span style={{ ...colHdr, marginRight: 8 }}>Cliente</span>{data.item.form.obsCliente}</p>}
                          {data.item.form.obsInterna && <p style={{ margin: 0, fontSize: 13, color: '#898892', fontStyle: 'italic' }}><span style={{ ...colHdr, marginRight: 8 }}>Interna</span>{data.item.form.obsInterna}</p>}
                        </div>
                      )}
                    </>)}

                    {/* ── Proposta custom ──────────────────────────────────── */}
                    {isP && (<>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr', gap: 8, padding: '6px 0', borderBottom: '1px solid #eef0f2' }}>
                        <span style={colHdr}>Qtd</span>
                        <span style={{ ...colHdr, textAlign: 'right' }}>Unitário</span>
                        <span style={{ ...colHdr, textAlign: 'right' }}>Total</span>
                        <span style={{ ...colHdr, textAlign: 'right' }}>12×/mês</span>
                      </div>
                      {data.proposta.linhas.filter(l => l.ativa && l.quantidade > 0).map((l, i) => {
                        const total = l.unitario * l.quantidade
                        const parc  = (total * parcFator) / 12
                        return (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr', gap: 8, alignItems: 'center', padding: '9px 12px', marginTop: 5, background: l.isIdeal ? '#f7fdf9' : '#fafafa', border: `1px solid ${l.isIdeal ? '#e3f6ea' : '#f0f1f3'}`, borderRadius: 9 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: '#191625' }}>{num(l.quantidade)} <span style={{ fontSize: 11, color: '#898892' }}>un</span></span>
                              {l.isIdeal && <span style={{ fontSize: 9, fontWeight: 700, color: '#009351', background: '#dcfce7', padding: '2px 6px', borderRadius: 999 }}>IDEAL</span>}
                            </div>
                            <span style={{ fontFamily: MONO, fontSize: 13, color: '#5e5c68', textAlign: 'right' }}>{brl(l.unitario)}</span>
                            <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: '#8456e8', textAlign: 'right' }}>{brl(total)}</span>
                            <span style={{ fontFamily: MONO, fontSize: 12, color: '#898892', textAlign: 'right' }}>{brl(parc)}/mês</span>
                          </div>
                        )
                      })}
                      {data.proposta.obsCliente && (
                        <p style={{ margin: '14px 0 0', fontSize: 13, color: '#3f3d4a' }}><span style={{ ...colHdr, marginRight: 8 }}>Cliente</span>{data.proposta.obsCliente}</p>
                      )}
                    </>)}

                    {/* ── Kanban: opcoes ou preço fixo ─────────────────────── */}
                    {isK && (!isTerceirizado ? (<>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 8, padding: '6px 0', borderBottom: '1px solid #eef0f2' }}>
                        <span style={colHdr}>Qtd</span>
                        <span style={{ ...colHdr, textAlign: 'right' }}>Unitário</span>
                        <span style={{ ...colHdr, textAlign: 'right' }}>Total</span>
                      </div>
                      {(card.opcoes?.length ? card.opcoes : [{ quantidade: card.quantidade, unitario: 0, preco: card.preco }]).map((op, i) => {
                        const isCurrent = op.quantidade === card.quantidade
                        return (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 8, alignItems: 'center', padding: '9px 12px', marginTop: 5, background: isCurrent ? '#f7fdf9' : '#fafafa', border: `1px solid ${isCurrent ? '#e3f6ea' : '#f0f1f3'}`, borderRadius: 9 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <span style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: 700, color: '#191625' }}>{num(op.quantidade)} <span style={{ fontSize: 11, fontWeight: 500, color: '#898892' }}>un</span></span>
                              {isCurrent && <span style={{ fontSize: 9, fontWeight: 700, color: '#009351', background: '#dcfce7', padding: '2px 6px', borderRadius: 999 }}>FECHADO</span>}
                            </div>
                            <span style={{ fontFamily: MONO, fontSize: 13, color: '#5e5c68', textAlign: 'right' }}>{op.unitario > 0 ? brl(op.unitario) : '—'}</span>
                            <span style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: 700, color: '#8456e8', textAlign: 'right' }}>{brl(op.preco)}</span>
                          </div>
                        )
                      })}
                    </>) : (
                      <div style={{ padding: '12px 13px', background: '#fafafa', border: '1px solid #f0f1f3', borderRadius: 9 }}>
                        <p style={{ margin: 0, fontFamily: MONO, fontSize: 18, fontWeight: 700, color: '#191625' }}>{brl(card.preco)}</p>
                        <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#898892' }}>{num(card.quantidade)} un · Terceirizado{card.fornecedor ? ` via ${card.fornecedor}` : ''}</p>
                        {card.custoTerceiro != null && card.custoTerceiro > 0 && (
                          <p style={{ margin: '3px 0 0', fontSize: 12, fontFamily: MONO, color: card.preco - card.custoTerceiro >= 0 ? '#009351' : '#d33a3c' }}>
                            Custo {brl(card.custoTerceiro)} · Margem {brl(card.preco - card.custoTerceiro)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ══ Seção: Controle de Prazos ══════════════════════════════ */}
              {isK && onSavePrazos && (() => {
                const etapas: { key: keyof PrazoEtapas; label: string }[] = [
                  { key: "pedido_enviado",    label: "Enviado à gráfica" },
                  { key: "inicio_arte",       label: "Início arte" },
                  { key: "arte_enviada",      label: "Arte p/ aprovação" },
                  { key: "arte_aprovada",     label: "Arte aprovada" },
                  { key: "inicio_impressao",  label: "Início impressão" },
                  { key: "fim_impressao",     label: "Fim impressão" },
                  { key: "inicio_verniz",     label: "Início verniz" },
                  { key: "fim_verniz",        label: "Fim verniz" },
                  { key: "inicio_acabamento", label: "Início acabamento" },
                  { key: "fim_acabamento",    label: "Fim acabamento" },
                  { key: "expedicao",         label: "Expedição" },
                ]
                const allStages = [
                  { key: null as null, label: "Pedido realizado", value: card?.dataFechamento, readOnly: true },
                  ...etapas.map(e => ({ key: e.key as keyof PrazoEtapas | null, label: e.label, value: prazos[e.key], readOnly: false })),
                ]
                const doneCnt = allStages.filter(s => s.value).length
                const total = allStages.length
                const progPct = Math.round((doneCnt / total) * 100)
                return (
                  <div style={{ borderBottom: '1px solid #f0f1f3' }}>
                    <SecHdr sectionKey="prazos" label="Controle de Prazos" badge={`${doneCnt}/${total}`} />
                    {openSections.has('prazos') && (
                      <div style={{ paddingBottom: 16 }}>
                        {/* Progress bar */}
                        <div style={{ height: 3, background: 'rgba(0,0,0,0.06)', borderRadius: 99, marginBottom: 14, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 99, background: progPct === 100 ? '#009351' : '#8456e8', width: `${progPct}%`, transition: 'width 0.4s ease' }} />
                        </div>
                        {/* Grid 2 colunas */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
                          {allStages.map((stage, idx) => {
                            const isDone = !!stage.value
                            const fmt = (iso?: string) => {
                              if (!iso) return "—"
                              return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                            }
                            return (
                              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                {/* dot */}
                                <div style={{
                                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: isDone ? 'rgba(124,58,237,0.12)' : 'transparent',
                                  border: isDone ? 'none' : '1.5px solid #d1d5db',
                                }}>
                                  {isDone && (
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#8456e8" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="m4.5 12.75 6 6 9-13.5" />
                                    </svg>
                                  )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ margin: 0, fontSize: 10, color: '#898892', fontFamily: INTER, fontWeight: 600, textTransform: 'none', letterSpacing: '0.03em', lineHeight: 1.2, marginBottom: 2 }}>{stage.label}</p>
                                  {stage.readOnly ? (
                                    <p style={{ margin: 0, fontFamily: MONO, fontSize: 13, fontWeight: 700, color: isDone ? '#191625' : '#d1d5db' }}>{fmt(stage.value)}</p>
                                  ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <input
                                        type="date"
                                        value={stage.value ?? ""}
                                        onChange={e => setPrazoEtapa(stage.key as keyof PrazoEtapas, e.target.value)}
                                        style={{
                                          border: 'none', outline: 'none', background: 'none', padding: 0,
                                          fontFamily: MONO, fontSize: 13, fontWeight: 700,
                                          color: isDone ? '#8456e8' : '#898892', cursor: 'pointer',
                                        }}
                                      />
                                      {isDone && (
                                        <button onClick={() => setPrazoEtapa(stage.key as keyof PrazoEtapas, "")}
                                          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 14, color: '#d1d5db', lineHeight: 1 }}
                                          title="Limpar">×</button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ══ Seção: Projeção de Custos ═══════════════════════════════ */}
              {isK && onSaveProjecao && (
                <div style={{ borderBottom: '1px solid #f0f1f3' }}>
                  <SecHdr sectionKey="projecao" label="Projeção de Custos"
                    badge={projTotal > 0 ? brl(projTotal) : undefined} />
                  {openSections.has('projecao') && (
                    <div style={{ paddingBottom: 16 }}>
                      {/* KPIs: total projetado vs preço */}
                      {projTotal > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7, marginBottom: 12 }}>
                          <KpiCard label="Total projetado" value={brl(projTotal)} color="#191625" bg="rgba(116,116,128,0.05)" />
                          <KpiCard label="Preço de venda" value={brl(card.preco)} color="#8456e8" bg="rgba(116,116,128,0.05)" />
                          <KpiCard label="Margem proj."
                            value={projMargem != null ? `${num(projMargem, 1)}%` : "—"}
                            color={projMargem == null ? '#898892' : projMargem >= 40 ? '#009351' : projMargem >= 20 ? '#c57800' : '#d33a3c'}
                            sub={projMargem != null ? (projMargem >= 40 ? "Boa" : projMargem >= 20 ? "Razoável" : "Baixa") : ""}
                            bg="rgba(116,116,128,0.05)" />
                        </div>
                      )}
                      {/* Grade de itens de custo */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {([
                          { key: "papel",       label: "Papel / Material",  Icon: FileText  },
                          { key: "impressao",   label: "Impressão",         Icon: Printer   },
                          { key: "corte",       label: "Corte",             Icon: Scissors  },
                          { key: "verniz",      label: "Verniz",            Icon: Star      },
                          { key: "colagem",     label: "Colagem",           Icon: Wrench    },
                          { key: "arte",        label: "Arte / Design",     Icon: Palette   },
                          { key: "faca",        label: "Faca",              Icon: Scissors  },
                          { key: "hotstamping", label: "Hot Stamping",      Icon: Star      },
                          { key: "corteVinco",  label: "Corte e Vinco",     Icon: Square    },
                          { key: "outros",      label: "Outros",            Icon: Package   },
                        ] as Array<{ key: keyof ProjecaoCustos; label: string; Icon: React.ElementType }>).map(({ key, label, Icon }) => (
                          <div key={key} style={{ background: '#fafafa', border: '1px solid #f0f1f3', borderRadius: 9, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Icon style={{ width: 14, height: 14, flexShrink: 0, color: '#898892' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: 10, color: '#898892', fontFamily: INTER, textTransform: 'none', letterSpacing: '0.03em', fontWeight: 600 }}>{label}</p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                <span style={{ fontSize: 12, color: '#5e5c68', fontFamily: MONO }}>R$</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={proj[key] != null ? String(proj[key]) : ""}
                                  onChange={e => setField(key, e.target.value)}
                                  placeholder="—"
                                  style={{ border: 'none', outline: 'none', background: 'none', fontFamily: MONO, fontSize: 14, fontWeight: 700, color: ((proj[key] as number) ?? 0) > 0 ? '#191625' : '#c4c8ce', width: '100%', padding: 0 }}
                                />
                              </div>
                            </div>
                            {((proj[key] as number) ?? 0) > 0 && (
                              <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: '#8456e8', opacity: 0.5, flexShrink: 0 }} />
                            )}
                          </div>
                        ))}
                      </div>
                      {/* Observação */}
                      <div style={{ marginTop: 8 }}>
                        <p style={{ margin: '0 0 4px', fontSize: 10, color: '#898892', fontFamily: INTER, textTransform: 'none', letterSpacing: '0.03em', fontWeight: 600 }}>Observação</p>
                        <textarea
                          value={proj.obs ?? ""}
                          onChange={e => setField("obs", e.target.value)}
                          placeholder="Ex: Faca já existe, hot stamping a confirmar com fornecedor…"
                          rows={2}
                          style={{ width: '100%', border: '1px solid #f0f1f3', borderRadius: 9, padding: '8px 12px', fontSize: 12.5, fontFamily: INTER, color: '#3f3d4a', background: '#fafafa', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                      {/* Botão salvar */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                        <button onClick={saveProjecao} disabled={savingProj}
                          style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', background: '#8456e8', border: 'none', borderRadius: 8, padding: '7px 18px', cursor: 'pointer', fontFamily: INTER, opacity: savingProj ? 0.6 : 1 }}>
                          {savingProj ? 'Salvando…' : 'Salvar projeção'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SIDE — Log + Comentários (260px) */}
            <div style={{ width: 260, flexShrink: 0, borderLeft: '1px solid #eef0f2', background: '#fbfbfc', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ flexShrink: 0, padding: '14px 18px 10px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', fontFamily: INTER }}>Atividade</span>
              </div>
              <div style={{ flexShrink: 0, height: 1, background: '#eef0f2' }} />
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 18px' }}>
                {etapasLog === null ? (
                  <p style={{ fontSize: 12, color: '#898892', margin: 0 }}>Carregando…</p>
                ) : etapasLog.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#898892', margin: 0 }}>Sem histórico registrado.</p>
                ) : (
                  [...etapasLog].reverse().map((e, i, arr) => (
                    <div key={i} style={{ padding: '7px 0', borderBottom: i < arr.length - 1 ? '1px solid #f0f1f3' : 'none' }}>
                      <p style={{ margin: 0, fontSize: 12, color: e.tipo === 'observacao' ? '#3f3d4a' : '#3f3d4a', lineHeight: 1.5, fontFamily: INTER }}>
                        {e.tipo === 'criacao' ? 'Orçamento criado'
                          : e.tipo === 'preco' ? <><b>Valor</b> {e.detalhe ? `→ ${e.detalhe}` : 'atualizado'}</>
                          : e.tipo === 'observacao' ? <span style={{ color: '#5b21b6', display: 'flex', alignItems: 'center', gap: 4 }}><MessageCircle style={{ width: 11, height: 11, flexShrink: 0 }} />{e.detalhe}</span>
                          : <><b>{e.nome}</b></>}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 10.5, color: '#b5b9c0', fontFamily: MONO }}>{e.dataHora}</p>
                    </div>
                  ))
                )}
              </div>
              <div style={{ flexShrink: 0, borderTop: '1px solid #eef0f2', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 7 }}>
                <input
                  placeholder="Anotação…"
                  value={obsInput}
                  onChange={e => setObsInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addObservacao() } }}
                  style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, outline: 'none', fontFamily: INTER, color: '#3f3d4a', background: '#fff' }}
                />
                <button onClick={addObservacao} disabled={savingObs || !obsInput.trim()} style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 8, border: 'none', background: '#8456e8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: savingObs || !obsInput.trim() ? 0.45 : 1 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#8456e8')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#8456e8')}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </div>
          </div>

          {/* ── FOOTER (unificado) ───────────────────────────────────────── */}
          <div style={{ flexShrink: 0, height: 1, background: '#eef0f2', margin: '0 28px' }} />
          <div style={{ flexShrink: 0, padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <HoverBtn onClick={onClose}
              baseStyle={{ fontSize: 13.5, fontWeight: 500, color: '#898892', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', fontFamily: INTER }}
              hoverStyle={{ color: '#5e5c68' }}>Fechar</HoverBtn>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {/* Orçamento / Proposta — botões de edição */}
              {isH && onPersonalizarHistorico && (
                <button onClick={() => onPersonalizarHistorico(data.item)}
                  style={{ fontSize: 13, fontWeight: 600, color: '#8456e8', background: 'rgba(132,86,232,0.08)', border: '1px solid rgba(132,86,232,0.16)', padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: INTER }}>
                  Personalizar valores
                </button>
              )}
              {isH && onEditarHistorico && (
                <button onClick={() => onEditarHistorico(data.item)}
                  style={{ fontSize: 13, fontWeight: 600, color: '#8456e8', background: 'rgba(132,86,232,0.08)', border: '1px solid rgba(132,86,232,0.16)', padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: INTER }}>
                  Editar orçamento
                </button>
              )}
              {isP && onEditar && (
                <button onClick={() => { onEditar(data.proposta); onClose() }}
                  style={{ fontSize: 13, fontWeight: 600, color: '#8456e8', background: 'rgba(132,86,232,0.08)', border: '1px solid rgba(132,86,232,0.16)', padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: INTER }}>
                  Editar proposta
                </button>
              )}
              {/* PIX */}
              {showPix && (
                <button onClick={() => {
                  const url = `${window.location.origin}/pix/${encodeURIComponent(pixNumero)}?v=${pixPreco.toFixed(2)}&c=${encodeURIComponent(pixCliente)}`
                  navigator.clipboard.writeText(url).then(() => { setPixCopied(true); setTimeout(() => setPixCopied(false), 2000) })
                }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: pixCopied ? '#fff' : '#009351', background: pixCopied ? '#009351' : '#f0fdf4', border: `1px solid ${pixCopied ? '#009351' : '#dcfce7'}`, padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: INTER }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>
                  {pixCopied ? 'Copiado!' : 'Link PIX'}
                </button>
              )}
              {/* Emitir Pedido — kanban fechado */}
              {coluna >= COL_FECHADO && coluna !== COL_PERDIDO && onEmitirOS && (
                <button onClick={() => onEmitirOS(card)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#fff', background: '#8456e8', border: 'none', padding: '8px 14px', borderRadius: 9, cursor: 'pointer', boxShadow: '0 4px 12px -2px rgba(124,58,237,0.4)', fontFamily: INTER }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#8456e8')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#8456e8')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
                  Emitir Pedido
                </button>
              )}
            </div>
          </div>

        </>) : (<>

        {/* ══════════════════════════════════════════════════════════════
            HISTORICO / PROPOSTA LAYOUT (unchanged)
        ══════════════════════════════════════════════════════════════ */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '24px 40px 32px' }}>

              {/* Items section */}
              <div style={{ height: 1, background: '#eef0f2', margin: '8px 0 0' }} />
              <div style={{ padding: '14px 0 0' }}><span style={colHdr}>Itens</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr', gap: 8, padding: '10px 0 8px', marginTop: 4, borderBottom: '1px solid #eef0f2' }}>
                <span style={colHdr}>Qtd</span>
                <span style={{ ...colHdr, textAlign: 'right' }}>Unitário</span>
                <span style={{ ...colHdr, textAlign: 'right' }}>À vista</span>
                <span style={{ ...colHdr, textAlign: 'right' }}>12×/mês</span>
              </div>

              {isH && data.item.calculo.tabela.map(l => {
                const cf = data.item.form.comFaca
                const unit  = cf ? l.unitarioComFaca   : l.unitarioSemFaca
                const total = cf ? l.precoComFaca      : l.precoSemFaca
                const parc  = cf ? l.parcela12xComFaca : l.parcela12xSemFaca
                const isIdeal = l.quantidade === data.item.calculo.sweetSpotIdealQtd
                const isMin   = l.quantidade === data.item.calculo.sweetSpotMinimoQtd
                return (
                  <div key={l.quantidade} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr', gap: 8, alignItems: 'center', padding: '12px 16px', marginTop: 8, background: isIdeal ? '#f7fdf9' : isMin ? '#fffbf0' : '#fafafa', border: `1px solid ${isIdeal ? '#e3f6ea' : isMin ? '#fde68a' : '#f0f1f3'}`, borderRadius: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: '#191625' }}>{num(l.quantidade)} <span style={{ fontSize: 12, fontWeight: 500, color: '#898892' }}>un</span></span>
                      {isIdeal && <span style={{ fontSize: 9, fontWeight: 700, color: '#009351', background: '#dcfce7', padding: '2px 7px', borderRadius: 999 }}>IDEAL</span>}
                      {isMin && !isIdeal && <span style={{ fontSize: 9, fontWeight: 700, color: '#c57800', background: '#fef3c7', padding: '2px 7px', borderRadius: 999 }}>MÍN</span>}
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 14, color: '#5e5c68', textAlign: 'right' }}>{brl(unit)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: '#8456e8', textAlign: 'right' }}>{brl(total)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12.5, color: '#898892', textAlign: 'right' }}>{brl(parc)}/mês</span>
                  </div>
                )
              })}

              {isP && data.proposta.linhas.filter(l => l.ativa && l.quantidade > 0).map((l, i) => {
                const total = l.unitario * l.quantidade
                const parc  = (total * parcFator) / 12
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr', gap: 8, alignItems: 'center', padding: '12px 16px', marginTop: 8, background: l.isIdeal ? '#f7fdf9' : '#fafafa', border: `1px solid ${l.isIdeal ? '#e3f6ea' : '#f0f1f3'}`, borderRadius: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: '#191625' }}>{num(l.quantidade)} <span style={{ fontSize: 12, fontWeight: 500, color: '#898892' }}>un</span></span>
                      {l.isIdeal && <span style={{ fontSize: 9, fontWeight: 700, color: '#009351', background: '#dcfce7', padding: '2px 7px', borderRadius: 999 }}>IDEAL</span>}
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 14, color: '#5e5c68', textAlign: 'right' }}>{brl(l.unitario)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: '#8456e8', textAlign: 'right' }}>{brl(total)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12.5, color: '#898892', textAlign: 'right' }}>{brl(parc)}/mês</span>
                  </div>
                )
              })}

              {isH && (data.item.form.obsCliente || data.item.form.obsInterna) && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ height: 1, background: '#eef0f2', marginBottom: 16 }} />
                  {data.item.form.obsCliente && <div style={{ marginBottom: 12 }}>
                    <p style={{ margin: '0 0 4px', ...colHdr }}>Para o cliente</p>
                    <p style={{ margin: 0, fontSize: 13.5, color: '#3f3d4a', lineHeight: 1.6 }}>{data.item.form.obsCliente}</p>
                  </div>}
                  {data.item.form.obsInterna && <div>
                    <p style={{ margin: '0 0 4px', ...colHdr }}>Interna</p>
                    <p style={{ margin: 0, fontSize: 13.5, color: '#898892', fontStyle: 'italic', lineHeight: 1.6 }}>{data.item.form.obsInterna}</p>
                  </div>}
                </div>
              )}
              {isP && data.proposta.obsCliente && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ height: 1, background: '#eef0f2', marginBottom: 16 }} />
                  <p style={{ margin: '0 0 4px', ...colHdr }}>Para o cliente</p>
                  <p style={{ margin: 0, fontSize: 13.5, color: '#3f3d4a', lineHeight: 1.6 }}>{data.proposta.obsCliente}</p>
                </div>
              )}
            </div>

            {/* History panel (historico/proposta) */}
            <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid #eef0f2', background: '#fbfbfc', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ flexShrink: 0, padding: '20px 20px 12px' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1f2937', fontFamily: INTER }}>Histórico</span>
              </div>
              <div style={{ flexShrink: 0, height: 1, background: '#eef0f2' }} />
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 20px' }}>
                {etapasLog === null ? (
                  <p style={{ fontSize: 13, color: '#898892', margin: 0 }}>Carregando…</p>
                ) : etapasLog.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#898892', margin: 0 }}>Sem histórico.</p>
                ) : (
                  [...etapasLog].reverse().map((e, i, arr) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid #f0f1f3' : 'none' }}>
                      <span style={{ fontSize: 12.5, color: '#3f3d4a', fontFamily: INTER, lineHeight: 1.5 }}>
                        {e.tipo === 'criacao' ? 'Orçamento criado'
                          : e.tipo === 'preco' ? <><b>Valor</b> {e.detalhe ? `→ ${e.detalhe}` : 'atualizado'}</>
                          : e.tipo === 'observacao' ? <span style={{ color: '#5b21b6', display: 'flex', alignItems: 'center', gap: 4 }}><MessageCircle style={{ width: 11, height: 11, flexShrink: 0 }} />{e.detalhe}</span>
                          : <><b>Etapa</b> → {e.nome}</>}
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: 10.5, color: '#b5b9c0', flexShrink: 0 }}>{e.dataHora}</span>
                    </div>
                  ))
                )}
              </div>
              <div style={{ flexShrink: 0, padding: '12px 16px 16px', borderTop: '1px solid #eef0f2', display: 'flex', gap: 7 }}>
                <input
                  placeholder="Adicionar observação…"
                  value={obsInput}
                  onChange={e => setObsInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addObservacao() } }}
                  style={{ flex: 1, fontSize: 12.5, color: '#3f3d4a', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 9, padding: '8px 11px', fontFamily: INTER, outline: 'none' }}
                />
                <button onClick={addObservacao} disabled={savingObs || !obsInput.trim()} style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: '#8456e8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', alignSelf: 'flex-end', opacity: savingObs || !obsInput.trim() ? 0.45 : 1 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </div>
          </div>

          <div style={{ flexShrink: 0, height: 1, background: '#eef0f2', margin: '0 40px' }} />
          <div style={{ flexShrink: 0, padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <HoverBtn onClick={onClose}
              baseStyle={{ fontSize: 14, fontWeight: 500, color: '#898892', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 12px', fontFamily: INTER }}
              hoverStyle={{ color: '#5e5c68' }}>Fechar</HoverBtn>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {isH && onPersonalizarHistorico && (
                <button onClick={() => onPersonalizarHistorico(data.item)}
                  style={{ fontSize: 13.5, fontWeight: 600, color: '#8456e8', background: 'rgba(132,86,232,0.08)', border: '1px solid rgba(132,86,232,0.16)', padding: '10px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: INTER }}>
                  Personalizar valores
                </button>
              )}
              {isH && onEditarHistorico && (
                <button onClick={() => onEditarHistorico(data.item)}
                  style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#8456e8', border: 'none', padding: '10px 16px', borderRadius: 10, cursor: 'pointer', boxShadow: '0 4px 12px -2px rgba(124,58,237,0.4)', fontFamily: INTER }}>
                  Editar orçamento
                </button>
              )}
              {isP && onEditar && (
                <button onClick={() => { onEditar(data.proposta); onClose() }}
                  style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#8456e8', border: 'none', padding: '10px 16px', borderRadius: 10, cursor: 'pointer', boxShadow: '0 4px 12px -2px rgba(124,58,237,0.4)', fontFamily: INTER }}>
                  Editar proposta
                </button>
              )}
              {isDirty && (
                <button onClick={handleSave} disabled={saving}
                  style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#8456e8', border: 'none', padding: '10px 16px', borderRadius: 10, cursor: 'pointer', boxShadow: '0 4px 12px -2px rgba(124,58,237,0.4)', opacity: saving ? 0.6 : 1, fontFamily: INTER }}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              )}
              {showPix && (
                <button onClick={() => {
                  const url = `${window.location.origin}/pix/${encodeURIComponent(pixNumero)}?v=${pixPreco.toFixed(2)}&c=${encodeURIComponent(pixCliente)}`
                  navigator.clipboard.writeText(url).then(() => { setPixCopied(true); setTimeout(() => setPixCopied(false), 2000) })
                }}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 600, color: pixCopied ? '#fff' : '#009351', background: pixCopied ? '#009351' : '#f0fdf4', border: `1px solid ${pixCopied ? '#009351' : '#dcfce7'}`, padding: '10px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: INTER }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>
                  {pixCopied ? 'Copiado!' : 'Link PIX'}
                </button>
              )}
            </div>
          </div>

        </>)}
      </div>
    </div>
  )
}

function SPill({ children, red }: { children: React.ReactNode; red?: boolean }) {
  return (
    <span style={{ fontSize: 12.5, fontWeight: 500, color: red ? '#d33a3c' : '#5e5c68', background: red ? '#fef2f2' : '#f3f4f6', padding: '5px 11px', borderRadius: 999 }}>
      {children}
    </span>
  )
}

function HoverBtn({ onClick, baseStyle, hoverStyle, children }: { onClick: () => void; baseStyle: React.CSSProperties; hoverStyle: React.CSSProperties; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} style={{ ...baseStyle, ...(hovered ? hoverStyle : {}) }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {children}
    </button>
  )
}
