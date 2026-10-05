"use client"
import { useState } from "react"
import { Landmark, PiggyBank, CreditCard, Wallet } from "lucide-react"
import { ContaBancaria, Configuracoes } from "../../config"
import { brl } from "../../utils"

const TIPOS: { value: ContaBancaria["tipo"]; label: string; Icon: React.ElementType; cor: string }[] = [
  { value: "corrente", label: "Conta corrente",    Icon: Landmark,    cor: "#3b82f6" },
  { value: "poupanca", label: "Poupança",           Icon: PiggyBank,   cor: "#10b981" },
  { value: "credito",  label: "Cartão de crédito", Icon: CreditCard,  cor: "#8b5cf6" },
  { value: "debito",   label: "Cartão de débito",  Icon: Wallet,      cor: "#f59e0b" },
]

const CORES = ["#3b82f6","#10b981","#8b5cf6","#f59e0b","#ef4444","#6366f1","#0ea5e9","#ec4899","#14b8a6","#f97316"]

type Props = {
  config: Configuracoes
  onUpdateConfig: (cfg: Configuracoes) => void
}

export function ContasTab({ config, onUpdateConfig }: Props) {
  const contas = config.contas ?? []
  const [modal, setModal] = useState<ContaBancaria | true | null>(null)
  const [editandoSaldo, setEditandoSaldo] = useState<string | null>(null)
  const [saldoTemp, setSaldoTemp] = useState("")

  function save(c: ContaBancaria) {
    const next = contas.find(x => x.id === c.id)
      ? contas.map(x => x.id === c.id ? c : x)
      : [...contas, c]
    onUpdateConfig({ ...config, contas: next })
    setModal(null)
  }

  function del(id: string) {
    if (!confirm("Excluir esta conta?")) return
    onUpdateConfig({ ...config, contas: contas.filter(c => c.id !== id) })
  }

  function toggle(id: string) {
    onUpdateConfig({ ...config, contas: contas.map(c => c.id === id ? { ...c, ativa: !c.ativa } : c) })
  }

  function setPadrao(id: string) {
    onUpdateConfig({ ...config, contas: contas.map(c => ({ ...c, padrao: c.id === id ? !c.padrao : false })) })
  }

  function iniciarEdicaoSaldo(c: ContaBancaria) {
    setEditandoSaldo(c.id)
    setSaldoTemp(c.saldo != null ? String(c.saldo) : "")
  }

  function salvarSaldo(id: string) {
    const valor = parseFloat(saldoTemp.replace(",", "."))
    onUpdateConfig({
      ...config,
      contas: contas.map(c => c.id === id ? { ...c, saldo: isNaN(valor) ? undefined : valor } : c),
    })
    setEditandoSaldo(null)
  }

  const ativas = contas.filter(c => c.ativa)
  const totalCaixa = ativas.filter(c => c.tipo !== "credito").reduce((s, c) => s + (c.saldo ?? 0), 0)
  const totalCredito = ativas.filter(c => c.tipo === "credito").reduce((s, c) => s + (c.limite ?? 0), 0)
  const contasComSaldo = ativas.filter(c => c.tipo !== "credito" && c.saldo != null).length
  const totalContas = ativas.filter(c => c.tipo !== "credito").length

  return (
    <div className="max-w-2xl space-y-5">
      {/* KPI principal de caixa */}
      {contasComSaldo > 0 && (
        <div className="rounded-2xl px-5 py-4"
          style={{ background: "var(--bg-surface)", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
          <p className="text-[10.5px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-faint)" }}>Caixa disponível</p>
          <p className="text-[28px] font-bold tabular-nums tracking-tight" style={{ color: totalCaixa >= 0 ? "#009351" : "#d33a3c" }}>
            {brl(totalCaixa)}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
            {contasComSaldo} de {totalContas} conta{totalContas !== 1 ? "s" : ""} com saldo informado
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiBox label="Contas ativas" value={String(ativas.filter(c => c.tipo !== "credito").length)} />
        <KpiBox label="Cartões ativos" value={String(ativas.filter(c => c.tipo === "credito" || c.tipo === "debito").length)} />
        <KpiBox label="Limite total crédito" value={brl(totalCredito)} color="violet" />
      </div>

      {/* Lista */}
      {contas.length === 0 ? (
        <div className="py-20 text-center space-y-2">
          <div className="flex justify-center mb-1"><Landmark className="w-9 h-9 text-[#c7c7cc]" /></div>
          <p className="text-[13px] font-semibold text-[#5e5c68]">Nenhuma conta cadastrada</p>
          <p className="text-[12px] text-[#8E8E93]">Adicione contas bancárias e cartões para vincular nos lançamentos</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contas.map(c => {
            const t = TIPOS.find(x => x.value === c.tipo)!
            const isEd = editandoSaldo === c.id
            const isDebitoConta = c.tipo !== "credito"
            return (
              <div key={c.id}
                className={`bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl px-5 py-4 transition-opacity ${!c.ativa ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center"
                    style={{ background: `${c.cor}18`, border: `1.5px solid ${c.cor}30` }}>
                    <t.Icon className="w-5 h-5" style={{ color: c.cor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-[13px] text-[#191625]">{c.nome}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: `${c.cor}18`, color: c.cor }}>
                        {t.label}
                      </span>
                      {c.padrao && (
                        <span className="text-[9.5px] px-1.5 py-0.5 rounded-full font-bold bg-[#8456e8]/10 text-[#8456e8] border border-[#8456e8]/20">
                          Padrão
                        </span>
                      )}
                      {!c.ativa && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(116,116,128,0.08)] text-[#8E8E93] font-medium">Inativa</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {c.banco && <span className="text-[11px] text-[#8E8E93]">{c.banco}</span>}
                      {c.tipo === "credito" && c.limite && (
                        <span className="text-[11px] text-[#8E8E93]">· Limite {brl(c.limite)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => setPadrao(c.id)} title={c.padrao ? "Remover padrão" : "Definir como padrão"}
                      className={`p-1.5 rounded-lg transition-colors ${c.padrao ? "text-[#8456e8] bg-[#8456e8]/10" : "text-[#C7C7CC] hover:text-[#8456e8] hover:bg-[#8456e8]/08"}`}>
                      <svg className="w-4 h-4" fill={c.padrao ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                      </svg>
                    </button>
                    <button onClick={() => toggle(c.id)}
                      className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-[rgba(116,116,128,0.08)] text-[#72707d] hover:bg-[rgba(116,116,128,0.14)] transition-colors">
                      {c.ativa ? "Desativar" : "Ativar"}
                    </button>
                    <button onClick={() => setModal(c)}
                      className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-[rgba(116,116,128,0.08)] text-[#72707d] hover:bg-[rgba(116,116,128,0.14)] transition-colors">
                      Editar
                    </button>
                    <button onClick={() => del(c.id)}
                      className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors">
                      ✕
                    </button>
                  </div>
                </div>

                {/* Saldo — apenas contas/poupança/débito */}
                {isDebitoConta && (
                  <div className="mt-3 pt-3 flex items-center gap-3" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                      Saldo atual
                    </span>
                    {isEd ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-[#8E8E93]">R$</span>
                        <input
                          autoFocus
                          type="number"
                          step="0.01"
                          value={saldoTemp}
                          onChange={e => setSaldoTemp(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") salvarSaldo(c.id); if (e.key === "Escape") setEditandoSaldo(null) }}
                          onBlur={() => salvarSaldo(c.id)}
                          className="w-32 h-7 border border-[rgba(60,60,67,0.18)] rounded-lg px-2 text-[12.5px] font-semibold text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400"
                          placeholder="0,00"
                        />
                        <button onClick={() => salvarSaldo(c.id)}
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#161421] text-white">
                          OK
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => iniciarEdicaoSaldo(c)}
                        className="flex items-center gap-1.5 group">
                        <span className={`text-[15px] font-bold tabular-nums transition-colors ${
                          c.saldo == null ? "text-[#C7C7CC]" :
                          c.saldo >= 0 ? "text-[#009351]" : "text-[#d33a3c]"
                        }`}>
                          {c.saldo != null ? brl(c.saldo) : "—"}
                        </span>
                        <svg className="w-3 h-3 text-[#C7C7CC] group-hover:text-[#8E8E93] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    )}
                    {c.saldo != null && !isEd && (
                      <span className="text-[10px] text-[#8E8E93] ml-auto">clique para atualizar</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <button onClick={() => setModal(true)}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#161421] hover:bg-[#0b0914] text-white text-[12.5px] font-semibold rounded-xl transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Adicionar conta ou cartão
      </button>

      {modal && (
        <ModalConta
          inicial={modal === true ? null : modal}
          onSave={save}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function ModalConta({ inicial, onSave, onClose }: {
  inicial: ContaBancaria | null
  onSave: (c: ContaBancaria) => void
  onClose: () => void
}) {
  const [nome, setNome]   = useState(inicial?.nome ?? "")
  const [banco, setBanco] = useState(inicial?.banco ?? "")
  const [tipo, setTipo]   = useState<ContaBancaria["tipo"]>(inicial?.tipo ?? "corrente")
  const [cor, setCor]     = useState(inicial?.cor ?? CORES[0])
  const [limite, setLimite] = useState(String(inicial?.limite ?? ""))
  const [saldo, setSaldo]   = useState(inicial?.saldo != null ? String(inicial.saldo) : "")

  function salvar() {
    if (!nome.trim()) return
    const saldoNum = parseFloat(saldo.replace(",", "."))
    onSave({
      id:     inicial?.id ?? Date.now().toString(),
      nome:   nome.trim(),
      banco:  banco.trim(),
      tipo,
      cor,
      limite: tipo === "credito" ? (parseFloat(limite) || undefined) : undefined,
      saldo:  tipo !== "credito" && !isNaN(saldoNum) ? saldoNum : undefined,
      padrao: inicial?.padrao ?? false,
      ativa:  inicial?.ativa ?? true,
    })
  }

  const cls = "w-full h-9 border border-[rgba(60,60,67,0.12)] rounded-lg px-3 text-[12.5px] text-[#5e5c68] bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] flex items-center justify-between">
          <p className="font-bold text-[#191625] text-[14px]">{inicial ? "Editar conta" : "Nova conta / cartão"}</p>
          <button onClick={onClose} className="text-[#898892] hover:text-[#8E8E93] text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: "60vh" }}>
          <Fld label="Nome *">
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Conta Itaú" className={cls} />
          </Fld>
          <Fld label="Banco / Instituição">
            <input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Ex: Itaú, Nubank, Inter…" className={cls} />
          </Fld>
          <Fld label="Tipo">
            <div className="grid grid-cols-2 gap-2">
              {TIPOS.map(t => (
                <button key={t.value} onClick={() => setTipo(t.value)}
                  className={`py-2 rounded-lg border text-[11.5px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
                    tipo === t.value
                      ? "text-white border-transparent"
                      : "border-[rgba(60,60,67,0.12)] text-[#8E8E93] hover:border-slate-300"
                  }`}
                  style={tipo === t.value ? { background: t.cor } : {}}>
                  <t.Icon className="w-3.5 h-3.5 shrink-0" />{t.label}
                </button>
              ))}
            </div>
          </Fld>
          {tipo === "credito" && (
            <Fld label="Limite de crédito (R$)">
              <input type="number" min="0" step="100" value={limite} onChange={e => setLimite(e.target.value)} placeholder="0,00" className={cls} />
            </Fld>
          )}
          {tipo !== "credito" && (
            <Fld label="Saldo atual (R$)">
              <input type="number" step="0.01" value={saldo} onChange={e => setSaldo(e.target.value)} placeholder="0,00" className={cls} />
            </Fld>
          )}
          <Fld label="Cor de identificação">
            <div className="flex gap-2 flex-wrap">
              {CORES.map(c => (
                <button key={c} onClick={() => setCor(c)}
                  className={`w-8 h-8 rounded-full transition-all ${cor === c ? "ring-2 ring-offset-2 ring-slate-400 scale-110" : "hover:scale-105"}`}
                  style={{ background: c }} />
              ))}
            </div>
          </Fld>
        </div>
        <div className="px-6 pb-5 flex gap-2 border-t border-[rgba(60,60,67,0.08)] pt-4">
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

function KpiBox({ label, value, color }: { label: string; value: string; color?: "violet" }) {
  return (
    <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">{label}</p>
      <p className={`font-semibold text-[17px] mt-0.5 ${color === "violet" ? "text-violet-700" : "text-[#191625]"}`}>{value}</p>
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
