"use client"

import React from "react"
import {
  Factory, Clock, AlertTriangle, Gauge, History, PackageCheck, Plus, Trash2, Send, ChevronDown, Wrench, SlidersHorizontal, Save, Check,
} from "lucide-react"
import { KanbanCard, LancamentoFinanceiro, FormData } from "../types"
import { CalibragemView } from "./CalibragemView"
import { Configuracoes } from "../config"
import {
  ConfigProducao, FornecedorProducao, RegraCobranca, Servico, SERVICOS, TipoRegra, Ferramental, TipoFerramental,
  MovimentoFornecedor, Ocorrencia, TIPOS_OCORRENCIA, TipoOcorrencia, normalizarProducao, descreverRegra, etapaDosServicos, nomeServicos,
} from "../lib/producao"
import { somarDiasUteis, diasUteisEntre } from "../lib/diasUteis"
import { montarPedidos, pedidoEntregue } from "../lib/negocio"
import { brl, num } from "../utils"

const border = { border: "1px solid rgba(60,60,67,0.08)" }
const inputCls = "h-9 rounded-lg px-2.5 text-[12.5px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] transition-colors"
const inputStyle = { border: "1px solid rgba(60,60,67,0.18)" }

const TIPOS_REGRA: { id: TipoRegra; nome: string }[] = [
  { id: "acerto_milheiro", nome: "Acerto + milheiro" },
  { id: "fixo_chapa", nome: "Fixo por chapa" },
  { id: "por_folha", nome: "Por folha" },
  { id: "por_m2", nome: "Por m²" },
  { id: "por_unidade", nome: "Por unidade" },
  { id: "por_trabalho", nome: "Por trabalho" },
]
const TIPOS_ACABAMENTO: Partial<Record<Servico, string[]>> = {
  laminacao: ["Fosca", "Brilhante", "Soft Touch", "Holográfica"],
  verniz: ["UV Total", "UV Localizado", "Resinado", "Holográfico"],
}

const hoje = () => new Date().toLocaleDateString("sv-SE")
// Prazos de fornecedor contam em dias úteis
const somarDias = somarDiasUteis
const diasEntre = diasUteisEntre
const dataBR = (iso?: string) => iso ? iso.split("-").reverse().join("/") : "—"
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

function Campo({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <span className="text-[10px] text-[rgba(60,60,67,0.55)] font-medium">{label}</span>
      {children}
    </label>
  )
}

function Num({ value, onChange, step = 1, w = "w-full" }: { value: number | undefined; onChange: (v: number) => void; step?: number; w?: string }) {
  return (
    <input type="number" step={step} min={0} value={value ?? ""} onChange={e => onChange(Number(e.target.value))}
      className={`${inputCls} ${w} ds-num`} style={inputStyle} />
  )
}

// Seleção de serviços de um envio (mostra só os que o fornecedor presta, se houver cadastro)
function ServicosChips({ forn, valor, onChange }: { forn?: FornecedorProducao; valor: Servico[]; onChange: (s: Servico[]) => void }) {
  const lista = forn && Object.keys(forn.servicos).length ? SERVICOS.filter(x => forn.servicos[x.id]) : SERVICOS
  return (
    <div className="flex flex-wrap gap-1.5">
      {lista.map(x => {
        const on = valor.includes(x.id)
        return (
          <button key={x.id} type="button" onClick={() => onChange(on ? valor.filter(v => v !== x.id) : [...valor, x.id])}
            className={`h-8 px-3 rounded-full text-[12px] font-medium transition-all ${on ? "bg-[#8456e8] text-white" : "bg-white text-[#5e5c68] hover:bg-[rgba(116,116,128,0.06)]"}`}
            style={on ? undefined : inputStyle}>
            {x.nome}
          </button>
        )
      })}
    </div>
  )
}

type PorServico = { nome: string; n: number; prazoMedio: number; atrasoPct: number | null; min: number; max: number }

function estatisticasPorServico(movs: MovimentoFornecedor[]): PorServico[] {
  const grupos = new Map<string, MovimentoFornecedor[]>()
  for (const m of movs.filter(x => x.recebidoEm)) {
    const k = nomeServicos(m)
    grupos.set(k, [...(grupos.get(k) ?? []), m])
  }
  return [...grupos.entries()].map(([nome, ms]) => {
    const dias = ms.map(m => diasEntre(m.enviadoEm, m.recebidoEm!))
    const comPrazo = ms.filter(m => m.prazoPrevisto)
    return {
      nome, n: ms.length, prazoMedio: dias.reduce((a, b) => a + b, 0) / dias.length,
      min: Math.min(...dias), max: Math.max(...dias),
      atrasoPct: comPrazo.length ? comPrazo.filter(m => m.recebidoEm! > m.prazoPrevisto!).length / comPrazo.length * 100 : null,
    }
  }).sort((a, b) => b.n - a.n)
}

// ── Desempenho ────────────────────────────────────────────────────────────────

type Stats = {
  forn: FornecedorProducao
  pedidos: number
  concluidos: number
  prazoMedio: number | null
  atrasoPct: number | null
  abertos: MovimentoFornecedor[]
  ocorrencias: Ocorrencia[]
  prejuizo: number
  historico: MovimentoFornecedor[]
  porServico: PorServico[]
}

function calcularStats(p: ConfigProducao): Stats[] {
  return p.fornecedores.map(forn => {
    const movs = p.movimentos.filter(m => m.fornecedorId === forn.id)
    const concl = movs.filter(m => m.recebidoEm)
    const prazos = concl.map(m => diasEntre(m.enviadoEm, m.recebidoEm!))
    const comPrazo = concl.filter(m => m.prazoPrevisto)
    const atrasados = comPrazo.filter(m => m.recebidoEm! > m.prazoPrevisto!)
    const ocorrencias = p.ocorrencias.filter(o => o.fornecedorId === forn.id).sort((a, b) => b.data.localeCompare(a.data))
    return {
      forn,
      pedidos: new Set(movs.map(m => m.pedidoKey)).size,
      concluidos: concl.length,
      prazoMedio: prazos.length ? prazos.reduce((s, d) => s + d, 0) / prazos.length : null,
      atrasoPct: comPrazo.length ? atrasados.length / comPrazo.length * 100 : null,
      abertos: movs.filter(m => !m.recebidoEm),
      ocorrencias,
      prejuizo: ocorrencias.reduce((s, o) => s + (o.prejuizo || 0), 0),
      historico: [...movs].sort((a, b) => b.enviadoEm.localeCompare(a.enviadoEm)),
      porServico: estatisticasPorServico(movs),
    }
  })
}

function Desempenho({ producao, pedidosOpcoes, todosPedidos, salvar }: {
  producao: ConfigProducao
  pedidosOpcoes: { key: string; label: string }[]
  todosPedidos: { key: string; label: string }[]
  salvar: (p: ConfigProducao) => void
}) {
  const [hist, setHist] = React.useState<(Partial<MovimentoFornecedor> & { textoPedido?: string }) | null>(null)
  const [registrados, setRegistrados] = React.useState(0)
  const fornDe = (id?: string) => producao.fornecedores.find(f => f.id === id)

  // Pedidos antigos: envio e retorno de uma vez; fornecedor e serviços ficam para o próximo
  function registrarHistorico(continuar: boolean) {
    if (!hist?.fornecedorId || !hist.enviadoEm || !hist.recebidoEm || !(hist.pedidoKey || hist.textoPedido?.trim()) || !hist.servicos?.length) return
    const forn = fornDe(hist.fornecedorId)
    const key = hist.pedidoKey || `manual-${hist.textoPedido!.trim().toLowerCase()}`
    const mov: MovimentoFornecedor = {
      id: novoId(), pedidoKey: key,
      pedidoLabel: todosPedidos.find(p => p.key === hist.pedidoKey)?.label ?? hist.textoPedido!.trim(),
      fornecedorId: hist.fornecedorId, etapa: etapaDosServicos(hist.servicos), servicos: hist.servicos,
      enviadoEm: hist.enviadoEm, recebidoEm: hist.recebidoEm,
      prazoPrevisto: forn?.prazoDias ? somarDias(hist.enviadoEm, forn.prazoDias) : undefined,
      historico: true,
    }
    salvar({ ...producao, movimentos: [...producao.movimentos, mov] })
    setRegistrados(n => n + 1)
    setHist(continuar ? { fornecedorId: hist.fornecedorId, servicos: hist.servicos } : null)
  }
  const stats = calcularStats(producao)
  const [envio, setEnvio] = React.useState<Partial<MovimentoFornecedor> | null>(null)
  const [ocorr, setOcorr] = React.useState<Partial<Ocorrencia> | null>(null)
  const [aberto, setAberto] = React.useState<string | null>(null)
  const nomeForn = (id: string) => producao.fornecedores.find(f => f.id === id)?.nome ?? "—"

  const emAndamento = producao.movimentos.filter(m => !m.recebidoEm).sort((a, b) => a.enviadoEm.localeCompare(b.enviadoEm))

  function registrarEnvio() {
    if (!envio?.pedidoKey || !envio.fornecedorId || !envio.servicos?.length) return
    const forn = producao.fornecedores.find(f => f.id === envio.fornecedorId)
    const enviadoEm = envio.enviadoEm || hoje()
    const mov: MovimentoFornecedor = {
      id: novoId(),
      pedidoKey: envio.pedidoKey,
      pedidoLabel: pedidosOpcoes.find(p => p.key === envio.pedidoKey)?.label ?? envio.pedidoKey,
      fornecedorId: envio.fornecedorId,
      etapa: etapaDosServicos(envio.servicos ?? []),
      servicos: envio.servicos,
      enviadoEm,
      prazoPrevisto: envio.prazoPrevisto || (forn?.prazoDias ? somarDias(enviadoEm, forn.prazoDias) : undefined),
    }
    salvar({ ...producao, movimentos: [...producao.movimentos, mov] })
    setEnvio(null)
  }

  function marcarRecebido(id: string, data: string) {
    salvar({ ...producao, movimentos: producao.movimentos.map(m => m.id === id ? { ...m, recebidoEm: data } : m) })
  }

  function registrarOcorrencia() {
    if (!ocorr?.fornecedorId || !ocorr.descricao?.trim()) return
    const o: Ocorrencia = {
      id: novoId(),
      fornecedorId: ocorr.fornecedorId,
      pedidoKey: ocorr.pedidoKey || undefined,
      pedidoLabel: pedidosOpcoes.find(p => p.key === ocorr.pedidoKey)?.label,
      tipo: ocorr.tipo ?? "atraso",
      descricao: ocorr.descricao.trim(),
      prejuizo: ocorr.prejuizo ?? 0,
      data: ocorr.data || hoje(),
    }
    salvar({ ...producao, ocorrencias: [...producao.ocorrencias, o] })
    setOcorr(null)
  }

  return (
    <div className="space-y-6">
      {/* Em andamento */}
      <div className="bg-white rounded-xl overflow-hidden" style={border}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid rgba(60,60,67,0.06)" }}>
          <p className="text-[13px] font-semibold text-[#191625] flex items-center gap-2">
            <Send className="w-4 h-4 text-[#8456e8]" /> No fornecedor agora
            <span className="text-[11px] font-medium text-[#898892]">{emAndamento.length}</span>
          </p>
          <div className="flex gap-2">
            <button onClick={() => { setOcorr({ tipo: "atraso", data: hoje() }); setEnvio(null); setHist(null) }}
              className="h-8 px-3 rounded-lg text-[12px] font-medium text-[#5e5c68] hover:bg-[rgba(116,116,128,0.06)] transition-colors flex items-center gap-1.5" style={border}>
              <AlertTriangle className="w-3.5 h-3.5" /> Ocorrência
            </button>
            <button onClick={() => { setHist({}); setEnvio(null); setOcorr(null); setRegistrados(0) }}
              className="h-8 px-3 rounded-lg text-[12px] font-medium text-[#5e5c68] hover:bg-[rgba(116,116,128,0.06)] transition-colors flex items-center gap-1.5" style={border}>
              <History className="w-3.5 h-3.5" /> Registrar pedidos antigos
            </button>
            <button onClick={() => { setEnvio({ enviadoEm: hoje(), servicos: [] }); setOcorr(null); setHist(null) }}
              className="h-8 px-3 rounded-lg text-[12px] font-semibold text-white bg-[#8456e8] hover:bg-[#7445d4] transition-colors flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Enviar pedido
            </button>
          </div>
        </div>

        {envio && (
          <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-6 gap-2.5 items-end bg-[#8456e8]/[0.03] animate-[apple-slide-up_.2s_ease-out]">
            <Campo label="Pedido" className="col-span-2">
              <select value={envio.pedidoKey ?? ""} onChange={e => setEnvio({ ...envio, pedidoKey: e.target.value })} className={inputCls} style={inputStyle}>
                <option value="">Escolha…</option>
                {pedidosOpcoes.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </Campo>
            <Campo label="Fornecedor">
              <select value={envio.fornecedorId ?? ""} onChange={e => setEnvio({ ...envio, fornecedorId: e.target.value, servicos: [] })} className={inputCls} style={inputStyle}>
                <option value="">Escolha…</option>
                {producao.fornecedores.filter(f => f.ativo).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Campo>

            <Campo label="Enviado em">
              <input type="date" value={envio.enviadoEm ?? ""} onChange={e => setEnvio({ ...envio, enviadoEm: e.target.value })} className={inputCls} style={inputStyle} />
            </Campo>
            <div className="flex gap-2">
              <button onClick={() => setEnvio(null)} className="h-9 px-3 rounded-lg text-[12px] text-[#898892] hover:bg-[rgba(116,116,128,0.06)]">Cancelar</button>
              <button onClick={registrarEnvio} disabled={!envio.pedidoKey || !envio.fornecedorId || !envio.servicos?.length}
                className="h-9 px-3 rounded-lg text-[12px] font-semibold text-white bg-[#8456e8] disabled:opacity-30">Registrar</button>
            </div>
            <div className="col-span-2 md:col-span-6">
              <p className="text-[10px] text-[rgba(60,60,67,0.55)] font-medium mb-1.5">O que o fornecedor vai fazer</p>
              <ServicosChips forn={fornDe(envio.fornecedorId)} valor={envio.servicos ?? []} onChange={sv => setEnvio({ ...envio, servicos: sv })} />
            </div>
          </div>
        )}

        {hist && (
          <div className="px-5 py-4 space-y-3 bg-[#8456e8]/[0.03] animate-[apple-slide-up_.2s_ease-out]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12.5px] font-semibold text-[#191625]">Registrar pedidos antigos
                <span className="font-normal text-[#898892]"> · data de envio e de retorno; fornecedor e serviços ficam preenchidos para o próximo</span></p>
              {registrados > 0 && <span className="text-[11.5px] font-semibold text-[#009351]">{registrados} {registrados === 1 ? "registrado" : "registrados"}</span>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5 items-end">
              <Campo label="Pedido" className="col-span-2">
                <select value={hist.pedidoKey ?? (hist.textoPedido !== undefined ? "__outro" : "")}
                  onChange={e => e.target.value === "__outro" ? setHist({ ...hist, pedidoKey: undefined, textoPedido: "" }) : setHist({ ...hist, pedidoKey: e.target.value, textoPedido: undefined })}
                  className={inputCls} style={inputStyle}>
                  <option value="">Escolha…</option>
                  <option value="__outro">Outro (digitar)</option>
                  {todosPedidos.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </Campo>
              {hist.textoPedido !== undefined && (
                <Campo label="Qual pedido" className="col-span-2">
                  <input autoFocus value={hist.textoPedido} onChange={e => setHist({ ...hist, textoPedido: e.target.value })} placeholder="Ex.: Pedido Raniere março" className={inputCls} style={inputStyle} />
                </Campo>
              )}
              <Campo label="Fornecedor">
                <select value={hist.fornecedorId ?? ""} onChange={e => setHist({ ...hist, fornecedorId: e.target.value, servicos: [] })} className={inputCls} style={inputStyle}>
                  <option value="">Escolha…</option>
                  {producao.fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </Campo>
              <Campo label="Enviado em">
                <input type="date" value={hist.enviadoEm ?? ""} onChange={e => setHist({ ...hist, enviadoEm: e.target.value })} className={inputCls} style={inputStyle} />
              </Campo>
              <Campo label="Recebido em">
                <input type="date" value={hist.recebidoEm ?? ""} min={hist.enviadoEm} onChange={e => setHist({ ...hist, recebidoEm: e.target.value })} className={inputCls} style={inputStyle} />
              </Campo>
            </div>
            <div>
              <p className="text-[10px] text-[rgba(60,60,67,0.55)] font-medium mb-1.5">O que o fornecedor fez</p>
              <ServicosChips forn={fornDe(hist.fornecedorId)} valor={hist.servicos ?? []} onChange={sv => setHist({ ...hist, servicos: sv })} />
            </div>
            <div className="flex items-center justify-end gap-2">
              {hist.enviadoEm && hist.recebidoEm && <span className="text-[11.5px] text-[#898892] mr-auto">{diasEntre(hist.enviadoEm, hist.recebidoEm)} dias úteis no fornecedor</span>}
              <button onClick={() => setHist(null)} className="h-9 px-3 rounded-lg text-[12px] text-[#898892] hover:bg-[rgba(116,116,128,0.06)]">Fechar</button>
              <button onClick={() => registrarHistorico(false)} disabled={!hist.fornecedorId || !hist.enviadoEm || !hist.recebidoEm || !hist.servicos?.length || !(hist.pedidoKey || hist.textoPedido?.trim())}
                className="h-9 px-3 rounded-lg text-[12px] font-semibold text-[#191625] bg-white disabled:opacity-30" style={inputStyle}>Registrar</button>
              <button onClick={() => registrarHistorico(true)} disabled={!hist.fornecedorId || !hist.enviadoEm || !hist.recebidoEm || !hist.servicos?.length || !(hist.pedidoKey || hist.textoPedido?.trim())}
                className="h-9 px-3 rounded-lg text-[12px] font-semibold text-white bg-[#8456e8] disabled:opacity-30">Registrar e continuar</button>
            </div>
          </div>
        )}

        {ocorr && (
          <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-6 gap-2.5 items-end bg-[#c57800]/[0.04] animate-[apple-slide-up_.2s_ease-out]">
            <Campo label="Fornecedor">
              <select value={ocorr.fornecedorId ?? ""} onChange={e => setOcorr({ ...ocorr, fornecedorId: e.target.value })} className={inputCls} style={inputStyle}>
                <option value="">Escolha…</option>
                {producao.fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Campo>
            <Campo label="Tipo">
              <select value={ocorr.tipo} onChange={e => setOcorr({ ...ocorr, tipo: e.target.value as TipoOcorrencia })} className={inputCls} style={inputStyle}>
                {TIPOS_OCORRENCIA.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </Campo>
            <Campo label="Pedido (opcional)">
              <select value={ocorr.pedidoKey ?? ""} onChange={e => setOcorr({ ...ocorr, pedidoKey: e.target.value })} className={inputCls} style={inputStyle}>
                <option value="">—</option>
                {pedidosOpcoes.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </Campo>
            <Campo label="O que aconteceu" className="col-span-2">
              <input value={ocorr.descricao ?? ""} onChange={e => setOcorr({ ...ocorr, descricao: e.target.value })}
                placeholder="Ex.: 300 folhas com cor fora" className={inputCls} style={inputStyle} />
            </Campo>
            <Campo label="Prejuízo (R$)">
              <Num value={ocorr.prejuizo} onChange={v => setOcorr({ ...ocorr, prejuizo: v })} step={0.01} />
            </Campo>
            <div className="col-span-2 md:col-span-6 flex justify-end gap-2">
              <button onClick={() => setOcorr(null)} className="h-9 px-3 rounded-lg text-[12px] text-[#898892] hover:bg-[rgba(116,116,128,0.06)]">Cancelar</button>
              <button onClick={registrarOcorrencia} disabled={!ocorr.fornecedorId || !ocorr.descricao?.trim()}
                className="h-9 px-3 rounded-lg text-[12px] font-semibold text-white bg-[#0b0914] disabled:opacity-30">Registrar ocorrência</button>
            </div>
          </div>
        )}

        {emAndamento.length === 0 ? (
          <p className="px-5 py-6 text-[12.5px] text-[#898892]">Nenhum pedido em fornecedor. Use “Enviar pedido” quando mandar um trabalho para fora; o prazo é medido sozinho.</p>
        ) : (
          <div className="divide-y divide-[rgba(60,60,67,0.06)]">
            {emAndamento.map(m => {
              const dias = diasEntre(m.enviadoEm, hoje())
              const atrasado = m.prazoPrevisto && hoje() > m.prazoPrevisto
              return (
                <div key={m.id} className="px-5 py-3 flex items-center gap-4 text-[12.5px]">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#191625] truncate">{m.pedidoLabel}</p>
                    <p className="text-[11.5px] text-[#898892]">
                      {nomeForn(m.fornecedorId)} · {nomeServicos(m)} · enviado {dataBR(m.enviadoEm)}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ds-num ${atrasado ? "bg-[#e5484d]/10 text-[#e5484d]" : "bg-[rgba(116,116,128,0.08)] text-[#5e5c68]"}`}>
                    {dias} {dias === 1 ? "dia útil" : "dias úteis"}{m.prazoPrevisto ? ` · prazo ${dataBR(m.prazoPrevisto)}` : ""}
                  </span>
                  <button onClick={() => marcarRecebido(m.id, hoje())}
                    className="h-8 px-3 rounded-lg text-[12px] font-semibold text-[#009351] hover:bg-[#009351]/[0.08] transition-colors flex items-center gap-1.5" style={border}>
                    <PackageCheck className="w-3.5 h-3.5" /> Recebido hoje
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Por fornecedor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {stats.map(s => {
          const exp = aberto === s.forn.id
          return (
            <div key={s.forn.id} className={`bg-white rounded-xl transition-shadow duration-200 ${exp ? "shadow-md" : "hover:shadow-sm"} ${s.forn.ativo ? "" : "opacity-60"}`} style={border}>
              <button onClick={() => setAberto(exp ? null : s.forn.id)} className="w-full text-left px-5 pt-4 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14px] font-semibold text-[#191625] flex items-center gap-2 truncate">
                    <Factory className="w-4 h-4 text-[#8456e8] shrink-0" />{s.forn.nome}
                  </p>
                  <ChevronDown className={`w-4 h-4 text-[#898892] transition-transform duration-200 ${exp ? "rotate-180" : ""}`} />
                </div>
                <p className="text-[11px] text-[#898892] mt-0.5 truncate">
                  {SERVICOS.filter(x => s.forn.servicos[x.id]).map(x => x.nome).join(" · ") || "Sem serviços cadastrados"}
                </p>
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {[
                    { l: "Prazo médio", v: s.prazoMedio != null ? `${num(s.prazoMedio, 1)} d` : "—", sub: s.forn.prazoDias ? `dias úteis · combinado ${s.forn.prazoDias}` : "dias úteis" },
                    { l: "Atrasos", v: s.atrasoPct != null ? `${num(s.atrasoPct, 0)}%` : "—", alerta: (s.atrasoPct ?? 0) >= 25 },
                    { l: "Pedidos", v: num(s.pedidos), sub: s.abertos.length ? `${s.abertos.length} em andamento` : undefined },
                    { l: "Ocorrências", v: num(s.ocorrencias.length), sub: s.prejuizo > 0 ? brl(s.prejuizo) : undefined, alerta: s.ocorrencias.length > 0 },
                  ].map(k => (
                    <div key={k.l}>
                      <p className="text-[11px] text-[#898892] font-medium">{k.l}</p>
                      <p className={`text-[17px] font-semibold ds-num ${k.alerta ? "text-[#d33a3c]" : "text-[#191625]"}`}>{k.v}</p>
                      {k.sub && <p className="text-[10px] text-[#898892] truncate">{k.sub}</p>}
                    </div>
                  ))}
                </div>
                {s.porServico.length > 0 && (
                  <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: "1px solid rgba(60,60,67,0.06)" }}>
                    <p className="text-[10.5px] font-medium text-[#898892]">Prazo por serviço · dias úteis</p>
                    {s.porServico.map(ps => (
                      <div key={ps.nome} className="flex items-center gap-3 text-[12px]">
                        <span className="flex-1 min-w-0 truncate text-[#191625]">{ps.nome}</span>
                        <span className="text-[#898892] ds-num">{ps.n} {ps.n === 1 ? "envio" : "envios"}</span>
                        {ps.n > 1 && <span className="text-[#898892] ds-num">{ps.min}–{ps.max} d</span>}
                        <span className="w-[64px] text-right font-semibold ds-num text-[#191625]">{num(ps.prazoMedio, 1)} d</span>
                        {ps.atrasoPct != null && <span className={`w-[78px] text-right ds-num whitespace-nowrap ${ps.atrasoPct >= 25 ? "text-[#d33a3c]" : "text-[#898892]"}`}>{num(ps.atrasoPct, 0)}% atraso</span>}
                      </div>
                    ))}
                  </div>
                )}
              </button>
              {exp && (
                <div className="px-5 pb-4 pt-1 space-y-3 animate-[apple-slide-up_.2s_ease-out]" style={{ borderTop: "1px solid rgba(60,60,67,0.06)" }}>
                  {s.ocorrencias.length > 0 && (
                    <div>
                      <p className="text-[9.5px] uppercase tracking-wide text-[#898892] font-semibold mt-3 mb-1.5">Ocorrências</p>
                      {s.ocorrencias.map(o => (
                        <div key={o.id} className="flex items-start gap-2 py-1.5 text-[12px]">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#c57800] mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[#191625]">
                              <strong>{TIPOS_OCORRENCIA.find(t => t.id === o.tipo)?.nome}</strong> — {o.descricao}
                            </p>
                            <p className="text-[11px] text-[#898892]">{dataBR(o.data)}{o.pedidoLabel ? ` · ${o.pedidoLabel}` : ""}{o.prejuizo ? ` · prejuízo ${brl(o.prejuizo)}` : ""}</p>
                          </div>
                          <button onClick={() => salvar({ ...producao, ocorrencias: producao.ocorrencias.filter(x => x.id !== o.id) })}
                            className="text-[#898892] hover:text-[#e5484d] transition-colors" title="Remover"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <p className="text-[9.5px] uppercase tracking-wide text-[#898892] font-semibold mt-3 mb-1.5">Histórico</p>
                    {s.historico.length === 0 && <p className="text-[12px] text-[#898892]">Nenhum envio registrado ainda.</p>}
                    {s.historico.slice(0, 12).map(m => {
                      const d = m.recebidoEm ? diasEntre(m.enviadoEm, m.recebidoEm) : null
                      const atrasou = m.recebidoEm && m.prazoPrevisto && m.recebidoEm > m.prazoPrevisto
                      return (
                        <div key={m.id} className="flex items-center gap-2 py-1 text-[12px]">
                          <span className="flex-1 min-w-0 truncate text-[#191625]">{m.pedidoLabel}</span>
                          <span className="text-[#898892] text-[11px] truncate max-w-[180px]">{nomeServicos(m)}{m.historico ? " · antigo" : ""}</span>
                          <span className="text-[#898892] text-[11px] ds-num w-[78px] text-right">{dataBR(m.enviadoEm)}</span>
                          <span className={`text-[11px] ds-num w-[64px] text-right font-medium ${d == null ? "text-[#8456e8]" : atrasou ? "text-[#e5484d]" : "text-[#009351]"}`}>
                            {d == null ? "aberto" : `${d} d`}
                          </span>
                          <button onClick={() => salvar({ ...producao, movimentos: producao.movimentos.filter(x => x.id !== m.id) })}
                            className="text-[#898892] hover:text-[#e5484d] transition-colors" title="Remover"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Cadastro e preços ─────────────────────────────────────────────────────────

function EditorRegra({ servico, regra, onChange }: { servico: Servico; regra: RegraCobranca; onChange: (r: RegraCobranca) => void }) {
  const tiposAcab = TIPOS_ACABAMENTO[servico]
  const usaTabela = tiposAcab && (regra.tipo === "por_folha" || regra.tipo === "por_m2")
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <Campo label="Cobrança">
        <select value={regra.tipo} onChange={e => onChange({ ...regra, tipo: e.target.value as TipoRegra })} className={inputCls} style={inputStyle}>
          {TIPOS_REGRA.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
      </Campo>
      {regra.tipo === "acerto_milheiro" && <>
        <Campo label="Acerto (R$)"><Num value={regra.acerto} onChange={v => onChange({ ...regra, acerto: v })} step={0.01} /></Campo>
        <Campo label="Milheiro (R$)"><Num value={regra.milheiro} onChange={v => onChange({ ...regra, milheiro: v })} step={0.01} /></Campo>
      </>}
      {regra.tipo === "fixo_chapa" && <>
        <Campo label="Valor por chapa (R$)"><Num value={regra.valor} onChange={v => onChange({ ...regra, valor: v })} step={0.01} /></Campo>
        <label className="flex items-center gap-2 text-[11.5px] text-[#5e5c68] mt-5 col-span-2 cursor-pointer">
          <input type="checkbox" checked={!!regra.proporcionalCavidades} onChange={e => onChange({ ...regra, proporcionalCavidades: e.target.checked })} />
          Proporcional às cavidades (chapa de 2 numa máquina de 4 = metade)
        </label>
      </>}
      {(regra.tipo === "por_folha" || regra.tipo === "por_m2" || regra.tipo === "por_unidade" || regra.tipo === "por_trabalho") && !usaTabela && (
        <Campo label={`Valor (R$ ${regra.tipo === "por_m2" ? "por m²" : regra.tipo === "por_folha" ? "por folha" : regra.tipo === "por_trabalho" ? "por trabalho" : "por unidade"})`}>
          <Num value={regra.valor} onChange={v => onChange({ ...regra, valor: v })} step={0.001} />
        </Campo>
      )}
      {(regra.tipo === "por_folha" || regra.tipo === "por_m2") && (
        <Campo label="Acerto (R$, opcional)"><Num value={regra.acerto} onChange={v => onChange({ ...regra, acerto: v })} step={0.01} /></Campo>
      )}
      {usaTabela && (
        <div className="col-span-2 md:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          {tiposAcab!.map(t => (
            <Campo key={t} label={`${t} (R$ ${regra.tipo === "por_m2" ? "/m²" : "/folha"})`}>
              <Num value={regra.precosPorTipo?.[t]} step={0.001}
                onChange={v => onChange({ ...regra, precosPorTipo: { ...regra.precosPorTipo, [t]: v } })} />
            </Campo>
          ))}
        </div>
      )}
    </div>
  )
}

function Cadastro({ draft, setDraft, fornecedoresFin }: {
  draft: ConfigProducao
  setDraft: (p: ConfigProducao) => void
  fornecedoresFin: { id: string; nome: string }[]
}) {
  const [aberto, setAberto] = React.useState<string | null>(null)
  const upd = (id: string, patch: Partial<FornecedorProducao>) =>
    setDraft({ ...draft, fornecedores: draft.fornecedores.map(f => f.id === id ? { ...f, ...patch } : f) })

  function adicionar() {
    const f: FornecedorProducao = { id: novoId(), nome: "Novo fornecedor", ativo: true, servicos: {}, frete: 0, prazoDias: 5 }
    setDraft({ ...draft, fornecedores: [...draft.fornecedores, f] })
    setAberto(f.id)
  }

  const padroesEtapas: { k: keyof ConfigProducao["padroes"]; nome: string; servicos: Servico[] }[] = [
    { k: "arte", nome: "Arte", servicos: ["arte"] },
    { k: "acabamento", nome: "Laminação / verniz", servicos: ["laminacao", "verniz"] },
    { k: "hotStamping", nome: "Hot stamping", servicos: ["hotStamping"] },
    { k: "corteVinco", nome: "Corte e vinco", servicos: ["corteVinco"] },
    { k: "colagem", nome: "Colagem", servicos: ["colagem"] },
  ]

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-5" style={border}>
        <p className="text-[13px] font-semibold text-[#191625]">Fornecedor padrão por etapa</p>
        <p className="text-[11.5px] text-[#898892] mb-3">O orçamento usa estes por padrão. Dá para trocar em cada orçamento.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {padroesEtapas.map(e => (
            <Campo key={e.k} label={e.nome}>
              <select value={draft.padroes[e.k] ?? ""} onChange={ev => setDraft({ ...draft, padroes: { ...draft.padroes, [e.k]: ev.target.value || undefined } })}
                className={inputCls} style={inputStyle}>
                <option value="">—</option>
                {draft.fornecedores.filter(f => e.servicos.some(s => f.servicos[s])).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Campo>
          ))}
        </div>
      </div>

      {draft.fornecedores.map(f => {
        const exp = aberto === f.id
        return (
          <div key={f.id} className={`bg-white rounded-xl ${f.ativo ? "" : "opacity-60"}`} style={border}>
            <button onClick={() => setAberto(exp ? null : f.id)} className="w-full text-left px-5 py-3.5 flex items-center gap-3">
              <Factory className="w-4 h-4 text-[#8456e8] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-[#191625] truncate">{f.nome}</p>
                <p className="text-[11px] text-[#898892] truncate">
                  {f.maquina ? `${f.maquina.nome} (${num(f.maquina.largura / 10, 1)}×${num(f.maquina.altura / 10, 1)} cm) · ` : ""}
                  {SERVICOS.filter(s => f.servicos[s.id]).map(s => `${s.nome}: ${descreverRegra(f.servicos[s.id])}`).join(" · ") || "Sem serviços"}
                </p>
              </div>
              <ChevronDown className={`w-4 h-4 text-[#898892] transition-transform duration-200 ${exp ? "rotate-180" : ""}`} />
            </button>
            {exp && (
              <div className="px-5 pb-5 space-y-4 animate-[apple-slide-up_.2s_ease-out]" style={{ borderTop: "1px solid rgba(60,60,67,0.06)" }}>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 pt-4">
                  <Campo label="Nome" className="col-span-2">
                    <input value={f.nome} onChange={e => upd(f.id, { nome: e.target.value })} className={inputCls} style={inputStyle} />
                  </Campo>
                  <Campo label="Cadastro financeiro">
                    <select value={f.fornecedorId ?? ""} onChange={e => upd(f.id, { fornecedorId: e.target.value || undefined })} className={inputCls} style={inputStyle}>
                      <option value="">—</option>
                      {fornecedoresFin.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Frete até ele (R$)"><Num value={f.frete} onChange={v => upd(f.id, { frete: v })} step={0.01} /></Campo>
                  <Campo label="Prazo combinado (dias úteis)"><Num value={f.prazoDias} onChange={v => upd(f.id, { prazoDias: v })} /></Campo>
                </div>

                <div className="rounded-lg p-3.5 bg-[rgba(116,116,128,0.04)] space-y-2.5">
                  <label className="flex items-center gap-2 text-[12.5px] font-medium text-[#191625] cursor-pointer">
                    <input type="checkbox" checked={!!f.maquina}
                      onChange={e => upd(f.id, { maquina: e.target.checked ? { nome: "Máquina", largura: 660, altura: 480, pinca: 10, margem: 5 } : undefined })} />
                    Imprime (tem máquina)
                  </label>
                  {f.maquina && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                      <Campo label="Nome da máquina">
                        <input value={f.maquina.nome} onChange={e => upd(f.id, { maquina: { ...f.maquina!, nome: e.target.value } })} className={inputCls} style={inputStyle} />
                      </Campo>
                      <Campo label="Largura máx. (cm)"><Num value={f.maquina.largura / 10} step={0.1} onChange={v => upd(f.id, { maquina: { ...f.maquina!, largura: v * 10 } })} /></Campo>
                      <Campo label="Altura máx. (cm)"><Num value={f.maquina.altura / 10} step={0.1} onChange={v => upd(f.id, { maquina: { ...f.maquina!, altura: v * 10 } })} /></Campo>
                      <Campo label="Pinça (mm)"><Num value={f.maquina.pinca} onChange={v => upd(f.id, { maquina: { ...f.maquina!, pinca: v } })} /></Campo>
                      <Campo label="Margem demais bordas (mm)"><Num value={f.maquina.margem} onChange={v => upd(f.id, { maquina: { ...f.maquina!, margem: v } })} /></Campo>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5">
                  {SERVICOS.map(s => {
                    const regra = f.servicos[s.id]
                    return (
                      <div key={s.id} className="rounded-lg p-3.5" style={border}>
                        <label className="flex items-center gap-2 text-[12.5px] font-medium text-[#191625] cursor-pointer mb-2">
                          <input type="checkbox" checked={!!regra}
                            onChange={e => {
                              const servicos = { ...f.servicos }
                              if (e.target.checked) servicos[s.id] = s.id === "arte" ? { tipo: "por_trabalho", valor: 200 }
                                : s.id === "fechamento" ? { tipo: "por_trabalho", valor: 80 }
                                : s.id === "impressao" ? { tipo: "acerto_milheiro", acerto: 650, milheiro: 100 }
                                : s.id === "laminacao" || s.id === "verniz" ? { tipo: "por_folha", precosPorTipo: {} }
                                : { tipo: "acerto_milheiro", acerto: 70, milheiro: 70 }
                              else delete servicos[s.id]
                              upd(f.id, { servicos })
                            }} />
                          {s.nome}
                          {s.id === "corteVinco" && <span className="text-[10.5px] text-[#898892] font-normal">milheiro = mil batidas</span>}
                          {s.id === "colagem" && <span className="text-[10.5px] text-[#898892] font-normal">milheiro = mil caixas</span>}
                        </label>
                        {regra && <EditorRegra servico={s.id} regra={regra} onChange={r => upd(f.id, { servicos: { ...f.servicos, [s.id]: r } })} />}
                      </div>
                    )
                  })}
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[12px] text-[#5e5c68] cursor-pointer">
                    <input type="checkbox" checked={f.ativo} onChange={e => upd(f.id, { ativo: e.target.checked })} /> Ativo
                  </label>
                  <button onClick={() => setDraft({ ...draft, fornecedores: draft.fornecedores.filter(x => x.id !== f.id) })}
                    className="h-8 px-3 rounded-lg text-[12px] text-[#e5484d] hover:bg-[#e5484d]/[0.06] transition-colors flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" /> Remover
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <button onClick={adicionar}
        className="w-full h-11 rounded-xl text-[12.5px] font-medium text-[#8456e8] hover:bg-[#8456e8]/[0.05] transition-colors flex items-center justify-center gap-2"
        style={{ border: "1px dashed rgba(132,86,232,0.35)" }}>
        <Plus className="w-4 h-4" /> Adicionar fornecedor
      </button>
    </div>
  )
}

// ── Ferramental ───────────────────────────────────────────────────────────────

function FerramentalLista({ draft, setDraft }: { draft: ConfigProducao; setDraft: (p: ConfigProducao) => void }) {
  const [novo, setNovo] = React.useState<Partial<Ferramental> | null>(null)
  const lista = [...draft.ferramentais].sort((a, b) => a.cliente.localeCompare(b.cliente))

  function adicionar() {
    if (!novo?.cliente?.trim()) return
    const f: Ferramental = {
      id: novoId(), tipo: novo.tipo ?? "faca", cliente: novo.cliente.trim(), produto: novo.produto ?? "",
      blankLargura: novo.blankLargura ?? 0, blankAltura: novo.blankAltura ?? 0, cavidades: novo.cavidades ?? 1,
      fornecedor: novo.fornecedor, custo: novo.custo ?? 0, data: hoje(),
    }
    setDraft({ ...draft, ferramentais: [...draft.ferramentais, f] })
    setNovo(null)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl overflow-hidden" style={border}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid rgba(60,60,67,0.06)" }}>
          <div>
            <p className="text-[13px] font-semibold text-[#191625] flex items-center gap-2"><Wrench className="w-4 h-4 text-[#8456e8]" /> Facas, clichês e fotolitos dos clientes</p>
            <p className="text-[11.5px] text-[#898892]">Quando o cliente repete o pedido com a mesma caixa, o orçamento não cobra de novo.</p>
          </div>
          <button onClick={() => setNovo({ tipo: "faca", cavidades: 4 })}
            className="h-8 px-3 rounded-lg text-[12px] font-semibold text-white bg-[#8456e8] hover:bg-[#7445d4] transition-colors flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Adicionar
          </button>
        </div>
        {novo && (
          <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-8 gap-2.5 items-end bg-[#8456e8]/[0.03] animate-[apple-slide-up_.2s_ease-out]">
            <Campo label="Tipo">
              <select value={novo.tipo} onChange={e => setNovo({ ...novo, tipo: e.target.value as TipoFerramental })} className={inputCls} style={inputStyle}>
                <option value="faca">Faca</option><option value="cliche">Clichê</option><option value="fotolito">Fotolito</option>
              </select>
            </Campo>
            <Campo label="Cliente" className="col-span-2"><input value={novo.cliente ?? ""} onChange={e => setNovo({ ...novo, cliente: e.target.value })} className={inputCls} style={inputStyle} /></Campo>
            <Campo label="Produto"><input value={novo.produto ?? ""} onChange={e => setNovo({ ...novo, produto: e.target.value })} placeholder="12,5×6×3" className={inputCls} style={inputStyle} /></Campo>
            <Campo label="Blank L (mm)"><Num value={novo.blankLargura} onChange={v => setNovo({ ...novo, blankLargura: v })} /></Campo>
            <Campo label="Blank A (mm)"><Num value={novo.blankAltura} onChange={v => setNovo({ ...novo, blankAltura: v })} /></Campo>
            <Campo label="Cavidades"><Num value={novo.cavidades} onChange={v => setNovo({ ...novo, cavidades: Math.max(1, v) })} /></Campo>
            <Campo label="Custo (R$)"><Num value={novo.custo} onChange={v => setNovo({ ...novo, custo: v })} step={0.01} /></Campo>
            <div className="col-span-2 md:col-span-8 flex justify-end gap-2">
              <button onClick={() => setNovo(null)} className="h-9 px-3 rounded-lg text-[12px] text-[#898892] hover:bg-[rgba(116,116,128,0.06)]">Cancelar</button>
              <button onClick={adicionar} disabled={!novo.cliente?.trim()} className="h-9 px-3 rounded-lg text-[12px] font-semibold text-white bg-[#0b0914] disabled:opacity-30">Adicionar</button>
            </div>
          </div>
        )}
        {lista.length === 0 ? (
          <p className="px-5 py-6 text-[12.5px] text-[#898892]">Nenhum ferramental registrado. No orçamento, use “Registrar faca” depois de fechar o pedido.</p>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-[rgba(116,116,128,0.04)]">
              <tr className="text-[9.5px] uppercase tracking-wide text-[#898892]">
                {["Cliente", "Tipo", "Produto", "Blank", "Cavidades", "Custo", "Desde", ""].map(h => <th key={h} className="px-4 py-2 text-left font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(60,60,67,0.05)]">
              {lista.map(f => (
                <tr key={f.id} className="hover:bg-[rgba(116,116,128,0.03)]">
                  <td className="px-4 py-2 font-medium text-[#191625]">{f.cliente}</td>
                  <td className="px-4 py-2 text-[#5e5c68] capitalize">{f.tipo === "cliche" ? "Clichê" : f.tipo}</td>
                  <td className="px-4 py-2 text-[#5e5c68]">{f.produto || "—"}</td>
                  <td className="px-4 py-2 text-[#5e5c68] ds-num">{f.blankLargura}×{f.blankAltura} mm</td>
                  <td className="px-4 py-2 text-[#5e5c68] ds-num">{f.tipo === "faca" ? f.cavidades : "—"}</td>
                  <td className="px-4 py-2 text-[#5e5c68] ds-num">{brl(f.custo)}</td>
                  <td className="px-4 py-2 text-[#898892] ds-num">{dataBR(f.data)}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => setDraft({ ...draft, ferramentais: draft.ferramentais.filter(x => x.id !== f.id) })}
                      className="text-[#898892] hover:text-[#e5484d] transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Parâmetros ────────────────────────────────────────────────────────────────

function Parametros({ draft, setDraft }: { draft: ConfigProducao; setDraft: (p: ConfigProducao) => void }) {
  const fp = draft.ferramentalPadrao
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl p-5 space-y-3" style={border}>
        <p className="text-[13px] font-semibold text-[#191625]">Montagem e papel</p>
        <div className="grid grid-cols-2 gap-2.5">
          <Campo label="Espaço entre peças (mm)"><Num value={draft.espacoEntrePecas} onChange={v => setDraft({ ...draft, espacoEntrePecas: v })} /></Campo>
          <Campo label="Perda de folhas (%)"><Num value={draft.perdaPct} onChange={v => setDraft({ ...draft, perdaPct: v })} step={0.5} /></Campo>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-[#5e5c68] cursor-pointer">
          <input type="checkbox" checked={draft.arredondarPacote} onChange={e => setDraft({ ...draft, arredondarPacote: e.target.checked })} />
          Papel comprado em pacotes de 100 folhas
        </label>
      </div>
      <div className="bg-white rounded-xl p-5 space-y-3" style={border}>
        <p className="text-[13px] font-semibold text-[#191625]">Preço e impostos</p>
        <div className="grid grid-cols-2 gap-2.5">
          <Campo label="Impostos sobre o preço (%)"><Num value={draft.impostoPct} onChange={v => setDraft({ ...draft, impostoPct: v })} step={0.1} /></Campo>
          <Campo label="Colagem manual (R$/un)"><Num value={draft.colagemManualUnit} onChange={v => setDraft({ ...draft, colagemManualUnit: v })} step={0.001} /></Campo>
        </div>
        <p className="text-[11px] text-[#898892]">Preço = custo total × multiplicador (em Configurações). O imposto só entra na margem líquida.</p>
      </div>
      <div className="bg-white rounded-xl p-5 space-y-3 lg:col-span-2" style={border}>
        <p className="text-[13px] font-semibold text-[#191625]">Automações ao mover o pedido no quadro</p>
        <label className="flex items-start gap-2.5 text-[12.5px] text-[#191625] cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={draft.automacoes.prazoEntrega}
            onChange={e => setDraft({ ...draft, automacoes: { ...draft.automacoes, prazoEntrega: e.target.checked } })} />
          <span>Preencher a data de entrega ao fechar um pedido sem data
            <span className="block text-[11.5px] text-[#898892]">Usa a data de fechamento + o prazo padrão abaixo. Você pode ajustar no pedido.</span></span>
        </label>
        <div className="w-48 pl-6">
          <Campo label="Prazo padrão de entrega (dias úteis)"><Num value={draft.prazoEntregaPadraoDias} onChange={v => setDraft({ ...draft, prazoEntregaPadraoDias: Math.max(1, v) })} /></Campo>
        </div>
        <label className="flex items-start gap-2.5 text-[12.5px] text-[#191625] cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={draft.automacoes.fornecedores}
            onChange={e => setDraft({ ...draft, automacoes: { ...draft.automacoes, fornecedores: e.target.checked } })} />
          <span>Registrar envio e retorno de fornecedores pela etapa
            <span className="block text-[11.5px] text-[#898892]">Impressão: envia ao impressor da rota do orçamento. Verniz ou Acabamento: recebe a impressão e envia ao acabamento. Expedição: recebe tudo. Os prazos de cada fornecedor passam a ser medidos sozinhos.</span></span>
        </label>
      </div>
      <div className="bg-white rounded-xl p-5 space-y-3 lg:col-span-2" style={border}>
        <p className="text-[13px] font-semibold text-[#191625]">Ferramental — valores de referência</p>
        <p className="text-[11.5px] text-[#898892]">Usados quando o orçamento não tem o valor do faquista. Aparecem como “estimado”.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <Campo label="Faca — base (R$)"><Num value={fp.facaBase} onChange={v => setDraft({ ...draft, ferramentalPadrao: { ...fp, facaBase: v } })} step={0.01} /></Campo>
          <Campo label="Faca — por cavidade (R$)"><Num value={fp.facaPorCavidade} onChange={v => setDraft({ ...draft, ferramentalPadrao: { ...fp, facaPorCavidade: v } })} step={0.01} /></Campo>
          <Campo label="Clichê (R$)"><Num value={fp.cliche} onChange={v => setDraft({ ...draft, ferramentalPadrao: { ...fp, cliche: v } })} step={0.01} /></Campo>
          <Campo label="Fotolito (R$)"><Num value={fp.fotolito} onChange={v => setDraft({ ...draft, ferramentalPadrao: { ...fp, fotolito: v } })} step={0.01} /></Campo>
        </div>
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

type Aba = "desempenho" | "calibragem" | "cadastro" | "ferramental" | "parametros"

export function FornecedoresView({ config, kanban, lancamentos, historico, onSave, onCategorizar }: {
  config: Configuracoes
  kanban: KanbanCard[]
  lancamentos: LancamentoFinanceiro[]
  onSave: (cfg: Configuracoes) => void
  historico: { form: FormData; numero?: string }[]
  onCategorizar?: (lancamentoId: string, subcategoria: string) => void
}) {
  const producao = normalizarProducao(config.producao)
  const [aba, setAba] = React.useState<Aba>("desempenho")
  const [draft, setDraft] = React.useState<ConfigProducao>(producao)
  const [salvo, setSalvo] = React.useState(false)
  const sujo = JSON.stringify(draft) !== JSON.stringify(producao)


  const pedidosOpcoes = React.useMemo(() => montarPedidos(kanban, lancamentos)
    .filter(p => !pedidoEntregue(p))
    .sort((a, b) => (b.dataFechamento ?? "").localeCompare(a.dataFechamento ?? ""))
    .map(p => ({ key: p.key, label: `${p.numero} · ${p.nomeCliente}` })), [kanban, lancamentos])

  const todosPedidos = React.useMemo(() => montarPedidos(kanban, lancamentos)
    .sort((a, b) => (b.dataFechamento ?? "").localeCompare(a.dataFechamento ?? ""))
    .map(p => ({ key: p.key, label: `${p.numero} · ${p.nomeCliente}` })), [kanban, lancamentos])

  const salvarProducao = (p: ConfigProducao) => onSave({ ...config, producao: p })

  function salvarDraft() {
    salvarProducao(draft)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 1800)
  }

  const abas: { id: Aba; nome: string; icon: React.ReactNode }[] = [
    { id: "desempenho", nome: "Desempenho", icon: <Clock className="w-3.5 h-3.5" /> },
    { id: "cadastro", nome: "Cadastro e preços", icon: <Factory className="w-3.5 h-3.5" /> },
    { id: "ferramental", nome: "Ferramental", icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: "parametros", nome: "Parâmetros", icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
    { id: "calibragem", nome: "Calibragem", icon: <Gauge className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="h-full overflow-y-auto px-6 py-6 space-y-5" style={{ background: "var(--bg-page)" }}>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-semibold text-[#191625] tracking-tight">Fornecedores de produção</h1>
          <p className="text-[12.5px] text-[#898892] mt-0.5">Quem imprime, acaba e cola; quanto cobram; e como estão entregando.</p>
        </div>
        {aba !== "desempenho" && aba !== "calibragem" && (
          <button onClick={salvarDraft} disabled={!sujo && !salvo}
            className={`h-9 px-4 rounded-lg text-[12.5px] font-semibold flex items-center gap-2 transition-all duration-200 ${
              salvo ? "bg-[#009351] text-white" : "bg-[#8456e8] hover:bg-[#7445d4] text-white disabled:opacity-30"
            }`}>
            {salvo ? <><Check className="w-4 h-4" /> Salvo</> : <><Save className="w-4 h-4" /> Salvar alterações</>}
          </button>
        )}
      </div>

      <div className="inline-flex p-1 rounded-xl bg-[rgba(116,116,128,0.08)]">
        {abas.map(a => (
          <button key={a.id} onClick={() => {
            // Ao sair do desempenho, o rascunho parte do que está salvo (envios e ocorrências inclusos)
            if (aba === "desempenho" && a.id !== "desempenho") setDraft(producao)
            setAba(a.id)
          }}
            className={`h-8 px-3.5 rounded-lg text-[12.5px] font-medium flex items-center gap-1.5 transition-all duration-150 ${
              aba === a.id ? "bg-white text-[#191625] shadow-sm" : "text-[#72707d] hover:text-[#191625]"
            }`}>
            {a.icon}{a.nome}
          </button>
        ))}
      </div>

      <div key={aba} className="animate-[apple-slide-up_.22s_ease-out]">
        {aba === "desempenho" && <Desempenho producao={producao} pedidosOpcoes={pedidosOpcoes} todosPedidos={todosPedidos} salvar={salvarProducao} />}
        {aba === "cadastro" && <Cadastro draft={draft} setDraft={setDraft} fornecedoresFin={(config.fornecedores ?? []).filter(f => f.ativo)} />}
        {aba === "ferramental" && <FerramentalLista draft={draft} setDraft={setDraft} />}
        {aba === "parametros" && <Parametros draft={draft} setDraft={setDraft} />}
        {aba === "calibragem" && <CalibragemView kanban={kanban} lancamentos={lancamentos} historico={historico} config={config} onCategorizar={onCategorizar}
          onAtualizarConfig={cfg => { onSave(cfg); setDraft(normalizarProducao(cfg.producao)) }} />}
      </div>
    </div>
  )
}
