"use client"
import { CheckCircle2, Clock, ClipboardList } from "lucide-react"
import { useState } from "react"
import { GastoFixo, CategoriaFinanceira, ContaBancaria, Configuracoes } from "../../config"
import { LancamentoFinanceiro } from "../../types"
import { brl } from "../../utils"
import { hoje } from "../../lib/financeiro"

type Props = {
  config: Configuracoes
  lancamentos: LancamentoFinanceiro[]
  onUpdateConfig: (cfg: Configuracoes) => void
  onLancar: (l: Partial<LancamentoFinanceiro>) => void
}

export function FixasTab({ config, lancamentos, onUpdateConfig, onLancar }: Props) {
  const gastosFixos = config.gastosFixos ?? []
  const contas      = config.contas ?? []
  const catsDesp    = config.categoriasDespesa

  const [modal, setModal] = useState<GastoFixo | true | null>(null)

  const hj  = hoje()
  const ano = parseInt(hj.slice(0, 4))
  const mes = parseInt(hj.slice(5, 7))
  const mesPad = String(mes).padStart(2, "0")

  function statusMes(gf: GastoFixo) {
    return lancamentos.some(l =>
      l.tipo === "despesa" &&
      l.categoria === gf.categoriaId &&
      l.descricao.toLowerCase().includes(gf.nome.toLowerCase().slice(0, 8)) &&
      (l.dataPagamento || l.dataVencimento).startsWith(`${ano}-${mesPad}`)
    )
  }

  function save(gf: GastoFixo) {
    const next = gastosFixos.find(x => x.id === gf.id)
      ? gastosFixos.map(x => x.id === gf.id ? gf : x)
      : [...gastosFixos, gf]
    onUpdateConfig({ ...config, gastosFixos: next })
    setModal(null)
  }

  function del(id: string) {
    if (!confirm("Excluir este gasto fixo?")) return
    onUpdateConfig({ ...config, gastosFixos: gastosFixos.filter(g => g.id !== id) })
  }

  const ativos     = gastosFixos.filter(g => g.ativa)
  const totalMensal = ativos.reduce((s, g) => s + g.valor, 0)
  const pagosMes   = ativos.filter(g => statusMes(g))
  const totalPago  = pagosMes.reduce((s, g) => s + g.valor, 0)
  const pctPago    = totalMensal > 0 ? (totalPago / totalMensal) * 100 : 0

  return (
    <div className="max-w-2xl space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiBox label="Comprometido/mês"  value={brl(totalMensal)}         color="rose" />
        <KpiBox label="Pago este mês"     value={brl(totalPago)}           color="green" />
        <KpiBox label="Pendente"          value={brl(totalMensal - totalPago)} color="amber" />
      </div>

      {/* Barra de progresso */}
      {totalMensal > 0 && (
        <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl px-5 py-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[12.5px] font-semibold text-[#191625]">Progresso do mês</span>
            <span className="text-[12px] text-[#8E8E93] tabular-nums">{pagosMes.length} de {ativos.length} pagos</span>
          </div>
          <div className="w-full h-2.5 bg-[rgba(116,116,128,0.1)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(pctPago, 100)}%`,
                background: pctPago >= 100 ? "#009351" : pctPago >= 60 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
          <p className="text-[11px] text-[#8E8E93] mt-1.5">{pctPago.toFixed(0)}% liquidado</p>
        </div>
      )}

      {/* Lista */}
      {gastosFixos.length === 0 ? (
        <div className="py-20 text-center space-y-2">
          <div className="flex justify-center mb-1"><ClipboardList className="w-9 h-9 text-[#c7c7cc]" /></div>
          <p className="text-[13px] font-semibold text-[#5e5c68]">Nenhum gasto fixo cadastrado</p>
          <p className="text-[12px] text-[#8E8E93]">Adicione aluguel, energia, salários e outros recorrentes mensais</p>
        </div>
      ) : (
        <div className="space-y-2">
          {gastosFixos.map(gf => {
            const pago  = statusMes(gf)
            const cat   = catsDesp.find(c => c.id === gf.categoriaId)
            const conta = contas.find(c => c.id === gf.contaId)
            const diaVenc = `${ano}-${mesPad}-${String(gf.diaVencimento).padStart(2, "0")}`
            return (
              <div key={gf.id}
                className={`bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl px-5 py-4 flex items-center gap-4 ${!gf.ativa ? "opacity-50" : ""}`}>
                <div className={`w-11 h-11 rounded-xl shrink-0 flex items-center justify-center ${
                  pago ? "bg-emerald-50" : "bg-rose-50"
                }`}>
                  {pago
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    : <Clock className="w-5 h-5 text-rose-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="font-semibold text-[13px] text-[#191625]">{gf.nome}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      pago
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {pago ? "Pago" : "Pendente"}
                    </span>
                    {cat && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(116,116,128,0.08)] text-[#8E8E93] font-medium">
                        {cat.nome}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#8E8E93]">
                    <span>Todo dia {gf.diaVencimento}</span>
                    {conta && <span>· {conta.nome}</span>}
                    {gf.obs && <span>· {gf.obs}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="font-semibold text-[14px] text-rose-600 tabular-nums">−{brl(gf.valor)}</p>
                  <div className="flex gap-1.5">
                    {!pago && (
                      <button
                        onClick={() => onLancar({
                          tipo:           "despesa",
                          descricao:      gf.nome,
                          valor:          gf.valor,
                          categoria:      gf.categoriaId || undefined,
                          contaId:        gf.contaId,
                          dataVencimento: diaVenc,
                          status:         "pendente",
                        })}
                        className="px-3 py-1.5 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">
                        Lançar
                      </button>
                    )}
                    <button onClick={() => setModal(gf)}
                      className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-[rgba(116,116,128,0.08)] text-[#72707d] hover:bg-[rgba(116,116,128,0.14)] transition-colors">
                      Editar
                    </button>
                    <button onClick={() => del(gf.id)}
                      className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors">
                      ✕
                    </button>
                  </div>
                </div>
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
        Adicionar gasto fixo
      </button>

      {modal && (
        <ModalGastoFixo
          inicial={modal === true ? null : modal}
          catsDesp={catsDesp}
          contas={contas.filter(c => c.ativa)}
          onSave={save}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function ModalGastoFixo({ inicial, catsDesp, contas, onSave, onClose }: {
  inicial: GastoFixo | null
  catsDesp: CategoriaFinanceira[]
  contas: ContaBancaria[]
  onSave: (gf: GastoFixo) => void
  onClose: () => void
}) {
  const [nome, setNome]             = useState(inicial?.nome ?? "")
  const [categoriaId, setCatId]     = useState(inicial?.categoriaId ?? "")
  const [valor, setValor]           = useState(String(inicial?.valor ?? ""))
  const [dia, setDia]               = useState(String(inicial?.diaVencimento ?? "5"))
  const [contaId, setContaId]       = useState(inicial?.contaId ?? "")
  const [obs, setObs]               = useState(inicial?.obs ?? "")
  const [ativa, setAtiva]           = useState(inicial?.ativa ?? true)

  function salvar() {
    if (!nome.trim() || !parseFloat(valor)) return
    onSave({
      id:             inicial?.id ?? Date.now().toString(),
      nome:           nome.trim(),
      categoriaId,
      valor:          parseFloat(valor),
      diaVencimento:  Math.max(1, Math.min(31, parseInt(dia) || 5)),
      contaId:        contaId || undefined,
      obs:            obs.trim() || undefined,
      ativa,
    })
  }

  const cls = "w-full h-9 border border-[rgba(60,60,67,0.12)] rounded-lg px-3 text-[12.5px] text-[#5e5c68] bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col overflow-hidden" style={{ maxHeight: "90vh" }}>
        <div className="px-6 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] flex items-center justify-between shrink-0">
          <p className="font-bold text-[#191625] text-[14px]">{inicial ? "Editar gasto fixo" : "Novo gasto fixo"}</p>
          <button onClick={onClose} className="text-[#898892] hover:text-[#8E8E93] text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <Fld label="Nome *">
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Aluguel galpão" className={cls} />
          </Fld>
          <Fld label="Valor mensal (R$) *">
            <input type="number" min="0" step="0.01" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" className={cls} />
          </Fld>
          <Fld label="Dia do vencimento">
            <input type="number" min="1" max="31" value={dia} onChange={e => setDia(e.target.value)} className={cls} />
          </Fld>
          <Fld label="Categoria">
            <select value={categoriaId} onChange={e => setCatId(e.target.value)} className={cls}>
              <option value="">Selecione…</option>
              {catsDesp.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Fld>
          {contas.length > 0 && (
            <Fld label="Conta / Cartão">
              <select value={contaId} onChange={e => setContaId(e.target.value)} className={cls}>
                <option value="">—</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Fld>
          )}
          <Fld label="Observação">
            <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" className={cls} />
          </Fld>
          {inicial && (
            <div className="flex items-center gap-3">
              <button onClick={() => setAtiva(v => !v)}
                className={`relative w-10 h-6 rounded-full transition-colors ${ativa ? "bg-emerald-500" : "bg-[rgba(116,116,128,0.3)]"}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${ativa ? "left-5" : "left-1"}`} />
              </button>
              <span className="text-[12px] text-[#72707d]">{ativa ? "Ativo" : "Inativo"}</span>
            </div>
          )}
        </div>
        <div className="px-6 pb-5 flex gap-2 border-t border-[rgba(60,60,67,0.08)] pt-4 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-[12.5px] font-medium text-[#8E8E93] hover:bg-[rgba(116,116,128,0.04)] rounded-xl transition-colors">
            Cancelar
          </button>
          <button disabled={!nome.trim() || !parseFloat(valor)} onClick={salvar}
            className="flex-1 py-2.5 text-[12.5px] font-semibold text-white bg-[#161421] hover:bg-[#0b0914] rounded-xl transition-colors disabled:opacity-40">
            {inicial ? "Salvar" : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  )
}

function KpiBox({ label, value, color }: { label: string; value: string; color?: "rose" | "green" | "amber" }) {
  const cls = color === "rose" ? "text-rose-600" : color === "green" ? "text-emerald-700" : color === "amber" ? "text-amber-600" : "text-[#191625]"
  return (
    <div className="bg-white border border-[rgba(60,60,67,0.08)] rounded-2xl px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-[#8E8E93] font-semibold">{label}</p>
      <p className={`font-semibold text-[17px] mt-0.5 tabular-nums ${cls}`}>{value}</p>
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
