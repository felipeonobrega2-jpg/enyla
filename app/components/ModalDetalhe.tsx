"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import {
  Palette, Scissors, Package, Paperclip, FileText, Factory, User, Home, Building2, Megaphone, Wrench, ClipboardList,
  Printer, Star, Square, MessageCircle, Link2, X, ChevronRight, ChevronDown, LayoutGrid, DollarSign, CalendarDays,
  CircleCheck, Truck, Check, Download, Upload, Send, Zap, FileOutput, ExternalLink, Boxes, Camera,
} from "lucide-react"
import type { FormData, Calculo, PropostaCustom, KanbanCard, LancamentoFinanceiro, PedidoArquivo, ProjecaoCustos, PrazoEtapas } from "../types"
import { COLUNAS_KANBAN, COL_FECHADO, COL_EXPEDICAO, COL_PERDIDO, COL_HOT } from "../types"
import type { Pedido } from "../lib/negocio"
import { brl, num } from "../utils"
import { enviarFotoProducao } from "../lib/imagem"
import { Botao, Selo, Tom } from "./ds"

const CORES_RAPIDAS = ["4x0", "4x4", "2x0", "1x0", "1x1"]
const ACABAMENTOS_OPCOES = ["Verniz UV", "Laminação fosca", "Laminação brilho", "Hot stamp", "Relevo seco", "Corte e vinco"]
const TIPO_ARQUIVO_ICON: Record<string, React.ElementType> = { arte: Palette, faca: Scissors, mockup: Package, referencia: Paperclip, foto: Camera, outro: FileText }
const TIPO_LABEL = { arte: "Arte", faca: "Faca", mockup: "Mockup", referencia: "Ref.", foto: "Foto da produção (cliente vê)", outro: "Outro" } as const
const FORMA_PAG: Record<string, string> = { pix: "Pix", boleto: "Boleto", cartao_credito: "Crédito", cartao_debito: "Débito", dinheiro: "Dinheiro", transferencia: "Transf.", outro: "Outro" }
const CAT_ICONE: Record<string, React.ElementType> = { fornecedor: Factory, materiais: Package, salarios: User, aluguel: Home, impostos: Building2, marketing: Megaphone, servicos: Wrench, outros: ClipboardList }

const ETAPAS_PRAZO: { key: keyof PrazoEtapas; label: string }[] = [
  { key: "pedido_enviado", label: "Enviado à gráfica" },
  { key: "inicio_arte", label: "Início arte" },
  { key: "arte_enviada", label: "Arte p/ aprovação" },
  { key: "arte_aprovada", label: "Arte aprovada" },
  { key: "inicio_impressao", label: "Início impressão" },
  { key: "fim_impressao", label: "Fim impressão" },
  { key: "inicio_verniz", label: "Início verniz" },
  { key: "fim_verniz", label: "Fim verniz" },
  { key: "inicio_acabamento", label: "Início acabamento" },
  { key: "fim_acabamento", label: "Fim acabamento" },
  { key: "expedicao", label: "Expedição" },
]

const ITENS_PROJECAO: { key: keyof ProjecaoCustos; label: string; Icon: React.ElementType }[] = [
  { key: "papel", label: "Papel / material", Icon: FileText },
  { key: "impressao", label: "Impressão", Icon: Printer },
  { key: "corte", label: "Corte", Icon: Scissors },
  { key: "verniz", label: "Verniz", Icon: Star },
  { key: "colagem", label: "Colagem", Icon: Wrench },
  { key: "arte", label: "Arte / design", Icon: Palette },
  { key: "faca", label: "Faca", Icon: Scissors },
  { key: "hotstamping", label: "Hot stamping", Icon: Star },
  { key: "corteVinco", label: "Corte e vinco", Icon: Square },
  { key: "outros", label: "Outros", Icon: Package },
]

const dataCurta = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
const inputData = "bg-transparent border-0 outline-none p-0 text-[13px] font-semibold ds-num cursor-pointer"
const inputCls = "h-9 rounded-lg px-2.5 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] transition-colors ds-borda"

type HistItem = { form: FormData; calculo: Calculo; data: string; numero?: string }
type Etapa = { coluna: number; nome: string; dataHora: string; tipo?: string; detalhe?: string }

export type DetalheData =
  | { tipo: "historico"; item: HistItem;         card?: KanbanCard }
  | { tipo: "proposta";  proposta: PropostaCustom; card?: KanbanCard }
  | { tipo: "kanban";    card: KanbanCard }

// ── Peças ─────────────────────────────────────────────────────────────────────

function Pilula({ children, tom }: { children: React.ReactNode; tom?: "perigo" }) {
  return (
    <span className={`text-[12px] font-medium px-2.5 py-1 rounded-full ${tom ? "text-[#d33a3c] bg-[#d33a3c]/[0.08]" : "text-[#5e5c68] bg-[rgba(116,116,128,0.08)]"}`}>{children}</span>
  )
}

// Linha de campo: ícone + rótulo (110px) + valor
function Campo({ icone, rotulo, children }: { icone: React.ReactNode; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 py-2.5 border-b border-[rgba(60,60,67,0.06)] min-w-0">
      <span className="w-[110px] shrink-0 flex items-center gap-1.5 text-[12px] text-[#898892] [&_svg]:w-3.5 [&_svg]:h-3.5 [&_svg]:text-[#c7c7cc]">{icone}{rotulo}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function MiniKpi({ rotulo, valor, sub, cor = "#191625" }: { rotulo: string; valor: string; sub?: string; cor?: string }) {
  return (
    <div className="rounded-xl px-3.5 py-2.5 bg-[rgba(116,116,128,0.05)] min-w-0">
      <p className="text-[11px] text-[#898892] font-medium">{rotulo}</p>
      <p className="text-[16px] font-semibold ds-num mt-0.5 truncate" style={{ color: cor }}>{valor}</p>
      {sub && <p className="text-[11px] text-[#898892] ds-num truncate">{sub}</p>}
    </div>
  )
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="text-[11.5px] font-semibold text-[#898892] mb-1.5">{children}</p>
}

function LinhaHistorico({ e }: { e: Etapa }) {
  return (
    <div className="py-2 border-b border-[rgba(60,60,67,0.06)] last:border-0">
      <p className="text-[12px] text-[#3f3d4a] leading-relaxed">
        {e.tipo === "criacao" ? "Orçamento criado"
          : e.tipo === "preco" ? <><b className="font-semibold">Valor</b> {e.detalhe ? `→ ${e.detalhe}` : "atualizado"}</>
          : e.tipo === "observacao" ? <span className="text-[#5b21b6] flex items-start gap-1.5"><MessageCircle className="w-3 h-3 mt-0.5 shrink-0" />{e.detalhe}</span>
          : e.tipo === "aprovacao" ? <><b className="font-semibold">Aprovado pelo cliente</b>{e.detalhe ? ` · ${e.detalhe}` : ""}</>
          : <b className="font-semibold">{e.nome}</b>}
      </p>
      <p className="text-[10.5px] text-[#b5b9c0] ds-num mt-0.5">{e.dataHora}</p>
    </div>
  )
}

function Historico({ etapas, obs, setObs, onEnviar, salvando, titulo }: {
  etapas: Etapa[] | null; obs: string; setObs: (s: string) => void; onEnviar: () => void; salvando: boolean; titulo: string
}) {
  return (
    <div className="w-[270px] shrink-0 border-l border-[rgba(60,60,67,0.08)] bg-[#fbfbfc] flex flex-col min-h-0 max-lg:hidden">
      <p className="px-4 pt-4 pb-2.5 text-[13px] font-semibold text-[#191625] border-b border-[rgba(60,60,67,0.08)]">{titulo}</p>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
        {etapas === null ? <p className="text-[12px] text-[#898892] py-2">Carregando…</p>
          : etapas.length === 0 ? <p className="text-[12px] text-[#898892] py-2">Sem histórico registrado.</p>
          : [...etapas].reverse().map((e, i) => <LinhaHistorico key={i} e={e} />)}
      </div>
      <div className="border-t border-[rgba(60,60,67,0.08)] p-3 flex items-center gap-2">
        <input placeholder="Anotação…" value={obs} onChange={e => setObs(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEnviar() } }}
          className={`${inputCls} flex-1 min-w-0`} />
        <button onClick={onEnviar} disabled={salvando || !obs.trim()} aria-label="Adicionar anotação"
          className="w-9 h-9 shrink-0 rounded-lg bg-[#8456e8] text-white grid place-items-center disabled:opacity-40 transition-opacity">
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// Tabela de quantidades (orçamento calculado, proposta ou opções do card)
function TabelaQuantidades({ linhas, comParcela }: {
  linhas: { quantidade: number; unitario: number; total: number; parcela?: number; selo?: { texto: string; tom: Tom } }[]
  comParcela: boolean
}) {
  const grade = comParcela ? "grid-cols-[1.1fr_1fr_1fr_1fr]" : "grid-cols-[1.1fr_1fr_1fr]"
  return (
    <div>
      <div className={`grid ${grade} gap-2 px-3 py-1.5 text-[11px] font-medium text-[#898892]`}>
        <span>Quantidade</span><span className="text-right">Unitário</span><span className="text-right">Total</span>{comParcela && <span className="text-right">12×</span>}
      </div>
      <div className="space-y-1.5">
        {linhas.map((l, i) => (
          <div key={i} className={`grid ${grade} gap-2 items-center px-3 py-2.5 rounded-xl ${l.selo ? "bg-[#009351]/[0.04] ring-1 ring-[#009351]/15" : "bg-[rgba(116,116,128,0.04)]"}`}>
            <span className="flex items-center gap-2 text-[14px] font-semibold text-[#191625] ds-num">
              {num(l.quantidade)} <span className="text-[11px] font-normal text-[#898892]">un</span>
              {l.selo && <Selo tom={l.selo.tom}>{l.selo.texto}</Selo>}
            </span>
            <span className="text-right text-[13px] text-[#5e5c68] ds-num">{l.unitario > 0 ? brl(l.unitario) : "—"}</span>
            <span className="text-right text-[14px] font-semibold text-[#8456e8] ds-num">{brl(l.total)}</span>
            {comParcela && <span className="text-right text-[12px] text-[#898892] ds-num">{l.parcela != null ? `${brl(l.parcela)}/mês` : "—"}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// Seção recolhível (fora do modal para os campos não perderem o foco a cada tecla)
function Secao({ chave, aberta, onAlternar, titulo, selo, acao, children }: {
  chave: string; aberta: boolean; onAlternar: (k: string) => void; titulo: string; selo?: string; acao?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="border-b border-[rgba(60,60,67,0.06)]">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => onAlternar(chave)} className="flex-1 flex items-center gap-2 py-3 text-left">
          <ChevronRight className={`w-3.5 h-3.5 text-[#898892] transition-transform duration-200 ${aberta ? "rotate-90" : ""}`} />
          <span className={`text-[13.5px] font-semibold ${aberta ? "text-[#191625]" : "text-[#5e5c68]"}`}>{titulo}</span>
          {selo && <span className="text-[11px] font-medium text-[#898892] bg-[rgba(116,116,128,0.08)] rounded-full px-2 py-0.5 ds-num">{selo}</span>}
        </button>
        {acao}
      </div>
      {aberta && <div className="pb-4 animate-[apple-slide-up_.2s_ease-out]">{children}</div>}
    </div>
  )
}

// Botão que copia um link e confirma
function BotaoCopiar({ rotulo, icone, obterUrl, variante = "secundario", titulo }: {
  rotulo: string; icone: React.ReactNode; obterUrl: () => Promise<string | null> | string | null; variante?: "primario" | "secundario"; titulo?: string
}) {
  const [ok, setOk] = useState(false)
  return (
    <Botao variante={variante} title={titulo} icone={ok ? <Check className="w-3.5 h-3.5" /> : icone}
      className={ok ? "!text-[#009351]" : ""}
      onClick={async () => {
        const url = await obterUrl()
        if (url) navigator.clipboard.writeText(url).then(() => { setOk(true); setTimeout(() => setOk(false), 1800) })
      }}>
      {ok ? "Copiado" : rotulo}
    </Botao>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function ModalDetalhe({
  data, parcFator, onClose, onEditar, onEditarHistorico, onPersonalizarHistorico,
  onSaveDelivery, onSaveDeliveryReal, onSaveCloseDate,
  onRegistrarSobra, onSaveFornecedor, onEmitirOS, onSaveCardExtras, onSaveProjecao, onSavePrazos, onMoveEtapa, onSavePreco, lancamentos, pedido,
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
  pedido?: Pedido   // pedido completo (lote inteiro) da camada canônica
}) {
  const isH = data.tipo === "historico"
  const isP = data.tipo === "proposta"
  const isK = data.tipo === "kanban"
  const card = data.card

  // ── Estado editável ─────────────────────────────────────────────────────────
  const [closeDate, setCloseDate] = useState(card?.dataFechamento ?? "")
  const [deliveryDate, setDeliveryDate] = useState(card?.dataEntregaPrevista ?? "")
  const [deliveryRealDate, setDeliveryRealDate] = useState(card?.dataEntregaReal ?? "")
  const [fornecedor, setFornecedor] = useState(card?.fornecedor ?? "")
  const [custoTerceiro, setCustoTerceiro] = useState(card?.custoTerceiro?.toString() ?? "")
  const [coluna, setColuna] = useState(card?.coluna ?? 0)
  const [saving, setSaving] = useState(false)
  const [abertas, setAbertas] = useState<Set<string>>(new Set(["financeiro", "opcoes", "prazos"]))
  const [arquivos, setArquivos] = useState<PedidoArquivo[]>([])
  const [uploading, setUploading] = useState(false)
  const [cores, setCores] = useState(card?.cores ?? "")
  const [acabamentos, setAcabamentos] = useState<string[]>(card?.acabamentos ?? [])
  const [obsOS, setObsOS] = useState(card?.observacoesOS ?? "")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fotoInputRef = useRef<HTMLInputElement>(null)
  const [etapasLog, setEtapasLog] = useState<Etapa[] | null>(null)
  const [obsInput, setObsInput] = useState("")
  const [savingObs, setSavingObs] = useState(false)
  const [editingPreco, setEditingPreco] = useState(false)
  const [precoInput, setPrecoInput] = useState((card?.preco ?? 0).toFixed(2))
  const [prazos, setPrazos] = useState<PrazoEtapas>(card?.prazos ?? {})
  const [proj, setProj] = useState<ProjecaoCustos>(card?.projecaoCustos ?? {})
  const [savingProj, setSavingProj] = useState(false)

  const alternar = (k: string) => setAbertas(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })

  function setPrazoEtapa(key: keyof PrazoEtapas, value: string) {
    const next = { ...prazos }
    if (value) next[key] = value
    else delete next[key]
    setPrazos(next)
    if (card) onSavePrazos?.(card.id, next)
  }

  const projTotal = ITENS_PROJECAO.reduce((s, i) => s + ((proj[i.key] as number | undefined) ?? 0), 0)
  const projMargem = isK && card && card.preco > 0 && projTotal > 0 ? ((card.preco - projTotal) / card.preco) * 100 : null
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

  // ── Histórico (rastreio) ─────────────────────────────────────────────────────
  const trackingNumero = card?.numero ?? (isH ? data.item.numero : undefined)
  const fetchHistorico = useCallback(async () => {
    if (!trackingNumero) { setEtapasLog([]); return }
    try {
      const res = await fetch(`/api/track/${encodeURIComponent(trackingNumero)}`)
      setEtapasLog(res.ok ? (await res.json()).etapas ?? [] : [])
    } catch { setEtapasLog([]) }
  }, [trackingNumero])

  async function addObservacao() {
    const text = obsInput.trim()
    if (!text || !trackingNumero) return
    setSavingObs(true)
    const now = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    const novasEtapas = [...(etapasLog ?? []), { coluna: card?.coluna ?? 0, nome: "Observação", tipo: "observacao", detalhe: text, dataHora: now }]
    setEtapasLog(novasEtapas)
    setObsInput("")
    await fetch(`/api/track/${encodeURIComponent(trackingNumero)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nomeCliente: card?.nomeCliente ?? "", descricao: card?.dimensoes ?? "", materialNome: card?.materialNome ?? "",
        quantidade: card?.quantidade ?? 0, preco: card?.preco ?? 0, colunaAtual: card?.coluna ?? 0, etapas: novasEtapas, criadoEm: card?.data ?? "",
      }),
    }).catch(() => {})
    setSavingObs(false)
  }

  // ── Arquivos ─────────────────────────────────────────────────────────────────
  const cardId = card?.id
  const fetchArquivos = useCallback(async () => {
    if (!cardId) return
    try {
      const res = await fetch(`/api/pedido/${cardId}/arquivos`)
      if (res.ok) setArquivos(await res.json())
    } catch { /* sem conexão: segue sem a lista de arquivos */ }
  }, [cardId])

  async function handleUpload(files: FileList | null) {
    if (!files || !card) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("cardNumero", card.numero)
      const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
      const tipo = ["pdf", "ai", "psd", "eps", "png", "jpg", "jpeg", "svg", "tiff"].includes(ext) ? "arte" : ["dxf", "cdr"].includes(ext) ? "faca" : "outro"
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

  function saveExtras(extra?: Partial<{ cores: string; acabamentos: string[] }>) {
    if (!card || !onSaveCardExtras) return
    const c = extra?.cores ?? cores
    onSaveCardExtras(card.id, { cores: c.trim() || undefined, acabamentos: extra?.acabamentos ?? acabamentos, observacoesOS: obsOS.trim() || undefined })
  }

  useEffect(() => { fetchHistorico() }, [fetchHistorico])
  useEffect(() => { if (cardId) fetchArquivos() }, [cardId, fetchArquivos])

  const isTerceirizado = card?.materialNome === "Terceirizado"

  // ── Financeiro: pedido inteiro (lote) pela camada canônica; sem pedido, o card ──
  const receitasCard = useMemo(() => lancamentos?.filter(l => l.tipo === "receita" && (l.cardId === card?.id || (card?.loteId && l.loteId === card?.loteId))) ?? [], [lancamentos, card?.id, card?.loteId])
  const despesasCard = useMemo(() => lancamentos?.filter(l => l.tipo === "despesa" && (l.cardId === card?.id || (card?.loteId && l.loteId === card?.loteId))) ?? [], [lancamentos, card?.id, card?.loteId])
  const fin = useMemo(() => {
    const receitas = pedido?.receitas ?? receitasCard
    const despesas = (pedido?.despesas ?? despesasCard).filter(l => l.status === "pago" || l.formaPagamento === "conta")
    const sobras = pedido?.sobras ?? receitas.filter(l => l.categoria === "sobra").reduce((s, l) => s + l.valor, 0)
    const venda = pedido?.venda ?? (card?.preco ?? 0) + sobras
    const recebido = pedido?.recebido ?? receitas.filter(l => l.status === "pago").reduce((s, l) => s + l.valor, 0)
    const falta = pedido?.aReceber ?? Math.max(0, venda - recebido)
    const custo = pedido?.custoDireto ?? despesas.reduce((s, l) => s + l.valor, 0)
    const qtd = pedido?.quantidade ?? card?.quantidade ?? 0
    return {
      receitasPagas: receitas.filter(l => l.status === "pago"), despesas, sobras, venda, recebido, falta, custo, qtd,
      margem: custo > 0 && venda > 0 ? (venda - custo) / venda * 100 : null,
      pctPago: venda > 0 ? Math.min(100, (venda - falta) / venda * 100) : 0,
      vazio: receitas.length === 0 && despesas.length === 0,
      sobrasQuitadas: (pedido?.sobrasQuitadas.length ?? 0) > 0,
    }
  }, [pedido, receitasCard, despesasCard, card?.preco, card?.quantidade])

  // ── Salvar campos rápidos ────────────────────────────────────────────────────
  const isDirty = useMemo(() => {
    if (!card) return false
    if (onSaveCloseDate && card.coluna !== COL_PERDIDO && closeDate !== (card.dataFechamento ?? "") && closeDate) return true
    if (onSaveDelivery && deliveryDate !== (card.dataEntregaPrevista ?? "")) return true
    if (onSaveDeliveryReal && deliveryRealDate !== (card.dataEntregaReal ?? "")) return true
    if (onSaveFornecedor && isTerceirizado && (fornecedor !== (card.fornecedor ?? "") || custoTerceiro !== (card.custoTerceiro?.toString() ?? ""))) return true
    return false
  }, [card, closeDate, deliveryDate, deliveryRealDate, fornecedor, custoTerceiro, onSaveCloseDate, onSaveDelivery, onSaveDeliveryReal, onSaveFornecedor, isTerceirizado])

  function handleSave() {
    if (!card || !isDirty) return
    setSaving(true)
    if (onSaveCloseDate && closeDate && closeDate !== (card.dataFechamento ?? "")) onSaveCloseDate(card.id, closeDate)
    if (onSaveDelivery && deliveryDate !== (card.dataEntregaPrevista ?? "")) onSaveDelivery(card.id, deliveryDate || null)
    if (onSaveDeliveryReal && deliveryRealDate !== (card.dataEntregaReal ?? "")) onSaveDeliveryReal(card.id, deliveryRealDate || null)
    if (onSaveFornecedor && isTerceirizado) onSaveFornecedor(card.id, fornecedor.trim() || null, custoTerceiro ? parseFloat(custoTerceiro) : null)
    setSaving(false)
    onClose()
  }

  const numero = isH ? (data.item.numero ?? "") : isP ? data.proposta.numero : data.card.numero
  const nome = isH ? data.item.form.nomeCliente : isP ? data.proposta.nomeCliente : (data.card.loteNumero ?? data.card.nomeCliente)
  const nomeSecundario = isK && data.card.loteNumero ? data.card.nomeCliente : null
  const dataStr = isH ? data.item.data : isP ? data.proposta.data : data.card.data
  const showPix = (isK || isP) && (card?.preco ?? 0) > 0
  const linkPix = () => `${window.location.origin}/pix/${encodeURIComponent(numero)}?v=${(card?.preco ?? 0).toFixed(2)}&c=${encodeURIComponent(nome)}`
  const showSobra = card && onRegistrarSobra && card.coluna >= COL_EXPEDICAO && card.coluna !== COL_PERDIDO

  const etapaTom: Tom = coluna === COL_PERDIDO ? "perigo" : coluna >= COL_EXPEDICAO ? "info" : coluna >= COL_FECHADO ? "sucesso" : "neutro"
  const etapaNome = coluna === COL_HOT ? "Lead quente" : COLUNAS_KANBAN[coluna] ?? "—"

  // Linhas de quantidade para a tabela
  const linhasHist = isH ? data.item.calculo.tabela.map(l => {
    const cf = data.item.form.comFaca
    const ideal = l.quantidade === data.item.calculo.sweetSpotIdealQtd, min = l.quantidade === data.item.calculo.sweetSpotMinimoQtd
    return {
      quantidade: l.quantidade, unitario: cf ? l.unitarioComFaca : l.unitarioSemFaca, total: cf ? l.precoComFaca : l.precoSemFaca,
      parcela: cf ? l.parcela12xComFaca : l.parcela12xSemFaca,
      selo: ideal ? { texto: "ideal", tom: "sucesso" as Tom } : min ? { texto: "mínimo", tom: "alerta" as Tom } : undefined,
    }
  }) : []
  const linhasProp = isP ? data.proposta.linhas.filter(l => l.ativa && l.quantidade > 0).map(l => ({
    quantidade: l.quantidade, unitario: l.unitario, total: l.unitario * l.quantidade, parcela: l.unitario * l.quantidade * parcFator / 12,
    selo: l.isIdeal ? { texto: "ideal", tom: "sucesso" as Tom } : undefined,
  })) : []

  const pilulas = (
    <div className="flex gap-1.5 flex-wrap">
      {isH && <>
        {data.item.form.frente > 0 && <Pilula>{data.item.form.frente}×{data.item.form.alturaBox}×{data.item.form.lateral} cm</Pilula>}
        {data.item.form.materialNome && <Pilula>{data.item.form.materialNome}</Pilula>}
        <Pilula>{data.item.form.comFaca ? "Com faca" : "Sem faca"}</Pilula>
        {data.item.form.incluirVerniz && <Pilula>Verniz {data.item.form.vernizTipo || "UV"}</Pilula>}
        {data.item.form.validadeDias > 0 && <Pilula>Válido {data.item.form.validadeDias} dias</Pilula>}
      </>}
      {isP && <>
        {data.proposta.descricao && <Pilula>{data.proposta.descricao}</Pilula>}
        {data.proposta.dimensoes && <Pilula>{data.proposta.dimensoes}</Pilula>}
        {data.proposta.material && <Pilula>{data.proposta.material}</Pilula>}
        {data.proposta.incluirVerniz && <Pilula>Verniz UV</Pilula>}
        {data.proposta.comFaca && <Pilula>Com faca</Pilula>}
        {data.proposta.validadeDias > 0 && <Pilula>Válido {data.proposta.validadeDias} dias</Pilula>}
      </>}
      {isK && <>
        {data.card.dimensoes && !isTerceirizado && <Pilula>{data.card.dimensoes} cm</Pilula>}
        {data.card.materialNome && <Pilula>{data.card.materialNome}</Pilula>}
        {data.card.motivoPerdido && <Pilula tom="perigo">“{data.card.motivoPerdido}”</Pilula>}
      </>}
    </div>
  )

  const sec = (chave: string) => ({ chave, aberta: abertas.has(chave), onAlternar: alternar })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(25,22,37,0.38)] backdrop-blur-[6px] p-4 apple-backdrop-enter"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="apple-modal-enter w-full max-w-[1180px] h-[min(820px,92vh)] overflow-hidden bg-white rounded-2xl shadow-[0_24px_64px_-16px_rgba(25,22,37,0.35)] ring-1 ring-[rgba(60,60,67,0.08)] flex flex-col">

        {/* ── Cabeçalho ── */}
        <div className="shrink-0 px-8 pt-6 pb-4 flex items-start justify-between gap-6 border-b border-[rgba(60,60,67,0.08)]">
          <div className="flex flex-col gap-2.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {card && <Selo tom={etapaTom}>{etapaNome}</Selo>}
              {numero && <span className="text-[12px] font-semibold ds-num text-[#8456e8] bg-[#8456e8]/[0.08] px-2.5 py-0.5 rounded-full">{numero}</span>}
              <span className="text-[12.5px] text-[#898892]">{dataStr}</span>
            </div>
            <h1 className={`text-[22px] font-semibold tracking-[-0.02em] leading-tight ${isK && data.card.loteNumero ? "text-[#8456e8]" : "text-[#191625]"}`}>{nome || "Sem nome"}</h1>
            {nomeSecundario && <p className="-mt-1.5 text-[14px] font-medium text-[#5e5c68]">{nomeSecundario}</p>}
            {pilulas}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full bg-[rgba(116,116,128,0.1)] hover:bg-[rgba(116,116,128,0.18)] grid place-items-center text-[#5e5c68] shrink-0 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {card ? (<>
          {/* ── Campos rápidos ── */}
          <div className="shrink-0 px-8 border-b border-[rgba(60,60,67,0.08)]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <Campo icone={<LayoutGrid />} rotulo="Etapa">
                <div className="relative inline-flex items-center gap-1">
                  <select value={coluna} onChange={e => { const v = +e.target.value; setColuna(v); onMoveEtapa?.(card.id, v) }}
                    className="appearance-none bg-transparent border-0 outline-none pr-4 text-[13px] font-semibold cursor-pointer"
                    style={{ color: etapaTom === "neutro" ? "#5e5c68" : undefined }}>
                    {(COLUNAS_KANBAN as readonly string[]).map((n, i) => <option key={i} value={i}>{n}</option>)}
                    <option value={COL_HOT}>Lead quente</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-[#898892] absolute right-0 pointer-events-none" />
                </div>
              </Campo>
              <Campo icone={<DollarSign />} rotulo="Valor">
                {editingPreco && onSavePreco ? (
                  <input autoFocus type="number" min="0" step="0.01" value={precoInput} onChange={e => setPrecoInput(e.target.value)}
                    onBlur={() => { const v = parseFloat(precoInput); if (!isNaN(v) && v >= 0) onSavePreco(card.id, v); setEditingPreco(false) }}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setPrecoInput(card.preco.toFixed(2)); setEditingPreco(false) } }}
                    className={`${inputCls} w-32 h-8 text-[13px] font-semibold ds-num`} />
                ) : (
                  <button onClick={() => { if (onSavePreco) { setPrecoInput(card.preco.toFixed(2)); setEditingPreco(true) } }} disabled={!onSavePreco}
                    title={onSavePreco ? "Clique para editar" : undefined}
                    className="text-[14px] font-semibold text-[#191625] ds-num rounded-md px-1 -mx-1 enabled:hover:bg-[#8456e8]/[0.06] transition-colors">
                    {brl(card.preco)}
                  </button>
                )}
              </Campo>
              {onSaveCloseDate && coluna !== COL_PERDIDO && (
                <Campo icone={<CalendarDays />} rotulo="Data do pedido">
                  <input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} className={`${inputData} ${closeDate ? "text-[#191625]" : "text-[#c7c7cc]"}`} />
                </Campo>
              )}
              {onSaveDelivery && (
                <Campo icone={<Truck />} rotulo="Entrega prev.">
                  <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className={`${inputData} ${deliveryDate ? "text-[#191625]" : "text-[#c7c7cc]"}`} />
                </Campo>
              )}
              {onSaveDeliveryReal && (
                <Campo icone={<CircleCheck />} rotulo="Entrega real">
                  <input type="date" value={deliveryRealDate} onChange={e => setDeliveryRealDate(e.target.value)} className={`${inputData} ${deliveryRealDate ? "text-[#009351]" : "text-[#c7c7cc]"}`} />
                </Campo>
              )}
              {isTerceirizado && onSaveFornecedor && <>
                <Campo icone={<Factory />} rotulo="Fornecedor">
                  <input value={fornecedor} onChange={e => setFornecedor(e.target.value)} placeholder="—" className="bg-transparent border-0 outline-none p-0 text-[13px] font-semibold text-[#191625] w-full" />
                </Campo>
                <Campo icone={<DollarSign />} rotulo="Custo do item">
                  <input type="number" value={custoTerceiro} onChange={e => setCustoTerceiro(e.target.value)} placeholder="0,00" min={0} step={0.01} className={`${inputData} text-[#191625] w-28`} />
                </Campo>
              </>}
            </div>
            {isDirty && (
              <div className="py-2.5 flex justify-end">
                <Botao variante="primario" onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar alterações"}</Botao>
              </div>
            )}
          </div>

          {/* ── Corpo ── */}
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 overflow-y-auto px-8 pb-8 pt-1">

              <Secao {...sec("financeiro")} titulo={pedido && pedido.cards.length > 1 ? `Financeiro do lote (${pedido.cards.length} itens)` : "Financeiro"}
                selo={fin.recebido > 0 ? `${brl(fin.recebido)} recebido` : brl(fin.venda)}>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <MiniKpi rotulo="Valor" valor={brl(fin.venda)} sub={fin.sobras > 0 ? `inclui ${brl(fin.sobras)} de sobras` : undefined} />
                  <MiniKpi rotulo="Recebido" valor={brl(fin.recebido)} cor="#009351" sub={fin.falta > 0.5 ? `falta ${brl(fin.falta)}` : "quitado"} />
                  <MiniKpi rotulo="Custos" valor={brl(fin.custo)} cor={fin.custo > 0 ? "#d33a3c" : "#898892"} sub={fin.despesas.length ? `${fin.despesas.length} lançamentos` : "sem custos lançados"} />
                  <MiniKpi rotulo="Margem de contribuição" valor={fin.margem == null ? "—" : `${num(fin.margem, 1)}%`}
                    cor={fin.margem == null ? "#898892" : fin.margem >= 45 ? "#009351" : fin.margem >= 30 ? "#c57800" : "#d33a3c"}
                    sub={fin.margem == null ? "lance os custos para ver" : `${brl(fin.venda - fin.custo)} sobre a venda`} />
                  <MiniKpi rotulo="Quantidade" valor={fin.qtd > 0 ? `${num(fin.qtd)} un` : "—"} />
                  <MiniKpi rotulo="Custo por unidade" valor={fin.custo > 0 && fin.qtd > 0 ? brl(fin.custo / fin.qtd) : "—"} cor={fin.custo > 0 ? "#191625" : "#898892"} />
                </div>
                <div className="h-1 rounded-full bg-[rgba(116,116,128,0.12)] overflow-hidden mt-3 mb-2">
                  <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${fin.pctPago}%`, background: fin.pctPago >= 100 ? "#009351" : fin.pctPago >= 50 ? "#8456e8" : "#c57800" }} />
                </div>
                {fin.sobrasQuitadas && <p className="text-[11.5px] text-[#009351] mb-2">As sobras foram pagas junto com o pedido.</p>}

                {showSobra && (
                  <button onClick={() => { onRegistrarSobra!(card); onClose() }}
                    className="w-full mb-2 h-9 rounded-lg border border-dashed border-[#c57800]/40 text-[12.5px] font-medium text-[#c57800] hover:bg-[#c57800]/[0.05] flex items-center justify-center gap-2 transition-colors">
                    <Boxes className="w-3.5 h-3.5" /> Registrar sobras
                  </button>
                )}

                {fin.receitasPagas.length > 0 && (
                  <div className="mt-2 rounded-xl ring-1 ring-[rgba(60,60,67,0.08)] overflow-hidden">
                    <div className="flex items-center justify-between px-3.5 py-2 bg-[rgba(116,116,128,0.04)] text-[11.5px] font-semibold text-[#009351]">
                      <span>Entradas</span><span className="ds-num">{brl(fin.receitasPagas.reduce((s, l) => s + l.valor, 0))}</span>
                    </div>
                    {fin.receitasPagas.map(l => (
                      <div key={l.id} className="flex items-center gap-2.5 px-3.5 py-2 border-t border-[rgba(60,60,67,0.05)] text-[12px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#009351] shrink-0" />
                        <span className="flex-1 min-w-0 truncate text-[#3f3d4a]">{l.descricao || "Recebimento"}{l.categoria === "sobra" ? " · sobra" : ""}</span>
                        <span className="font-semibold text-[#009351] ds-num">{brl(l.valor)}</span>
                        {l.dataPagamento && <span className="text-[11px] text-[#898892] w-16 text-right whitespace-nowrap">{dataCurta(l.dataPagamento)}</span>}
                        {l.formaPagamento && <span className="text-[11px] text-[#898892] w-14 text-right">{FORMA_PAG[l.formaPagamento] ?? ""}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {fin.despesas.length > 0 && (
                  <div className="mt-2 rounded-xl ring-1 ring-[rgba(60,60,67,0.08)] overflow-hidden">
                    <div className="flex items-center justify-between px-3.5 py-2 bg-[rgba(116,116,128,0.04)] text-[11.5px] font-semibold text-[#d33a3c]">
                      <span>Custos</span><span className="ds-num">{brl(fin.custo)}</span>
                    </div>
                    {fin.despesas.map(l => {
                      const I = CAT_ICONE[l.categoria ?? ""] ?? ClipboardList
                      return (
                        <div key={l.id} className="flex items-center gap-2.5 px-3.5 py-2 border-t border-[rgba(60,60,67,0.05)] text-[12px]">
                          <I className="w-3.5 h-3.5 text-[#898892] shrink-0" />
                          <span className="flex-1 min-w-0 truncate text-[#3f3d4a]">{l.descricao || "Despesa"}</span>
                          <span className="font-semibold text-[#d33a3c] ds-num">−{brl(l.valor)}</span>
                          {l.formaPagamento === "conta" ? <Selo tom="alerta">conta</Selo>
                            : l.dataPagamento && <span className="text-[11px] text-[#898892] w-16 text-right whitespace-nowrap">{dataCurta(l.dataPagamento)}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
                {fin.vazio && <p className="text-[12.5px] text-[#898892] mt-2">Nenhum lançamento registrado.</p>}
              </Secao>

              <Secao {...sec("os")} titulo="Ordem de serviço" selo={arquivos.length ? `${arquivos.length} arquivo${arquivos.length > 1 ? "s" : ""}` : undefined}
                acao={<div className="flex items-center gap-1">
                  <button onClick={() => fotoInputRef.current?.click()} disabled={uploading} title="Aparece na página do cliente"
                    className="h-7 px-2.5 rounded-md text-[11.5px] font-medium text-[#8456e8] hover:bg-[#8456e8]/10 flex items-center gap-1.5 transition-colors">
                    <Camera className="w-3.5 h-3.5" />Foto
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    className="h-7 px-2.5 rounded-md text-[11.5px] font-medium text-[#8456e8] hover:bg-[#8456e8]/10 flex items-center gap-1.5 transition-colors">
                    <Upload className="w-3.5 h-3.5" />{uploading ? "Enviando…" : "Arquivo"}
                  </button>
                </div>}>
                <div className="space-y-4">
                  <div>
                    <Rotulo>Observações para a gráfica</Rotulo>
                    <textarea value={obsOS} onChange={e => setObsOS(e.target.value)} onBlur={() => saveExtras()} rows={3}
                      placeholder="Instruções especiais, referências, cuidados…"
                      className="w-full rounded-lg px-3 py-2 text-[13px] leading-relaxed text-[#3f3d4a] bg-white ds-borda focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 resize-y" />
                  </div>
                  <div>
                    <Rotulo>Cores de impressão</Rotulo>
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {CORES_RAPIDAS.map(c => (
                        <button key={c} onClick={() => { setCores(c); saveExtras({ cores: c }) }}
                          className={`h-7 px-3 rounded-full text-[12px] font-medium transition-colors ${cores === c ? "bg-[#8456e8] text-white" : "bg-white text-[#5e5c68] ds-borda hover:bg-[rgba(116,116,128,0.06)]"}`}>{c}</button>
                      ))}
                    </div>
                    <input value={cores} onChange={e => setCores(e.target.value)} onBlur={() => saveExtras()} placeholder="Ex.: 4x0, Pantone 485…" className={`${inputCls} w-full`} />
                  </div>
                  <div>
                    <Rotulo>Acabamentos</Rotulo>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {ACABAMENTOS_OPCOES.map(op => (
                        <label key={op} className="flex items-center gap-2 cursor-pointer text-[13px] text-[#3f3d4a]">
                          <input type="checkbox" className="accent-[#8456e8]" checked={acabamentos.includes(op)}
                            onChange={() => { const next = acabamentos.includes(op) ? acabamentos.filter(a => a !== op) : [...acabamentos, op]; setAcabamentos(next); saveExtras({ acabamentos: next }) }} />
                          {op}
                        </label>
                      ))}
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
                  <input ref={fotoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async e => {
                    const fs = Array.from(e.target.files ?? []); e.target.value = ""
                    if (!fs.length) return
                    setUploading(true)
                    for (const f of fs) await enviarFotoProducao(card.id, card.numero, f)
                    setUploading(false); fetchArquivos()
                  }} />
                  {arquivos.length === 0 ? (
                    <button onClick={() => fileInputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files) }}
                      className="w-full rounded-xl border-2 border-dashed border-[rgba(60,60,67,0.12)] hover:border-[#8456e8]/30 py-4 text-[12.5px] text-[#898892] transition-colors">
                      Arraste ou clique · arte, faca, mockup…
                    </button>
                  ) : (
                    <div className="space-y-1" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files) }}>
                      {arquivos.map(a => {
                        const I = TIPO_ARQUIVO_ICON[a.tipo] ?? FileText
                        return (
                          <div key={a.id} className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-[rgba(116,116,128,0.04)] hover:bg-[rgba(116,116,128,0.08)] transition-colors">
                            <I className="w-4 h-4 text-[#5e5c68] shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-[#191625] truncate">{a.nome}</p>
                              <p className="text-[11px] text-[#898892]">{TIPO_LABEL[a.tipo]}{a.tamanho ? ` · ${(a.tamanho / 1024).toFixed(0)} KB` : ""}</p>
                            </div>
                            <a href={a.url} target="_blank" rel="noreferrer" aria-label="Baixar" className="w-7 h-7 grid place-items-center rounded-md text-[#8456e8] hover:bg-[#8456e8]/10"><Download className="w-3.5 h-3.5" /></a>
                            <button onClick={() => handleDeleteArquivo(a.id)} aria-label="Remover" className="w-7 h-7 grid place-items-center rounded-md text-[#898892] hover:text-[#d33a3c] hover:bg-[#d33a3c]/10"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <BotaoCopiar rotulo="Link da gráfica" icone={<Link2 className="w-3.5 h-3.5" />} obterUrl={() => `${window.location.origin}/pedido/${encodeURIComponent(card.numero)}`} />
                    <a href={`/pedido/${encodeURIComponent(card.numero)}`} target="_blank" rel="noreferrer" aria-label="Abrir página da gráfica"
                      className="h-9 w-9 grid place-items-center rounded-lg bg-white ds-borda text-[#5e5c68] hover:bg-[rgba(116,116,128,0.06)]"><ExternalLink className="w-3.5 h-3.5" /></a>
                  </div>
                </div>
              </Secao>

              <Secao {...sec("opcoes")} titulo="Opções de quantidade" selo={card.opcoes?.length ? `${card.opcoes.length}` : undefined}>
                {!isTerceirizado ? (
                  <TabelaQuantidades comParcela={false} linhas={(card.opcoes?.length ? card.opcoes : [{ quantidade: card.quantidade, unitario: 0, preco: card.preco }]).map(op => ({
                    quantidade: op.quantidade, unitario: op.unitario, total: op.preco,
                    selo: op.quantidade === card.quantidade && coluna >= COL_FECHADO && coluna !== COL_PERDIDO ? { texto: "fechado", tom: "sucesso" as Tom } : undefined,
                  }))} />
                ) : (
                  <div className="rounded-xl bg-[rgba(116,116,128,0.04)] px-4 py-3">
                    <p className="text-[18px] font-semibold text-[#191625] ds-num">{brl(card.preco)}</p>
                    <p className="text-[12.5px] text-[#898892]">{num(card.quantidade)} un · revenda{card.fornecedor ? ` via ${card.fornecedor}` : ""}</p>
                    {card.custoTerceiro != null && card.custoTerceiro > 0 && (
                      <p className={`text-[12px] ds-num mt-0.5 ${card.preco - card.custoTerceiro >= 0 ? "text-[#009351]" : "text-[#d33a3c]"}`}>Custo {brl(card.custoTerceiro)} · margem {brl(card.preco - card.custoTerceiro)}</p>
                    )}
                  </div>
                )}
              </Secao>

              {isK && onSavePrazos && (() => {
                const etapas = [
                  { key: null, label: "Pedido realizado", value: card.dataFechamento },
                  ...ETAPAS_PRAZO.map(e => ({ key: e.key as keyof PrazoEtapas | null, label: e.label, value: prazos[e.key] })),
                ]
                const feitas = etapas.filter(s => s.value).length
                const pct = Math.round(feitas / etapas.length * 100)
                return (
                  <Secao {...sec("prazos")} titulo="Controle de prazos" selo={`${feitas}/${etapas.length}`}>
                    <div className="h-1 rounded-full bg-[rgba(116,116,128,0.12)] overflow-hidden mb-3">
                      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: pct === 100 ? "#009351" : "#8456e8" }} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
                      {etapas.map((s, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className={`mt-0.5 w-4 h-4 rounded-full grid place-items-center shrink-0 ${s.value ? "bg-[#8456e8]/[0.12]" : "ring-[1.5px] ring-[#d1d5db]"}`}>
                            {s.value && <Check className="w-2.5 h-2.5 text-[#8456e8]" strokeWidth={3.5} />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-[#898892] leading-tight">{s.label}</p>
                            {s.key == null ? (
                              <p className={`text-[13px] font-semibold ds-num ${s.value ? "text-[#191625]" : "text-[#c7c7cc]"}`}>{s.value ? s.value.split("-").reverse().join("/") : "—"}</p>
                            ) : (
                              <div className="flex items-center gap-1">
                                <input type="date" value={s.value ?? ""} onChange={e => setPrazoEtapa(s.key!, e.target.value)}
                                  className={`${inputData} ${s.value ? "text-[#8456e8]" : "text-[#898892]"}`} />
                                {s.value && <button onClick={() => setPrazoEtapa(s.key!, "")} aria-label="Limpar" className="text-[#c7c7cc] hover:text-[#d33a3c]"><X className="w-3 h-3" /></button>}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Secao>
                )
              })()}

              {isK && onSaveProjecao && (
                <Secao {...sec("projecao")} titulo="Projeção de custos" selo={projTotal > 0 ? brl(projTotal) : undefined}>
                  {projTotal > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <MiniKpi rotulo="Total projetado" valor={brl(projTotal)} />
                      <MiniKpi rotulo="Preço de venda" valor={brl(card.preco)} cor="#8456e8" />
                      <MiniKpi rotulo="Margem projetada" valor={projMargem != null ? `${num(projMargem, 1)}%` : "—"}
                        cor={projMargem == null ? "#898892" : projMargem >= 40 ? "#009351" : projMargem >= 20 ? "#c57800" : "#d33a3c"} />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {ITENS_PROJECAO.map(({ key, label, Icon }) => (
                      <label key={key} className="flex items-center gap-2 rounded-xl bg-[rgba(116,116,128,0.04)] px-3 py-2 cursor-text">
                        <Icon className="w-3.5 h-3.5 text-[#898892] shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[11px] font-medium text-[#898892]">{label}</span>
                          <span className="flex items-center gap-1">
                            <span className="text-[12px] text-[#898892]">R$</span>
                            <input type="number" min={0} step={0.01} value={proj[key] != null ? String(proj[key]) : ""} onChange={e => setField(key, e.target.value)} placeholder="—"
                              className={`bg-transparent border-0 outline-none p-0 w-full text-[14px] font-semibold ds-num ${((proj[key] as number) ?? 0) > 0 ? "text-[#191625]" : "text-[#c7c7cc]"}`} />
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <textarea value={proj.obs ?? ""} onChange={e => setField("obs", e.target.value)} rows={2} placeholder="Ex.: faca já existe, hot stamping a confirmar…"
                    className="mt-2 w-full rounded-lg px-3 py-2 text-[12.5px] text-[#3f3d4a] bg-white ds-borda focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 resize-none" />
                  <div className="flex justify-end mt-2">
                    <Botao variante="primario" onClick={saveProjecao} disabled={savingProj}>{savingProj ? "Salvando…" : "Salvar projeção"}</Botao>
                  </div>
                </Secao>
              )}
            </div>

            <Historico titulo="Atividade" etapas={etapasLog} obs={obsInput} setObs={setObsInput} onEnviar={addObservacao} salvando={savingObs} />
          </div>

          {/* ── Rodapé ── */}
          <div className="shrink-0 border-t border-[rgba(60,60,67,0.08)] px-8 py-3 flex items-center justify-between gap-3">
            <Botao variante="fantasma" onClick={onClose}>Fechar</Botao>
            <div className="flex gap-2 flex-wrap justify-end">
              {isH && onPersonalizarHistorico && <Botao onClick={() => onPersonalizarHistorico(data.item)}>Personalizar valores</Botao>}
              {isH && onEditarHistorico && <Botao onClick={() => onEditarHistorico(data.item)}>Editar orçamento</Botao>}
              {isP && onEditar && <Botao onClick={() => { onEditar(data.proposta); onClose() }}>Editar proposta</Botao>}
              {(coluna === 0 || coluna === COL_HOT) && card.numero && (
                <BotaoCopiar rotulo="Link de aprovação" icone={<Link2 className="w-3.5 h-3.5" />} titulo="Copia o link para o cliente escolher a quantidade e aprovar"
                  obterUrl={async () => {
                    const r = await fetch(`/api/aprovacao/link?numero=${encodeURIComponent(card.numero)}`).catch(() => null)
                    return r?.ok ? (await r.json()).url : null
                  }} />
              )}
              {showPix && <BotaoCopiar rotulo="Link Pix" icone={<Zap className="w-3.5 h-3.5" />} obterUrl={linkPix} />}
              {coluna >= COL_FECHADO && coluna !== COL_PERDIDO && (
                <BotaoCopiar rotulo="Página do cliente" icone={<User className="w-3.5 h-3.5" />} titulo="Copia o link com todos os pedidos, arquivos e pagamentos do cliente"
                  obterUrl={async () => {
                    const r = await fetch(`/api/cliente/link?nome=${encodeURIComponent(card.nomeCliente)}`).catch(() => null)
                    return r?.ok ? (await r.json()).url : null
                  }} />
              )}
              {coluna >= COL_FECHADO && coluna !== COL_PERDIDO && onEmitirOS && (
                <Botao variante="primario" icone={<FileOutput className="w-3.5 h-3.5" />} onClick={() => onEmitirOS(card)}>Emitir pedido</Botao>
              )}
            </div>
          </div>
        </>) : (<>
          {/* ── Orçamento do histórico / proposta personalizada (sem card) ── */}
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 overflow-y-auto px-8 py-6">
              <p className="text-[13px] font-semibold text-[#191625] mb-2">{isH ? "Orçamento calculado" : "Proposta"}</p>
              <TabelaQuantidades comParcela linhas={isH ? linhasHist : linhasProp} />
              {isH && (data.item.form.obsCliente || data.item.form.obsInterna) && (
                <div className="mt-6 pt-4 border-t border-[rgba(60,60,67,0.08)] space-y-3">
                  {data.item.form.obsCliente && <div><Rotulo>Para o cliente</Rotulo><p className="text-[13.5px] text-[#3f3d4a] leading-relaxed">{data.item.form.obsCliente}</p></div>}
                  {data.item.form.obsInterna && <div><Rotulo>Interna</Rotulo><p className="text-[13.5px] text-[#898892] leading-relaxed">{data.item.form.obsInterna}</p></div>}
                </div>
              )}
              {isP && data.proposta.obsCliente && (
                <div className="mt-6 pt-4 border-t border-[rgba(60,60,67,0.08)]"><Rotulo>Para o cliente</Rotulo><p className="text-[13.5px] text-[#3f3d4a] leading-relaxed">{data.proposta.obsCliente}</p></div>
              )}
            </div>
            <Historico titulo="Histórico" etapas={etapasLog} obs={obsInput} setObs={setObsInput} onEnviar={addObservacao} salvando={savingObs} />
          </div>
          <div className="shrink-0 border-t border-[rgba(60,60,67,0.08)] px-8 py-3 flex items-center justify-between gap-3">
            <Botao variante="fantasma" onClick={onClose}>Fechar</Botao>
            <div className="flex gap-2 flex-wrap justify-end">
              {isH && onPersonalizarHistorico && <Botao onClick={() => onPersonalizarHistorico(data.item)}>Personalizar valores</Botao>}
              {isH && onEditarHistorico && <Botao variante="primario" onClick={() => onEditarHistorico(data.item)}>Editar orçamento</Botao>}
              {isP && onEditar && <Botao variante="primario" onClick={() => { onEditar(data.proposta); onClose() }}>Editar proposta</Botao>}
              {showPix && <BotaoCopiar rotulo="Link Pix" icone={<Zap className="w-3.5 h-3.5" />} obterUrl={linkPix} />}
            </div>
          </div>
        </>)}
      </div>
    </div>
  )
}
