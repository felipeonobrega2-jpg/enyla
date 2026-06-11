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

  const precoItem = (item: HistItem) => {
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

  const filtradoPropostas = propostasCustom.filter(p =>
    !busca.trim() ||
    p.nomeCliente.toLowerCase().includes(busca.toLowerCase()) ||
    p.data.toLowerCase().includes(busca.toLowerCase()) ||
    p.numero.toLowerCase().includes(busca.toLowerCase())
  )

  const temResultados = filtrado.length > 0 || filtradoPropostas.length > 0

  if (!historico.length && !propostasCustom.length) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-1">
        <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </div>
      <p className="text-[14px] font-semibold text-slate-700">Nenhum registro ainda</p>
      <p className="text-[12px] text-slate-400 max-w-[260px] leading-relaxed">
        Orçamentos calculados e propostas personalizadas aparecerão aqui.
      </p>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-5">

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
            placeholder="Buscar por cliente, número ou data…"
            className="w-full border border-slate-200 rounded-xl pl-9 pr-9 py-2.5 text-[13px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
          {busca && (
            <button onClick={() => setBusca("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg leading-none transition-colors">×</button>
          )}
        </div>
        <select
          value={ordem}
          onChange={e => setOrdem(e.target.value as OrdemHistorico)}
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="recente">Mais recentes</option>
          <option value="antigo">Mais antigos</option>
          <option value="maior">Maior valor</option>
          <option value="menor">Menor valor</option>
          <option value="nome">Nome A–Z</option>
        </select>
      </div>

      {/* Sem resultados */}
      {!temResultados && busca && (
        <div className="text-center py-16">
          <p className="text-[13px] text-slate-400">Nenhum resultado para <span className="font-medium text-slate-600">"{busca}"</span>.</p>
        </div>
      )}

      {/* Orçamentos calculados */}
      {filtrado.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {(historico.length > 0 && propostasCustom.length > 0) && (
            <SectionLabel>Orçamentos calculados · {filtrado.length}</SectionLabel>
          )}
          {historico.length > 0 && propostasCustom.length === 0 && (
            <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-400 mb-1">
              {filtrado.length} de {historico.length} orçamento{historico.length !== 1 ? "s" : ""}
            </p>
          )}

          {filtrado.map(({ item, originalIndex }) => {
            const ideal = item.calculo.tabela.find(l => l.quantidade === item.calculo.sweetSpotIdealQtd) ?? item.calculo.tabela[0]
            const preco = precoItem(item)
            const initial = item.form.nomeCliente?.[0]?.toUpperCase() ?? "#"
            return (
              <div
                key={originalIndex}
                className="group relative bg-white border border-slate-100 rounded-2xl overflow-hidden hover:border-slate-200 hover:shadow-[0_2px_12px_rgba(0,0,0,0.05)] transition-all duration-200"
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Avatar */}
                  <button
                    onClick={() => onDetalhes?.(item)}
                    className="w-10 h-10 rounded-full bg-slate-900 text-white text-[13px] font-bold flex items-center justify-center shrink-0 hover:bg-slate-700 transition-colors"
                    tabIndex={-1}
                  >
                    {initial}
                  </button>

                  {/* Info */}
                  <button
                    onClick={() => onDetalhes?.(item)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[14px] text-slate-800 leading-snug">
                        {item.form.nomeCliente || "Sem nome"}
                      </span>
                      {item.numero && (
                        <span className="shrink-0 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full tabular-nums">
                          {item.numero}
                        </span>
                      )}
                    </div>
                    <p className="text-[11.5px] text-slate-400 mt-0.5">
                      {item.form.frente}×{item.form.alturaBox}×{item.form.lateral} cm
                      {item.form.materialNome && ` · ${item.form.materialNome}`}
                      {` · ${item.data}`}
                    </p>
                  </button>

                  {/* Right: price fades → actions appear on hover */}
                  <div className="relative shrink-0 flex items-center justify-end" style={{ minWidth: 196 }}>
                    <div className="text-right transition-opacity duration-150 group-hover:opacity-0 group-hover:pointer-events-none">
                      <p className="font-bold text-[15px] text-slate-800 tabular-nums">{brl(preco)}</p>
                      <p className="text-[11px] text-slate-400 tabular-nums">{num(ideal?.quantidade ?? 0)} un</p>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <IconBtn title="Replicar" onClick={() => onReplicar(item)}>
                        <CopyIcon />
                      </IconBtn>
                      {onPersonalizar && (
                        <IconBtn title="Personalizar proposta" onClick={() => onPersonalizar(item)} color="blue">
                          <SparkleIcon />
                        </IconBtn>
                      )}
                      <IconBtn title="WhatsApp" onClick={() => onWhatsApp(item)} color="green">
                        <WhatsAppIcon />
                      </IconBtn>
                      <IconBtn title="PDF Cliente" onClick={() => onDownloadPdfCliente(item)} color="blue">
                        <PdfClienteIcon />
                      </IconBtn>
                      <IconBtn title="PDF Gráfica" onClick={() => onDownloadPdf(item)}>
                        <PdfGraficaIcon />
                      </IconBtn>
                      <IconBtn title="Excluir" onClick={() => { if (confirm("Excluir este orçamento?")) onExcluir(originalIndex) }} color="red">
                        <TrashIcon />
                      </IconBtn>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Propostas personalizadas */}
      {filtradoPropostas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionLabel>Propostas personalizadas · {filtradoPropostas.length}</SectionLabel>

          {filtradoPropostas.map(p => {
            const linhasAtivas = p.linhas.filter(l => l.ativa && l.quantidade > 0)
            const ideal = linhasAtivas.find(l => l.isIdeal) ?? linhasAtivas[linhasAtivas.length - 1]
            const preco = ideal ? ideal.unitario * ideal.quantidade : null
            const initial = p.nomeCliente?.[0]?.toUpperCase() ?? "#"
            return (
              <div
                key={p.id}
                className="group relative bg-white border border-slate-100 rounded-2xl overflow-hidden hover:border-slate-200 hover:shadow-[0_2px_12px_rgba(0,0,0,0.05)] transition-all duration-200"
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Avatar */}
                  <button
                    onClick={() => onDetalhes?.(p)}
                    className="w-10 h-10 rounded-full bg-slate-700 text-white text-[13px] font-bold flex items-center justify-center shrink-0 hover:bg-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {initial}
                  </button>

                  {/* Info */}
                  <button
                    onClick={() => onDetalhes?.(p)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[14px] text-slate-800 leading-snug">
                        {p.nomeCliente || "Sem nome"}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full tabular-nums">
                        {p.numero}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-slate-400 mt-0.5">
                      {[p.descricao, p.dimensoes, p.material].filter(Boolean).join(" · ") || "—"}
                      {` · ${p.data}`}
                    </p>
                  </button>

                  {/* Right: price → actions */}
                  <div className="relative shrink-0 flex items-center justify-end" style={{ minWidth: 164 }}>
                    <div className="text-right transition-opacity duration-150 group-hover:opacity-0 group-hover:pointer-events-none">
                      {preco != null
                        ? <>
                            <p className="font-bold text-[15px] text-slate-800 tabular-nums">{brl(preco)}</p>
                            <p className="text-[11px] text-slate-400 tabular-nums">{num(ideal!.quantidade)} un</p>
                          </>
                        : <p className="text-[13px] text-slate-300 font-medium">—</p>
                      }
                    </div>
                    <div className="absolute inset-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <IconBtn title="Editar proposta" onClick={() => onEditarCustom(p)} color="violet">
                        <EditIcon />
                      </IconBtn>
                      <IconBtn title="WhatsApp" onClick={() => onWhatsAppCustom(p)} color="green">
                        <WhatsAppIcon />
                      </IconBtn>
                      <IconBtn title="PDF Cliente" onClick={() => onPdfCustom(p)} color="blue">
                        <PdfClienteIcon />
                      </IconBtn>
                      <IconBtn title="Excluir" onClick={() => { if (confirm("Excluir esta proposta?")) onExcluirCustom(p.id) }} color="red">
                        <TrashIcon />
                      </IconBtn>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children, violet }: { children: React.ReactNode; violet?: boolean }) {
  return (
    <p className={`text-[10px] uppercase tracking-[0.12em] font-bold mb-1 ${violet ? "text-violet-400" : "text-slate-400"}`}>
      {children}
    </p>
  )
}

function IconBtn({
  title, onClick, children, color = "slate",
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  color?: "slate" | "blue" | "green" | "red" | "violet"
}) {
  const colors = {
    slate:  "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
    blue:   "text-blue-500  hover:bg-blue-50   hover:text-blue-700",
    green:  "text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700",
    red:    "text-rose-400  hover:bg-rose-50   hover:text-rose-600",
    violet: "text-violet-500 hover:bg-violet-50 hover:text-violet-700",
  }
  return (
    <button
      title={title}
      onClick={e => { e.stopPropagation(); onClick() }}
      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${colors[color]}`}
    >
      {children}
    </button>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CopyIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.847L0 24l6.335-1.502A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.373l-.36-.214-3.724.882.897-3.63-.235-.374A9.817 9.817 0 0 1 2.182 12c0-5.42 4.398-9.818 9.818-9.818 5.42 0 9.818 4.398 9.818 9.818 0 5.42-4.398 9.818-9.818 9.818z"/>
    </svg>
  )
}

function PdfClienteIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}

function PdfGraficaIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  )
}
