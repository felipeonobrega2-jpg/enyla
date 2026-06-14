"use client"

import { useState, useMemo } from "react"
import {
  LancamentoFinanceiro, TipoLancamento, StatusLancamento,
  FormaPagamento, KanbanCard, COL_FECHADO, COL_EXPEDICAO, COL_PERDIDO, NegocioParceiro, Lote,
} from "../types"
import { brl } from "../utils"

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

const CATEGORIAS_DESP = [
  "Aluguel", "Fornecedor", "Materiais", "Salários",
  "Impostos", "Marketing", "Serviços", "Outros",
]

const hoje = () => new Date().toISOString().split("T")[0]

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

type ModalLancProps = {
  inicial?: Partial<LancamentoFinanceiro>
  kanban: KanbanCard[]
  onSave: (l: LancamentoFinanceiro) => void
  onClose: () => void
}

function ModalLancamento({ inicial, kanban, onSave, onClose }: ModalLancProps) {
  const [tipo, setTipo]               = useState<TipoLancamento>(inicial?.tipo ?? "receita")
  const [descricao, setDescricao]     = useState(inicial?.descricao ?? "")
  const [valor, setValor]             = useState(String(inicial?.valor ?? ""))
  const [dataVenc, setDataVenc]       = useState(inicial?.dataVencimento ?? hoje())
  const [dataPag, setDataPag]         = useState(inicial?.dataPagamento ?? "")
  const [status, setStatus]           = useState<StatusLancamento>(inicial?.status === "pago" ? "pago" : "pendente")
  const [cardId, setCardId]           = useState(inicial?.cardId ?? "")
  const [categoria, setCategoria]     = useState(inicial?.categoria ?? "")
  const [forma, setForma]             = useState<FormaPagamento | "">(inicial?.formaPagamento ?? "")
  const [obs, setObs]                 = useState(inicial?.obs ?? "")

  const cardSel = kanban.find(c => c.id === cardId)

  function handleCard(id: string) {
    setCardId(id)
    const c = kanban.find(x => x.id === id)
    if (c) {
      setValor(String(c.preco))
      const loteTag = c.loteNumero ? ` [${c.loteNumero}]` : ""
      setDescricao(`Pedido ${c.numero} — ${c.nomeCliente}${loteTag}`)
    }
  }

  function salvar() {
    const v = parseFloat(valor)
    if (!descricao.trim() || !v || !dataVenc) return
    onSave({
      id:             inicial?.id ?? Date.now().toString(),
      tipo,
      descricao:      descricao.trim(),
      valor:          v,
      dataVencimento: dataVenc,
      dataPagamento:  status === "pago" ? (dataPag || dataVenc) : undefined,
      status:         status === "pago" ? "pago" : "pendente",
      cardId:         cardId || undefined,
      cardNumero:     cardSel?.numero || inicial?.cardNumero,
      nomeCliente:    cardSel?.nomeCliente || inicial?.nomeCliente,
      loteId:         cardSel?.loteId || inicial?.loteId,
      loteNumero:     cardSel?.loteNumero || inicial?.loteNumero,
      categoria:      categoria || undefined,
      formaPagamento: forma || undefined,
      obs:            obs.trim() || undefined,
      criadoEm:       inicial?.criadoEm ?? new Date().toLocaleString("pt-BR"),
    })
    onClose()
  }

  const pedidosAbertos = kanban.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col overflow-hidden" style={{ maxHeight: "92vh" }}>
        <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] flex items-center justify-between shrink-0">
          <p className="font-bold text-[#1C1C1E] text-[15px]">
            {inicial?.id ? "Editar lançamento" : "Novo lançamento"}
          </p>
          <button onClick={onClose} className="text-[rgba(60,60,67,0.3)] hover:text-[#8E8E93] text-xl leading-none">×</button>
        </div>

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

          {/* Vincular a pedido (só receita) */}
          {tipo === "receita" && pedidosAbertos.length > 0 && (
            <Field label="Vincular a pedido (opcional)">
              <select value={cardId} onChange={e => handleCard(e.target.value)} className={inp()}>
                <option value="">— Nenhum —</option>
                {pedidosAbertos.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.numero} — {c.nomeCliente} — {brl(c.preco)}
                  </option>
                ))}
              </select>
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

          {tipo === "despesa" && (
            <Field label="Categoria">
              <select value={categoria} onChange={e => setCategoria(e.target.value)} className={inp()}>
                <option value="">Selecione…</option>
                {CATEGORIAS_DESP.map(c => <option key={c} value={c.toLowerCase()}>{c}</option>)}
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
            className="flex-1 py-2.5 text-[12.5px] font-semibold text-white bg-[#2C2C2E] hover:bg-[#1C1C1E] rounded-xl transition-colors disabled:opacity-40">
            {inicial?.id ? "Salvar" : "Lançar"}
          </button>
        </div>
      </div>
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
            <p className="font-bold text-[#1C1C1E] text-[14px]">Registrar pagamento</p>
            <p className="text-[11px] text-[#8E8E93] mt-0.5 truncate">{lancamento.descricao}</p>
          </div>
          <button onClick={onClose} className="text-[rgba(60,60,67,0.3)] hover:text-[#8E8E93] text-xl leading-none ml-3">×</button>
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

// ─── Período helpers ──────────────────────────────────────────────────────────

type Periodo = "mes" | "trimestre" | "semestre" | "ano" | "tudo"

function periodoRange(p: Periodo): { from: Date | null; to: Date | null } {
  const now = new Date()
  if (p === "tudo") return { from: null, to: null }
  if (p === "mes") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null }
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

const PERIODO_LABEL: Record<Periodo, string> = {
  mes: "Este mês", trimestre: "Este trimestre", semestre: "Este semestre", ano: "Este ano", tudo: "Tudo"
}

// ─── Main View ───────────────────────────────────────────────────────────────

export function FinanceiroView({
  lancamentos,
  kanban,
  negocios,
  lotes,
  onAdd,
  onUpdate,
  onDelete,
  onRegistrarSobra,
}: {
  lancamentos: LancamentoFinanceiro[]
  kanban: KanbanCard[]
  negocios: NegocioParceiro[]
  lotes?: Lote[]
  onAdd: (l: LancamentoFinanceiro) => void
  onUpdate: (id: string, updates: Partial<LancamentoFinanceiro>) => void
  onDelete: (id: string) => void
  onRegistrarSobra?: (card: KanbanCard) => void
}) {
  const [tab, setTab]                     = useState<"dash" | "receber" | "lancamentos">("dash")
  const [periodo, setPeriodo]             = useState<Periodo>("mes")
  const [modalLanc, setModalLanc]         = useState<Partial<LancamentoFinanceiro> | true | null>(null)
  const [modalPag, setModalPag]           = useState<LancamentoFinanceiro | null>(null)
  const [filtroTipo, setFiltroTipo]       = useState<TipoLancamento | "">("")
  const [filtroStatus, setFiltroStatus]   = useState<StatusLancamento | "">("")
  const [confirmarDel, setConfirmarDel]   = useState<string | null>(null)

  // Pedidos elegíveis (fechado, em produção, entregue — exceto perdido)
  const pedidosElegiveis = useMemo(() =>
    kanban.filter(c => c.coluna >= COL_FECHADO && c.coluna !== COL_PERDIDO),
    [kanban]
  )

  // Todos os pagamentos por loteId (exclui sobras) — suporta múltiplos parciais
  const pagamentosPorLote = useMemo(() => {
    const m: Record<string, LancamentoFinanceiro[]> = {}
    for (const l of lancamentos) {
      if (l.tipo === "receita" && l.loteId && l.categoria !== "sobra") {
        if (!m[l.loteId]) m[l.loteId] = []
        m[l.loteId].push(l)
      }
    }
    return m
  }, [lancamentos])

  // Todos os pagamentos por cardId (exclui sobras)
  const pagamentosPorCard = useMemo(() => {
    const m: Record<string, LancamentoFinanceiro[]> = {}
    for (const l of lancamentos) {
      if (l.tipo === "receita" && l.cardId && l.categoria !== "sobra") {
        if (!m[l.cardId]) m[l.cardId] = []
        m[l.cardId].push(l)
      }
    }
    return m
  }, [lancamentos])

  // Backward-compat: single entry maps (used in kpis / pending list)
  const lancPorLote = useMemo(() => {
    const m: Record<string, LancamentoFinanceiro> = {}
    for (const [lid, arr] of Object.entries(pagamentosPorLote)) m[lid] = arr[arr.length - 1]
    return m
  }, [pagamentosPorLote])

  const lancPorCard = useMemo(() => {
    const m: Record<string, LancamentoFinanceiro> = {}
    for (const [cid, arr] of Object.entries(pagamentosPorCard)) m[cid] = arr[arr.length - 1]
    return m
  }, [pagamentosPorCard])

  // Sobras por loteId (soma dos valores)
  const sobrasPorLote = useMemo(() => {
    const m: Record<string, LancamentoFinanceiro[]> = {}
    for (const l of lancamentos) {
      if (l.categoria === "sobra" && l.loteId) {
        if (!m[l.loteId]) m[l.loteId] = []
        m[l.loteId].push(l)
      }
    }
    return m
  }, [lancamentos])

  // Sobras por cardId (cards solo sem lote)
  const sobrasPorCard = useMemo(() => {
    const m: Record<string, LancamentoFinanceiro[]> = {}
    for (const l of lancamentos) {
      if (l.categoria === "sobra" && l.cardId && !l.loteId) {
        if (!m[l.cardId]) m[l.cardId] = []
        m[l.cardId].push(l)
      }
    }
    return m
  }, [lancamentos])

  // Filtrar por período
  const { from } = periodoRange(periodo)
  const inPeriodo = (l: LancamentoFinanceiro) => {
    if (!from) return true
    const ref = l.dataPagamento || l.dataVencimento
    return ref >= from.toISOString().split("T")[0]
  }

  const lancFiltrados = useMemo(() => lancamentos
    .filter(inPeriodo)
    .filter(l => !filtroTipo || l.tipo === filtroTipo)
    .filter(l => !filtroStatus || statusEfetivo(l) === filtroStatus),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lancamentos, periodo, filtroTipo, filtroStatus]
  )

  // Parcerias — comissão e ganho são AMBOS receita do usuário
  const negociosInPeriodo = (n: NegocioParceiro) => {
    if (!from) return true
    return (n.dataOrcamento || n.criadoEm) >= from.toISOString().split("T")[0]
  }

  // Negócios pagos no período selecionado (para KPIs e DRE)
  const negociosPagos     = negocios.filter(n => n.status === "pago" && negociosInPeriodo(n))
  // Todos os pagos (sem filtro de período — para mostrar no painel de parcerias)
  const negociosPagosTodos = negocios.filter(n => n.status === "pago")
  // Pendentes (qualquer tipo → a receber)
  const negociosPendentes  = negocios.filter(n => n.status === "pendente")

  // KPIs (período selecionado)
  const kpis = useMemo(() => {
    const all = lancamentos.filter(inPeriodo)
    const recebidas = all.filter(l => l.tipo === "receita" && l.status === "pago")
    const despesas  = all.filter(l => l.tipo === "despesa" && l.status === "pago")
    const pendentes = lancamentos.filter(l => l.tipo === "receita" && l.status !== "pago")
    const atrasados = pendentes.filter(l => l.dataVencimento < hoje())

    const totalParceiros = negociosPagos.reduce((s, n) => s + n.comissaoValor, 0)
    const totalRecebido  = recebidas.reduce((s, l) => s + l.valor, 0) + totalParceiros
    const totalDespesas  = despesas.reduce((s, l) => s + l.valor, 0)

    return {
      recebido:   totalRecebido,
      despesasPg: totalDespesas,
      aReceber:   pendentes.reduce((s, l) => s + l.valor, 0) + negociosPendentes.reduce((s, n) => s + n.comissaoValor, 0),
      emAtraso:   atrasados.reduce((s, l) => s + l.valor, 0),
      resultado:  totalRecebido - totalDespesas,
      naoRegistrados: pedidosElegiveis.filter(c =>
        c.loteId
          ? !(pagamentosPorLote[c.loteId]?.length)
          : !(pagamentosPorCard[c.id]?.length)
      ).length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentos, negocios, periodo, pedidosElegiveis, lancPorCard])

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
  }, [lancamentos, periodo])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-6 pb-0 shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[18px] font-semibold text-[#1C1C1E]">Financeiro</h1>
            <p className="text-[12px] text-[#8E8E93] mt-0.5">Receitas, despesas e fluxo de caixa</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)}
              className="h-8 border border-[rgba(60,60,67,0.12)] rounded-lg px-3 text-[12px] text-[rgba(60,60,67,0.6)] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              {(Object.entries(PERIODO_LABEL) as [Periodo, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <button onClick={() => setModalLanc(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#2C2C2E] hover:bg-[#1C1C1E] text-white text-[12.5px] font-semibold rounded-xl transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Novo lançamento
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[rgba(60,60,67,0.08)]">
          {([
            ["dash",       "Visão geral"],
            ["receber",    `A receber${kpis.naoRegistrados > 0 ? ` (${kpis.naoRegistrados})` : ""}`],
            ["lancamentos","Lançamentos"],
          ] as const).map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-[12.5px] font-semibold border-b-2 transition-colors -mb-px ${
                tab === t ? "border-slate-800 text-[#1C1C1E]" : "border-transparent text-[#8E8E93] hover:text-[rgba(60,60,67,0.6)]"
              }`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-5">

        {/* ── DASHBOARD ── */}
        {tab === "dash" && (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiCard label="Recebido" value={brl(kpis.recebido)} color="green"
                sub={PERIODO_LABEL[periodo].toLowerCase()} />
              <KpiCard label="Despesas pagas" value={brl(kpis.despesasPg)} color="rose"
                sub={PERIODO_LABEL[periodo].toLowerCase()} />
              <KpiCard label="Resultado" value={brl(kpis.resultado)}
                color={kpis.resultado >= 0 ? "blue" : "rose"}
                sub="receitas − despesas" />
              <KpiCard label="A receber" value={brl(kpis.aReceber)} color="amber"
                sub={`${lancamentos.filter(l => l.tipo === "receita" && l.status !== "pago").length} pendentes`} />
              <KpiCard label="Em atraso" value={brl(kpis.emAtraso)} color="rose"
                sub={`${lancamentos.filter(l => l.tipo === "receita" && statusEfetivo(l) === "atrasado").length} títulos`} />
            </div>

            {/* DRE simples */}
            <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[rgba(60,60,67,0.08)]">
                <p className="font-bold text-[#1C1C1E] text-[13px]">DRE — {PERIODO_LABEL[periodo]}</p>
              </div>
              <div className="divide-y divide-slate-50">
                <DreRow label="Receitas de pedidos" value={lancamentos.filter(l => l.tipo === "receita" && l.status === "pago" && inPeriodo(l)).reduce((s, l) => s + l.valor, 0)} bold accent="green" />
                {negociosPagos.length > 0 && (
                  <DreRow label="Receitas de parcerias" value={negociosPagos.reduce((s, n) => s + n.comissaoValor, 0)} accent="green" />
                )}
                {dreDesp.map(([cat, val]) => (
                  <DreRow key={cat} label={`Despesas — ${capitalize(cat)}`} value={-val} />
                ))}
                {dreDesp.length === 0 && (
                  <DreRow label="Despesas" value={0} />
                )}
                <DreRow label="Resultado líquido" value={kpis.resultado}
                  bold accent={kpis.resultado >= 0 ? "green" : "rose"} separator />
              </div>
            </div>

            {/* Parcerias recentes pagas — sempre visíveis independente do período */}
            {negociosPagosTodos.length > 0 && (
              <div className="bg-white border border-violet-100 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-violet-100 flex items-center justify-between">
                  <p className="font-bold text-[#1C1C1E] text-[13px]">Receitas de parcerias</p>
                  <p className="font-semibold text-[#AF52DE] text-[13px] tabular-nums">
                    {brl(negociosPagosTodos.reduce((s, n) => s + n.comissaoValor, 0))} total
                  </p>
                </div>
                <div className="divide-y divide-slate-50">
                  {negociosPagosTodos.slice(0, 5).map(n => (
                    <div key={n.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[12.5px] font-semibold text-[rgba(60,60,67,0.75)] truncate">{n.descricao}</p>
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[#AF52DE]/10 text-[#AF52DE] shrink-0">
                            {n.tipo === "comissao" ? "COMISSÃO" : "GANHO"}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#8E8E93] mt-0.5">{n.parceiroNome} · {fmtDate(n.dataOrcamento)}</p>
                      </div>
                      <p className="font-bold text-[#AF52DE] text-[13px] tabular-nums shrink-0">{brl(n.comissaoValor)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Próximos recebimentos — lançamentos pendentes + parcerias pendentes */}
            {(lancamentos.filter(l => l.tipo === "receita" && statusEfetivo(l) !== "pago").length > 0 || negociosPendentes.length > 0) && (
              <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[rgba(60,60,67,0.08)]">
                  <p className="font-bold text-[#1C1C1E] text-[13px]">Próximos recebimentos</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {/* Parcerias pendentes */}
                  {negociosPendentes.map(n => (
                    <div key={`neg-${n.id}`} className="px-5 py-3.5 flex items-center gap-3 hover:bg-[rgba(116,116,128,0.04)]">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[12.5px] font-semibold text-[rgba(60,60,67,0.75)] truncate">{n.descricao}</p>
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[#AF52DE]/10 text-[#AF52DE] shrink-0">PARCERIA</span>
                        </div>
                        <p className="text-[11px] text-[#8E8E93] mt-0.5">
                          {n.parceiroNome} · {fmtDate(n.dataOrcamento)}
                          {n.tipo === "comissao" ? " · Comissão" : " · Ganho"}
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700">
                        Pendente
                      </span>
                      <p className="font-bold text-[#1C1C1E] text-[13px] tabular-nums">{brl(n.comissaoValor)}</p>
                    </div>
                  ))}
                  {/* Lançamentos pendentes */}
                  {lancamentos
                    .filter(l => l.tipo === "receita" && statusEfetivo(l) !== "pago")
                    .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
                    .slice(0, 8)
                    .map(l => {
                      const st = statusEfetivo(l)
                      return (
                        <div key={l.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-[rgba(116,116,128,0.04)] group">
                          <div className="flex-1 min-w-0">
                            <p className="text-[12.5px] font-semibold text-[rgba(60,60,67,0.75)] truncate">{l.descricao}</p>
                            <p className="text-[11px] text-[#8E8E93] mt-0.5">
                              Vence {fmtDate(l.dataVencimento)}
                              {l.nomeCliente && ` · ${l.nomeCliente}`}
                            </p>
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_CLS[st]}`}>
                            {STATUS_LABEL[st]}
                          </span>
                          <p className="font-bold text-[#1C1C1E] text-[13px] tabular-nums">{brl(l.valor)}</p>
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

        {/* ── A RECEBER ── */}
        {tab === "receber" && (
          <div className="space-y-2">
            <p className="text-[11.5px] text-[#8E8E93] mb-4">
              Pedidos fechados ou em produção, e ganhos de parcerias pendentes.
            </p>

            {/* Parcerias pendentes (comissão ou ganho — ambos são receita) */}
            {negociosPendentes.length > 0 && (
              <div className="mb-4">
                <p className="text-[10.5px] uppercase tracking-wider text-[#8E8E93] font-semibold mb-2">Receitas de parcerias</p>
                {negociosPendentes.map(n => (
                  <div key={n.id} className="bg-white border border-violet-100 rounded-2xl px-5 py-4 flex items-center gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[#1C1C1E] text-[13px]">{n.descricao}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-[#AF52DE] border border-violet-200">
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
                    <p className="font-semibold text-[#AF52DE] text-[15px] tabular-nums shrink-0">{brl(n.comissaoValor)}</p>
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
              // Group by lote (cards with same loteId → one row)
              const loteGroups: Record<string, KanbanCard[]> = {}
              const solos: KanbanCard[] = []
              for (const card of pedidosElegiveis) {
                if (card.loteId) {
                  if (!loteGroups[card.loteId]) loteGroups[card.loteId] = []
                  loteGroups[card.loteId].push(card)
                } else {
                  solos.push(card)
                }
              }
              const loteEntries = Object.entries(loteGroups)

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
                              <span className="font-semibold text-[#1C1C1E] text-[14px] leading-tight">{loteInfo?.nomeCliente ?? cards[0].nomeCliente}</span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#AF52DE]/10 text-[#AF52DE] shrink-0">{loteNum}</span>
                              {completo && (
                                <svg className="w-3.5 h-3.5 text-[#34C759] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              )}
                            </div>
                            <p className="text-[11px] text-[#8E8E93] mt-0.5">
                              {cards.length} produto{cards.length > 1 ? "s" : ""}
                              {pagamentosLote.length > 0 && !completo && ` · ${brl(totalPago)} recebido`}
                              {sobrasLote.length > 0 && ` · +${brl(totalSobras)} sobras`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-semibold text-[#1C1C1E] text-[15px] tabular-nums">{brl(total)}</span>
                            {onRegistrarSobra && podeSobra && (
                              <button onClick={() => onRegistrarSobra(cards[0])}
                                className="h-7 px-2.5 text-[11px] font-medium text-[#FF9500] bg-[#FF9500]/[0.08] hover:bg-[#FF9500]/[0.14] rounded-lg transition-colors shrink-0">
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
                                className="h-7 px-3 text-[11px] font-semibold text-white bg-[#34C759] hover:bg-[#2DB84D] rounded-lg transition-colors shrink-0">
                                Receber
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Progress bar — only when payments exist */}
                        {pagamentosLote.length > 0 && (
                          <div className="h-0.5 bg-[rgba(60,60,67,0.06)] mx-5 rounded-full overflow-hidden mb-1">
                            <div className="h-full rounded-full bg-[#34C759] transition-all"
                              style={{ width: `${pagoPct}%` }} />
                          </div>
                        )}
                        {/* Rows */}
                        <div className="border-t border-[rgba(60,60,67,0.05)] divide-y divide-[rgba(60,60,67,0.04)]">
                          {cards.map(card => (
                            <div key={card.id} className="px-5 py-2.5 flex items-center gap-3">
                              <span className="text-[9.5px] font-bold text-[#007AFF] bg-[#007AFF]/[0.08] px-1.5 py-0.5 rounded-md shrink-0">{card.numero}</span>
                              <p className="flex-1 text-[12px] text-[rgba(60,60,67,0.55)] truncate">{card.dimensoes}{card.materialNome ? ` · ${card.materialNome}` : ""}</p>
                              <p className="text-[12px] font-medium text-[rgba(60,60,67,0.75)] tabular-nums">{brl(card.preco)}</p>
                            </div>
                          ))}
                          {sobrasLote.map(s => (
                            <div key={s.id} className="px-5 py-2.5 flex items-center gap-3">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#FF9500] shrink-0 ml-0.5" />
                              <p className="flex-1 text-[12px] text-[rgba(60,60,67,0.5)] truncate">{s.descricao}</p>
                              <p className="text-[12px] font-medium text-[#FF9500] tabular-nums">+{brl(s.valor)}</p>
                            </div>
                          ))}
                          {pagamentosLote.map(p => (
                            <div key={p.id} className="px-5 py-2.5 flex items-center gap-3">
                              {p.status === "pago" ? (
                                <svg className="w-3.5 h-3.5 text-[#34C759] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
                              <p className={`text-[12px] font-semibold tabular-nums ${p.status === "pago" ? "text-[#34C759]" : "text-amber-600"}`}>{brl(p.valor)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  {/* Solo cards */}
                  {solos.sort((a, b) => b.preco - a.preco).map(card => {
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
                              <span className="font-semibold text-[#1C1C1E] text-[14px] leading-tight">{card.nomeCliente}</span>
                              <span className="text-[9.5px] font-bold text-[#007AFF] bg-[#007AFF]/[0.08] px-1.5 py-0.5 rounded-md shrink-0">{card.numero}</span>
                              {completoCard && (
                                <svg className="w-3.5 h-3.5 text-[#34C759] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              )}
                            </div>
                            <p className="text-[11px] text-[#8E8E93] mt-0.5">
                              {[card.dimensoes, card.materialNome].filter(Boolean).join(" · ")}
                              {pagamentosCard.length > 0 && !completoCard && ` · ${brl(totalPagoCard)} recebido`}
                              {sobrasCard.length > 0 && ` · +${brl(totalSobrasCard)} sobras`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-semibold text-[#1C1C1E] text-[15px] tabular-nums">{brl(totalCard)}</span>
                            {onRegistrarSobra && card.coluna >= COL_EXPEDICAO && card.coluna !== COL_PERDIDO && (
                              <button onClick={() => onRegistrarSobra(card)}
                                className="h-7 px-2.5 text-[11px] font-medium text-[#FF9500] bg-[#FF9500]/[0.08] hover:bg-[#FF9500]/[0.14] rounded-lg transition-colors shrink-0">
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
                                className="h-7 px-3 text-[11px] font-semibold text-white bg-[#34C759] hover:bg-[#2DB84D] rounded-lg transition-colors shrink-0">
                                Receber
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Progress bar — only when payments exist */}
                        {pagamentosCard.length > 0 && (
                          <div className="h-0.5 bg-[rgba(60,60,67,0.06)] mx-5 rounded-full overflow-hidden mb-1">
                            <div className="h-full rounded-full bg-[#34C759] transition-all"
                              style={{ width: `${pagoPctCard}%` }} />
                          </div>
                        )}
                        {/* Rows */}
                        {(sobrasCard.length > 0 || pagamentosCard.length > 0) && (
                          <div className="border-t border-[rgba(60,60,67,0.05)] divide-y divide-[rgba(60,60,67,0.04)]">
                            {sobrasCard.map(s => (
                              <div key={s.id} className="px-5 py-2.5 flex items-center gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#FF9500] shrink-0 ml-0.5" />
                                <p className="flex-1 text-[12px] text-[rgba(60,60,67,0.5)] truncate">{s.descricao}</p>
                                <p className="text-[12px] font-medium text-[#FF9500] tabular-nums">+{brl(s.valor)}</p>
                              </div>
                            ))}
                            {pagamentosCard.map(p => (
                              <div key={p.id} className="px-5 py-2.5 flex items-center gap-3">
                                {p.status === "pago" ? (
                                  <svg className="w-3.5 h-3.5 text-[#34C759] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
                                <p className={`text-[12px] font-semibold tabular-nums ${p.status === "pago" ? "text-[#34C759]" : "text-amber-600"}`}>{brl(p.valor)}</p>
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
          </div>
        )}

        {/* ── LANÇAMENTOS ── */}
        {tab === "lancamentos" && (
          <>
            <div className="flex gap-2 mb-4 flex-wrap">
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as TipoLancamento | "")}
                className="h-8 border border-[rgba(60,60,67,0.12)] rounded-lg px-3 text-[12px] text-[rgba(60,60,67,0.6)] bg-white focus:outline-none">
                <option value="">Todos os tipos</option>
                <option value="receita">Receitas</option>
                <option value="despesa">Despesas</option>
              </select>
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as StatusLancamento | "")}
                className="h-8 border border-[rgba(60,60,67,0.12)] rounded-lg px-3 text-[12px] text-[rgba(60,60,67,0.6)] bg-white focus:outline-none">
                <option value="">Todos os status</option>
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
                <option value="atrasado">Em atraso</option>
              </select>
            </div>

            {/* Negócios de parcerias — sempre visíveis (sem filtro de período) */}
            {negocios.filter(n => n.status !== "cancelado" && (!filtroTipo || filtroTipo === "receita") && (!filtroStatus || filtroStatus === (n.status === "pago" ? "pago" : "pendente"))).map(n => (
              <div key={`neg-${n.id}`}
                className="bg-white border border-violet-100 rounded-2xl px-5 py-4 flex items-center gap-3 hover:border-violet-200 transition-colors">
                <div className="w-1.5 h-10 rounded-full shrink-0 bg-violet-400" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[#1C1C1E] text-[13px]">{n.descricao}</span>
                    <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[#AF52DE]/10 text-[#AF52DE]">PARCERIA</span>
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
                <p className="font-semibold text-[14px] tabular-nums shrink-0 text-[#AF52DE]">{brl(n.comissaoValor)}</p>
              </div>
            ))}

            {lancFiltrados.length === 0 && negocios.filter(n => n.status !== "cancelado").length === 0 ? (
              <Empty msg="Nenhum lançamento no período selecionado." />
            ) : lancFiltrados.length > 0 ? (
              <div className="space-y-2">
                {lancFiltrados.map(l => {
                  const st = statusEfetivo(l)
                  return (
                    <div key={l.id}
                      className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl px-5 py-4 flex items-center gap-3 hover:border-[rgba(60,60,67,0.12)] transition-colors group">
                      {/* Tipo indicator */}
                      <div className={`w-1.5 h-10 rounded-full shrink-0 ${l.tipo === "receita" ? "bg-emerald-400" : "bg-rose-400"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[#1C1C1E] text-[13px]">{l.descricao}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_CLS[st]}`}>
                            {STATUS_LABEL[st]}
                          </span>
                          {l.categoria && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(116,116,128,0.08)] text-[#8E8E93] font-medium">
                              {capitalize(l.categoria)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-[11px] text-[#8E8E93]">
                            {l.status === "pago" && l.dataPagamento
                              ? `Pago em ${fmtDate(l.dataPagamento)}`
                              : `Vence ${fmtDate(l.dataVencimento)}`}
                          </span>
                          {l.formaPagamento && (
                            <span className="text-[11px] text-[#8E8E93]">
                              {FORMAS.find(f => f.value === l.formaPagamento)?.label}
                            </span>
                          )}
                          {l.nomeCliente && (
                            <span className="text-[11px] text-[#8E8E93]">{l.nomeCliente}</span>
                          )}
                        </div>
                      </div>
                      <p className={`font-semibold text-[14px] tabular-nums shrink-0 ${
                        l.tipo === "receita" ? "text-emerald-700" : "text-rose-600"
                      }`}>
                        {l.tipo === "despesa" ? "−" : ""}{brl(l.valor)}
                      </p>
                      {/* Actions */}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {l.tipo === "receita" && st !== "pago" && (
                          <button onClick={() => setModalPag(l)}
                            className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 transition-colors" title="Registrar pagamento">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                          </button>
                        )}
                        <button onClick={() => setModalLanc(l)}
                          className="p-1.5 rounded-lg text-[#8E8E93] hover:text-[rgba(60,60,67,0.75)] hover:bg-[rgba(116,116,128,0.08)] transition-colors">
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
            ) : null}
          </>
        )}
      </div>

      {/* Modals */}
      {modalLanc && (
        <ModalLancamento
          inicial={modalLanc === true ? {} : modalLanc}
          kanban={kanban}
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

      {confirmarDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 p-6 text-center">
            <p className="font-bold text-[#1C1C1E] text-[14px] mb-1">Excluir lançamento?</p>
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

function KpiCard({ label, value, sub, color }: {
  label: string; value: string; sub: string
  color: "green" | "rose" | "blue" | "amber"
}) {
  const cls = color === "green"  ? "text-emerald-700"
            : color === "rose"   ? "text-rose-600"
            : color === "amber"  ? "text-amber-600"
            :                      "text-blue-700"
  return (
    <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">{label}</p>
      <p className={`font-semibold text-[17px] tabular-nums mt-0.5 ${cls}`}>{value}</p>
      <p className="text-[10.5px] text-[#8E8E93] mt-0.5">{sub}</p>
    </div>
  )
}

function DreRow({ label, value, bold, accent, separator }: {
  label: string; value: number; bold?: boolean; separator?: boolean
  accent?: "green" | "rose"
}) {
  const valCls = accent === "green" ? "text-emerald-700"
               : accent === "rose"  ? "text-rose-600"
               : value < 0          ? "text-rose-600"
               :                      "text-[rgba(60,60,67,0.75)]"
  return (
    <div className={`px-5 py-3 flex items-center justify-between ${separator ? "border-t border-[rgba(60,60,67,0.12)] bg-[rgba(116,116,128,0.04)]/50" : ""}`}>
      <span className={`text-[12.5px] ${bold ? "font-bold text-[#1C1C1E]" : "text-[rgba(60,60,67,0.6)]"}`}>{label}</span>
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

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-[13px] font-semibold text-[#8E8E93]">{msg}</p>
    </div>
  )
}

function inp() {
  return "w-full h-9 border border-[rgba(60,60,67,0.12)] rounded-lg px-3 text-[12.5px] text-[rgba(60,60,67,0.75)] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
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
