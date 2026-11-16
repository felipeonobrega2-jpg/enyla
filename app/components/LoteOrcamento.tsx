"use client"

// Orçamento em lote: o mesmo cliente com tamanhos diferentes (30 ml, 50 ml, 100 ml). Você monta cada um na mesa,
// adiciona ao lote e no fim salva todos (um ORC por item, cada um com a sua aprovação) e manda uma proposta só.

import { Layers, Plus, X, SendHorizontal, Loader2, PencilLine } from "lucide-react"
import type { FormData, Calculo } from "../types"
import { brl, num } from "../utils"

export type ItemLote = { id: string; form: FormData; calculo: Calculo }

const n1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
export function medidasLote(f: FormData): string {
  if (f.pecaPlana) return `${f.pecaPlana.nome} ${n1(f.pecaPlana.largura)}×${n1(f.pecaPlana.comprimento)} cm`
  if (f.frente > 0) return `${n1(f.frente)}×${n1(f.alturaBox)}×${n1(f.lateral)} cm`
  if (f.caixaDxf) return `${[f.caixaDxf.largura, f.caixaDxf.altura, f.caixaDxf.profundidade].map(v => n1(v / 10)).join("×")} cm`
  return "Caixa do DXF"
}
export function idealLote(it: { form: FormData; calculo: Calculo }) {
  const t = it.calculo.tabela
  const l = t.find(x => x.quantidade === it.calculo.sweetSpotIdealQtd) ?? t[t.length - 1]
  return l ? { quantidade: l.quantidade, total: it.form.comFaca ? l.precoComFaca : l.precoSemFaca } : { quantidade: 0, total: 0 }
}

export function LoteOrcamento({ itens, podeAdicionar, mesaNoLote, salvando, onAdicionar, onAbrir, onRemover, onSalvarEnviar }: {
  itens: ItemLote[]
  podeAdicionar: boolean     // tem cálculo na mesa
  mesaNoLote: boolean        // o que está na mesa já é um item do lote (igual)
  salvando: boolean
  onAdicionar: () => void
  onAbrir: (id: string) => void
  onRemover: (id: string) => void
  onSalvarEnviar: () => void
}) {
  const soma = itens.reduce((s, it) => s + idealLote(it).total, 0)
  const cliente = itens[0]?.form.nomeCliente.trim()

  if (!itens.length) return podeAdicionar ? (
    <button type="button" onClick={onAdicionar}
      className="w-full h-9 rounded-xl border border-dashed border-[#8456e8]/35 text-[#8456e8] text-[11.5px] font-semibold flex items-center justify-center gap-1.5 hover:bg-[#8456e8]/[0.04] transition-colors"
      title="O cliente quer mais de um tamanho? Adicione este e monte o próximo: sai uma proposta só">
      <Layers className="w-3.5 h-3.5" />Outro tamanho para o mesmo cliente
    </button>
  ) : null

  return (
    <div className="rounded-xl border border-[#8456e8]/20 bg-[#8456e8]/[0.04] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#8456e8] flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" />Lote{cliente ? ` · ${cliente}` : ""}</p>
        <p className="text-[11px] font-semibold text-[#5e5c68]">{itens.length} {itens.length === 1 ? "item" : "itens"}</p>
      </div>
      <ul className="space-y-1">
        {itens.map((it, i) => {
          const ideal = idealLote(it)
          return (
            <li key={it.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 border border-[rgba(60,60,67,0.08)]">
              <span className="w-5 h-5 rounded-full bg-[#8456e8]/10 text-[#8456e8] text-[10.5px] font-bold grid place-items-center shrink-0">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-[#191625] truncate">{medidasLote(it.form)}</span>
                <span className="block text-[10.5px] text-[#898892] truncate">{num(ideal.quantidade)} un · {brl(ideal.total)}{it.form.materialNome ? ` · ${it.form.materialNome}` : ""}</span>
              </span>
              <button type="button" onClick={() => onAbrir(it.id)} title="Abrir na mesa para ajustar (sai do lote até você adicionar de novo)" aria-label={`Ajustar item ${i + 1}`}
                className="w-6 h-6 grid place-items-center rounded-md text-[#898892] hover:text-[#8456e8] hover:bg-[#8456e8]/[0.06]"><PencilLine className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => onRemover(it.id)} title="Tirar do lote" aria-label={`Tirar item ${i + 1}`}
                className="w-6 h-6 grid place-items-center rounded-md text-[#898892] hover:text-[#d92d20] hover:bg-[#d92d20]/[0.06]"><X className="w-3.5 h-3.5" /></button>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center justify-between text-[11.5px] px-0.5">
        <span className="text-[#5e5c68]">Total nas quantidades recomendadas</span>
        <span className="font-bold text-[#191625]">{brl(soma)}</span>
      </div>
      {podeAdicionar && !mesaNoLote && (
        <button type="button" onClick={onAdicionar}
          className="w-full h-8 rounded-lg bg-white border border-[#8456e8]/30 text-[#8456e8] text-[11.5px] font-semibold flex items-center justify-center gap-1.5 hover:bg-[#8456e8]/[0.05]">
          <Plus className="w-3.5 h-3.5" />Adicionar o que está na mesa
        </button>
      )}
      <button type="button" onClick={onSalvarEnviar} disabled={salvando || itens.length < 2}
        title={itens.length < 2 ? "Adicione pelo menos dois tamanhos" : undefined}
        className="w-full h-9 rounded-lg bg-[#8456e8] hover:bg-[#7445d4] disabled:opacity-40 text-white text-[12px] font-bold flex items-center justify-center gap-1.5">
        {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SendHorizontal className="w-3.5 h-3.5" />}
        {salvando ? "Salvando…" : `Salvar e enviar os ${itens.length} numa proposta`}
      </button>
      {podeAdicionar && !mesaNoLote && <p className="text-[10.5px] text-[#898892] leading-snug">O que está na mesa agora só entra se você adicionar.</p>}
    </div>
  )
}
