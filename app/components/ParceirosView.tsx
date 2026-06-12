"use client"

import { useState, useMemo } from "react"
import { Parceiro, NegocioParceiro, TipoNegocio, StatusNegocio, StatusLoteParceiro, Lote } from "../types"
import { brl } from "../utils"

const PARTNER_STEPS: { id: StatusLoteParceiro; label: string }[] = [
  { id: "aguardando",  label: "Aguardando" },
  { id: "em_producao", label: "Em produção" },
  { id: "pronto",      label: "Pronto" },
  { id: "entregue",    label: "Entregue" },
]

const CATEGORIAS = [
  "Embalagens", "Vidros", "Essências", "Papéis",
  "Impressão", "Design", "Logística", "Distribuição", "Outro",
]

const hoje = () => new Date().toISOString().split("T")[0]

const STATUS_LABEL: Record<StatusNegocio, string> = {
  pendente:  "Pendente",
  pago:      "Pago",
  cancelado: "Cancelado",
}

const STATUS_CLS: Record<StatusNegocio, string> = {
  pendente:  "bg-amber-50 text-amber-700 border-amber-200",
  pago:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelado: "bg-rose-50 text-rose-600 border-rose-200",
}

function pill(text: string, cls: string) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {text}
    </span>
  )
}

// ─── Modal Parceiro ─────────────────────────────────────────────────────────
function ModalParceiro({ inicial, onSave, onClose }: {
  inicial?: Parceiro
  onSave: (p: Parceiro) => void
  onClose: () => void
}) {
  const [nome, setNome]             = useState(inicial?.nome ?? "")
  const [categoria, setCategoria]   = useState(inicial?.categoria ?? "")
  const [catCustom, setCatCustom]   = useState("")
  const [contato, setContato]       = useState(inicial?.contato ?? "")
  const [comissao, setComissao]     = useState(String(inicial?.comissaoDefault ?? ""))

  const catFinal = categoria === "__custom__" ? catCustom : categoria

  function salvar() {
    if (!nome.trim() || !catFinal.trim()) return
    onSave({
      id:              inicial?.id ?? Date.now().toString(),
      nome:            nome.trim(),
      categoria:       catFinal.trim(),
      contato:         contato.trim() || undefined,
      comissaoDefault: parseFloat(comissao) || 0,
      criadoEm:        inicial?.criadoEm ?? new Date().toLocaleString("pt-BR"),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between">
          <p className="font-bold text-slate-800 text-[15px]">{inicial ? "Editar parceiro" : "Novo parceiro"}</p>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="Nome *">
            <input
              autoFocus
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: João Silva"
              className={input()}
            />
          </Field>
          <Field label="Categoria *">
            <select value={categoria} onChange={e => setCategoria(e.target.value)} className={input()}>
              <option value="">Selecione…</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__custom__">Personalizada…</option>
            </select>
          </Field>
          {categoria === "__custom__" && (
            <Field label="Nome da categoria">
              <input
                value={catCustom}
                onChange={e => setCatCustom(e.target.value)}
                placeholder="Ex: Cosméticos"
                className={input()}
              />
            </Field>
          )}
          <Field label="Contato (tel / e-mail)">
            <input
              value={contato}
              onChange={e => setContato(e.target.value)}
              placeholder="Ex: (11) 99999-9999"
              className={input()}
            />
          </Field>
          <Field label="Comissão padrão (%)">
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={comissao}
              onChange={e => setComissao(e.target.value)}
              placeholder="Ex: 5"
              className={input()}
            />
          </Field>
        </div>
        <div className="px-6 pb-5 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-[12.5px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">
            Cancelar
          </button>
          <button
            disabled={!nome.trim() || !catFinal.trim()}
            onClick={salvar}
            className="flex-1 py-2.5 text-[12.5px] font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-colors disabled:opacity-40">
            {inicial ? "Salvar" : "Cadastrar"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Negócio ───────────────────────────────────────────────────────────
function ModalNegocio({ inicial, parceiros, lotes, onSave, onClose }: {
  inicial?: NegocioParceiro
  parceiros: Parceiro[]
  lotes?: Lote[]
  onSave: (n: NegocioParceiro) => void
  onClose: () => void
}) {
  const [parceiroId, setParceiroId]   = useState(inicial?.parceiroId ?? "")
  const [descricao, setDescricao]     = useState(inicial?.descricao ?? "")
  const [tipo, setTipo]               = useState<TipoNegocio>(inicial?.tipo ?? "comissao")
  const [valorVenda, setValorVenda]   = useState(String(inicial?.valorVenda ?? ""))
  const [valorCusto, setValorCusto]   = useState(String(inicial?.valorCusto ?? ""))
  const [comissaoPerc, setComissaoPerc] = useState(String(inicial?.comissaoPerc ?? ""))
  const [dataOrcamento, setDataOrcamento] = useState(inicial?.dataOrcamento ?? hoje())
  const [status, setStatus]           = useState<StatusNegocio>(inicial?.status ?? "pendente")
  const [obs, setObs]                 = useState(inicial?.obs ?? "")
  const [loteId, setLoteId]           = useState(inicial?.loteId ?? "")
  const [loteNumero, setLoteNumero]   = useState(inicial?.loteNumero ?? "")
  const [statusLote, setStatusLote]   = useState<StatusLoteParceiro>(inicial?.statusLote ?? "aguardando")

  const parceiro = parceiros.find(p => p.id === parceiroId)

  // auto-fill default commission when partner changes
  function handleParceiro(id: string) {
    setParceiroId(id)
    const p = parceiros.find(x => x.id === id)
    if (p && !comissaoPerc && tipo === "comissao") setComissaoPerc(String(p.comissaoDefault || ""))
  }

  const vv = parseFloat(valorVenda) || 0
  const vc = parseFloat(valorCusto) || 0
  const cp = parseFloat(comissaoPerc) || 0

  const comissaoCalculada = tipo === "comissao"
    ? vv * cp / 100
    : vv - vc

  const ganhoPerc = tipo === "ganho" && vc > 0 ? ((vv - vc) / vc) * 100 : 0

  function salvar() {
    if (!parceiroId || !descricao.trim() || vv <= 0) return
    onSave({
      id:             inicial?.id ?? Date.now().toString(),
      parceiroId,
      parceiroNome:   parceiro?.nome ?? "",
      descricao:      descricao.trim(),
      tipo,
      valorVenda:     vv,
      valorCusto:     tipo === "ganho" ? vc : undefined,
      comissaoPerc:   tipo === "comissao" ? cp : ganhoPerc,
      comissaoValor:  comissaoCalculada,
      dataOrcamento,
      status,
      obs:            obs.trim() || undefined,
      loteId:         loteId || undefined,
      loteNumero:     loteNumero || undefined,
      statusLote:     loteId ? statusLote : undefined,
      criadoEm:       inicial?.criadoEm ?? new Date().toLocaleString("pt-BR"),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col overflow-hidden" style={{ maxHeight: "92vh" }}>
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <p className="font-bold text-slate-800 text-[15px]">{inicial ? "Editar negócio" : "Registrar negócio"}</p>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <Field label="Parceiro *">
            <select value={parceiroId} onChange={e => handleParceiro(e.target.value)} className={input()}>
              <option value="">Selecione…</option>
              {parceiros.map(p => (
                <option key={p.id} value={p.id}>{p.nome} — {p.categoria}</option>
              ))}
            </select>
          </Field>

          <Field label="Descrição *">
            <input
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Ex: Caixas para perfume linha premium"
              className={input()}
            />
          </Field>

          <Field label="Data do orçamento">
            <input
              type="date"
              value={dataOrcamento}
              onChange={e => setDataOrcamento(e.target.value)}
              className={input()}
            />
            {dataOrcamento && (
              <p className="text-[10.5px] text-slate-400 mt-1">
                {new Date(dataOrcamento + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            )}
          </Field>

          {/* Tipo */}
          <Field label="Tipo de venda">
            <div className="flex gap-2">
              {(["comissao", "ganho"] as TipoNegocio[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTipo(t)}
                  className={`flex-1 py-2 rounded-lg border text-[12px] font-semibold transition-all ${
                    tipo === t
                      ? "border-blue-400 bg-blue-50/60 text-blue-700"
                      : "border-slate-200 text-slate-400 hover:border-slate-300"
                  }`}
                >
                  {t === "comissao" ? "Comissão" : "Ganho em cima"}
                </button>
              ))}
            </div>
            <p className="text-[10.5px] text-slate-400 mt-1.5">
              {tipo === "comissao"
                ? "Parceiro indicou o cliente. Você paga uma comissão sobre a venda."
                : "Você comprou via parceiro e marcou preço acima. O ganho é o spread."}
            </p>
          </Field>

          {tipo === "comissao" ? (
            <>
              <Field label="Valor da venda (R$) *">
                <input type="number" min="0" step="0.01" value={valorVenda}
                  onChange={e => setValorVenda(e.target.value)} placeholder="0,00" className={input()} />
              </Field>
              <Field label="Comissão (%)">
                <div className="flex items-center gap-2">
                  <input type="number" min="0" max="100" step="0.5" value={comissaoPerc}
                    onChange={e => setComissaoPerc(e.target.value)} placeholder="0" className={`${input()} flex-1`} />
                  <span className="text-slate-400 text-[12px] shrink-0">%</span>
                </div>
                {vv > 0 && cp > 0 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    = <span className="font-bold text-blue-700">{brl(comissaoCalculada)}</span> a pagar ao parceiro
                  </p>
                )}
              </Field>
            </>
          ) : (
            <>
              <Field label="Valor de custo (R$) — quanto você pagou">
                <input type="number" min="0" step="0.01" value={valorCusto}
                  onChange={e => setValorCusto(e.target.value)} placeholder="0,00" className={input()} />
              </Field>
              <Field label="Valor de venda (R$) *">
                <input type="number" min="0" step="0.01" value={valorVenda}
                  onChange={e => setValorVenda(e.target.value)} placeholder="0,00" className={input()} />
              </Field>
              {vv > 0 && vc > 0 && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                  <p className="text-[11px] text-emerald-700">
                    Ganho: <span className="font-bold text-[13px]">{brl(comissaoCalculada)}</span>
                    {ganhoPerc > 0 && <span className="text-emerald-600"> ({ganhoPerc.toFixed(1)}%)</span>}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Status */}
          <Field label="Status">
            <div className="flex gap-2">
              {(["pendente", "pago", "cancelado"] as StatusNegocio[]).map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`flex-1 py-1.5 rounded-lg border text-[11px] font-semibold transition-all capitalize ${
                    status === s
                      ? STATUS_CLS[s]
                      : "border-slate-200 text-slate-400 hover:border-slate-300"
                  }`}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Observação">
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="Notas internas…"
              rows={2}
              className={`${input()} resize-none`}
            />
          </Field>

          {lotes && lotes.length > 0 && (
            <Field label="Vincular ao lote (opcional)">
              <select
                value={loteId}
                onChange={e => {
                  const chosen = lotes.find(l => l.id === e.target.value)
                  setLoteId(chosen?.id ?? "")
                  setLoteNumero(chosen?.numero ?? "")
                }}
                className={input()}>
                <option value="">Nenhum</option>
                {lotes.map(l => (
                  <option key={l.id} value={l.id}>{l.numero} · {l.nomeCliente}</option>
                ))}
              </select>
            </Field>
          )}

          {loteId && (
            <Field label="Status do produto no lote">
              <div className="flex gap-1.5">
                {PARTNER_STEPS.map(step => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setStatusLote(step.id)}
                    className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg transition-colors border ${
                      statusLote === step.id
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                    }`}>
                    {step.label}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </div>

        <div className="px-6 pb-5 flex gap-2 shrink-0 border-t border-slate-100 pt-4">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-[12.5px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">
            Cancelar
          </button>
          <button
            disabled={!parceiroId || !descricao.trim() || vv <= 0}
            onClick={salvar}
            className="flex-1 py-2.5 text-[12.5px] font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-colors disabled:opacity-40">
            {inicial ? "Salvar" : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main View ───────────────────────────────────────────────────────────────
export function ParceirosView({
  parceiros,
  negocios,
  lotes,
  onAddParceiro,
  onUpdateParceiro,
  onDeleteParceiro,
  onAddNegocio,
  onUpdateNegocio,
  onDeleteNegocio,
}: {
  parceiros: Parceiro[]
  negocios: NegocioParceiro[]
  lotes?: Lote[]
  onAddParceiro: (p: Parceiro) => void
  onUpdateParceiro: (p: Parceiro) => void
  onDeleteParceiro: (id: string) => void
  onAddNegocio: (n: NegocioParceiro) => void
  onUpdateNegocio: (n: NegocioParceiro) => void
  onDeleteNegocio: (id: string) => void
}) {
  const [tab, setTab]                       = useState<"parceiros" | "negocios">("parceiros")
  const [modalParceiro, setModalParceiro]   = useState<Parceiro | true | null>(null)
  const [modalNegocio, setModalNegocio]     = useState<NegocioParceiro | true | null>(null)
  const [filtroParceiro, setFiltroParceiro] = useState("")
  const [filtroStatus, setFiltroStatus]     = useState<StatusNegocio | "">("")
  const [confirmarExcluir, setConfirmarExcluir] = useState<{ tipo: "parceiro" | "negocio"; id: string } | null>(null)

  // Stats
  const totalComissao = useMemo(() =>
    negocios.filter(n => n.status !== "cancelado").reduce((s, n) => s + n.comissaoValor, 0), [negocios])
  const comissaoPaga = useMemo(() =>
    negocios.filter(n => n.status === "pago").reduce((s, n) => s + n.comissaoValor, 0), [negocios])
  const comissaoPendente = useMemo(() =>
    negocios.filter(n => n.status === "pendente").reduce((s, n) => s + n.comissaoValor, 0), [negocios])

  // Per-partner stats
  const statsParc = useMemo(() => {
    const m: Record<string, { deals: number; total: number }> = {}
    for (const n of negocios) {
      if (n.status === "cancelado") continue
      if (!m[n.parceiroId]) m[n.parceiroId] = { deals: 0, total: 0 }
      m[n.parceiroId].deals++
      m[n.parceiroId].total += n.comissaoValor
    }
    return m
  }, [negocios])

  const negociosFiltrados = useMemo(() => {
    return negocios
      .filter(n => !filtroParceiro || n.parceiroId === filtroParceiro)
      .filter(n => !filtroStatus || n.status === filtroStatus)
  }, [negocios, filtroParceiro, filtroStatus])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-6 pb-0 shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[18px] font-black text-slate-800">Parceiros comerciais</h1>
            <p className="text-[12px] text-slate-400 mt-0.5">Gestão de parceiros e negócios gerados</p>
          </div>
          <button
            onClick={() => tab === "parceiros" ? setModalParceiro(true) : setModalNegocio(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-[12.5px] font-semibold rounded-xl transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {tab === "parceiros" ? "Novo parceiro" : "Registrar negócio"}
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <KpiParceiro label="Total gerado" value={brl(totalComissao)} sub={`${negocios.filter(n => n.status !== "cancelado").length} negócios`} color="blue" />
          <KpiParceiro label="Recebido / Pago" value={brl(comissaoPaga)} sub={`${negocios.filter(n => n.status === "pago").length} pagos`} color="green" />
          <KpiParceiro label="Pendente" value={brl(comissaoPendente)} sub={`${negocios.filter(n => n.status === "pendente").length} aguardando`} color="amber" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-100">
          {(["parceiros", "negocios"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-[12.5px] font-semibold border-b-2 transition-colors -mb-px ${
                tab === t
                  ? "border-slate-800 text-slate-800"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}>
              {t === "parceiros" ? `Parceiros (${parceiros.length})` : `Negócios (${negocios.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-5">

        {/* ── Tab: Parceiros ── */}
        {tab === "parceiros" && (
          <>
            {parceiros.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                  </svg>
                </div>
                <p className="text-[13px] font-semibold text-slate-500">Nenhum parceiro cadastrado</p>
                <p className="text-[12px] text-slate-400 mt-1">Clique em "Novo parceiro" para começar.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {parceiros.map(p => {
                  const st = statsParc[p.id]
                  return (
                    <div key={p.id}
                      className="bg-white border border-slate-100 rounded-2xl px-5 py-4 flex items-center gap-4 hover:border-slate-200 transition-colors group">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-600 font-black text-[15px]">
                        {p.nome[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-800 text-[13.5px]">{p.nome}</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                            {p.categoria}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {p.contato && (
                            <span className="text-[11.5px] text-slate-400">{p.contato}</span>
                          )}
                          {p.comissaoDefault > 0 && (
                            <span className="text-[11.5px] text-slate-400">Comissão padrão: {p.comissaoDefault}%</span>
                          )}
                        </div>
                      </div>
                      {/* Stats */}
                      <div className="text-right shrink-0 hidden sm:block">
                        <p className="font-bold text-slate-800 text-[13px]">{brl(st?.total ?? 0)}</p>
                        <p className="text-[10.5px] text-slate-400">{st?.deals ?? 0} negócio{(st?.deals ?? 0) !== 1 ? "s" : ""}</p>
                      </div>
                      {/* Actions */}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setModalParceiro(p)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setConfirmarExcluir({ tipo: "parceiro", id: p.id })}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── Tab: Negócios ── */}
        {tab === "negocios" && (
          <>
            {/* Filtros */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <select
                value={filtroParceiro}
                onChange={e => setFiltroParceiro(e.target.value)}
                className="h-8 border border-slate-200 rounded-lg px-3 text-[12px] text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                <option value="">Todos os parceiros</option>
                {parceiros.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <select
                value={filtroStatus}
                onChange={e => setFiltroStatus(e.target.value as StatusNegocio | "")}
                className="h-8 border border-slate-200 rounded-lg px-3 text-[12px] text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                <option value="">Todos os status</option>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>

            {negociosFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-[13px] font-semibold text-slate-500">Nenhum negócio registrado</p>
                <p className="text-[12px] text-slate-400 mt-1">Registre vendas feitas através de parceiros.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {negociosFiltrados.map(n => (
                  <div key={n.id}
                    className="bg-white border border-slate-100 rounded-2xl px-5 py-4 hover:border-slate-200 transition-colors group">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-800 text-[13px]">{n.descricao}</span>
                          {pill(n.tipo === "comissao" ? "Comissão" : "Ganho", "bg-violet-50 text-violet-700 border-violet-200")}
                          {pill(STATUS_LABEL[n.status], STATUS_CLS[n.status])}
                          {n.loteNumero && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-violet-100 text-violet-700 border-violet-200">
                              {n.loteNumero}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-[11.5px] font-medium text-slate-500">{n.parceiroNome}</span>
                          <span className="text-[11px] text-slate-400">{formatDate(n.dataOrcamento)}</span>
                        </div>
                        {n.loteId && (
                          <div className="flex gap-1 mt-2">
                            {PARTNER_STEPS.map((step, i) => {
                              const currentIdx = PARTNER_STEPS.findIndex(s => s.id === (n.statusLote ?? "aguardando"))
                              const done = i <= currentIdx
                              return (
                                <button
                                  key={step.id}
                                  onClick={() => onUpdateNegocio({ ...n, statusLote: step.id })}
                                  title={step.label}
                                  className={`flex-1 h-5 rounded text-[9px] font-bold transition-colors ${
                                    done
                                      ? "bg-amber-400 text-white"
                                      : "bg-slate-100 text-slate-400 hover:bg-amber-100 hover:text-amber-600"
                                  }`}>
                                  {step.label.split(" ")[0]}
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {n.obs && (
                          <p className="text-[11px] text-slate-400 italic mt-1">{n.obs}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-slate-800 text-[14px] tabular-nums">
                          {brl(n.comissaoValor)}
                        </p>
                        <p className="text-[10.5px] text-slate-400 tabular-nums">
                          {n.tipo === "comissao"
                            ? `${n.comissaoPerc.toFixed(1)}% de ${brl(n.valorVenda)}`
                            : `${brl(n.valorVenda)} venda`}
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setModalNegocio(n)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setConfirmarExcluir({ tipo: "negocio", id: n.id })}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {modalParceiro && (
        <ModalParceiro
          inicial={modalParceiro === true ? undefined : modalParceiro}
          onSave={p => modalParceiro === true ? onAddParceiro(p) : onUpdateParceiro(p)}
          onClose={() => setModalParceiro(null)}
        />
      )}

      {modalNegocio && (
        <ModalNegocio
          inicial={modalNegocio === true ? undefined : modalNegocio}
          parceiros={parceiros}
          lotes={lotes}
          onSave={n => modalNegocio === true ? onAddNegocio(n) : onUpdateNegocio(n)}
          onClose={() => setModalNegocio(null)}
        />
      )}

      {/* Confirmar exclusão */}
      {confirmarExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 p-6 text-center">
            <p className="font-bold text-slate-800 text-[14px] mb-1">Confirmar exclusão</p>
            <p className="text-[12px] text-slate-400 mb-5">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmarExcluir(null)}
                className="flex-1 py-2.5 text-[12.5px] font-medium text-slate-500 hover:bg-slate-50 rounded-xl transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (confirmarExcluir.tipo === "parceiro") onDeleteParceiro(confirmarExcluir.id)
                  else onDeleteNegocio(confirmarExcluir.id)
                  setConfirmarExcluir(null)
                }}
                className="flex-1 py-2.5 text-[12.5px] font-semibold text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-colors">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function KpiParceiro({ label, value, sub, color }: {
  label: string; value: string; sub: string; color: "blue" | "green" | "amber"
}) {
  const accent = color === "blue" ? "text-blue-700"
               : color === "green" ? "text-emerald-700"
               : "text-amber-600"
  return (
    <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
      <p className={`font-black text-[17px] tabular-nums mt-0.5 ${accent}`}>{value}</p>
      <p className="text-[10.5px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] uppercase tracking-[0.08em] text-slate-400 font-semibold mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

function input() {
  return "w-full h-9 border border-slate-200 rounded-lg px-3 text-[12.5px] text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
}

function formatDate(iso: string) {
  if (!iso) return ""
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })
  } catch { return iso }
}
