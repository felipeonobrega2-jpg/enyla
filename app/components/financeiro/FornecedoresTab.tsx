"use client"
import { useState } from "react"
import { Factory } from "lucide-react"
import { Fornecedor, Configuracoes } from "../../config"
import { LancamentoFinanceiro } from "../../types"

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function fmtDate(s: string) {
  if (!s) return "—"
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })
}

function hoje() {
  return new Date().toISOString().split("T")[0]
}

type Props = {
  config: Configuracoes
  lancamentos: LancamentoFinanceiro[]
  onUpdateConfig: (cfg: Configuracoes) => void
  onAddLancamento?: (l: LancamentoFinanceiro) => void
  onDeleteLancamento?: (id: string) => void
}

export function FornecedoresTab({ config, lancamentos, onUpdateConfig, onAddLancamento, onDeleteLancamento }: Props) {
  const fornecedores = config.fornecedores ?? []
  const [modal, setModal] = useState<Fornecedor | true | null>(null)
  const [modalConta, setModalConta] = useState<Fornecedor | null>(null)
  const [busca, setBusca] = useState("")

  function save(f: Fornecedor) {
    const next = fornecedores.find(x => x.id === f.id)
      ? fornecedores.map(x => x.id === f.id ? f : x)
      : [...fornecedores, f]
    onUpdateConfig({ ...config, fornecedores: next })
    setModal(null)
  }

  function del(id: string) {
    if (!confirm("Excluir este fornecedor?")) return
    onUpdateConfig({ ...config, fornecedores: fornecedores.filter(f => f.id !== id) })
  }

  function toggle(id: string) {
    onUpdateConfig({ ...config, fornecedores: fornecedores.map(f => f.id === id ? { ...f, ativo: !f.ativo } : f) })
  }

  function toggleConta(id: string) {
    onUpdateConfig({ ...config, fornecedores: fornecedores.map(f => f.id === id ? { ...f, conta: !f.conta } : f) })
  }

  function saldoConta(fornId: string): number {
    return lancamentos
      .filter(l => l.fornecedorId === fornId && l.formaPagamento === "conta")
      .reduce((s, l) => s + (l.tipo === "despesa" ? l.valor : -l.valor), 0)
  }

  const ativos = fornecedores.filter(f => f.ativo)
  const contaAtivos = fornecedores.filter(f => f.conta && f.ativo)
  const categorias = [...new Set(fornecedores.map(f => f.categoria).filter(Boolean))]

  const lista = fornecedores.filter(f => {
    if (!busca) return true
    const q = busca.toLowerCase()
    return f.nome.toLowerCase().includes(q) || f.categoria.toLowerCase().includes(q) || (f.contato ?? "").toLowerCase().includes(q)
  })

  return (
    <div className="max-w-2xl space-y-5">

      {/* Cards de conta por fornecedor */}
      {contaAtivos.length > 0 && (
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-faint)" }}>
            Contas abertas
          </p>
          <div className="grid grid-cols-1 gap-2">
            {contaAtivos.map(f => {
              const saldo = saldoConta(f.id)
              const entradas = lancamentos.filter(l => l.fornecedorId === f.id && l.formaPagamento === "conta")
              const pendentes = entradas.filter(l => l.status !== "pago").length
              return (
                <button key={f.id}
                  onClick={() => setModalConta(f)}
                  className="rounded-2xl px-5 py-4 flex items-center gap-4 w-full text-left hover:brightness-95 active:scale-[.99] transition-all"
                  style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.07),0 1px 2px rgba(0,0,0,0.04)" }}>
                  <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-[15px] font-bold text-white"
                    style={{ background: strToColor(f.nome) }}>
                    {f.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-semibold text-[13px]" style={{ color: "var(--text-main)" }}>{f.nome}</p>
                    <p className="text-[10.5px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                      {pendentes > 0 ? `${pendentes} lançamento${pendentes > 1 ? "s" : ""} em aberto` : "Sem lançamentos"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-[18px] font-bold tabular-nums ${saldo > 0 ? "text-rose-600" : saldo < 0 ? "text-emerald-600" : "text-[#8E8E93]"}`}>
                      {saldo > 0 ? "−" : saldo < 0 ? "+" : ""}{brl(Math.abs(saldo))}
                    </p>
                    <p className="text-[9.5px] font-medium mt-0.5" style={{ color: "var(--text-faint)" }}>
                      {saldo > 0 ? "você deve" : saldo < 0 ? "eles devem" : "quitado"}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Total cadastrados" value={String(fornecedores.length)} />
        <Kpi label="Ativos" value={String(ativos.length)} color="green" />
        <Kpi label="Categorias" value={String(categorias.length)} />
      </div>

      {/* Busca + Adicionar */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 h-9 border border-[rgba(60,60,67,0.12)] rounded-xl px-3 bg-white">
          <svg className="w-3.5 h-3.5 text-[#898892] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
          </svg>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar fornecedor…"
            className="flex-1 text-[12.5px] text-[#191625] placeholder:text-[#898892] bg-transparent focus:outline-none"
          />
          {busca && <button onClick={() => setBusca("")} className="text-[#898892] text-base leading-none">×</button>}
        </div>
        <button onClick={() => setModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#161421] hover:bg-[#0b0914] text-white text-[12.5px] font-semibold rounded-xl transition-colors shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Novo
        </button>
      </div>

      {/* Lista */}
      {lista.length === 0 ? (
        <div className="py-20 text-center space-y-2">
          <div className="flex justify-center mb-1"><Factory className="w-9 h-9 text-[#c7c7cc]" /></div>
          <p className="text-[13px] font-semibold text-[#5e5c68]">
            {busca ? "Nenhum fornecedor encontrado" : "Nenhum fornecedor cadastrado"}
          </p>
          {!busca && <p className="text-[12px] text-[#8E8E93]">Cadastre papelarias, gráficas parceiras, serviços e qualquer fornecedor recorrente</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map(f => (
            <div key={f.id}
              className={`bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl px-5 py-4 flex items-center gap-4 transition-opacity ${!f.ativo ? "opacity-50" : ""}`}>
              <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-[15px] font-bold text-white"
                style={{ background: strToColor(f.nome) }}>
                {f.nome.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <p className="font-semibold text-[13px] text-[#191625]">{f.nome}</p>
                  {f.categoria && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(116,116,128,0.08)] text-[#8E8E93] font-medium">
                      {f.categoria}
                    </span>
                  )}
                  {f.conta && (
                    <span className="text-[9.5px] px-1.5 py-0.5 rounded-full font-bold bg-amber-50 text-amber-600 border border-amber-200">
                      Conta
                    </span>
                  )}
                  {!f.ativo && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(116,116,128,0.08)] text-[#8E8E93] font-medium">Inativo</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[#8E8E93]">
                  {f.contato && <span>{f.contato}</span>}
                  {f.telefone && <span>{f.telefone}</span>}
                  {f.email && <span>{f.email}</span>}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => toggleConta(f.id)} title={f.conta ? "Desativar conta" : "Ativar conta"}
                  className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
                    f.conta
                      ? "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100"
                      : "bg-[rgba(116,116,128,0.07)] text-[#8E8E93] border-transparent hover:bg-[rgba(116,116,128,0.13)]"
                  }`}>
                  {f.conta ? "Conta ativa" : "Conta"}
                </button>
                <button onClick={() => toggle(f.id)}
                  className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-[rgba(116,116,128,0.08)] text-[#72707d] hover:bg-[rgba(116,116,128,0.14)] transition-colors">
                  {f.ativo ? "Desativar" : "Ativar"}
                </button>
                <button onClick={() => setModal(f)}
                  className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-[rgba(116,116,128,0.08)] text-[#72707d] hover:bg-[rgba(116,116,128,0.14)] transition-colors">
                  Editar
                </button>
                <button onClick={() => del(f.id)}
                  className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ModalFornecedor
          inicial={modal === true ? null : modal}
          categoriasExistentes={categorias}
          onSave={save}
          onClose={() => setModal(null)}
        />
      )}

      {modalConta && (
        <ModalContaFornecedor
          fornecedor={modalConta}
          lancamentos={lancamentos.filter(l => l.fornecedorId === modalConta.id && l.formaPagamento === "conta")}
          onAddLancamento={onAddLancamento}
          onDeleteLancamento={onDeleteLancamento}
          onClose={() => setModalConta(null)}
        />
      )}
    </div>
  )
}

/* ─── Modal Conta do Fornecedor ─── */
function ModalContaFornecedor({
  fornecedor, lancamentos, onAddLancamento, onDeleteLancamento, onClose,
}: {
  fornecedor: Fornecedor
  lancamentos: LancamentoFinanceiro[]
  onAddLancamento?: (l: LancamentoFinanceiro) => void
  onDeleteLancamento?: (id: string) => void
  onClose: () => void
}) {
  const [editandoSaldo, setEditandoSaldo] = useState(false)
  const [novoSaldo, setNovoSaldo] = useState("")

  const saldo = lancamentos.reduce((s, l) => s + (l.tipo === "despesa" ? l.valor : -l.valor), 0)
  const sorted = [...lancamentos].sort((a, b) => {
    const da = a.dataPagamento || a.dataVencimento
    const db = b.dataPagamento || b.dataVencimento
    return db.localeCompare(da)
  })

  function salvarSaldo() {
    const novo = parseFloat(novoSaldo.replace(",", "."))
    if (isNaN(novo) || !onAddLancamento) { setEditandoSaldo(false); return }
    const diff = novo - saldo // positivo = você deve mais, negativo = pagou
    if (Math.abs(diff) < 0.01) { setEditandoSaldo(false); return }
    // diff > 0 => adicionar despesa; diff < 0 => adicionar receita (quitação)
    onAddLancamento({
      id:             Date.now().toString(),
      tipo:           diff > 0 ? "despesa" : "receita",
      descricao:      `Ajuste de saldo — ${fornecedor.nome}`,
      valor:          Math.abs(diff),
      dataVencimento: hoje(),
      dataPagamento:  diff < 0 ? hoje() : undefined,
      status:         diff < 0 ? "pago" : "pendente",
      fornecedorId:   fornecedor.id,
      formaPagamento: "conta",
      criadoEm:       new Date().toLocaleString("pt-BR"),
    } as LancamentoFinanceiro)
    setEditandoSaldo(false)
    setNovoSaldo("")
  }

  const isPositive = saldo > 0
  const saldoColor = saldo > 0 ? "#dc2626" : saldo < 0 ? "#059669" : "#8E8E93"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col overflow-hidden" style={{ maxHeight: "88vh" }}>

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[14px] font-bold text-white shrink-0"
              style={{ background: strToColor(fornecedor.nome) }}>
              {fornecedor.nome.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-[#191625] text-[14px] leading-tight">{fornecedor.nome}</p>
              <p className="text-[10.5px] text-[#8E8E93]">Conta corrente</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#898892] hover:text-[#8E8E93] text-xl leading-none">×</button>
        </div>

        {/* Saldo */}
        <div className="px-5 py-5 border-b border-[rgba(60,60,67,0.08)] shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E93] mb-2">Saldo em aberto</p>
          <div className="flex items-center gap-2">
            {editandoSaldo ? (
              <>
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  value={novoSaldo}
                  onChange={e => setNovoSaldo(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") salvarSaldo(); if (e.key === "Escape") setEditandoSaldo(false) }}
                  placeholder={String(saldo.toFixed(2))}
                  className="flex-1 text-[22px] font-bold tabular-nums border-b-2 border-[#8456e8] bg-transparent focus:outline-none pb-0.5"
                  style={{ color: saldoColor }}
                />
                <button onClick={salvarSaldo}
                  className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-[#161421] rounded-lg transition-colors shrink-0">
                  OK
                </button>
                <button onClick={() => setEditandoSaldo(false)}
                  className="px-2.5 py-1.5 text-[11.5px] font-medium text-[#8E8E93] hover:text-[#5e5c68] shrink-0">
                  ✕
                </button>
              </>
            ) : (
              <>
                <p className="text-[26px] font-bold tabular-nums flex-1" style={{ color: saldoColor }}>
                  {saldo > 0 ? "−" : saldo < 0 ? "+" : ""}{brl(Math.abs(saldo))}
                </p>
                <p className="text-[11px] text-[#8E8E93] mr-1">
                  {saldo > 0 ? "você deve" : saldo < 0 ? "eles devem" : "quitado"}
                </p>
                {onAddLancamento && (
                  <button onClick={() => { setNovoSaldo(String(saldo.toFixed(2))); setEditandoSaldo(true) }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[rgba(116,116,128,0.1)] transition-colors text-[#8E8E93] hover:text-[#5e5c68]">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 0 1 2.828 0l.172.172a2 2 0 0 1 0 2.828L12 16H9v-3z" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Lista de lançamentos */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E93] mb-3">
            Lançamentos · {sorted.length}
          </p>
          {sorted.length === 0 ? (
            <p className="text-[12px] text-[#8E8E93] text-center py-8">Nenhum lançamento ainda.</p>
          ) : (
            <div className="space-y-px">
              {sorted.map(l => {
                const isDebt = l.tipo === "despesa"
                const ref = l.loteNumero || l.cardNumero
                return (
                  <div key={l.id} className="flex items-center gap-3 py-3 border-b border-[rgba(60,60,67,0.06)] last:border-0">
                    <div className={`w-1 h-7 rounded-full shrink-0 ${isDebt ? "bg-rose-400" : "bg-emerald-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium text-[#191625] truncate leading-tight">{l.descricao}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10.5px] text-[#8E8E93]">{fmtDate(l.dataPagamento || l.dataVencimento)}</span>
                        {ref && (
                          <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full bg-[#8456e8]/10 text-[#8456e8]">
                            #{ref}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className={`text-[13px] font-bold tabular-nums shrink-0 ${isDebt ? "text-rose-600" : "text-emerald-600"}`}>
                      {isDebt ? "−" : "+"}{brl(l.valor)}
                    </p>
                    {onDeleteLancamento && (
                      <button onClick={() => { if (confirm("Remover?")) onDeleteLancamento(l.id) }}
                        className="w-6 h-6 flex items-center justify-center rounded-md text-[#D1D1D6] hover:text-rose-500 hover:bg-rose-50 transition-colors shrink-0">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Modal Editar Fornecedor ─── */
function ModalFornecedor({ inicial, categoriasExistentes, onSave, onClose }: {
  inicial: Fornecedor | null
  categoriasExistentes: string[]
  onSave: (f: Fornecedor) => void
  onClose: () => void
}) {
  const [nome, setNome]     = useState(inicial?.nome ?? "")
  const [cat, setCat]       = useState(inicial?.categoria ?? "")
  const [catInput, setCatInput] = useState(inicial?.categoria ?? "")
  const [showCatList, setShowCatList] = useState(false)
  const [contato, setContato] = useState(inicial?.contato ?? "")
  const [tel, setTel]       = useState(inicial?.telefone ?? "")
  const [email, setEmail]   = useState(inicial?.email ?? "")
  const [obs, setObs]       = useState(inicial?.obs ?? "")
  const [conta, setConta]   = useState(inicial?.conta ?? false)

  function salvar() {
    if (!nome.trim()) return
    onSave({
      id:       inicial?.id ?? Date.now().toString(),
      nome:     nome.trim(),
      categoria: (catInput || cat).trim(),
      contato:  contato.trim() || undefined,
      telefone: tel.trim() || undefined,
      email:    email.trim() || undefined,
      obs:      obs.trim() || undefined,
      conta,
      ativo:    inicial?.ativo ?? true,
    })
  }

  const cls = "w-full h-9 border border-[rgba(60,60,67,0.12)] rounded-lg px-3 text-[12.5px] text-[#5e5c68] bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
  const catsFiltradas = categoriasExistentes.filter(c => c.toLowerCase().includes(catInput.toLowerCase()))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col overflow-hidden" style={{ maxHeight: "90vh" }}>
        <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] flex items-center justify-between shrink-0">
          <p className="font-bold text-[#191625] text-[14px]">{inicial ? "Editar fornecedor" : "Novo fornecedor"}</p>
          <button onClick={onClose} className="text-[#898892] hover:text-[#8E8E93] text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <Fld label="Nome *">
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Papel Express" className={cls} />
          </Fld>
          <Fld label="Categoria / O que fornece">
            <div className="relative">
              <input
                value={catInput}
                onChange={e => { setCatInput(e.target.value); setCat(e.target.value); setShowCatList(true) }}
                onFocus={() => setShowCatList(true)}
                onBlur={() => setTimeout(() => setShowCatList(false), 150)}
                placeholder="Ex: Papel, Tinta, Serviços…"
                className={cls}
              />
              {showCatList && catsFiltradas.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-[rgba(60,60,67,0.12)] rounded-xl shadow-lg overflow-hidden">
                  {catsFiltradas.map(c => (
                    <button key={c} onMouseDown={() => { setCatInput(c); setCat(c); setShowCatList(false) }}
                      className="w-full text-left px-3 py-2 text-[12px] text-[#191625] hover:bg-[#F2F2F7] transition-colors">
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Fld>
          <Fld label="Contato / Nome do responsável">
            <input value={contato} onChange={e => setContato(e.target.value)} placeholder="Ex: João da Silva" className={cls} />
          </Fld>
          <Fld label="Telefone / WhatsApp">
            <input value={tel} onChange={e => setTel(e.target.value)} placeholder="(11) 99999-9999" className={cls} />
          </Fld>
          <Fld label="E-mail">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@fornecedor.com.br" className={cls} />
          </Fld>
          <Fld label="Observações">
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              placeholder="Condições de pagamento, prazo de entrega…"
              className={`${cls} h-auto resize-none py-2`} />
          </Fld>
          <button onClick={() => setConta(v => !v)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
              conta
                ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-[rgba(116,116,128,0.05)] border-[rgba(60,60,67,0.10)] text-[#5e5c68]"
            }`}>
            <div className="text-left">
              <p className="text-[12.5px] font-semibold">Função de Conta</p>
              <p className="text-[10.5px] mt-0.5 opacity-70">Registra custos na conta deste fornecedor</p>
            </div>
            <div className={`w-10 h-6 rounded-full transition-all relative ${conta ? "bg-amber-500" : "bg-[#D1D1D6]"}`}>
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow-sm ${conta ? "left-[18px]" : "left-0.5"}`} />
            </div>
          </button>
        </div>
        <div className="px-6 pb-5 flex gap-2 border-t border-[rgba(60,60,67,0.08)] pt-4 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-[12.5px] font-medium text-[#8E8E93] hover:bg-[rgba(116,116,128,0.04)] rounded-xl transition-colors">
            Cancelar
          </button>
          <button disabled={!nome.trim()} onClick={salvar}
            className="flex-1 py-2.5 text-[12.5px] font-semibold text-white bg-[#161421] hover:bg-[#0b0914] rounded-xl transition-colors disabled:opacity-40">
            {inicial ? "Salvar" : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: string; color?: "green" }) {
  return (
    <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">{label}</p>
      <p className={`font-semibold text-[17px] mt-0.5 ${color === "green" ? "text-emerald-700" : "text-[#191625]"}`}>{value}</p>
    </div>
  )
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] uppercase text-[#8E8E93] font-semibold mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function strToColor(s: string): string {
  const PALETTE = ["#3b82f6","#10b981","#8b5cf6","#f59e0b","#ef4444","#6366f1","#0ea5e9","#ec4899","#14b8a6","#f97316"]
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash)
  return PALETTE[Math.abs(hash) % PALETTE.length]
}
