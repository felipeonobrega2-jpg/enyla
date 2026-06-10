"use client"

import { useState } from "react"
import { FormData, Calculo, PropostaCustom } from "../types"
import { brl, num } from "../utils"

type OrdemHistorico = "recente" | "antigo" | "maior" | "menor" | "nome"

export type HistItem = { form: FormData; calculo: Calculo; data: string; numero?: string }

export function HistoricoView({
  historico,
  propostasCustom,
  onReplicar,
  onDownloadPdf,
  onDownloadPdfCliente,
  onExcluir,
  onWhatsApp,
  onPdfCustom,
  onWhatsAppCustom,
  onExcluirCustom,
  onEditarCustom,
  onPersonalizar,
  onDetalhes,
}: {
  historico: HistItem[]
  propostasCustom: PropostaCustom[]
  onReplicar: (item: HistItem) => void
  onDownloadPdf: (item: HistItem) => void
  onDownloadPdfCliente: (item: HistItem) => void
  onExcluir: (index: number) => void
  onWhatsApp: (item: HistItem) => void
  onPdfCustom: (p: PropostaCustom) => void
  onWhatsAppCustom: (p: PropostaCustom) => void
  onExcluirCustom: (id: string) => void
  onEditarCustom: (p: PropostaCustom) => void
  onPersonalizar?: (item: HistItem) => void
  onDetalhes?: (item: HistItem | PropostaCustom) => void
}) {
  const [busca, setBusca] = useState("")
  const [ordem, setOrdem] = useState<OrdemHistorico>("recente")

  const precoItem = (item: typeof historico[0]) => {
    const ideal = item.calculo.tabela.find(l => l.quantidade === item.calculo.sweetSpotIdealQtd) ?? item.calculo.tabela[0]
    return item.form.comFaca ? (ideal?.precoComFaca ?? 0) : (ideal?.precoSemFaca ?? 0)
  }

  const filtrado = historico
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => {
      if (!busca.trim()) return true
      const q = busca.toLowerCase()
      return (
        item.form.nomeCliente.toLowerCase().includes(q) ||
        item.data.toLowerCase().includes(q) ||
        (item.numero?.toLowerCase().includes(q) ?? false)
      )
    })
    .sort((a, b) => {
      if (ordem === "recente") return a.originalIndex - b.originalIndex
      if (ordem === "antigo")  return b.originalIndex - a.originalIndex
      if (ordem === "maior")   return precoItem(b.item) - precoItem(a.item)
      if (ordem === "menor")   return precoItem(a.item) - precoItem(b.item)
      if (ordem === "nome")    return (a.item.form.nomeCliente || "").localeCompare(b.item.form.nomeCliente || "", "pt-BR")
      return 0
    })

  if (!historico.length) return (
    <div className="flex flex-col items-center justify-center h-full text-slate-400">
      <p className="text-sm">Nenhum orçamento salvo ainda.</p>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-3">

      {/* Barra de busca + ordenação */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por cliente ou data…"
            className="w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {busca && (
            <button onClick={() => setBusca("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg leading-none">×</button>
          )}
        </div>
        <select
          value={ordem}
          onChange={e => setOrdem(e.target.value as OrdemHistorico)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-[13px] text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="recente">Mais recentes</option>
          <option value="antigo">Mais antigos</option>
          <option value="maior">Maior valor</option>
          <option value="menor">Menor valor</option>
          <option value="nome">Nome A–Z</option>
        </select>
      </div>

      {/* Contador */}
      <p className="text-[9.5px] uppercase tracking-[0.12em] font-bold text-slate-400">
        {filtrado.length} de {historico.length} orçamento{historico.length !== 1 ? "s" : ""}
        {busca ? ` para "${busca}"` : ""}
      </p>

      {filtrado.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">
          Nenhum orçamento encontrado para "{busca}".
        </div>
      )}

      {filtrado.map(({ item, originalIndex }) => {
        const ideal = item.calculo.tabela.find(l => l.quantidade === item.calculo.sweetSpotIdealQtd) ?? item.calculo.tabela[0]
        const preco = precoItem(item)
        return (
          <div key={originalIndex} className="bg-white border border-slate-100 rounded-2xl flex items-center gap-4 hover:border-slate-200 hover:shadow-sm transition-all duration-150 overflow-hidden">
            <button
              onClick={() => onDetalhes?.(item)}
              className="flex items-center gap-4 flex-1 min-w-0 px-5 py-3.5 text-left hover:bg-slate-50/60 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center shrink-0">
                {item.form.nomeCliente?.[0]?.toUpperCase() ?? "#"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-800 truncate">{item.form.nomeCliente || "Sem nome"}</p>
                  {item.numero && (
                    <span className="shrink-0 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full tabular-nums">
                      {item.numero}
                    </span>
                  )}
                </div>
                <p className="text-slate-400 text-[11.5px] mt-0.5">
                  {item.form.frente}×{item.form.alturaBox}×{item.form.lateral} cm · {item.form.materialNome || item.calculo.melhorFormato.formatoNome} · {item.data}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-slate-800 text-[15px]">{brl(preco)}</p>
                <p className="text-[11px] text-slate-400 tabular-nums">{num(ideal?.quantidade ?? 0)} un</p>
              </div>
            </button>
            <div className="flex flex-col gap-1.5 shrink-0 pr-5 py-3.5">
              <button onClick={() => onReplicar(item)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-700 text-white text-[11.5px] font-semibold rounded-lg transition-all whitespace-nowrap">
                Replicar
              </button>
              {onPersonalizar && (
                <button onClick={() => onPersonalizar(item)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11.5px] font-semibold rounded-lg transition-all whitespace-nowrap">
                  Personalizar ↗
                </button>
              )}
              <button onClick={() => onWhatsApp(item)}
                className="px-3 py-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white text-[11.5px] font-medium rounded-lg transition-all whitespace-nowrap flex items-center justify-center gap-1.5">
                <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.847L0 24l6.335-1.502A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.373l-.36-.214-3.724.882.897-3.63-.235-.374A9.817 9.817 0 0 1 2.182 12c0-5.42 4.398-9.818 9.818-9.818 5.42 0 9.818 4.398 9.818 9.818 0 5.42-4.398 9.818-9.818 9.818z"/></svg>
                WhatsApp
              </button>
              <button onClick={() => onDownloadPdfCliente(item)}
                className="px-3 py-1.5 border border-blue-200 hover:bg-blue-50 text-blue-600 text-[11.5px] font-medium rounded-lg transition-all whitespace-nowrap">
                PDF Cliente
              </button>
              <button onClick={() => onDownloadPdf(item)}
                className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-500 text-[11.5px] font-medium rounded-lg transition-all whitespace-nowrap">
                PDF Gráfica
              </button>
              <button onClick={() => { if (confirm("Excluir este orçamento?")) onExcluir(originalIndex) }}
                className="px-3 py-1.5 border border-transparent hover:border-rose-100 hover:bg-rose-50 text-slate-300 hover:text-rose-500 text-[11.5px] font-medium rounded-lg transition-all whitespace-nowrap">
                Excluir
              </button>
            </div>
          </div>
        )
      })}

      {/* ── Propostas personalizadas ──────────────────────────────────────── */}
      {propostasCustom.length > 0 && (
        <>
          <p className="text-[9.5px] uppercase tracking-[0.12em] font-bold text-slate-400 pt-4">
            Propostas Personalizadas · {propostasCustom.length}
          </p>
          {propostasCustom
            .filter(p => !busca.trim() || p.nomeCliente.toLowerCase().includes(busca.toLowerCase()) || p.data.toLowerCase().includes(busca.toLowerCase()))
            .map(p => {
              const linhasAtivas = p.linhas.filter(l => l.ativa && l.quantidade > 0)
              const ideal = linhasAtivas.find(l => l.isIdeal) ?? linhasAtivas[linhasAtivas.length - 1]
              return (
                <div key={p.id} className="bg-white border border-violet-100 rounded-2xl flex items-center gap-4 hover:border-violet-200 hover:shadow-sm transition-all duration-150 overflow-hidden">
                  <button
                    onClick={() => onDetalhes?.(p)}
                    className="flex items-center gap-4 flex-1 min-w-0 px-5 py-3.5 text-left hover:bg-violet-50/30 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {p.nomeCliente?.[0]?.toUpperCase() ?? "#"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-800 truncate">{p.nomeCliente || "Sem nome"}</p>
                        <span className="shrink-0 text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full tabular-nums">
                          {p.numero}
                        </span>
                        <span className="shrink-0 text-[9px] font-semibold text-violet-500 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                          Personalizada
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11.5px] mt-0.5">
                        {[p.descricao, p.dimensoes, p.material].filter(Boolean).join(" · ") || "—"} · {p.data}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-slate-800 text-[15px]">{ideal ? brl(ideal.unitario * ideal.quantidade) : "—"}</p>
                      <p className="text-[11px] text-slate-400 tabular-nums">{ideal ? `${num(ideal.quantidade)} un` : ""}</p>
                    </div>
                  </button>
                  <div className="flex flex-col gap-1.5 shrink-0 pr-5 py-3.5">
                    <button onClick={() => onWhatsAppCustom(p)}
                      className="px-3 py-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white text-[11.5px] font-medium rounded-lg transition-all whitespace-nowrap flex items-center justify-center gap-1.5">
                      <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.847L0 24l6.335-1.502A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.373l-.36-.214-3.724.882.897-3.63-.235-.374A9.817 9.817 0 0 1 2.182 12c0-5.42 4.398-9.818 9.818-9.818 5.42 0 9.818 4.398 9.818 9.818 0 5.42-4.398 9.818-9.818 9.818z"/></svg>
                      WhatsApp
                    </button>
                    <button onClick={() => onPdfCustom(p)}
                      className="px-3 py-1.5 border border-violet-200 hover:bg-violet-50 text-violet-600 text-[11.5px] font-medium rounded-lg transition-all whitespace-nowrap">
                      PDF Cliente
                    </button>
                    <button onClick={() => { if (confirm("Excluir esta proposta?")) onExcluirCustom(p.id) }}
                      className="px-3 py-1.5 border border-transparent hover:border-rose-100 hover:bg-rose-50 text-slate-300 hover:text-rose-500 text-[11.5px] font-medium rounded-lg transition-all whitespace-nowrap">
                      Excluir
                    </button>
                  </div>
                </div>
              )
            })}
        </>
      )}
    </div>
  )
}
