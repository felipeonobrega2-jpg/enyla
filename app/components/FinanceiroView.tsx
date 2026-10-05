"use client"

import React, { useState, useMemo, useEffect, useRef } from "react"
import { CheckCircle2, Factory, TrendingUp, TrendingDown, DollarSign, Clock, AlertTriangle, Landmark } from "lucide-react"
import {
  LancamentoFinanceiro, TipoLancamento, StatusLancamento,
  FormaPagamento, KanbanCard, COL_EXPEDICAO, COL_PERDIDO, NegocioParceiro, Lote,
} from "../types"
import { brl } from "../utils"
import { CategoriaFinanceira, ContaBancaria, Configuracoes } from "../config"
import { ContasTab } from "./financeiro/ContasTab"
import { FixasTab } from "./financeiro/FixasTab"
import { FornecedoresTab } from "./financeiro/FornecedoresTab"
import {
  hoje, pixVencido, isReceitaPendenteValida, isAtrasada, pedidosElegiveis as calcPedidosElegiveis,
  pagamentosPorLote as calcPagamentosPorLote, pagamentosPorCard as calcPagamentosPorCard,
  sobrasPorLote as calcSobrasPorLote, sobrasPorCard as calcSobrasPorCard,
  calcularPedidosFechados, pedidosAbertos, contarNaoRegistrados, calcularVencidos,
} from "../lib/financeiro"

// ─── FinLineChart ─────────────────────────────────────────────────────────────

function FinLineChart({ data }: { data: { label: string; receita: number; despesas: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 600, H = 150
  const PAD = { top: 10, right: 12, bottom: 22, left: 8 }
  const gW = W - PAD.left - PAD.right
  const gH = H - PAD.top - PAD.bottom
  const n = data.length
  const maxVal = Math.max(...data.flatMap(d => [d.receita, d.despesas]), 1)
  const xOf = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * gW : gW / 2)
  const yOf = (v: number) => PAD.top + gH - (v / maxVal) * gH
  const cubicPath = (key: "receita" | "despesas") => {
    if (n < 2) return ""
    const pts = data.map((d, i) => ({ x: xOf(i), y: yOf(d[key]) }))
    let p = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 1; i < pts.length; i++) {
      const c1x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) / 3
      const c2x = pts[i - 1].x + (2 * (pts[i].x - pts[i - 1].x)) / 3
      p += ` C ${c1x} ${pts[i - 1].y} ${c2x} ${pts[i].y} ${pts[i].x} ${pts[i].y}`
    }
    return p
  }
  const areaPath = (key: "receita" | "despesas") => {
    const line = cubicPath(key)
    if (!line) return ""
    return `${line} L ${xOf(n - 1)} ${PAD.top + gH} L ${xOf(0)} ${PAD.top + gH} Z`
  }
  return (
    <div className="relative select-none" style={{ height: H }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none">
        <defs>
          <linearGradient id="fin-g-rec" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#009351" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#009351" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="fin-g-desp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d33a3c" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#d33a3c" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath("despesas")} fill="url(#fin-g-desp)" />
        <path d={areaPath("receita")} fill="url(#fin-g-rec)" />
        <path d={cubicPath("despesas")} fill="none" stroke="#d33a3c" strokeWidth="1.5" strokeOpacity="0.65" />
        <path d={cubicPath("receita")} fill="none" stroke="#009351" strokeWidth="2" />
        {hover !== null && (
          <>
            <line x1={xOf(hover)} y1={PAD.top} x2={xOf(hover)} y2={PAD.top + gH}
              stroke="rgba(100,100,110,0.2)" strokeWidth="1" />
            <circle cx={xOf(hover)} cy={yOf(data[hover].receita)} r="3.5" fill="#009351" />
            <circle cx={xOf(hover)} cy={yOf(data[hover].despesas)} r="3" fill="#d33a3c" />
          </>
        )}
        {data.map((d, i) => (
          <text key={i} x={xOf(i)} y={H - 3} textAnchor="middle" fontSize="8.5" fill="rgba(142,142,147,0.9)">{d.label}</text>
        ))}
        {data.map((_, i) => {
          const x0 = i === 0 ? 0 : (xOf(i - 1) + xOf(i)) / 2
          const x1 = i === n - 1 ? W : (xOf(i) + xOf(i + 1)) / 2
          return <rect key={i} x={x0} y={0} width={x1 - x0} height={H} fill="transparent"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        })}
      </svg>
      {hover !== null && (() => {
        const d = data[hover]
        const net = d.receita - d.despesas
        return (
          <div className="absolute top-1 right-2 rounded-xl px-3 py-2 text-[11px] shadow-lg z-10 pointer-events-none"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <p className="font-semibold mb-1" style={{ color: "var(--text-main)" }}>{d.label}</p>
            <p style={{ color: "#009351" }}>↑ {brl(d.receita)}</p>
            <p style={{ color: "#d33a3c" }}>↓ {brl(d.despesas)}</p>
            <p className="mt-1 font-bold tabular-nums" style={{ color: net >= 0 ? "#009351" : "#d33a3c" }}>= {brl(net)}</p>
          </div>
        )
      })()}
    </div>
  )
}


// ─── CaixaProjetadoChart ──────────────────────────────────────────────────────

function CaixaProjetadoChart({ data, saldoAtual }: {
  data: { label: string; valor: number; cumulo: number; saldoInicio: number; diaSemana: string }[]
  saldoAtual: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const H = 190, W = 600
  const PAD = { top: 14, right: 14, bottom: 28, left: 8 }
  const gW = W - PAD.left - PAD.right
  const gH = H - PAD.top - PAD.bottom

  const pts = [
    { label: "Hoje", value: saldoAtual },
    ...data.map(d => ({ label: d.label, value: d.cumulo })),
  ]
  const n = pts.length
  if (n < 2) return null

  // Y scale: always starts at 0 to convey absolute cash level
  const maxVal = Math.max(...pts.map(p => p.value)) * 1.12
  const xOf = (i: number) => PAD.left + (i / (n - 1)) * gW
  const yOf = (v: number) => PAD.top + gH - (v / maxVal) * gH

  const cubicPath = () => {
    const p = pts.map((d, i) => ({ x: xOf(i), y: yOf(d.value) }))
    let s = `M ${p[0].x} ${p[0].y}`
    for (let i = 1; i < p.length; i++) {
      const c1x = p[i-1].x + (p[i].x - p[i-1].x) / 3
      const c2x = p[i-1].x + (2 * (p[i].x - p[i-1].x)) / 3
      s += ` C ${c1x} ${p[i-1].y} ${c2x} ${p[i].y} ${p[i].x} ${p[i].y}`
    }
    return s
  }
  const areaPath = () =>
    `${cubicPath()} L ${xOf(n-1)} ${PAD.top + gH} L ${xOf(0)} ${PAD.top + gH} Z`

  // 3 horizontal grid lines at 25 / 50 / 75 % of max
  const gridVals = [0.25, 0.5, 0.75].map(f => maxVal * f)
  const brlK = (v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${Math.round(v)}`

  return (
    <div className="relative select-none" style={{ height: H }}>
      {/* Y-axis labels — HTML overlay avoids SVG text distortion */}
      {gridVals.map((v, i) => (
        <span key={i} className="absolute right-1 text-[9px] tabular-nums pointer-events-none"
          style={{ top: yOf(v) - 6, color: "rgba(142,142,147,0.55)", lineHeight: 1 }}>
          {brlK(v)}
        </span>
      ))}

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none">
        <defs>
          <linearGradient id="cpg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8456e8" stopOpacity="0.22" />
            <stop offset="75%" stopColor="#8456e8" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#8456e8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridVals.map((v, i) => (
          <line key={i} x1={PAD.left} y1={yOf(v)} x2={PAD.left + gW} y2={yOf(v)}
            stroke="rgba(132,86,232,0.09)" strokeWidth="1" />
        ))}

        {/* Baseline */}
        <line x1={PAD.left} y1={PAD.top + gH} x2={PAD.left + gW} y2={PAD.top + gH}
          stroke="rgba(132,86,232,0.15)" strokeWidth="1" />

        {/* Area fill */}
        <path d={areaPath()} fill="url(#cpg)" />

        {/* Line */}
        <path d={cubicPath()} fill="none" stroke="#8456e8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots at each data point */}
        {pts.map((p, i) => (
          <circle key={i} cx={xOf(i)} cy={yOf(p.value)} r="3"
            fill={i === 0 ? "#8456e8" : "white"} stroke="#8456e8" strokeWidth="2" />
        ))}

        {/* Hover vertical line (drawn on top) */}
        {hover !== null && (
          <line x1={xOf(hover)} y1={PAD.top} x2={xOf(hover)} y2={PAD.top + gH}
            stroke="rgba(132,86,232,0.22)" strokeWidth="1" strokeDasharray="3 2" />
        )}

        {/* X-axis labels */}
        {pts.map((p, i) => (
          <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle" fontSize="9"
            fill={i === 0 ? "rgba(132,86,232,0.9)" : "rgba(142,142,147,0.85)"}
            fontWeight={i === 0 ? "600" : "400"}>
            {p.label}
          </text>
        ))}

        {/* Hover zones */}
        {pts.map((_, i) => {
          const x0 = i === 0 ? 0 : (xOf(i-1) + xOf(i)) / 2
          const x1 = i === n-1 ? W : (xOf(i) + xOf(i+1)) / 2
          return <rect key={i} x={x0} y={0} width={x1 - x0} height={H} fill="transparent"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        })}
      </svg>

      {/* Tooltip */}
      {hover !== null && (() => {
        const p = pts[hover]
        const entrada = hover === 0 ? null : data[hover - 1]?.valor
        return (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 rounded-xl px-3.5 py-2.5 text-[11px] shadow-xl z-10 pointer-events-none"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <p className="font-bold text-[12px] mb-1" style={{ color: "var(--text-main)" }}>{p.label}</p>
            {hover === 0
              ? <p className="tabular-nums" style={{ color: "#8456e8" }}>Caixa atual · {brl(saldoAtual)}</p>
              : <div className="flex items-center gap-3">
                  <span className="tabular-nums font-semibold" style={{ color: "#30D158" }}>+{brl(entrada!)}</span>
                  <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>→</span>
                  <span className="tabular-nums font-bold" style={{ color: "#8456e8" }}>{brl(p.value)}</span>
                </div>
            }
          </div>
        )
      })()}
    </div>
  )
}


// ─── Constants ───────────────────────────────────────────────────────────────

const FORMAS: { value: FormaPagamento; label: string }[] = [
  { value: "pix",            label: "PIX" },
  { value: "transferencia",  label: "Transferência" },
  { value: "boleto",         label: "Boleto" },
  { value: "cartao_credito", label: "Cartão de crédito" },
  { value: "cartao_debito",  label: "Cartão de débito" },
  { value: "dinheiro",       label: "Dinheiro" },
  { value: "outro",          label: "Outro" },
]

const DEFAULT_CATS_DESP: CategoriaFinanceira[] = [
  { id: "aluguel",    nome: "Aluguel" },
  { id: "fornecedor", nome: "Fornecedor" },
  { id: "materiais",  nome: "Materiais" },
  { id: "salarios",   nome: "Salários" },
  { id: "impostos",   nome: "Impostos" },
  { id: "marketing",  nome: "Marketing" },
  { id: "servicos",   nome: "Serviços" },
  { id: "outros",     nome: "Outros" },
]

const DEFAULT_CATS_REC: CategoriaFinanceira[] = [
  { id: "pedido",      nome: "Pedido" },
  { id: "sinal",       nome: "Sinal" },
  { id: "saldo-final", nome: "Saldo final" },
  { id: "parcela",     nome: "Parcela" },
  { id: "outros",      nome: "Outros" },
]

function statusEfetivo(l: LancamentoFinanceiro): StatusLancamento {
  if (l.status === "pago") return "pago"
  if (l.dataVencimento < hoje()) return "atrasado"
  return "pendente"
}

const STATUS_CLS: Record<StatusLancamento, string> = {
  pago:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  pendente: "bg-amber-50 text-amber-700 border-amber-200",
  atrasado: "bg-rose-50 text-rose-600 border-rose-200",
}

const STATUS_LABEL: Record<StatusLancamento, string> = {
  pago: "Pago", pendente: "Pendente", atrasado: "Em atraso",
}

// ─── Modal Lançamento ────────────────────────────────────────────────────────

// Cores por categoria (background / text / border)
const CAT_CHIP: Record<string, [string, string, string]> = {
  aluguel:       ["#eff6ff", "#3b82f6", "#bfdbfe"],
  fornecedor:    ["#fff7ed", "#ea580c", "#fed7aa"],
  materiais:     ["#fffbeb", "#d97706", "#fde68a"],
  salarios:      ["#eef2ff", "#4f46e5", "#c7d2fe"],
  impostos:      ["#fff1f2", "#e11d48", "#fecdd3"],
  marketing:     ["#fdf2f8", "#db2777", "#fbcfe8"],
  servicos:      ["#f0fdfa", "#0d9488", "#99f6e4"],
  outros:        ["rgba(116,116,128,0.08)", "#72707d", "rgba(116,116,128,0.16)"],
  pedido:        ["#f0fdf4", "#16a34a", "#bbf7d0"],
  sinal:         ["#f0fdf4", "#15803d", "#86efac"],
  "saldo-final": ["#dcfce7", "#166534", "#86efac"],
  parcela:       ["#f0fdfa", "#0f766e", "#99f6e4"],
  pix_link:      ["rgba(132,86,232,0.08)", "#8456e8", "rgba(132,86,232,0.2)"],
  sobra:         ["rgba(116,116,128,0.06)", "#8E8E93", "rgba(116,116,128,0.12)"],
}

function getCatChip(catId: string | undefined) {
  const key = catId?.toLowerCase() ?? ""
  return CAT_CHIP[key] ?? ["rgba(116,116,128,0.08)", "#72707d", "rgba(116,116,128,0.16)"]
}

export type ModalLancProps = {
  inicial?: Partial<LancamentoFinanceiro>
  kanban: KanbanCard[]
  categoriasReceita?: CategoriaFinanceira[]
  categoriasDespesa?: CategoriaFinanceira[]
  contas?: ContaBancaria[]
  fornecedores?: Array<{ id: string; nome: string; ativo: boolean; conta?: boolean }>
  onSave: (l: LancamentoFinanceiro) => void
  onClose: () => void
}

export function ModalLancamento({ inicial, kanban, categoriasReceita, categoriasDespesa, contas, fornecedores, onSave, onClose }: ModalLancProps) {
  const catsRec  = categoriasReceita ?? DEFAULT_CATS_REC
  const catsDesp = categoriasDespesa ?? DEFAULT_CATS_DESP
  const contasAtivas = (contas ?? []).filter(c => c.ativa)
  const fornecedoresAtivos = (fornecedores ?? []).filter(f => f.ativo)
  const fornecedoresConta = fornecedoresAtivos.filter(f => f.conta)

  const [tipo, setTipo]               = useState<TipoLancamento>(inicial?.tipo ?? "receita")
  const [descricao, setDescricao]     = useState(inicial?.descricao ?? "")
  const [valor, setValor]             = useState(String(inicial?.valor ?? ""))
  const [dataVenc, setDataVenc]       = useState(inicial?.dataVencimento ?? hoje())
  const [dataPag, setDataPag]         = useState(inicial?.dataPagamento ?? "")
  const [status, setStatus]           = useState<StatusLancamento>(inicial?.status === "pago" ? "pago" : "pendente")
  const [vinculoKeys, setVinculoKeys] = useState<string[]>([
    inicial?.loteId ? `lote:${inicial.loteId}` : inicial?.cardId ? `card:${inicial.cardId}` : ""
  ])
  const [categoria, setCategoria]     = useState(inicial?.categoria ?? "")
  const [subcategoria, setSubcategoria] = useState(inicial?.subcategoria ?? "")
  const contaPadrao = (contas ?? []).find(c => c.padrao && c.ativa)
  const [contaId, setContaId]         = useState(inicial?.contaId ?? contaPadrao?.id ?? "")
  const [fornecedorId, setFornecedorId] = useState(inicial?.fornecedorId ?? "")
  const [forma, setForma]             = useState<FormaPagamento | "">(inicial?.formaPagamento ?? "")
  const [obs, setObs]                 = useState(inicial?.obs ?? "")

  // Modo Custo — aba separada para registrar na conta do fornecedor
  const [modoCusto, setModoCusto]         = useState(false)
  const [custoCardKey, setCustoCardKey]   = useState("")
  const [custoFornId, setCustoFornId]     = useState("")
  const [custoValor, setCustoValor]       = useState("")
  const [custoData, setCustoData]         = useState(hoje())
  const [custoDesc, setCustoDesc]         = useState("")

  function salvarCusto() {
    const v = parseFloat(custoValor)
    if (!v || !custoFornId) return
    const vin = vinculaveis.find(x => x.key === custoCardKey)
    const forn = fornecedoresConta.find(f => f.id === custoFornId)
    const descAuto = `${forn?.nome ?? "Custo"}${vin ? ` — ${vin.loteId ? "Lote" : "Pedido"} ${vin.numero}` : ""}`
    onSave({
      id:             Date.now().toString(),
      tipo:           "despesa",
      descricao:      (custoDesc.trim() || descAuto),
      valor:          v,
      dataVencimento: custoData,
      status:         "pendente",
      fornecedorId:   custoFornId,
      cardId:         vin?.cardId,
      cardNumero:     vin?.cardNumero,
      nomeCliente:    vin?.nomeCliente,
      loteId:         vin?.loteId,
      loteNumero:     vin?.loteNumero,
      formaPagamento: "conta",
      criadoEm:       new Date().toLocaleString("pt-BR"),
    } as LancamentoFinanceiro)
    onClose()
  }

  const catsAtivas = tipo === "despesa" ? catsDesp : catsRec
  const catSel = catsAtivas.find(c => c.id === categoria)
  const temSubs = (catSel?.subcategorias?.length ?? 0) > 0

  const pedidosFechados = calcPedidosElegiveis(kanban)
  // Despesa pode ser vinculada a qualquer pedido ativo (custo pode ocorrer antes do fechamento)
  const elegiveis = tipo === "receita" ? pedidosFechados : kanban.filter(c => c.coluna !== COL_PERDIDO)

  // Agrupa por lote — pedidos sem lote entram individualmente
  const vinculaveis = useMemo(() => {
    const porLote = new Map<string, KanbanCard[]>()
    const solos: KanbanCard[] = []
    for (const c of elegiveis) {
      if (c.loteId) {
        const arr = porLote.get(c.loteId) ?? []
        arr.push(c)
        porLote.set(c.loteId, arr)
      } else {
        solos.push(c)
      }
    }
    const itens: VinculoItem[] = []
    for (const [loteId, cards] of porLote) {
      itens.push({
        key: `lote:${loteId}`,
        numero: cards[0].loteNumero ?? loteId,
        nomeCliente: cards[0].nomeCliente,
        valor: cards.reduce((s, c) => s + c.preco, 0),
        loteId,
        loteNumero: cards[0].loteNumero,
      })
    }
    for (const c of solos) {
      itens.push({
        key: `card:${c.id}`,
        numero: c.numero,
        nomeCliente: c.nomeCliente,
        valor: c.preco,
        cardId: c.id,
        cardNumero: c.numero,
      })
    }
    return itens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegiveis])

  function handleVinculo(idx: number, key: string) {
    setVinculoKeys(prev => { const n = [...prev]; n[idx] = key; return n })
    const v = vinculaveis.find(x => x.key === key)
    if (!v || idx !== 0) return
    if (tipo === "receita") {
      setValor(String(v.valor))
      setDescricao(v.loteId ? `Lote ${v.numero} — ${v.nomeCliente}` : `Pedido ${v.numero} — ${v.nomeCliente}`)
    } else if (!descricao.trim()) {
      setDescricao(v.loteId ? `Lote ${v.numero} — ${v.nomeCliente}` : `Pedido ${v.numero} — ${v.nomeCliente}`)
    }
  }

  function salvar() {
    const v = parseFloat(valor)
    if (!descricao.trim() || !v || !dataVenc) return
    const base = {
      tipo,
      descricao:      descricao.trim(),
      valor:          v,
      dataVencimento: dataVenc,
      dataPagamento:  status === "pago" ? (dataPag || dataVenc) : undefined,
      status:         (status === "pago" ? "pago" : "pendente") as StatusLancamento,
      categoria:      categoria || undefined,
      subcategoria:   (temSubs && subcategoria) ? subcategoria : undefined,
      contaId:        contaId || undefined,
      fornecedorId:   fornecedorId || undefined,
      formaPagamento: forma || undefined,
      obs:            obs.trim() || undefined,
    }
    const activeKeys = vinculoKeys.filter(k => k)
    if (activeKeys.length <= 1) {
      const vinSel = activeKeys.length === 1 ? vinculaveis.find(x => x.key === activeKeys[0]) : undefined
      onSave({
        ...base,
        id:          inicial?.id ?? Date.now().toString(),
        cardId:      vinSel?.cardId || undefined,
        cardNumero:  vinSel?.cardNumero || inicial?.cardNumero,
        nomeCliente: vinSel?.nomeCliente || inicial?.nomeCliente,
        loteId:      vinSel?.loteId || inicial?.loteId,
        loteNumero:  vinSel?.loteNumero || (vinSel ? undefined : inicial?.loteNumero),
        criadoEm:    inicial?.criadoEm ?? new Date().toLocaleString("pt-BR"),
      })
    } else {
      const now = Date.now()
      for (let i = 0; i < activeKeys.length; i++) {
        const vinSel = vinculaveis.find(x => x.key === activeKeys[i])
        onSave({
          ...base,
          id:          `${now}-${i}`,
          cardId:      vinSel?.cardId || undefined,
          cardNumero:  vinSel?.cardNumero,
          nomeCliente: vinSel?.nomeCliente,
          loteId:      vinSel?.loteId || undefined,
          loteNumero:  vinSel?.loteNumero,
          criadoEm:    new Date().toLocaleString("pt-BR"),
        })
      }
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col overflow-hidden" style={{ maxHeight: "92vh" }}>
        <div className="px-6 pt-5 pb-0 border-b border-[rgba(60,60,67,0.08)] flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <p className="font-bold text-[#191625] text-[15px]">
              {inicial?.id ? "Editar lançamento" : "Novo lançamento"}
            </p>
            <button onClick={onClose} className="text-[#898892] hover:text-[#8E8E93] text-xl leading-none">×</button>
          </div>
          {/* Tabs — só mostra custo se há fornecedores com conta e é novo lançamento */}
          {!inicial?.id && fornecedoresConta.length > 0 && (
            <div className="flex gap-1 -mb-px">
              {[{ id: false, label: "Lançamento" }, { id: true, label: "Custo" }].map(t => (
                <button key={String(t.id)} onClick={() => setModoCusto(t.id)}
                  className={`px-4 py-2 text-[12px] font-semibold border-b-2 transition-colors ${
                    modoCusto === t.id
                      ? "border-[#8456e8] text-[#8456e8]"
                      : "border-transparent text-[#8E8E93] hover:text-[#5e5c68]"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Formulário Custo */}
        {modoCusto ? (
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-[11.5px] font-semibold text-amber-700">Custo na conta do fornecedor</p>
              <p className="text-[10.5px] text-amber-600 mt-0.5">
                Registra um débito na conta corrente do fornecedor — sem gerar saída de caixa imediata.
              </p>
            </div>
            <CustoField label="Fornecedor *">
              <select value={custoFornId} onChange={e => setCustoFornId(e.target.value)} className={inp()}>
                <option value="">Selecione o fornecedor…</option>
                {fornecedoresConta.map(f => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </CustoField>
            <CustoField label="Vincular ao pedido / lote (opcional)">
              {vinculaveis.length > 0
                ? <VinculoCombobox itens={vinculaveis} value={custoCardKey} onChange={setCustoCardKey} />
                : <p className="text-[11px] text-[#8E8E93]">Nenhum pedido ativo disponível</p>}
            </CustoField>
            <CustoField label="Valor (R$) *">
              <input type="number" min="0" step="0.01" value={custoValor}
                onChange={e => setCustoValor(e.target.value)} placeholder="0,00" className={inp()} />
            </CustoField>
            <CustoField label="Data *">
              <input type="date" value={custoData} onChange={e => setCustoData(e.target.value)} className={inp()} />
            </CustoField>
            <CustoField label="Descrição (opcional)">
              <input value={custoDesc} onChange={e => setCustoDesc(e.target.value)}
                placeholder="Ex: Impressão offset 4x0" className={inp()} />
            </CustoField>
            <button disabled={!custoValor || !custoFornId} onClick={salvarCusto}
              className="w-full py-3 text-[13px] font-semibold text-white bg-[#161421] hover:bg-[#0b0914] rounded-xl transition-colors disabled:opacity-40 mt-2">
              Registrar custo
            </button>
          </div>
        ) : (
        <>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Tipo */}
          <Field label="Tipo">
            <div className="flex gap-2">
              {(["receita", "despesa"] as TipoLancamento[]).map(t => (
                <button key={t} onClick={() => setTipo(t)}
                  className={`flex-1 py-2 rounded-lg border text-[12px] font-semibold transition-all ${
                    tipo === t
                      ? t === "receita"
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-rose-300 bg-rose-50 text-rose-600"
                      : "border-[rgba(60,60,67,0.12)] text-[#8E8E93] hover:border-slate-300"
                  }`}>
                  {t === "receita" ? "Receita" : "Despesa"}
                </button>
              ))}
            </div>
          </Field>

          {/* Vincular a lote — suporta múltiplos lotes (lança uma despesa por lote) */}
          {vinculaveis.length > 0 && (
            <Field label="Vincular a lote (opcional)">
              <div className="space-y-2">
                {vinculoKeys.map((key, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <div className="flex-1">
                      <VinculoCombobox itens={vinculaveis} value={key} onChange={k => handleVinculo(idx, k)} />
                    </div>
                    {vinculoKeys.length > 1 && (
                      <button onClick={() => setVinculoKeys(prev => prev.filter((_, i) => i !== idx))}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-[#C7C7CC] hover:text-rose-500 hover:bg-rose-50 transition-colors shrink-0 text-[16px] leading-none">
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {!inicial?.id && (
                  <button onClick={() => setVinculoKeys(prev => [...prev, ""])}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8456e8] hover:text-[#6e3fd4] transition-colors mt-0.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Adicionar outro lote
                  </button>
                )}
              </div>
              {vinculoKeys.filter(k => k).length > 1 && (
                <p className="text-[10.5px] text-[#8456e8] mt-1.5 font-medium">
                  {vinculoKeys.filter(k => k).length} despesas serão criadas, uma por lote
                </p>
              )}
            </Field>
          )}

          <Field label="Descrição *">
            <input value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder={tipo === "receita" ? "Ex: Pedido cliente João" : "Ex: Aluguel galpão"}
              className={inp()} />
          </Field>

          <Field label="Valor (R$) *">
            <input type="number" min="0" step="0.01" value={valor}
              onChange={e => setValor(e.target.value)} placeholder="0,00" className={inp()} />
          </Field>

          <Field label="Categoria">
            <select value={categoria} onChange={e => { setCategoria(e.target.value); setSubcategoria("") }} className={inp()}>
              <option value="">Selecione…</option>
              {catsAtivas.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </Field>

          {temSubs && (
            <Field label="Subcategoria">
              <select value={subcategoria} onChange={e => setSubcategoria(e.target.value)} className={inp()}>
                <option value="">Selecione…</option>
                {(catSel?.subcategorias ?? []).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          )}

          {contasAtivas.length > 0 && (
            <Field label="Conta / Cartão">
              <select value={contaId} onChange={e => setContaId(e.target.value)} className={inp()}>
                <option value="">—</option>
                {contasAtivas.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </Field>
          )}

          {tipo === "despesa" && fornecedoresAtivos.length > 0 && (
            <Field label="Fornecedor">
              <select value={fornecedorId} onChange={e => setFornecedorId(e.target.value)} className={inp()}>
                <option value="">—</option>
                {fornecedoresAtivos.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Field>
          )}

          <Field label="Vencimento">
            <input type="date" value={dataVenc} onChange={e => setDataVenc(e.target.value)} className={inp()} />
          </Field>

          <Field label="Status">
            <div className="flex gap-2">
              {(["pendente", "pago"] as const).map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`flex-1 py-2 rounded-lg border text-[12px] font-semibold transition-all ${
                    status === s ? STATUS_CLS[s] : "border-[rgba(60,60,67,0.12)] text-[#8E8E93] hover:border-slate-300"
                  }`}>
                  {s === "pago" ? "Pago" : "Pendente"}
                </button>
              ))}
            </div>
          </Field>

          {status === "pago" && (
            <Field label="Data do recebimento">
              <input type="date" value={dataPag || dataVenc}
                onChange={e => setDataPag(e.target.value)} className={inp()} />
            </Field>
          )}

          <Field label="Forma de pagamento">
            <select value={forma} onChange={e => setForma(e.target.value as FormaPagamento)} className={inp()}>
              <option value="">—</option>
              {FORMAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>

          <Field label="Observação">
            <textarea value={obs} onChange={e => setObs(e.target.value)}
              rows={2} placeholder="Notas internas…" className={`${inp()} resize-none`} />
          </Field>
        </div>

        <div className="px-6 pb-5 flex gap-2 shrink-0 border-t border-[rgba(60,60,67,0.08)] pt-4">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-[12.5px] font-medium text-[#8E8E93] hover:bg-[rgba(116,116,128,0.04)] rounded-xl transition-colors">
            Cancelar
          </button>
          <button disabled={!descricao.trim() || !parseFloat(valor) || !dataVenc} onClick={salvar}
            className="flex-1 py-2.5 text-[12.5px] font-semibold text-white bg-[#161421] hover:bg-[#0b0914] rounded-xl transition-colors disabled:opacity-40">
            {inicial?.id ? "Salvar" : "Lançar"}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  )
}

type VinculoItem = {
  key: string
  numero: string
  nomeCliente: string
  valor: number
  loteId?: string
  loteNumero?: string
  cardId?: string
  cardNumero?: string
}

function VinculoCombobox({
  itens, value, onChange,
}: {
  itens: VinculoItem[]
  value: string
  onChange: (key: string) => void
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen]   = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = itens.find(v => v.key === value)

  const matches = query.trim().length > 0
    ? itens.filter(v =>
        v.numero.toLowerCase().includes(query.toLowerCase()) ||
        v.nomeCliente.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : []

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 h-9 border border-[rgba(60,60,67,0.12)] rounded-lg px-3 bg-[#F2F2F7]">
        <span className="text-[12.5px] text-[#191625] font-medium truncate">
          {selected.numero} — {selected.nomeCliente} — {brl(selected.valor)}
        </span>
        <button onClick={() => { onChange(""); setQuery("") }}
          className="text-[#898892] hover:text-[#8E8E93] text-base leading-none shrink-0">
          ×
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        placeholder="Buscar por lote, pedido ou cliente…"
        className={inp()}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(query.trim().length > 0)}
      />
      {open && query.trim().length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-white border border-[rgba(60,60,67,0.12)] rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
          {matches.length > 0 ? matches.map(v => (
            <button key={v.key}
              onMouseDown={e => { e.preventDefault(); onChange(v.key); setQuery(""); setOpen(false) }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#F2F2F7] transition-colors">
              <span className="text-[12px] font-medium text-[#191625] truncate">{v.numero} — {v.nomeCliente}</span>
              <span className="text-[11px] text-[#8E8E93] shrink-0">{brl(v.valor)}</span>
            </button>
          )) : (
            <p className="px-3 py-2.5 text-[11.5px] text-[#8E8E93]">Nenhum resultado encontrado</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Modal Registrar Pagamento Rápido ─────────────────────────────────────────

function ModalPagamento({ lancamento, onSave, onClose }: {
  lancamento: LancamentoFinanceiro
  onSave: (updates: Partial<LancamentoFinanceiro>) => void
  onClose: () => void
}) {
  const [dataPag, setDataPag]   = useState(hoje())
  const [forma, setForma]       = useState<FormaPagamento | "">(lancamento.formaPagamento ?? "pix")
  const [obs, setObs]           = useState(lancamento.obs ?? "")

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] flex items-center justify-between">
          <div>
            <p className="font-bold text-[#191625] text-[14px]">Registrar pagamento</p>
            <p className="text-[11px] text-[#8E8E93] mt-0.5 truncate">{lancamento.descricao}</p>
          </div>
          <button onClick={onClose} className="text-[#898892] hover:text-[#8E8E93] text-xl leading-none ml-3">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-center">
            <p className="text-[11px] text-emerald-600 font-medium">Valor recebido</p>
            <p className="font-semibold text-[22px] text-emerald-700 tabular-nums">{brl(lancamento.valor)}</p>
          </div>
          <Field label="Data do recebimento">
            <input type="date" value={dataPag} onChange={e => setDataPag(e.target.value)} className={inp()} />
          </Field>
          <Field label="Forma de pagamento">
            <select value={forma} onChange={e => setForma(e.target.value as FormaPagamento)} className={inp()}>
              <option value="">—</option>
              {FORMAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="Observação">
            <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" className={inp()} />
          </Field>
        </div>
        <div className="px-6 pb-5 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-[12.5px] font-medium text-[#8E8E93] hover:bg-[rgba(116,116,128,0.04)] rounded-xl transition-colors">
            Cancelar
          </button>
          <button onClick={() => { onSave({ status: "pago", dataPagamento: dataPag, formaPagamento: forma || undefined, obs: obs || undefined }); onClose() }}
            className="flex-1 py-2.5 text-[12.5px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors">
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

function gerarPdfAReceber(grupos: Array<{ cliente: string; pedidos: Array<{ key: string; label: string; tipo: string; pago: number; total: number; restante: number }>; totalRestante: number; totalPago: number; totalTotal: number }>, total: number) {
  const dataBR = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
  const rows = grupos.map(g => `
    <tr class="group-row">
      <td colspan="3" class="cliente-cell">
        <span class="avatar">${g.cliente[0]?.toUpperCase() ?? "?"}</span>
        <strong>${g.cliente}</strong>
      </td>
      <td class="value amber">${brl(g.totalRestante)}</td>
    </tr>
    ${g.pedidos.map(p => `
    <tr class="sub-row">
      <td class="label-cell">
        <span class="badge">${p.tipo === "parceria" ? "Parceria" : p.label}</span>
      </td>
      <td class="sub-text">${p.pago > 0 ? `${brl(p.pago)} pago de ${brl(p.total)}` : ""}</td>
      <td></td>
      <td class="value sub">${brl(p.restante)}</td>
    </tr>`).join("")}
  `).join("")

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>A Receber — ${dataBR}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #191625; background: #fff; padding: 32px 40px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #8456e8; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 700; color: #8456e8; }
    .meta { font-size: 12px; color: #8E8E93; margin-top: 4px; }
    .total-box { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 10px; padding: 12px 20px; text-align: right; }
    .total-label { font-size: 11px; color: #b45309; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
    .total-value { font-size: 26px; font-weight: 800; color: #b45309; font-variant-numeric: tabular-nums; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .group-row { background: #f8f7ff; }
    .grupo-row td { padding: 10px 12px; }
    .sub-row td { padding: 6px 12px; border-bottom: 1px solid #f0eef8; }
    .cliente-cell { display: flex; align-items: center; gap: 10px; }
    .avatar { width: 26px; height: 26px; border-radius: 50%; background: #8456e8; color: #fff; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .badge { font-size: 9.5px; font-weight: 700; padding: 2px 7px; border-radius: 99px; background: #ede9fe; color: #6d28d9; }
    .sub-text { font-size: 10.5px; color: #8E8E93; }
    .label-cell { padding-left: 48px !important; }
    .value { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
    .value.amber { color: #b45309; font-size: 14px; }
    .value.sub { color: #5e5c68; font-size: 12px; font-weight: 600; }
    .group-row td { border-top: 1px solid #ddd6fe; }
    footer { margin-top: 32px; font-size: 10px; color: #8E8E93; text-align: center; }
    @media print { body { padding: 16px 20px; } @page { margin: 1cm; } }
  </style>
  </head><body>
  <header>
    <div><h1>Relatório — A Receber</h1><p class="meta">Gerado em ${dataBR}</p></div>
    <div class="total-box">
      <div class="total-label">Total a receber</div>
      <div class="total-value">${brl(total)}</div>
    </div>
  </header>
  <table>
    <colgroup><col style="width:140px"><col><col style="width:10px"><col style="width:120px"></colgroup>
    ${rows}
  </table>
  <footer>Enyla · relatório gerado automaticamente</footer>
  <script>window.onload = () => { window.print(); }<\/script>
  </body></html>`

  const win = window.open("", "_blank")
  if (win) { win.document.write(html); win.document.close() }
}

function ModalReceberDetalhe({ itens, total, onClose, onVerTudo, onClienteClick }: {
  itens: Array<{ key: string; cliente: string; label: string; total: number; pago: number; restante: number; tipo: "pedido" | "parceria" }>
  total: number
  onClose: () => void
  onVerTudo: () => void
  onClienteClick?: (nome: string) => void
}) {
  // Agrupar por cliente
  const grupos = React.useMemo(() => {
    const m = new Map<string, { cliente: string; pedidos: typeof itens; totalRestante: number; totalPago: number; totalTotal: number }>()
    for (const item of itens) {
      const key = item.cliente
      if (!m.has(key)) m.set(key, { cliente: item.cliente, pedidos: [], totalRestante: 0, totalPago: 0, totalTotal: 0 })
      const g = m.get(key)!
      g.pedidos.push(item)
      g.totalRestante += item.restante
      g.totalPago     += item.pago
      g.totalTotal    += item.total
    }
    return Array.from(m.values()).sort((a, b) => b.totalRestante - a.totalRestante)
  }, [itens])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[85vh] flex flex-col"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>

        {/* Header */}
        <div className="px-6 pt-5 pb-4 flex items-center justify-between shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <p className="font-bold text-[14px]" style={{ color: "var(--text-main)" }}>A receber</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
              {grupos.length} cliente{grupos.length !== 1 ? "s" : ""} em aberto
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => gerarPdfAReceber(grupos, total)}
              title="Baixar relatório PDF"
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ background: "var(--bg-alt)", color: "var(--text-faint)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <button onClick={onClose} className="text-xl leading-none" style={{ color: "var(--text-faint)" }}>×</button>
          </div>
        </div>

        {/* Total */}
        <div className="px-6 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border)", background: "rgba(251,191,36,0.06)" }}>
          <p className="text-[11px] font-medium" style={{ color: "#f59e0b" }}>Total a receber</p>
          <p className="font-bold text-[26px] tabular-nums" style={{ color: "#f59e0b" }}>{brl(total)}</p>
        </div>

        {/* Lista agrupada por cliente */}
        <div className="flex-1 overflow-y-auto">
          {grupos.length === 0 ? (
            <p className="text-center text-[12px] py-8 flex items-center justify-center gap-1.5" style={{ color: "var(--text-faint)" }}>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Nada em aberto
            </p>
          ) : grupos.map(g => (
            <button
              key={g.cliente}
              onClick={() => onClienteClick?.(g.cliente)}
              disabled={!onClienteClick}
              className="w-full text-left px-6 py-4 transition-colors"
              style={{ borderBottom: "1px solid var(--border)", background: "transparent" }}
              onMouseEnter={e => onClienteClick && ((e.currentTarget as HTMLElement).style.background = "var(--bg-alt)")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              {/* Cliente + total restante */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                    style={{ background: "#8456e8" }}>
                    {g.cliente[0]?.toUpperCase() ?? "?"}
                  </div>
                  <span className="font-semibold text-[13px] truncate" style={{ color: "var(--text-main)" }}>
                    {g.cliente}
                  </span>
                  {onClienteClick && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: "var(--text-faint)", flexShrink: 0 }}>
                      <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <p className="font-bold text-[14px] tabular-nums shrink-0" style={{ color: "#f59e0b" }}>
                  {brl(g.totalRestante)}
                </p>
              </div>

              {/* Sub-itens (lotes/pedidos) */}
              <div className="mt-2 pl-9 space-y-1">
                {g.pedidos.map(item => (
                  <div key={item.key} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: "var(--bg-alt)", color: "var(--text-faint)", border: "1px solid var(--border)" }}>
                        {item.tipo === "parceria" ? "Parceria" : item.label}
                      </span>
                      {item.pago > 0 && (
                        <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                          {brl(item.pago)} pago de {brl(item.total)}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color: "var(--text-sub)" }}>
                      {brl(item.restante)}
                    </span>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
          <button onClick={onVerTudo}
            className="w-full py-2.5 text-[12.5px] font-semibold text-white rounded-xl transition-colors"
            style={{ background: "#8456e8" }}>
            Ver detalhes e registrar pagamentos →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Período helpers ──────────────────────────────────────────────────────────

type Periodo = "mes" | "trimestre" | "semestre" | "ano" | "tudo"

function periodoRange(p: Periodo, mesOffset = 0): { from: Date | null; to: Date | null } {
  const now = new Date()
  if (p === "tudo") return { from: null, to: null }
  if (p === "mes") {
    const m = now.getMonth() + mesOffset
    const from = new Date(now.getFullYear(), m, 1)
    const to   = new Date(now.getFullYear(), m + 1, 0) // last day of that month
    return { from, to }
  }
  if (p === "trimestre") {
    const q = Math.floor(now.getMonth() / 3)
    return { from: new Date(now.getFullYear(), q * 3, 1), to: null }
  }
  if (p === "semestre") {
    const s = now.getMonth() < 6 ? 0 : 6
    return { from: new Date(now.getFullYear(), s, 1), to: null }
  }
  return { from: new Date(now.getFullYear(), 0, 1), to: null }
}

const MESES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]

const PERIODO_LABEL: Record<Periodo, string> = {
  mes: "Este mês", trimestre: "Este trimestre", semestre: "Este semestre", ano: "Este ano", tudo: "Tudo"
}

// ─── Main View ───────────────────────────────────────────────────────────────

export function FinanceiroView({
  lancamentos,
  kanban,
  negocios,
  lotes,
  config,
  onAdd,
  onUpdate,
  onDelete,
  onUpdateConfig,
  onRegistrarSobra,
  onDeleteCard,
  onDetalhesCard,
  onAbrirPerfil,
}: {
  lancamentos: LancamentoFinanceiro[]
  kanban: KanbanCard[]
  negocios: NegocioParceiro[]
  lotes?: Lote[]
  config?: Configuracoes
  onAdd: (l: LancamentoFinanceiro) => void
  onUpdate: (id: string, updates: Partial<LancamentoFinanceiro>) => void
  onDelete: (id: string) => void
  onUpdateConfig?: (cfg: Configuracoes) => void
  onRegistrarSobra?: (card: KanbanCard) => void
  onDeleteCard?: (id: string) => void
  onDetalhesCard?: (card: KanbanCard) => void
  onAbrirPerfil?: (nome: string) => void
}) {
  const catsRec  = config?.categoriasReceita ?? DEFAULT_CATS_REC
  const catsDesp = config?.categoriasDespesa ?? DEFAULT_CATS_DESP

  const [tab, setTab] = useState<"dash" | "dre" | "receber" | "lancamentos" | "pix" | "contas" | "fixas" | "fornecedores" | "config">("dash")
  const [periodo, setPeriodo] = useState<Periodo>("mes")
  const [mesOffset, setMesOffset] = useState(0)
  const [modalLanc, setModalLanc]         = useState<Partial<LancamentoFinanceiro> | true | null>(null)
  const [modalPag, setModalPag]           = useState<LancamentoFinanceiro | null>(null)
  const [filtroTipo, setFiltroTipo]           = useState<TipoLancamento | "">("")
  const [filtroStatus, setFiltroStatus]       = useState<StatusLancamento | "">("")
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set())
  const [bulkData, setBulkData]               = useState("")
  const [bulkCategoria, setBulkCategoria]     = useState("")
  const [bulkFornecedor, setBulkFornecedor]   = useState("")
  const [filtroCategoria, setFiltroCategoria] = useState("")
  const [buscaLanc, setBuscaLanc]             = useState("")
  const [buscaReceber, setBuscaReceber]       = useState("")
  const [filtroReceber, setFiltroReceber] = useState<"aberto" | "pendente" | "parcial" | "todos">("aberto")
  const [confirmarDel, setConfirmarDel]   = useState<string | null>(null)
  const [modalReceber, setModalReceber]   = useState(false)

  // Restore on mount — write effects would corrupt sessionStorage during SSR hydration
  useEffect(() => {
    const t = sessionStorage.getItem("fin:tab")
    if (t && ["dash", "dre", "receber", "lancamentos", "pix", "contas", "fixas", "fornecedores", "config"].includes(t))
      setTab(t as "dash" | "dre" | "receber" | "lancamentos" | "pix" | "contas" | "fixas" | "fornecedores" | "config")
    const p = sessionStorage.getItem("fin:periodo")
    if (p && ["mes", "trimestre", "semestre", "ano", "tudo"].includes(p))
      setPeriodo(p as Periodo)
  }, [])

  // Pedidos elegíveis (fechado, em produção, entregue — exceto perdido)
  const pedidosElegiveis = useMemo(() => calcPedidosElegiveis(kanban), [kanban])
  const pagamentosPorLote = useMemo(() => calcPagamentosPorLote(lancamentos), [lancamentos])
  const pagamentosPorCard = useMemo(() => calcPagamentosPorCard(lancamentos), [lancamentos])
  const sobrasPorLote = useMemo(() => calcSobrasPorLote(lancamentos), [lancamentos])
  const sobrasPorCard = useMemo(() => calcSobrasPorCard(lancamentos), [lancamentos])

  // Filtrar por período
  const { from, to } = periodoRange(periodo, mesOffset)
  const fromStr = from?.toISOString().split("T")[0] ?? null
  const toStr   = to?.toISOString().split("T")[0] ?? null
  const inPeriodo = (l: LancamentoFinanceiro) => {
    const ref = l.dataPagamento || l.dataVencimento
    if (fromStr && ref < fromStr) return false
    if (toStr   && ref > toStr)   return false
    return true
  }

  // Para a aba de lançamentos: filtra por mês específico (mesOffset) se periodo="mes",
  // ou mostra tudo se periodo != "mes". Independente do filtro global do dashboard.
  const lancFiltrados = useMemo(() => {
    const ref = (l: LancamentoFinanceiro) => l.dataPagamento || l.dataVencimento
    const inMes = (l: LancamentoFinanceiro) => {
      if (periodo !== "mes") return true
      const r = ref(l)
      if (fromStr && r < fromStr) return false
      if (toStr   && r > toStr)   return false
      return true
    }
    return lancamentos
      .filter(l => l.formaPagamento !== "conta") // custos na conta do fornecedor não aparecem no fluxo de caixa
      .filter(inMes)
      .filter(l => !filtroTipo     || l.tipo === filtroTipo)
      .filter(l => !filtroStatus   || statusEfetivo(l) === filtroStatus)
      .filter(l => !filtroCategoria || (l.categoria ?? "") === filtroCategoria)
      .filter(l => {
        if (!buscaLanc) return true
        const q = buscaLanc.toLowerCase()
        return l.descricao.toLowerCase().includes(q)
          || (l.nomeCliente ?? "").toLowerCase().includes(q)
          || (l.loteNumero  ?? "").toLowerCase().includes(q)
      })
      .sort((a, b) => ref(b).localeCompare(ref(a)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentos, periodo, mesOffset, fromStr, toStr, filtroTipo, filtroStatus, filtroCategoria, buscaLanc])

  // Parcerias — comissão e ganho são AMBOS receita do usuário
  const negociosInPeriodo = (n: NegocioParceiro) => {
    const ref = n.dataOrcamento || n.criadoEm
    if (fromStr && ref < fromStr) return false
    if (toStr   && ref > toStr)   return false
    return true
  }

  // Negócios pagos no período selecionado (para KPIs e DRE)
  const negociosPagos     = negocios.filter(n => n.status === "pago" && negociosInPeriodo(n))
  // Todos os pagos (sem filtro de período — para mostrar no painel de parcerias)
  const negociosPagosTodos = negocios.filter(n => n.status === "pago")
  // Pendentes (qualquer tipo → a receber)
  const negociosPendentes  = negocios.filter(n => n.status === "pendente")

  // KPIs (período selecionado)
  // Pedidos fechados com saldo aberto (total vs. pago) — base de "a receber", "em atraso" e
  // do contador de não-registrados. Uma única passada, em vez de recalcular o mesmo loop 3x.
  const pedidosFechadosTotais = useMemo(() => calcularPedidosFechados(kanban, lancamentos), [kanban, lancamentos])
  const pedidosEmAberto = useMemo(() => pedidosAbertos(pedidosFechadosTotais), [pedidosFechadosTotais])

  const kpis = useMemo(() => {
    const semConta = (l: LancamentoFinanceiro) => l.formaPagamento !== "conta"
    const all = lancamentos.filter(inPeriodo).filter(semConta)
    const recebidas = all.filter(l => l.tipo === "receita" && l.status === "pago")
    const despesas  = all.filter(l => l.tipo === "despesa" && l.status === "pago")
    const atrasados = lancamentos.filter(isAtrasada).filter(semConta)

    const totalParceiros = negociosPagos.reduce((s, n) => s + n.comissaoValor, 0)
    const totalRecebido  = recebidas.reduce((s, l) => s + l.valor, 0) + totalParceiros
    const totalDespesas  = despesas.reduce((s, l) => s + l.valor, 0)
    const aReceberPedidos = pedidosEmAberto.reduce((s, i) => s + i.restante, 0)

    return {
      recebido:   totalRecebido,
      despesasPg: totalDespesas,
      aReceber:   aReceberPedidos + negociosPendentes.reduce((s, n) => s + n.comissaoValor, 0),
      emAtraso:   atrasados.reduce((s, l) => s + l.valor, 0),
      resultado:  totalRecebido - totalDespesas,
      naoRegistrados: contarNaoRegistrados(pedidosFechadosTotais),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentos, negocios, periodo, mesOffset, pedidosEmAberto, pedidosFechadosTotais])

  // Itens que compõem o "A receber" — mesma base do kpis.aReceber, detalhada item a item
  const receberItens = useMemo(() => {
    type ItemReceber = { key: string; cliente: string; label: string; total: number; pago: number; restante: number; tipo: "pedido" | "parceria" }
    const itens: ItemReceber[] = pedidosEmAberto.map(i => ({ ...i, tipo: "pedido" as const }))

    for (const n of negociosPendentes) {
      itens.push({ key: `negocio-${n.id}`, cliente: n.parceiroNome, label: n.descricao, total: n.comissaoValor, pago: 0, restante: n.comissaoValor, tipo: "parceria" })
    }

    return itens.sort((a, b) => b.restante - a.restante)
  }, [pedidosEmAberto, negociosPendentes])

  // Margem de pedidos terceirizados (preço cobrado − custo pago ao fornecedor), no período selecionado
  const margemTerceiros = useMemo(() => {
    const itens = pedidosElegiveis
      .filter(c => c.materialNome === "Terceirizado" && c.custoTerceiro != null && c.custoTerceiro > 0)
      .filter(c => {
        const d = c.dataFechamento ?? c.data
        if (fromStr && d < fromStr) return false
        if (toStr   && d > toStr)   return false
        return true
      })
      .map(c => ({ ...c, margem: c.preco - (c.custoTerceiro ?? 0) }))
      .sort((a, b) => (b.dataFechamento ?? b.data).localeCompare(a.dataFechamento ?? a.data))

    const totalPreco  = itens.reduce((s, c) => s + c.preco, 0)
    const totalCusto  = itens.reduce((s, c) => s + (c.custoTerceiro ?? 0), 0)
    const totalMargem = totalPreco - totalCusto
    const pct = totalPreco > 0 ? (totalMargem / totalPreco) * 100 : 0

    return { itens, totalPreco, totalCusto, totalMargem, pct }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidosElegiveis, periodo, mesOffset])

  // Pagamentos vencidos — pendentes com dataVencimento no passado, agrupados por lote/card
  const vencidos = useMemo(() => calcularVencidos(lancamentos), [lancamentos])

  // PIX links emitidos
  const pixLinks = useMemo(() => {
    const hj = hoje()
    return lancamentos
      .filter(l => l.categoria === "pix_link")
      .map(l => ({
        ...l,
        pixStatus: l.status === "pago" ? "recebido" as const
          : l.dataVencimento < hj ? "expirado" as const
          : "pendente" as const,
      }))
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  }, [lancamentos])

  const pixPendentes  = pixLinks.filter(p => p.pixStatus === "pendente")
  const pixExpirados  = pixLinks.filter(p => p.pixStatus === "expirado")
  const pixRecebidos  = pixLinks.filter(p => p.pixStatus === "recebido")

  const [showPixHist, setShowPixHist] = useState(false)

  // ── Fluxo de caixa 60 dias ─────────────────────────────────────────────────
  const fluxo60 = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const semanas = Array.from({ length: 9 }, (_, i) => {
      const from = new Date(hoje); from.setDate(hoje.getDate() + i * 7)
      const to   = new Date(from); to.setDate(from.getDate() + 6)
      return { from, to, receitas: [] as LancamentoFinanceiro[], despesas: [] as LancamentoFinanceiro[] }
    })
    const atrasados = { receitas: [] as LancamentoFinanceiro[], despesas: [] as LancamentoFinanceiro[] }

    lancamentos
      .filter(l => l.status !== "pago" && l.categoria !== "sobra")
      .forEach(l => {
        const d = new Date(l.dataVencimento + "T12:00:00")
        if (d < hoje) { l.tipo === "receita" ? atrasados.receitas.push(l) : atrasados.despesas.push(l); return }
        const s = semanas.find(w => d >= w.from && d <= w.to)
        if (s) l.tipo === "receita" ? s.receitas.push(l) : s.despesas.push(l)
      })

    const summary = semanas.map(s => ({
      ...s,
      rec:  s.receitas.reduce((a, l) => a + l.valor, 0),
      desp: s.despesas.reduce((a, l) => a + l.valor, 0),
    }))
    const atrasadoRec  = atrasados.receitas.reduce((a, l) => a + l.valor, 0)
    const atrasadoDesp = atrasados.despesas.reduce((a, l) => a + l.valor, 0)
    const maxVal = Math.max(...summary.map(s => Math.max(s.rec, s.desp)), atrasadoRec, atrasadoDesp, 1)

    let running = atrasadoRec - atrasadoDesp
    const semanas60 = summary.map(s => { running += s.rec - s.desp; return { ...s, running } })

    return { atrasados, atrasadoRec, atrasadoDesp, semanas: semanas60, maxVal, netFinal: running }
  }, [lancamentos])

  const [semanaAberta, setSemanaAberta] = useState<number | null>(null)

  function fmtSemana(from: Date, to: Date) {
    const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")
    return `${fmt(from)} – ${fmt(to)}`
  }

  // DRE por categoria de despesas
  const dreDesp = useMemo(() => {
    const map: Record<string, number> = {}
    for (const l of lancamentos.filter(inPeriodo)) {
      if (l.tipo !== "despesa" || l.status !== "pago") continue
      const cat = l.categoria || "outros"
      map[cat] = (map[cat] ?? 0) + l.valor
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentos, periodo, mesOffset])

  // Dados mensais — últimos 12 meses (para charts do dashboard)
  const MES_BR = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"]

  const monthlyData12m = useMemo(() => {
    const result = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
      const key = d.toISOString().slice(0, 7)
      const label = MES_BR[d.getMonth()]
      const receita = lancamentos
        .filter(l => l.tipo === "receita" && l.status === "pago" && (l.dataPagamento || l.dataVencimento)?.slice(0, 7) === key)
        .reduce((s, l) => s + l.valor, 0)
      const parceiros = negocios
        .filter(n => n.status === "pago" && (n.dataOrcamento || n.criadoEm)?.slice(0, 7) === key)
        .reduce((s, n) => s + n.comissaoValor, 0)
      const despesas = lancamentos
        .filter(l => l.tipo === "despesa" && l.status === "pago" && (l.dataPagamento || l.dataVencimento)?.slice(0, 7) === key)
        .reduce((s, l) => s + l.valor, 0)
      result.push({ key, label, receita: receita + parceiros, despesas })
    }
    return result
  }, [lancamentos, negocios])

  const caixaProjetado = useMemo(() => {
    const recebidoCard: Record<string, number> = {}
    const recebidoLote: Record<string, number> = {}
    lancamentos.forEach(l => {
      if (l.tipo !== "receita" || l.status !== "pago") return
      if (l.cardId) recebidoCard[l.cardId] = (recebidoCard[l.cardId] ?? 0) + l.valor
      if (l.loteId) recebidoLote[l.loteId] = (recebidoLote[l.loteId] ?? 0) + l.valor
    })
    const lotePrecoTotal: Record<string, number> = {}
    kanban.forEach(c => { if (c.loteId) lotePrecoTotal[c.loteId] = (lotePrecoTotal[c.loteId] ?? 0) + c.preco })

    // Group by DAY (YYYY-MM-DD)
    const byDay: Record<string, { valor: number; pedidos: { numero: string; cliente: string; valor: number }[] }> = {}
    kanban.forEach(card => {
      if (!card.prazoRecebimentoInterno) return
      if (card.coluna === COL_PERDIDO) return
      const day = card.prazoRecebimentoInterno.slice(0, 10)
      let recebido = 0
      if (card.loteId) {
        const loteTotal = lotePrecoTotal[card.loteId] || 1
        recebido = ((recebidoLote[card.loteId] ?? 0) * card.preco) / loteTotal
      } else {
        recebido = recebidoCard[card.id] ?? 0
      }
      const valor = Math.max(card.preco - recebido, 0)
      if (!byDay[day]) byDay[day] = { valor: 0, pedidos: [] }
      byDay[day].valor += valor
      byDay[day].pedidos.push({ numero: card.numero ?? "", cliente: card.nomeCliente, valor })
    })

    const days = Object.keys(byDay).sort()
    if (days.length === 0) return []

    const saldoAtual = (config?.contas ?? [])
      .filter(c => c.ativa && c.tipo !== "credito" && c.saldo != null)
      .reduce((s, c) => s + (c.saldo ?? 0), 0)

    const DIAS_PT = ["dom","seg","ter","qua","qui","sex","sáb"]
    const MESES_PT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"]

    let cumulo = saldoAtual
    return days.map(day => {
      const [y, m, d] = day.split("-").map(Number)
      const dt = new Date(y, m - 1, d)
      const diaSemana = DIAS_PT[dt.getDay()]
      const label = `${String(d).padStart(2,"0")} ${MESES_PT[m - 1]}`
      cumulo += byDay[day].valor
      return {
        date: day, label, diaSemana,
        valor: byDay[day].valor,
        pedidos: byDay[day].pedidos,
        cumulo,
        saldoInicio: cumulo - byDay[day].valor,
      }
    })
  }, [kanban, lancamentos, config])


  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-7 pb-5 shrink-0">
        <div>
          <h1 className="text-[20px] font-bold text-[#1C1C1E] tracking-tight">Financeiro</h1>
          <p className="text-[12px] text-[#8E8E93] mt-0.5">
            {brl(kpis.recebido)} recebido · {brl(kpis.aReceber)} a receber · {brl(kpis.resultado >= 0 ? kpis.resultado : -kpis.resultado)} resultado
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={periodo} onChange={e => {
            const v = e.target.value as Periodo
            setPeriodo(v)
            setMesOffset(0)
            sessionStorage.setItem("fin:periodo", v)
          }}
            className="h-9 border border-[rgba(0,0,0,0.12)] rounded-xl px-3 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/25 focus:border-[#8456e8] cursor-pointer transition-all">
            {(Object.entries(PERIODO_LABEL) as [Periodo, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button onClick={() => setModalLanc(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#161421] hover:bg-[#0b0914] text-white text-[13px] font-semibold rounded-xl transition-colors active:scale-[0.98]">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Novo lançamento
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-8 pb-4 shrink-0 overflow-x-auto">
        <div className="inline-flex bg-[#F2F2F7] rounded-xl p-1 gap-0.5">
          {(["dash", "dre", "receber", "lancamentos", "contas", "fixas", "fornecedores", "pix", "config"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); sessionStorage.setItem("fin:tab", t) }}
              className={`px-3.5 py-2 text-[12px] font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                tab === t ? "bg-white text-[#191625] shadow-sm" : "text-[#8E8E93] hover:text-[#5e5c68]"
              }`}>
              {t === "dash"         ? "Dashboard"
               : t === "dre"         ? "DRE"
               : t === "lancamentos" ? "Lançamentos"
               : t === "contas"      ? "Contas"
               : t === "fixas"       ? "Fixas"
               : t === "fornecedores"? "Fornecedores"
               : t === "config"      ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
               )
               : t === "pix" ? (
                <>
                  PIX
                  {pixPendentes.length > 0 && (
                    <span className="text-[10px] font-bold bg-[#8456e8]/10 text-[#8456e8] rounded-full px-1.5 py-0.5 leading-none">{pixPendentes.length}</span>
                  )}
                </>
               ) : (
                <>
                  A receber
                  {kpis.naoRegistrados > 0 && (
                    <span className="text-[10px] font-bold bg-[rgba(116,116,128,0.12)] text-[#8E8E93] rounded-full px-1.5 py-0.5 leading-none">{kpis.naoRegistrados}</span>
                  )}
                  {vencidos.length > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d33a3c] shrink-0" />
                  )}
                </>
               )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-5">

        {/* ── DASHBOARD ── */}
        {tab === "dash" && (
          <div className="space-y-5">
            {/* KPI Caixa — saldo real das contas */}
            {(() => {
              const contas = (config?.contas ?? []).filter(c => c.ativa && c.tipo !== "credito")
              const comSaldo = contas.filter(c => c.saldo != null)
              if (comSaldo.length === 0) return null
              const totalCaixa = comSaldo.reduce((s, c) => s + (c.saldo ?? 0), 0)
              return (
                <div className="rounded-2xl px-5 py-4 flex items-center gap-4"
                  style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
                  <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
                    style={{ background: totalCaixa >= 0 ? "rgba(0,147,81,0.10)" : "rgba(211,58,60,0.08)" }}>
                    <Landmark className="w-5 h-5" style={{ color: totalCaixa >= 0 ? "#009351" : "#d33a3c" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-faint)" }}>Caixa disponível</p>
                    <p className="text-[22px] font-bold tabular-nums tracking-tight mt-0.5"
                      style={{ color: totalCaixa >= 0 ? "#009351" : "#d33a3c" }}>
                      {brl(totalCaixa)}
                    </p>
                  </div>
                  <div className="flex gap-3 shrink-0">
                    {comSaldo.map(c => (
                      <div key={c.id} className="text-right">
                        <p className="text-[9.5px] font-semibold truncate max-w-[80px]" style={{ color: "var(--text-faint)" }}>{c.nome}</p>
                        <p className="text-[12px] font-bold tabular-nums" style={{ color: (c.saldo ?? 0) >= 0 ? "var(--text-main)" : "#d33a3c" }}>{brl(c.saldo ?? 0)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* KPIs — 2 linhas de 3 */}
            <div className="grid grid-cols-3 gap-3.5">
              <KpiCard label="Recebido" value={brl(kpis.recebido)}
                icon={<TrendingUp className="w-4 h-4" />} iconBg="rgba(52,199,89,0.10)" iconColor="#16a34a"
                sub={PERIODO_LABEL[periodo].toLowerCase()} subColor="#16a34a" />
              <KpiCard label="Despesas pagas" value={brl(kpis.despesasPg)}
                icon={<TrendingDown className="w-4 h-4" />} iconBg="rgba(220,38,38,0.08)" iconColor="#b91c1c"
                sub={PERIODO_LABEL[periodo].toLowerCase()} subColor="#b91c1c" />
              <KpiCard label="Geração de Caixa" value={brl(kpis.resultado)}
                icon={<DollarSign className="w-4 h-4" />}
                iconBg={kpis.resultado >= 0 ? "rgba(52,199,89,0.10)" : "rgba(220,38,38,0.08)"}
                iconColor={kpis.resultado >= 0 ? "#16a34a" : "#b91c1c"}
                sub="entrou − saiu (caixa)"
                subColor={kpis.resultado >= 0 ? "#16a34a" : "#b91c1c"}
                highlight />
              <KpiCard label="A receber" value={brl(kpis.aReceber)}
                icon={<Clock className="w-4 h-4" />} iconBg="rgba(217,119,6,0.10)" iconColor="#d97706"
                sub={`${kpis.naoRegistrados} pedido${kpis.naoRegistrados !== 1 ? "s" : ""} incompleto${kpis.naoRegistrados !== 1 ? "s" : ""}`}
                onClick={() => setModalReceber(true)} />
              <KpiCard label="Em atraso" value={brl(kpis.emAtraso)}
                icon={<AlertTriangle className="w-4 h-4" />} iconBg="rgba(220,38,38,0.08)" iconColor="#b91c1c"
                sub={`${lancamentos.filter(l => l.tipo === "receita" && statusEfetivo(l) === "atrasado").length} títulos em atraso`}
                subColor={kpis.emAtraso > 0 ? "#b91c1c" : "var(--text-faint)"} />
              <KpiCard label="Margem terceirizados" value={brl(margemTerceiros.totalMargem)}
                icon={<Factory className="w-4 h-4" />}
                iconBg={margemTerceiros.totalMargem >= 0 ? "rgba(132,86,232,0.10)" : "rgba(220,38,38,0.08)"}
                iconColor={margemTerceiros.totalMargem >= 0 ? "#8456e8" : "#b91c1c"}
                sub={margemTerceiros.itens.length > 0 ? `${margemTerceiros.pct.toFixed(0)}% sobre ${brl(margemTerceiros.totalPreco)}` : "sem terceirizados"} />
            </div>

            {/* Charts row */}
            <div>
              {/* Receita & Despesas — 12m line chart */}
              <div className="rounded-2xl px-5 py-4"
                style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-faint)" }}>Receita & Despesas</p>
                    <div className="flex items-baseline gap-3 mt-1">
                      <p className="text-[22px] font-bold tabular-nums tracking-tight" style={{ color: "var(--text-main)" }}>
                        {brl(monthlyData12m[11]?.receita ?? 0)}
                      </p>
                      {(() => {
                        const prev = monthlyData12m[10]?.receita ?? 0
                        const cur  = monthlyData12m[11]?.receita ?? 0
                        if (prev === 0) return null
                        const pct = ((cur - prev) / prev) * 100
                        return (
                          <span className="text-[11px] font-semibold tabular-nums"
                            style={{ color: pct >= 0 ? "#009351" : "#d33a3c" }}>
                            {pct >= 0 ? "+" : ""}{pct.toFixed(0)}%
                          </span>
                        )
                      })()}
                      <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>este mês</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                      <span className="w-2.5 h-1.5 rounded-sm inline-block" style={{ background: "#009351", opacity: 0.85 }} />Receita
                    </span>
                    <span className="flex items-center gap-1.5 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                      <span className="w-2.5 h-1.5 rounded-sm inline-block" style={{ background: "#d33a3c", opacity: 0.65 }} />Despesas
                    </span>
                  </div>
                </div>
                <FinLineChart data={monthlyData12m} />
              </div>
            </div>

            {/* Caixa projetado */}
            {caixaProjetado.length > 0 && (() => {
              const saldoAtual = (config?.contas ?? [])
                .filter(c => c.ativa && c.tipo !== "credito" && c.saldo != null)
                .reduce((s, c) => s + (c.saldo ?? 0), 0)
              const totalEntradas = caixaProjetado.reduce((s, d) => s + d.valor, 0)
              const caixaFinal = caixaProjetado[caixaProjetado.length - 1]?.cumulo ?? saldoAtual
              const maxValorMes = Math.max(...caixaProjetado.map(d => d.valor), 1)
              return (
                <div className="rounded-2xl overflow-hidden"
                  style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
                  <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div>
                      <p className="text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-faint)" }}>Caixa projetado</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                        {saldoAtual > 0 ? `${brl(saldoAtual)} agora · ` : ""}{brl(totalEntradas)} de entradas previstas
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-bold tabular-nums" style={{ color: "#8456e8" }}>{brl(caixaFinal)}</p>
                      <p className="text-[10px] mt-0.5 font-semibold" style={{ color: "var(--text-faint)" }}>caixa final projetado</p>
                    </div>
                  </div>
                  <div className="px-5 pt-3 pb-1">
                    <CaixaProjetadoChart data={caixaProjetado} saldoAtual={saldoAtual} />
                  </div>
                  {/* Linha do tempo por dia */}
                  <div style={{ borderTop: "1px solid var(--border)" }}>
                    {/* Hoje */}
                    <div className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                      <div className="flex flex-col items-center gap-0.5 w-10 shrink-0">
                        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#8456e8" }}>hoje</span>
                      </div>
                      <div className="flex-1">
                        <span className="text-[12px] font-bold" style={{ color: "#8456e8" }}>Saldo atual</span>
                      </div>
                      <span className="text-[13px] font-bold tabular-nums" style={{ color: "#8456e8" }}>{brl(saldoAtual)}</span>
                    </div>
                    {caixaProjetado.map((d, i) => (
                      <div key={i} className="px-5 py-3 flex items-start gap-3"
                        style={{ borderBottom: i < caixaProjetado.length - 1 ? "1px solid var(--border)" : undefined }}>
                        <div className="flex flex-col items-center w-10 shrink-0 pt-0.5">
                          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>{d.diaSemana}</span>
                          <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--text-main)" }}>{d.label}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          {d.pedidos.map((p, j) => (
                            <div key={j} className="flex items-center justify-between gap-2 py-0.5">
                              <span className="text-[11px] truncate" style={{ color: "var(--text-faint)" }}>
                                {p.numero ? `#${p.numero} · ` : ""}{p.cliente}
                              </span>
                              <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color: "#30D158" }}>+{brl(p.valor)}</span>
                            </div>
                          ))}
                          {d.pedidos.length > 1 && (
                            <div className="flex items-center justify-end mt-0.5">
                              <span className="text-[10px] font-semibold tabular-nums" style={{ color: "#30D158" }}>
                                total +{brl(d.valor)}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="text-[13px] font-bold tabular-nums shrink-0 pt-0.5" style={{ color: "#8456e8" }}>{brl(d.cumulo)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Fluxo de caixa 60 dias */}
            {fluxo60.semanas.some(s => s.rec > 0 || s.desp > 0) ? (
                <div className="rounded-2xl overflow-hidden"
                  style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
                  <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div>
                      <p className="text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-faint)" }}>Fluxo 60 dias</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>Lançamentos por semana</p>
                    </div>
                    <span className="text-[14px] font-bold tabular-nums"
                      style={{ color: fluxo60.netFinal >= 0 ? "#009351" : "#d33a3c" }}>
                      {fluxo60.netFinal >= 0 ? "+" : "−"}{brl(Math.abs(fluxo60.netFinal))}
                    </span>
                  </div>
                  {(fluxo60.atrasadoRec > 0 || fluxo60.atrasadoDesp > 0) && (
                    <div className="px-5 py-2.5 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)", background: "rgba(211,58,60,0.04)" }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-[#d33a3c] shrink-0" />
                      <span className="text-[11px] font-semibold text-[#d33a3c] flex-1">Atrasados</span>
                      {fluxo60.atrasadoRec > 0 && <span className="text-[10.5px] font-semibold text-emerald-700 tabular-nums">+{brl(fluxo60.atrasadoRec)}</span>}
                      {fluxo60.atrasadoDesp > 0 && <span className="text-[10.5px] font-semibold text-rose-600 tabular-nums">−{brl(fluxo60.atrasadoDesp)}</span>}
                    </div>
                  )}
                  <div>
                    {fluxo60.semanas.filter(s => s.rec > 0 || s.desp > 0).slice(0, 6).map((s, i) => (
                      <div key={i} className="px-5 py-2.5 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                        <div className="w-20 shrink-0">
                          <p className="text-[10.5px] font-semibold" style={{ color: "var(--text-main)" }}>{fmtSemana(s.from, s.to)}</p>
                          <p className="text-[9.5px] font-semibold tabular-nums mt-0.5"
                            style={{ color: s.running >= 0 ? "#009351" : "#d33a3c" }}>
                            {s.running >= 0 ? "+" : ""}{brl(s.running)}
                          </p>
                        </div>
                        <div className="flex-1 flex flex-col gap-1">
                          {s.rec > 0 && (
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1 bg-emerald-100 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(s.rec / fluxo60.maxVal) * 100}%` }} />
                              </div>
                              <span className="text-[9.5px] text-emerald-700 font-semibold tabular-nums w-16 text-right">+{brl(s.rec)}</span>
                            </div>
                          )}
                          {s.desp > 0 && (
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1 bg-rose-100 rounded-full overflow-hidden">
                                <div className="h-full bg-rose-500 rounded-full" style={{ width: `${(s.desp / fluxo60.maxVal) * 100}%` }} />
                              </div>
                              <span className="text-[9.5px] text-rose-600 font-semibold tabular-nums w-16 text-right">−{brl(s.desp)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl px-5 py-8 flex items-center justify-center"
                  style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>Nenhum lançamento nos próximos 60 dias</p>
                </div>
              )}

            {/* Próximos recebimentos */}
            {(lancamentos.filter(l => isReceitaPendenteValida(l)).length > 0 || negociosPendentes.length > 0) && (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
                <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
                  <p className="text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-faint)" }}>Próximos recebimentos</p>
                </div>
                <div>
                  {negociosPendentes.map(n => (
                    <div key={`neg-${n.id}`} className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[12.5px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{n.descricao}</p>
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[#a582ff]/10 text-[#a582ff] shrink-0">PARCERIA</span>
                        </div>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                          {n.parceiroNome} · {fmtDate(n.dataOrcamento)}{n.tipo === "comissao" ? " · Comissão" : " · Ganho"}
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700">Pendente</span>
                      <p className="font-bold text-[13px] tabular-nums shrink-0" style={{ color: "var(--text-main)" }}>{brl(n.comissaoValor)}</p>
                    </div>
                  ))}
                  {lancamentos
                    .filter(l => isReceitaPendenteValida(l))
                    .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
                    .slice(0, 8)
                    .map(l => {
                      const st = statusEfetivo(l)
                      return (
                        <div key={l.id} className="px-5 py-3.5 flex items-center gap-3 group" style={{ borderBottom: "1px solid var(--border)" }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12.5px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{l.descricao}</p>
                            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                              Vence {fmtDate(l.dataVencimento)}{l.nomeCliente && ` · ${l.nomeCliente}`}
                            </p>
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_CLS[st]}`}>{STATUS_LABEL[st]}</span>
                          <p className="font-bold text-[13px] tabular-nums" style={{ color: "var(--text-main)" }}>{brl(l.valor)}</p>
                          <button onClick={() => setModalPag(l)}
                            className="opacity-0 group-hover:opacity-100 px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all">
                            Pago
                          </button>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DRE ── */}
        {tab === "dre" && (
          <div className="space-y-5 max-w-2xl">
            {/* DRE table */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
              <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
                <p className="font-bold text-[13px]" style={{ color: "var(--text-main)" }}>DRE — {PERIODO_LABEL[periodo]}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>Demonstrativo do Resultado do Exercício</p>
              </div>
              <div>
                <DreRow label="Receitas de pedidos" value={lancamentos.filter(l => l.tipo === "receita" && l.status === "pago" && inPeriodo(l)).reduce((s, l) => s + l.valor, 0)} bold accent="green" />
                {negociosPagos.length > 0 && (
                  <DreRow label="Receitas de parcerias" value={negociosPagos.reduce((s, n) => s + n.comissaoValor, 0)} accent="green" />
                )}
                {dreDesp.map(([cat, val]) => (
                  <DreRow key={cat} label={`Despesas — ${capitalize(cat)}`} value={-val} />
                ))}
                {dreDesp.length === 0 && <DreRow label="Despesas" value={0} />}
                <DreRow label="Resultado líquido" value={kpis.resultado}
                  bold accent={kpis.resultado >= 0 ? "green" : "rose"} separator />
              </div>
            </div>

            {/* Margem de terceirizados */}
            {margemTerceiros.itens.length > 0 && (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid rgba(197,120,0,0.18)" }}>
                <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(197,120,0,0.12)" }}>
                  <p className="font-bold text-[13px]" style={{ color: "var(--text-main)" }}>Margem — Terceirizados</p>
                  <p className="font-semibold text-[13px] tabular-nums"
                    style={{ color: margemTerceiros.totalMargem >= 0 ? "#009351" : "#d33a3c" }}>
                    {brl(margemTerceiros.totalMargem)} · {margemTerceiros.pct.toFixed(0)}%
                  </p>
                </div>
                <div>
                  {margemTerceiros.itens.slice(0, 10).map(c => (
                    <div key={c.id} className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[12.5px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{c.dimensoes || c.numero}</p>
                          {c.loteNumero && (
                            <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[#8456e8]/10 text-[#8456e8] shrink-0">{c.loteNumero}</span>
                          )}
                        </div>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                          {c.nomeCliente}{c.fornecedor ? ` · via ${c.fornecedor}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[13px] font-bold tabular-nums" style={{ color: c.margem >= 0 ? "#009351" : "#d33a3c" }}>{brl(c.margem)}</p>
                        <p className="text-[10px] tabular-nums" style={{ color: "var(--text-faint)" }}>{brl(c.preco)} − {brl(c.custoTerceiro ?? 0)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Parcerias pagas */}
            {negociosPagosTodos.length > 0 && (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid rgba(165,130,255,0.15)" }}>
                <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(165,130,255,0.12)" }}>
                  <p className="font-bold text-[13px]" style={{ color: "var(--text-main)" }}>Receitas de parcerias</p>
                  <p className="font-semibold text-[#a582ff] text-[13px] tabular-nums">
                    {brl(negociosPagosTodos.reduce((s, n) => s + n.comissaoValor, 0))} total
                  </p>
                </div>
                <div>
                  {negociosPagosTodos.slice(0, 5).map(n => (
                    <div key={n.id} className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[12.5px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{n.descricao}</p>
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[#a582ff]/10 text-[#a582ff] shrink-0">
                            {n.tipo === "comissao" ? "COMISSÃO" : "GANHO"}
                          </span>
                        </div>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>{n.parceiroNome} · {fmtDate(n.dataOrcamento)}</p>
                      </div>
                      <p className="font-bold text-[#a582ff] text-[13px] tabular-nums shrink-0">{brl(n.comissaoValor)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── A RECEBER ── */}
        {tab === "receber" && (
          <div className="space-y-2">
            <p className="text-[11.5px] text-[#8E8E93] mb-3">
              Pedidos fechados ou em produção, e ganhos de parcerias pendentes.
            </p>

            {/* Search + filter */}
            <div className="flex flex-col gap-2 mb-4">
              <div className="flex items-center gap-2 h-9 border border-[rgba(60,60,67,0.12)] rounded-xl px-3 bg-white">
                <svg className="w-3.5 h-3.5 text-[#898892] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
                </svg>
                <input
                  type="text"
                  value={buscaReceber}
                  onChange={e => setBuscaReceber(e.target.value)}
                  placeholder="Buscar por cliente ou pedido…"
                  className="flex-1 text-[12.5px] text-[#191625] placeholder:text-[#898892] bg-transparent focus:outline-none"
                />
                {buscaReceber && (
                  <button onClick={() => setBuscaReceber("")} className="text-[#898892] hover:text-[#8E8E93] text-base leading-none">×</button>
                )}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(["aberto", "pendente", "parcial", "todos"] as const).map(f => (
                  <button key={f}
                    onClick={() => setFiltroReceber(f)}
                    className={`h-7 px-3 rounded-full text-[11px] font-semibold transition-colors ${
                      filtroReceber === f
                        ? "bg-[#0b0914] text-white"
                        : "bg-[rgba(116,116,128,0.08)] text-[#8E8E93] hover:bg-[rgba(116,116,128,0.14)]"
                    }`}>
                    {f === "aberto" ? "Pendentes" : f === "pendente" ? "Sem registro" : f === "parcial" ? "Em aberto" : "Todos"}
                  </button>
                ))}
              </div>
            </div>

            {/* Vencidos — pagamentos registrados com data no passado */}
            {vencidos.length > 0 && (
              <div className="rounded-2xl border border-[#d33a3c]/20 bg-[#d33a3c]/[0.03] overflow-hidden mb-4">
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#d33a3c] shrink-0" />
                    <span className="text-[11px] font-semibold text-[#d33a3c] uppercase tracking-wide">
                      {vencidos.length} vencido{vencidos.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <span className="text-[13px] font-semibold text-[#d33a3c] tabular-nums">
                    {brl(vencidos.reduce((s, v) => s + v.total, 0))}
                  </span>
                </div>
                <div className="border-t border-[#d33a3c]/10 divide-y divide-[#d33a3c]/[0.07]">
                  {vencidos.map(v => (
                    <div key={v.key} className="px-5 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-[12.5px] font-medium text-[#191625]">{v.nomeCliente}</span>
                        {(v.loteNumero || v.cardNumero) && (
                          <span className="text-[11px] text-[#8E8E93] ml-2">{v.loteNumero ?? v.cardNumero}</span>
                        )}
                      </div>
                      <span className="text-[10.5px] text-[#d33a3c]/70 shrink-0">{v.diasAtraso}d em atraso</span>
                      <span className="text-[12px] font-semibold text-[#d33a3c] tabular-nums">{brl(v.total)}</span>
                      <button
                        onClick={() => setModalPag(v.lancamentos[0])}
                        className="h-6 px-2.5 text-[10.5px] font-semibold text-white bg-[#009351] hover:bg-[#2DB84D] rounded-lg transition-colors shrink-0">
                        Recebido
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Parcerias pendentes (comissão ou ganho — ambos são receita) */}
            {negociosPendentes.length > 0 && (
              <div className="mb-4">
                <p className="text-[10.5px] uppercase tracking-wider text-[#8E8E93] font-semibold mb-2">Receitas de parcerias</p>
                {negociosPendentes.map(n => (
                  <div key={n.id} className="bg-white border border-violet-100 rounded-2xl px-5 py-4 flex items-center gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[#191625] text-[13px]">{n.descricao}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-[#a582ff] border border-violet-200">
                          {n.parceiroNome}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(116,116,128,0.04)] text-[#8E8E93] border border-[rgba(60,60,67,0.12)]">
                          {n.tipo === "comissao" ? "Comissão" : "Ganho"}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700">
                          Pendente
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8E8E93] mt-1">{fmtDate(n.dataOrcamento)}</p>
                    </div>
                    <p className="font-semibold text-[#a582ff] text-[15px] tabular-nums shrink-0">{brl(n.comissaoValor)}</p>
                  </div>
                ))}
              </div>
            )}

            {negociosPendentes.length > 0 && pedidosElegiveis.length > 0 && (
              <p className="text-[10.5px] uppercase tracking-wider text-[#8E8E93] font-semibold mb-2">Pedidos</p>
            )}
            {pedidosElegiveis.length === 0 ? (
              <Empty msg="Nenhum pedido fechado ainda." />
            ) : (() => {
              // Apply search filter
              const q = buscaReceber.toLowerCase().trim()
              const pedidosBuscados = q
                ? pedidosElegiveis.filter(c =>
                    c.nomeCliente.toLowerCase().includes(q) || c.numero.toLowerCase().includes(q)
                  )
                : pedidosElegiveis

              // Group by lote (cards with same loteId → one row)
              const loteGroups: Record<string, KanbanCard[]> = {}
              const solos: KanbanCard[] = []
              for (const card of pedidosBuscados) {
                if (card.loteId) {
                  if (!loteGroups[card.loteId]) loteGroups[card.loteId] = []
                  loteGroups[card.loteId].push(card)
                } else {
                  solos.push(card)
                }
              }

              // Apply status filter
              const isComplete = (pags: LancamentoFinanceiro[], total: number) => {
                const totalPago = pags.filter(p => p.status === "pago").reduce((s, p) => s + p.valor, 0)
                return total > 0 && totalPago >= total
              }
              const loteEntries = Object.entries(loteGroups).filter(([loteId, cards]) => {
                if (filtroReceber === "todos") return true
                const pags = pagamentosPorLote[loteId] ?? []
                const sobrasLote = sobrasPorLote[loteId] ?? []
                const total = cards.reduce((s, c) => s + c.preco, 0) + sobrasLote.reduce((s, l) => s + l.valor, 0)
                if (filtroReceber === "aberto") return !isComplete(pags, total)
                if (filtroReceber === "pendente") return pags.length === 0
                // "parcial" = tem registro mas não está completo
                return pags.length > 0 && !isComplete(pags, total)
              })
              const solosFiltrados = solos.filter(card => {
                if (filtroReceber === "todos") return true
                const pags = pagamentosPorCard[card.id] ?? []
                const sobrasCard = sobrasPorCard[card.id] ?? []
                const total = card.preco + sobrasCard.reduce((s, l) => s + l.valor, 0)
                if (filtroReceber === "aberto") return !isComplete(pags, total)
                if (filtroReceber === "pendente") return pags.length === 0
                return pags.length > 0 && !isComplete(pags, total)
              })

              if (loteEntries.length === 0 && solosFiltrados.length === 0) {
                const msg = q
                  ? `Nenhum resultado para "${buscaReceber}".`
                  : filtroReceber === "pendente"
                    ? "Todos os pedidos já têm pagamento registrado."
                    : filtroReceber === "aberto"
                      ? "Todos os pedidos estão quitados."
                      : "Nenhum pedido em aberto."
                return <Empty msg={msg} />
              }

              return (
                <>
                  {/* Lote groups */}
                  {loteEntries.map(([loteId, cards]) => {
                    const loteNum = cards[0].loteNumero ?? loteId
                    const loteInfo = (lotes ?? []).find(l => l.id === loteId)
                    const totalPedidos = cards.reduce((s, c) => s + c.preco, 0)
                    const sobrasLote = sobrasPorLote[loteId] ?? []
                    const totalSobras = sobrasLote.reduce((s, l) => s + l.valor, 0)
                    const total = totalPedidos + totalSobras
                    const pagamentosLote = pagamentosPorLote[loteId] ?? []
                    const totalPago = pagamentosLote.filter(p => p.status === "pago").reduce((s, p) => s + p.valor, 0)
                    const pagoPct = total > 0 ? Math.min(100, Math.round((totalPago / total) * 100)) : 0
                    const completo = totalPago >= total && total > 0
                    const restante = Math.max(0, total - totalPago)
                    const podeSobra = cards.some(c => c.coluna >= COL_EXPEDICAO && c.coluna !== COL_PERDIDO)

                    return (
                      <div key={loteId} className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl overflow-hidden mb-2">
                        {/* Header */}
                        <div className="px-5 pt-4 pb-3 flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[#191625] text-[14px] leading-tight">{loteInfo?.nomeCliente ?? cards[0].nomeCliente}</span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#a582ff]/10 text-[#a582ff] shrink-0">{loteNum}</span>
                              {completo && (
                                <svg className="w-3.5 h-3.5 text-[#009351] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              )}
                            </div>
                            <p className="text-[11px] text-[#8E8E93] mt-0.5">
                              {cards.length} produto{cards.length > 1 ? "s" : ""}
                              {pagamentosLote.length > 0 && !completo && ` · ${brl(totalPago)} recebido`}
                              {sobrasLote.length > 0 && ` · +${brl(totalSobras)} sobras`}
                              {!completo && total > 0 && <span className="text-amber-600 font-medium"> · {brl(restante)} restante</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-semibold text-[#191625] text-[15px] tabular-nums">{brl(total)}</span>
                            {onRegistrarSobra && podeSobra && (
                              <button onClick={() => onRegistrarSobra(cards[0])}
                                className="h-7 px-2.5 text-[11px] font-medium text-[#c57800] bg-[#c57800]/[0.08] hover:bg-[#c57800]/[0.14] rounded-lg transition-colors shrink-0">
                                Sobras
                              </button>
                            )}
                            {!completo && (
                              <button onClick={() => setModalLanc({
                                  tipo: "receita",
                                  descricao: `Lote ${loteNum} — ${cards[0].nomeCliente}`,
                                  valor: restante,
                                  nomeCliente: cards[0].nomeCliente,
                                  loteId,
                                  loteNumero: loteNum,
                                  dataVencimento: hoje(),
                                })}
                                className="h-7 px-3 text-[11px] font-semibold text-white bg-[#009351] hover:bg-[#2DB84D] rounded-lg transition-colors shrink-0">
                                Receber
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Progress bar — only when payments exist */}
                        {pagamentosLote.length > 0 && (
                          <div className="h-0.5 bg-[rgba(60,60,67,0.06)] mx-5 rounded-full overflow-hidden mb-1">
                            <div className="h-full rounded-full bg-[#009351] transition-all"
                              style={{ width: `${pagoPct}%` }} />
                          </div>
                        )}
                        {/* Rows */}
                        <div className="border-t border-[rgba(60,60,67,0.05)] divide-y divide-[rgba(60,60,67,0.04)]">
                          {cards.map(card => (
                            <div key={card.id} className="px-5 py-2.5 flex items-center gap-3">
                              <span className="text-[9.5px] font-bold text-[#8456e8] bg-[#8456e8]/[0.08] px-1.5 py-0.5 rounded-md shrink-0">{card.numero}</span>
                              <p className="flex-1 text-[12px] text-[rgba(60,60,67,0.55)] truncate">{card.dimensoes}{card.materialNome ? ` · ${card.materialNome}` : ""}</p>
                              <p className="text-[12px] font-medium text-[#5e5c68] tabular-nums">{brl(card.preco)}</p>
                            </div>
                          ))}
                          {sobrasLote.map(s => (
                            <div key={s.id} className="px-5 py-2.5 flex items-center gap-3">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#c57800] shrink-0 ml-0.5" />
                              <p className="flex-1 text-[12px] text-[rgba(60,60,67,0.5)] truncate">{s.descricao}</p>
                              <p className="text-[12px] font-medium text-[#c57800] tabular-nums">+{brl(s.valor)}</p>
                            </div>
                          ))}
                          {pagamentosLote.map(p => (
                            <div key={p.id} className="px-5 py-2.5 flex items-center gap-3">
                              {p.status === "pago" ? (
                                <svg className="w-3.5 h-3.5 text-[#009351] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                </svg>
                              )}
                              <p className="flex-1 text-[12px] text-[rgba(60,60,67,0.5)] truncate">
                                {p.dataPagamento ? fmtDate(p.dataPagamento) : `vence ${fmtDate(p.dataVencimento)}`}
                                {p.formaPagamento ? ` · ${p.formaPagamento}` : ""}
                              </p>
                              <p className={`text-[12px] font-semibold tabular-nums ${p.status === "pago" ? "text-[#009351]" : "text-amber-600"}`}>{brl(p.valor)}</p>
                              {p.status !== "pago" && (
                                <button
                                  onClick={() => setModalPag(p)}
                                  className="h-6 px-2.5 text-[10.5px] font-semibold text-white bg-[#009351] hover:bg-[#2DB84D] rounded-lg transition-colors shrink-0">
                                  Recebido
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  {/* Solo cards */}
                  {solosFiltrados.sort((a, b) => b.preco - a.preco).map(card => {
                    const pagamentosCard = pagamentosPorCard[card.id] ?? []
                    const sobrasCard = sobrasPorCard[card.id] ?? []
                    const totalSobrasCard = sobrasCard.reduce((s, l) => s + l.valor, 0)
                    const totalCard = card.preco + totalSobrasCard
                    const totalPagoCard = pagamentosCard.filter(p => p.status === "pago").reduce((s, p) => s + p.valor, 0)
                    const pagoPctCard = totalCard > 0 ? Math.min(100, Math.round((totalPagoCard / totalCard) * 100)) : 0
                    const completoCard = totalPagoCard >= totalCard && totalCard > 0
                    const restanteCard = Math.max(0, totalCard - totalPagoCard)
                    return (
                      <div key={card.id} className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl overflow-hidden mb-2">
                        {/* Header */}
                        <div className="px-5 pt-4 pb-3 flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[#191625] text-[14px] leading-tight">{card.nomeCliente}</span>
                              <span className="text-[9.5px] font-bold text-[#8456e8] bg-[#8456e8]/[0.08] px-1.5 py-0.5 rounded-md shrink-0">{card.numero}</span>
                              {completoCard && (
                                <svg className="w-3.5 h-3.5 text-[#009351] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              )}
                            </div>
                            <p className="text-[11px] text-[#8E8E93] mt-0.5">
                              {[card.dimensoes, card.materialNome].filter(Boolean).join(" · ")}
                              {pagamentosCard.length > 0 && !completoCard && ` · ${brl(totalPagoCard)} recebido`}
                              {sobrasCard.length > 0 && ` · +${brl(totalSobrasCard)} sobras`}
                              {!completoCard && totalCard > 0 && <span className="text-amber-600 font-medium"> · {brl(restanteCard)} restante</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-semibold text-[#191625] text-[15px] tabular-nums">{brl(totalCard)}</span>
                            {onRegistrarSobra && card.coluna >= COL_EXPEDICAO && card.coluna !== COL_PERDIDO && (
                              <button onClick={() => onRegistrarSobra(card)}
                                className="h-7 px-2.5 text-[11px] font-medium text-[#c57800] bg-[#c57800]/[0.08] hover:bg-[#c57800]/[0.14] rounded-lg transition-colors shrink-0">
                                Sobras
                              </button>
                            )}
                            {!completoCard && (
                              <button onClick={() => setModalLanc({
                                  tipo: "receita",
                                  descricao: `Pedido ${card.numero} — ${card.nomeCliente}`,
                                  valor: restanteCard,
                                  cardId: card.id,
                                  cardNumero: card.numero,
                                  nomeCliente: card.nomeCliente,
                                  dataVencimento: hoje(),
                                })}
                                className="h-7 px-3 text-[11px] font-semibold text-white bg-[#009351] hover:bg-[#2DB84D] rounded-lg transition-colors shrink-0">
                                Receber
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Progress bar — only when payments exist */}
                        {pagamentosCard.length > 0 && (
                          <div className="h-0.5 bg-[rgba(60,60,67,0.06)] mx-5 rounded-full overflow-hidden mb-1">
                            <div className="h-full rounded-full bg-[#009351] transition-all"
                              style={{ width: `${pagoPctCard}%` }} />
                          </div>
                        )}
                        {/* Rows */}
                        {(sobrasCard.length > 0 || pagamentosCard.length > 0) && (
                          <div className="border-t border-[rgba(60,60,67,0.05)] divide-y divide-[rgba(60,60,67,0.04)]">
                            {sobrasCard.map(s => (
                              <div key={s.id} className="px-5 py-2.5 flex items-center gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#c57800] shrink-0 ml-0.5" />
                                <p className="flex-1 text-[12px] text-[rgba(60,60,67,0.5)] truncate">{s.descricao}</p>
                                <p className="text-[12px] font-medium text-[#c57800] tabular-nums">+{brl(s.valor)}</p>
                              </div>
                            ))}
                            {pagamentosCard.map(p => (
                              <div key={p.id} className="px-5 py-2.5 flex items-center gap-3">
                                {p.status === "pago" ? (
                                  <svg className="w-3.5 h-3.5 text-[#009351] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                  </svg>
                                ) : (
                                  <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                  </svg>
                                )}
                                <p className="flex-1 text-[12px] text-[rgba(60,60,67,0.5)] truncate">
                                  {p.dataPagamento ? fmtDate(p.dataPagamento) : `vence ${fmtDate(p.dataVencimento)}`}
                                  {p.formaPagamento ? ` · ${p.formaPagamento}` : ""}
                                </p>
                                <p className={`text-[12px] font-semibold tabular-nums ${p.status === "pago" ? "text-[#009351]" : "text-amber-600"}`}>{brl(p.valor)}</p>
                                {p.status !== "pago" && (
                                  <button
                                    onClick={() => setModalPag(p)}
                                    className="h-6 px-2.5 text-[10.5px] font-semibold text-white bg-[#009351] hover:bg-[#2DB84D] rounded-lg transition-colors shrink-0">
                                    Recebido
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              )
            })()}
          {/* ── Terceirizados ── */}
          {(() => {
            const tercs = kanban.filter(c => c.materialNome === "Terceirizado")
            if (tercs.length === 0) return null
            return (
              <div className="mt-6 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-[9.5px] uppercase tracking-wide font-bold" style={{ color: "#c57800" }}>
                    Terceirizados ({tercs.length})
                  </p>
                  <div className="flex-1 h-px" style={{ background: "rgba(255,149,0,0.2)" }} />
                </div>
                {tercs.map(t => (
                  <div key={t.id}
                    className="rounded-2xl border px-4 py-3 flex items-start justify-between gap-3"
                    style={{ background: "rgba(255,149,0,0.04)", borderColor: "rgba(255,149,0,0.15)" }}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="text-[12.5px] font-semibold truncate" style={{ color: "var(--text-main)" }}>
                          {t.dimensoes || t.numero}
                        </p>
                        {t.loteNumero && (
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(80,9,196,0.08)", color: "#8456e8" }}>
                            {t.loteNumero}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                        {t.nomeCliente}{t.fornecedor ? ` · via ${t.fornecedor}` : ""}
                      </p>
                      {t.custoTerceiro != null && t.custoTerceiro > 0 && (
                        <p className="text-[10px] mt-0.5" style={{ color: "#c57800" }}>
                          Custo: {brl(t.custoTerceiro)} · Margem: {brl(t.preco - t.custoTerceiro)}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-2">
                      <p className="text-[13px] font-bold tabular-nums" style={{ color: "var(--text-main)" }}>{brl(t.preco)}</p>
                      <div className="flex gap-1.5">
                        {onDetalhesCard && (
                          <button onClick={() => onDetalhesCard(t)}
                            className="text-[10.5px] font-medium px-2.5 py-1 rounded-lg transition-colors"
                            style={{ background: "rgba(80,9,196,0.08)", color: "#8456e8" }}>
                            Detalhes
                          </button>
                        )}
                        {onDeleteCard && (
                          <button onClick={() => onDeleteCard(t.id)}
                            className="text-[10.5px] font-medium px-2.5 py-1 rounded-lg transition-colors"
                            style={{ background: "rgba(255,59,48,0.08)", color: "#d33a3c" }}>
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
        )}

        {/* ── LANÇAMENTOS ── */}
        {tab === "lancamentos" && (
          <>
            {/* Navegação de mês — sempre visível nesta aba */}
            {(() => {
              const now = new Date()
              const d = new Date(now.getFullYear(), now.getMonth() + mesOffset, 1)
              const label = `${MESES_PT[d.getMonth()]} ${d.getFullYear()}`
              const isTudo = periodo !== "mes"
              return (
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-2 flex-1 bg-white border border-[rgba(60,60,67,0.10)] rounded-2xl px-4 py-3">
                    <button onClick={() => { if (isTudo) { setPeriodo("mes"); setMesOffset(-1) } else setMesOffset(o => o - 1) }}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-[rgba(60,60,67,0.06)] hover:bg-[rgba(60,60,67,0.12)] text-[#191625] transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                    </button>
                    <span className="flex-1 text-center text-[14px] font-semibold text-[#191625]">
                      {isTudo ? "Todos os meses" : label}
                    </span>
                    <button onClick={() => { if (!isTudo) setMesOffset(o => Math.min(o + 1, 0)) }}
                      disabled={!isTudo && mesOffset >= 0}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-[rgba(60,60,67,0.06)] hover:bg-[rgba(60,60,67,0.12)] text-[#191625] transition-colors disabled:opacity-25">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                    </button>
                  </div>
                  <button
                    onClick={() => { if (isTudo) { setPeriodo("mes"); setMesOffset(0) } else { setPeriodo("tudo") } }}
                    className="h-[52px] px-4 text-[12px] font-semibold rounded-2xl border transition-colors whitespace-nowrap"
                    style={isTudo
                      ? { background: "#191625", color: "#fff", borderColor: "#191625" }
                      : { background: "white", color: "#8E8E93", borderColor: "rgba(60,60,67,0.10)" }}>
                    {isTudo ? "Por mês" : "Ver todos"}
                  </button>
                </div>
              )
            })()}
            <div className="flex gap-2 mb-4 flex-wrap">
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as TipoLancamento | "")}
                className="h-8 border border-[rgba(60,60,67,0.12)] rounded-lg px-3 text-[12px] text-[#72707d] bg-white focus:outline-none">
                <option value="">Todos os tipos</option>
                <option value="receita">Receitas</option>
                <option value="despesa">Despesas</option>
              </select>
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as StatusLancamento | "")}
                className="h-8 border border-[rgba(60,60,67,0.12)] rounded-lg px-3 text-[12px] text-[#72707d] bg-white focus:outline-none">
                <option value="">Todos os status</option>
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
                <option value="atrasado">Em atraso</option>
              </select>
              <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
                className="h-8 border border-[rgba(60,60,67,0.12)] rounded-lg px-3 text-[12px] text-[#72707d] bg-white focus:outline-none">
                <option value="">Todas as categorias</option>
                {[...new Map([...catsRec, ...catsDesp].map(c => [c.id, c])).values()].map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              <input value={buscaLanc} onChange={e => setBuscaLanc(e.target.value)}
                placeholder="Buscar lançamento…"
                className="h-8 border border-[rgba(60,60,67,0.12)] rounded-lg px-3 text-[12px] text-[#72707d] bg-white focus:outline-none flex-1 min-w-[160px]" />
            </div>

            {/* Negócios de parcerias concretizados, respeitando o período selecionado */}
            {negocios.filter(n => n.status === "pago" && (!filtroTipo || filtroTipo === "receita") && negociosInPeriodo(n)).map(n => (
              <div key={`neg-${n.id}`}
                className="bg-white border border-violet-100 rounded-2xl px-5 py-4 flex items-center gap-3 hover:border-violet-200 transition-colors">
                <div className="w-1.5 h-10 rounded-full shrink-0 bg-violet-400" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[#191625] text-[13px]">{n.descricao}</span>
                    <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[#a582ff]/10 text-[#a582ff]">PARCERIA</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${n.status === "pago" ? STATUS_CLS.pago : STATUS_CLS.pendente}`}>
                      {n.status === "pago" ? "Pago" : "Pendente"}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(116,116,128,0.08)] text-[#8E8E93] font-medium">
                      {n.tipo === "comissao" ? "Comissão" : "Ganho"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-[#8E8E93]">{n.parceiroNome}</span>
                    <span className="text-[11px] text-[#8E8E93]">{fmtDate(n.dataOrcamento)}</span>
                  </div>
                </div>
                <p className="font-semibold text-[14px] tabular-nums shrink-0 text-[#a582ff]">{brl(n.comissaoValor)}</p>
              </div>
            ))}

            {lancFiltrados.length === 0 && negocios.filter(n => n.status !== "cancelado").length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-[13px] text-[#8E8E93]">Nenhum lançamento no período selecionado.</p>
                {periodo === "mes" && lancamentos.length > 0 && (
                  <p className="text-[11px] text-[#8E8E93]">
                    Use as setas ← → acima para navegar entre meses e ver lançamentos de outros períodos.
                  </p>
                )}
              </div>
            ) : lancFiltrados.length > 0 ? (
              (() => {
                const groups: { date: string; items: LancamentoFinanceiro[] }[] = []
                for (const l of lancFiltrados) {
                  const d = l.dataPagamento || l.dataVencimento
                  const last = groups[groups.length - 1]
                  if (!last || last.date !== d) groups.push({ date: d, items: [l] })
                  else last.items.push(l)
                }
                const allCats = [...(config?.categoriasReceita ?? DEFAULT_CATS_REC), ...(config?.categoriasDespesa ?? DEFAULT_CATS_DESP)]
                return (
                  <div className="space-y-2">
                    {groups.map(({ date, items }) => {
                      const dayTotal = items.reduce((s, l) => s + (l.tipo === "receita" ? l.valor : -l.valor), 0)
                      return (
                        <div key={date} className="rounded-2xl overflow-hidden"
                          style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)" }}>
                          {/* Cabeçalho do dia */}
                          <div className="px-4 py-2 flex items-center justify-between"
                            style={{ borderBottom: "1px solid var(--border)" }}>
                            <span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                              {fmtDate(date)}
                            </span>
                            <span className={`text-[11px] font-bold tabular-nums ${dayTotal >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {dayTotal >= 0 ? "+" : "−"}{brl(Math.abs(dayTotal))}
                            </span>
                          </div>
                          {/* Linhas de transação */}
                          {items.map((l, i) => {
                            const st = statusEfetivo(l)
                            const catNome = l.categoria ? (allCats.find(c => c.id === l.categoria)?.nome ?? capitalize(l.categoria)) : null
                            const [catBg, catText, catBorder] = l.categoria ? getCatChip(l.categoria) : ["", "", ""]
                            const conta = l.contaId ? (config?.contas ?? []).find(c => c.id === l.contaId) : null
                            const forn  = l.fornecedorId ? (config?.fornecedores ?? []).find(f => f.id === l.fornecedorId) : null
                            const isRec = l.tipo === "receita"
                            const isSel = selectedIds.has(l.id)
                            return (
                              <div key={l.id}
                                onClick={e => {
                                  if (e.metaKey || e.ctrlKey) {
                                    e.preventDefault()
                                    setSelectedIds(prev => {
                                      const next = new Set(prev)
                                      next.has(l.id) ? next.delete(l.id) : next.add(l.id)
                                      return next
                                    })
                                  }
                                }}
                                className={`px-4 py-2.5 flex items-center gap-3 group transition-colors ${isSel ? "bg-[#8456e8]/08" : "hover:bg-[rgba(0,0,0,0.018)]"} ${selectedIds.size > 0 ? "cursor-pointer" : ""}`}
                                style={{ borderBottom: i < items.length - 1 ? "1px solid var(--border)" : undefined, background: isSel ? "rgba(132,86,232,0.07)" : undefined }}>
                                {/* Checkbox de seleção (só mostra quando há seleção ativa) */}
                                {selectedIds.size > 0 && (
                                  <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${isSel ? "bg-[#8456e8] border-[#8456e8]" : "border-[#C7C7CC] bg-white"}`}>
                                    {isSel && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                                  </div>
                                )}
                                {/* Ícone compacto */}
                                <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[13px] font-bold"
                                  style={{ background: isRec ? "rgba(0,147,81,0.09)" : "rgba(211,58,60,0.08)", color: isRec ? "#009351" : "#d33a3c" }}>
                                  {isRec ? "↑" : "↓"}
                                </div>
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[12.5px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{l.descricao}</span>
                                    {st !== "pago" && (
                                      <span className={`text-[9.5px] font-bold px-1.5 py-px rounded-full border shrink-0 ${STATUS_CLS[st]}`}>
                                        {STATUS_LABEL[st]}
                                      </span>
                                    )}
                                    {catNome && (
                                      <span className="text-[9.5px] font-semibold px-1.5 py-px rounded-full border shrink-0"
                                        style={{ background: catBg, color: catText, borderColor: catBorder }}>
                                        {catNome}{l.subcategoria ? ` › ${l.subcategoria}` : ""}
                                      </span>
                                    )}
                                    {l.loteNumero && (
                                      <span className="text-[9.5px] font-semibold px-1.5 py-px rounded-full bg-[#8456e8]/10 text-[#8456e8] border border-[#8456e8]/20 shrink-0">
                                        #{l.loteNumero}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    {l.nomeCliente && <span className="text-[10.5px] truncate" style={{ color: "var(--text-faint)" }}>{l.nomeCliente}</span>}
                                    {conta && (
                                      <span className="text-[10px] font-medium shrink-0" style={{ color: conta.cor }}>· {conta.nome}</span>
                                    )}
                                    {forn && (
                                      <span className="text-[10px] font-medium text-amber-600 shrink-0">· {forn.nome}</span>
                                    )}
                                    {l.formaPagamento && (
                                      <span className="text-[10px] shrink-0" style={{ color: "var(--text-faint)" }}>
                                        · {FORMAS.find(f => f.value === l.formaPagamento)?.label}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {/* Valor */}
                                <span className={`text-[13.5px] font-bold tabular-nums shrink-0 ${isRec ? "text-emerald-700" : "text-rose-600"}`}>
                                  {isRec ? "+" : "−"}{brl(l.valor)}
                                </span>
                                {/* Ações no hover */}
                                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  {isRec && st !== "pago" && (
                                    <button onClick={() => setModalPag(l)} title="Registrar recebimento"
                                      className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 transition-colors">
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                      </svg>
                                    </button>
                                  )}
                                  <button onClick={() => setModalLanc(l)}
                                    className="p-1.5 rounded-lg text-[#8E8E93] hover:bg-[rgba(116,116,128,0.08)] transition-colors">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                                    </svg>
                                  </button>
                                  <button onClick={() => setConfirmarDel(l.id)}
                                    className="p-1.5 rounded-lg text-[#8E8E93] hover:text-rose-500 hover:bg-rose-50 transition-colors">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })()
            ) : null}

            {/* ── Barra de edição em massa ── */}
            {selectedIds.size > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl"
                style={{ background: "#161421", minWidth: 480, maxWidth: "calc(100vw - 48px)" }}>
                {/* Contador */}
                <span className="text-[12px] font-bold text-white shrink-0 mr-1">
                  {selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}
                </span>
                <div className="w-px h-5 bg-white/20 shrink-0" />
                {/* Data */}
                <input type="date" value={bulkData} onChange={e => setBulkData(e.target.value)}
                  className="h-8 rounded-lg px-2.5 text-[11.5px] font-medium bg-white/10 text-white border border-white/15 focus:outline-none focus:border-[#8456e8] w-32 shrink-0"
                  title="Alterar data de vencimento" />
                {/* Categoria */}
                <select value={bulkCategoria} onChange={e => setBulkCategoria(e.target.value)}
                  className="h-8 rounded-lg px-2.5 text-[11.5px] font-medium bg-white/10 text-white border border-white/15 focus:outline-none focus:border-[#8456e8] max-w-[130px] shrink-0">
                  <option value="">Categoria…</option>
                  {[...(config?.categoriasReceita ?? DEFAULT_CATS_REC), ...(config?.categoriasDespesa ?? DEFAULT_CATS_DESP)].map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
                {/* Fornecedor */}
                <select value={bulkFornecedor} onChange={e => setBulkFornecedor(e.target.value)}
                  className="h-8 rounded-lg px-2.5 text-[11.5px] font-medium bg-white/10 text-white border border-white/15 focus:outline-none focus:border-[#8456e8] max-w-[130px] shrink-0">
                  <option value="">Fornecedor…</option>
                  {(config?.fornecedores ?? []).filter(f => f.ativo).map(f => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
                {/* Aplicar */}
                <button
                  disabled={!bulkData && !bulkCategoria && !bulkFornecedor}
                  onClick={() => {
                    const ids = Array.from(selectedIds)
                    ids.forEach(id => {
                      const updates: Partial<LancamentoFinanceiro> = {}
                      if (bulkData) updates.dataVencimento = bulkData
                      if (bulkCategoria) updates.categoria = bulkCategoria
                      if (bulkFornecedor) updates.fornecedorId = bulkFornecedor
                      onUpdate(id, updates)
                    })
                    setSelectedIds(new Set())
                    setBulkData(""); setBulkCategoria(""); setBulkFornecedor("")
                  }}
                  className="h-8 px-3 rounded-lg text-[11.5px] font-bold text-white bg-[#8456e8] hover:bg-[#6e3fd4] disabled:opacity-30 transition-colors shrink-0">
                  Aplicar
                </button>
                <div className="w-px h-5 bg-white/20 shrink-0" />
                {/* Copiar */}
                <button
                  onClick={() => {
                    const now = Date.now()
                    lancamentos.filter(l => selectedIds.has(l.id)).forEach((l, i) => {
                      onAdd({ ...l, id: `${now}-copy-${i}`, criadoEm: new Date().toLocaleString("pt-BR") })
                    })
                    setSelectedIds(new Set())
                  }}
                  className="h-8 px-3 rounded-lg text-[11.5px] font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-colors shrink-0 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                  </svg>
                  Copiar
                </button>
                {/* Fechar */}
                <button onClick={() => { setSelectedIds(new Set()); setBulkData(""); setBulkCategoria(""); setBulkFornecedor("") }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0 ml-auto">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </>
        )}
        {/* ── CONTAS ── */}
        {tab === "contas" && config && onUpdateConfig && (
          <ContasTab config={config} onUpdateConfig={cfg => { onUpdateConfig(cfg) }} />
        )}

        {/* ── FORNECEDORES ── */}
        {tab === "fornecedores" && config && onUpdateConfig && (
          <FornecedoresTab
            config={config}
            lancamentos={lancamentos}
            onUpdateConfig={cfg => { onUpdateConfig(cfg) }}
            onAddLancamento={onAdd}
            onDeleteLancamento={onDelete}
          />
        )}

        {/* ── FIXAS ── */}
        {tab === "fixas" && config && onUpdateConfig && (
          <FixasTab
            config={config}
            lancamentos={lancamentos}
            onUpdateConfig={cfg => { onUpdateConfig(cfg) }}
            onLancar={pre => {
              setModalLanc(pre as Partial<LancamentoFinanceiro>)
              setTab("lancamentos")
            }}
          />
        )}

        {/* ── CONFIG ── */}
        {tab === "config" && (
          <div className="space-y-6 max-w-3xl">
            <div>
              <p className="text-[13px] font-semibold text-[#191625]">Categorias financeiras</p>
              <p className="text-[11.5px] text-[#8E8E93] mt-0.5">
                Gerencie as categorias e subcategorias usadas nos lançamentos. Duplo clique no nome para renomear.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CategoriaSection
                titulo="Categorias de Receita"
                cor="green"
                categorias={catsRec}
                onChange={cats => config && onUpdateConfig?.({ ...config, categoriasReceita: cats })}
              />
              <CategoriaSection
                titulo="Categorias de Despesa"
                cor="rose"
                categorias={catsDesp}
                onChange={cats => config && onUpdateConfig?.({ ...config, categoriasDespesa: cats })}
              />
            </div>
          </div>
        )}

        {/* ── PIX ── */}
        {tab === "pix" && (
          <div className="max-w-xl space-y-6">

            {/* Pendentes */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#8E8E93] mb-3">
                Aguardando pagamento
              </p>
              {pixPendentes.length === 0 ? (
                <div className="text-center py-10 text-[13px] text-[#8E8E93]">
                  Nenhum link PIX pendente.
                </div>
              ) : (
                <div className="space-y-2">
                  {pixPendentes.map(p => (
                    <div key={p.id} className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] p-4 flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-[#8456e8]/10 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-[#8456e8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#191625] truncate">
                          {p.loteNumero ?? "—"} · {p.nomeCliente?.split(" ")[0]}
                        </p>
                        <p className="text-[11px] text-[#8E8E93]">
                          Vence {new Date(p.dataVencimento + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                        </p>
                      </div>
                      <p className="text-[15px] font-bold text-[#191625] tabular-nums shrink-0">{brl(p.valor)}</p>
                      <button
                        onClick={() => onUpdate(p.id, { status: "pago", dataPagamento: hoje() })}
                        className="shrink-0 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-white bg-[#009351] hover:bg-[#2fb350] transition-colors active:scale-95"
                      >
                        Recebido
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recebidos */}
            {pixRecebidos.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#8E8E93] mb-3">Recebidos</p>
                <div className="space-y-2">
                  {pixRecebidos.map(p => (
                    <div key={p.id} className="bg-[#F2F2F7] rounded-2xl p-4 flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-[#009351]/15 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-[#009351]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#191625] truncate">
                          {p.loteNumero ?? "—"} · {p.nomeCliente?.split(" ")[0]}
                        </p>
                        <p className="text-[11px] text-[#8E8E93]">
                          Recebido {p.dataPagamento ? new Date(p.dataPagamento + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—"}
                        </p>
                      </div>
                      <p className="text-[15px] font-bold text-[#009351] tabular-nums shrink-0">{brl(p.valor)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Histórico (expirados) */}
            {pixExpirados.length > 0 && (
              <div>
                <button
                  onClick={() => setShowPixHist(h => !h)}
                  className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[#8E8E93] hover:text-[#191625] transition-colors mb-3"
                >
                  <svg className={`w-3.5 h-3.5 transition-transform ${showPixHist ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  Histórico · {pixExpirados.length} expirado{pixExpirados.length > 1 ? "s" : ""}
                </button>
                {showPixHist && (
                  <div className="space-y-2">
                    {pixExpirados.map(p => (
                      <div key={p.id} className="bg-[#F2F2F7] rounded-2xl p-4 flex items-center gap-4 opacity-60">
                        <div className="w-8 h-8 rounded-full bg-[rgba(0,0,0,0.06)] flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-[#8E8E93]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-[#191625] truncate">
                            {p.loteNumero ?? "—"} · {p.nomeCliente?.split(" ")[0]}
                          </p>
                          <p className="text-[11px] text-[#8E8E93]">
                            Expirou {new Date(p.dataVencimento + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                          </p>
                        </div>
                        <p className="text-[15px] font-bold text-[#8E8E93] tabular-nums shrink-0">{brl(p.valor)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {modalLanc && (
        <ModalLancamento
          inicial={modalLanc === true ? {} : modalLanc}
          kanban={kanban}
          categoriasReceita={catsRec}
          categoriasDespesa={catsDesp}
          contas={config?.contas}
          fornecedores={config?.fornecedores}
          onSave={l => {
            if ((modalLanc as LancamentoFinanceiro).id) onUpdate((modalLanc as LancamentoFinanceiro).id!, l)
            else onAdd(l)
          }}
          onClose={() => setModalLanc(null)}
        />
      )}

      {modalPag && (
        <ModalPagamento
          lancamento={modalPag}
          onSave={updates => onUpdate(modalPag.id, updates)}
          onClose={() => setModalPag(null)}
        />
      )}

      {modalReceber && (
        <ModalReceberDetalhe
          itens={receberItens}
          total={kpis.aReceber}
          onClose={() => setModalReceber(false)}
          onVerTudo={() => { setModalReceber(false); setTab("receber") }}
          onClienteClick={onAbrirPerfil ? (nome) => { setModalReceber(false); onAbrirPerfil(nome) } : undefined}
        />
      )}

      {confirmarDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 p-6 text-center">
            <p className="font-bold text-[#191625] text-[14px] mb-1">Excluir lançamento?</p>
            <p className="text-[12px] text-[#8E8E93] mb-5">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmarDel(null)}
                className="flex-1 py-2.5 text-[12.5px] font-medium text-[#8E8E93] hover:bg-[rgba(116,116,128,0.04)] rounded-xl">
                Cancelar
              </button>
              <button onClick={() => { onDelete(confirmarDel); setConfirmarDel(null) }}
                className="flex-1 py-2.5 text-[12.5px] font-semibold text-white bg-rose-500 hover:bg-rose-600 rounded-xl">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, iconBg, iconColor, subColor, highlight, onClick }: {
  label: string; value: string; sub?: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  subColor?: string
  highlight?: boolean
  onClick?: () => void
}) {
  const Tag = onClick ? "button" : "div"
  return (
    <Tag onClick={onClick} className={`rounded-2xl px-5 py-4 text-left w-full transition-all duration-200 ${highlight ? "ring-2 ring-[rgba(132,86,232,0.18)]" : ""} ${onClick ? "hover:-translate-y-px hover:shadow-md cursor-pointer" : ""}`}
      style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: iconBg, color: iconColor }}>
          {icon}
        </div>
        <p className="text-[10.5px] uppercase tracking-wider font-semibold text-[#8E8E93] leading-tight">{label}</p>
      </div>
      <p className="text-[22px] font-bold tabular-nums text-[#1C1C1E] tracking-tight leading-none">{value}</p>
      {sub && (
        <p className="text-[11px] mt-1.5" style={{ color: subColor ?? "#8E8E93" }}>{sub}</p>
      )}
    </Tag>
  )
}

function DreRow({ label, value, bold, accent, separator }: {
  label: string; value: number; bold?: boolean; separator?: boolean
  accent?: "green" | "rose"
}) {
  const valCls = accent === "green" ? "text-emerald-700"
               : accent === "rose"  ? "text-rose-600"
               : value < 0          ? "text-rose-600"
               :                      "text-[#5e5c68]"
  return (
    <div className={`px-5 py-3 flex items-center justify-between ${separator ? "border-t border-[rgba(60,60,67,0.12)] bg-[rgba(116,116,128,0.04)]/50" : ""}`}>
      <span className={`text-[12.5px] ${bold ? "font-bold text-[#191625]" : "text-[#72707d]"}`}>{label}</span>
      <span className={`text-[13px] tabular-nums ${bold ? "font-semibold" : "font-semibold"} ${valCls}`}>
        {value < 0 ? `−${brl(Math.abs(value))}` : brl(value)}
      </span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] uppercase  text-[#8E8E93] font-semibold mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function CustoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] uppercase text-[#8E8E93] font-semibold mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-[13px] font-semibold text-[#8E8E93]">{msg}</p>
    </div>
  )
}

function inp() {
  return "w-full h-9 border border-[rgba(60,60,67,0.12)] rounded-lg px-3 text-[12.5px] text-[#5e5c68] bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtDate(iso: string) {
  if (!iso) return "—"
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
  } catch { return iso }
}

// ─── CategoriaSection ─────────────────────────────────────────────────────────

function CategoriaSection({
  titulo, cor, categorias, onChange,
}: {
  titulo: string
  cor: "green" | "rose"
  categorias: CategoriaFinanceira[]
  onChange: (cats: CategoriaFinanceira[]) => void
}) {
  const [expanded, setExpanded]   = useState<Set<string>>(new Set())
  const [newName, setNewName]     = useState("")
  const [newSubMap, setNewSubMap] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName]   = useState("")

  const dot = cor === "green" ? "#009351" : "#d33a3c"

  function toggleExpand(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function addCategoria() {
    const nome = newName.trim()
    if (!nome) return
    const id = nome.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || Date.now().toString()
    if (categorias.find(c => c.id === id)) return
    onChange([...categorias, { id, nome }])
    setNewName("")
  }

  function removeCategoria(id: string) {
    onChange(categorias.filter(c => c.id !== id))
  }

  function renameCategoria(id: string, nome: string) {
    if (!nome.trim()) return
    onChange(categorias.map(c => c.id === id ? { ...c, nome: nome.trim() } : c))
  }

  function addSub(catId: string) {
    const sub = newSubMap[catId]?.trim()
    if (!sub) return
    onChange(categorias.map(c => c.id === catId
      ? { ...c, subcategorias: [...(c.subcategorias ?? []), sub] }
      : c
    ))
    setNewSubMap(prev => ({ ...prev, [catId]: "" }))
  }

  function removeSub(catId: string, sub: string) {
    onChange(categorias.map(c => c.id === catId
      ? { ...c, subcategorias: (c.subcategorias ?? []).filter(s => s !== sub) }
      : c
    ))
  }

  return (
    <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[rgba(60,60,67,0.06)] flex items-center justify-between">
        <p className="font-bold text-[#191625] text-[13px]">{titulo}</p>
        <span className="text-[10px] text-[#8E8E93] font-medium">{categorias.length} categorias</span>
      </div>

      <div className="divide-y divide-[rgba(60,60,67,0.04)]">
        {categorias.map(cat => {
          const isExp  = expanded.has(cat.id)
          const isEdit = editingId === cat.id
          const hasSubs = (cat.subcategorias?.length ?? 0) > 0

          return (
            <div key={cat.id}>
              <div className="px-4 py-3 flex items-center gap-2.5 group hover:bg-[rgba(0,0,0,0.01)] transition-colors">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />

                {isEdit ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onBlur={() => { renameCategoria(cat.id, editName); setEditingId(null) }}
                    onKeyDown={e => {
                      if (e.key === "Enter") { renameCategoria(cat.id, editName); setEditingId(null) }
                      if (e.key === "Escape") setEditingId(null)
                    }}
                    className="flex-1 text-[12.5px] font-semibold text-[#191625] bg-transparent border-b border-violet-400 focus:outline-none py-0.5"
                  />
                ) : (
                  <span
                    className="flex-1 text-[12.5px] font-semibold text-[#191625] cursor-text select-none"
                    onDoubleClick={() => { setEditingId(cat.id); setEditName(cat.nome) }}
                  >
                    {cat.nome}
                    {hasSubs && (
                      <span className="ml-1.5 text-[10px] font-medium text-[#8E8E93]">
                        {cat.subcategorias!.length}
                      </span>
                    )}
                  </span>
                )}

                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => toggleExpand(cat.id)}
                    title={isExp ? "Fechar subcategorias" : "Ver subcategorias"}
                    className="p-1.5 rounded-lg text-[#8E8E93] hover:text-[#191625] hover:bg-[rgba(0,0,0,0.05)] transition-colors"
                  >
                    <svg className={`w-3.5 h-3.5 transition-transform ${isExp ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => { if (confirm(`Excluir "${cat.nome}"?`)) removeCategoria(cat.id) }}
                    className="p-1.5 rounded-lg text-[#8E8E93] hover:text-rose-500 hover:bg-rose-50 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {isExp && (
                <div className="px-5 pb-3 pt-2 ml-4 space-y-2 border-t border-[rgba(0,0,0,0.03)] bg-[rgba(0,0,0,0.01)]">
                  {hasSubs && (
                    <div className="flex flex-wrap gap-1.5">
                      {cat.subcategorias!.map(sub => (
                        <div key={sub} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-[rgba(60,60,67,0.1)] rounded-full group/sub">
                          <span className="text-[11px] text-[#5e5c68] font-medium">{sub}</span>
                          <button
                            onClick={() => removeSub(cat.id, sub)}
                            className="text-[#8E8E93] hover:text-rose-500 leading-none ml-0.5 transition-colors"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <input
                      value={newSubMap[cat.id] ?? ""}
                      onChange={e => setNewSubMap(prev => ({ ...prev, [cat.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === "Enter") addSub(cat.id) }}
                      placeholder="Nova subcategoria…"
                      className="flex-1 h-7 border border-[rgba(60,60,67,0.12)] rounded-lg px-2.5 text-[11.5px] text-[#5e5c68] bg-white focus:outline-none focus:border-violet-400"
                    />
                    <button
                      onClick={() => addSub(cat.id)}
                      disabled={!(newSubMap[cat.id] ?? "").trim()}
                      className="h-7 px-3 text-[11px] font-semibold text-white bg-[#161421] hover:bg-black rounded-lg transition-colors disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="px-4 py-3 border-t border-[rgba(60,60,67,0.06)] flex gap-2">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") addCategoria() }}
          placeholder="Nova categoria…"
          className="flex-1 h-8 border border-[rgba(60,60,67,0.12)] rounded-lg px-3 text-[12px] text-[#5e5c68] bg-white focus:outline-none focus:border-violet-400"
        />
        <button
          onClick={addCategoria}
          disabled={!newName.trim()}
          className="h-8 px-3 text-[12px] font-semibold text-white bg-[#161421] hover:bg-black rounded-lg transition-colors disabled:opacity-30 whitespace-nowrap"
        >
          + Adicionar
        </button>
      </div>
    </div>
  )
}
