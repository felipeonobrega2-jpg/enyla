"use client"

import { useState } from "react"
import { KanbanCard, LancamentoFinanceiro } from "../types"
import { brl } from "../utils"

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

type Modo = "lote" | "pedido"

type ItemPedido = {
  cardId: string
  cardNumero: string
  descricao: string
  quantidade: string
  valor: string
}

export function ModalSobra({
  card,
  loteCards,
  onClose,
  onSave,
}: {
  card: KanbanCard
  loteCards: KanbanCard[]        // all cards in same lote (including this one), empty if solo
  onClose: () => void
  onSave: (lancamentos: Omit<LancamentoFinanceiro, "id" | "criadoEm">[]) => void
}) {
  const temLote = loteCards.length > 1
  const [modo, setModo] = useState<Modo>(temLote ? "lote" : "pedido")

  // Por lote
  const [qtdLote, setQtdLote]       = useState("")
  const [valorLote, setValorLote]   = useState("")

  // Por pedido
  const cards = temLote ? loteCards : [card]
  const [itens, setItens] = useState<ItemPedido[]>(
    cards.map(c => ({
      cardId: c.id,
      cardNumero: c.numero,
      descricao: c.dimensoes || c.materialNome || "",
      quantidade: "",
      valor: "",
    }))
  )

  const [data, setData]     = useState(card.dataFechamento || card.data?.slice(0, 10) || hoje())
  const [status, setStatus] = useState<"pago" | "pendente">("pendente")
  const [saving, setSaving] = useState(false)

  function updateItem(idx: number, field: keyof ItemPedido, v: string) {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, [field]: v } : it))
  }

  const totalLote = parseFloat(valorLote.replace(",", ".")) || 0
  const totalPedido = itens.reduce((s, it) => s + (parseFloat(it.valor.replace(",", ".")) || 0), 0)
  const total = modo === "lote" ? totalLote : totalPedido

  const podeSalvar = total > 0 && data

  function buildDescLote() {
    const qtd = qtdLote ? ` · ${qtdLote} un.` : ""
    const loteNum = card.loteNumero ? ` ${card.loteNumero}` : ""
    return `Sobras Lote${loteNum} — ${card.nomeCliente}${qtd}`
  }

  async function salvar() {
    setSaving(true)
    const base = {
      tipo: "receita" as const,
      categoria: "sobra",
      dataVencimento: data,
      dataPagamento: status === "pago" ? data : undefined,
      status: status === "pago" ? ("pago" as const) : ("pendente" as const),
      nomeCliente: card.nomeCliente,
      loteId: card.loteId,
      loteNumero: card.loteNumero,
    }

    let lancamentos: Omit<LancamentoFinanceiro, "id" | "criadoEm">[]

    if (modo === "lote") {
      lancamentos = [{
        ...base,
        descricao: buildDescLote(),
        valor: totalLote,
        cardId: temLote ? undefined : card.id,
        cardNumero: temLote ? undefined : card.numero,
      }]
    } else {
      lancamentos = itens
        .filter(it => (parseFloat(it.valor.replace(",", ".")) || 0) > 0)
        .map(it => ({
          ...base,
          descricao: `Sobra Pedido ${it.cardNumero}${it.quantidade ? ` · ${it.quantidade} un.` : ""} — ${card.nomeCliente}`,
          valor: parseFloat(it.valor.replace(",", ".")) || 0,
          cardId: it.cardId,
          cardNumero: it.cardNumero,
        }))
    }

    onSave(lancamentos)
    onClose()
    setSaving(false)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col overflow-hidden" style={{ maxHeight: "85vh" }}>

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-[rgba(60,60,67,0.08)] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold text-[#1C1C1E] text-[15px]">Registrar sobras</p>
              <p className="text-[11.5px] text-[#8E8E93] mt-0.5">
                {card.nomeCliente}{card.loteNumero ? ` · ${card.loteNumero}` : ` · ${card.numero}`}
              </p>
            </div>
            <button onClick={onClose} className="text-[rgba(60,60,67,0.3)] hover:text-[#8E8E93] transition-colors text-xl leading-none mt-0.5 shrink-0">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Modo — só mostrar se tiver lote com múltiplos pedidos */}
          {temLote && (
            <div className="space-y-2">
              <p className="text-[9.5px] uppercase tracking-wide font-semibold text-[#8E8E93]">Como foi negociado?</p>
              <div className="grid grid-cols-2 gap-2">
                {(["lote", "pedido"] as Modo[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setModo(m)}
                    className={`py-2.5 rounded-xl border text-[12px] font-semibold transition-colors ${
                      modo === m
                        ? "border-[#5009c4] bg-[#5009c4]/[0.07] text-[#5009c4]"
                        : "border-[rgba(60,60,67,0.12)] text-[#8E8E93] hover:border-[rgba(60,60,67,0.25)]"
                    }`}
                  >
                    {m === "lote" ? "Por lote total" : "Por pedido"}
                  </button>
                ))}
              </div>
              {modo === "lote" && (
                <p className="text-[10.5px] text-[rgba(60,60,67,0.5)]">
                  Um valor único para todas as sobras do lote ({loteCards.length} pedidos).
                </p>
              )}
              {modo === "pedido" && (
                <p className="text-[10.5px] text-[rgba(60,60,67,0.5)]">
                  Valor separado por cada produto do lote.
                </p>
              )}
            </div>
          )}

          {/* Por lote */}
          {modo === "lote" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-[9.5px] uppercase tracking-wide font-semibold text-[#8E8E93]">Quantidade total sobrou</p>
                <div className="flex items-center gap-2 border border-[rgba(60,60,67,0.12)] rounded-xl px-3 py-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={qtdLote}
                    onChange={e => setQtdLote(e.target.value)}
                    placeholder="ex: 3.000"
                    className="flex-1 text-[13px] text-[#1C1C1E] placeholder:text-[rgba(60,60,67,0.3)] bg-transparent focus:outline-none"
                  />
                  <span className="text-[11px] text-[#8E8E93] shrink-0">unidades</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[9.5px] uppercase tracking-wide font-semibold text-[#8E8E93]">Valor negociado</p>
                <div className="flex items-center gap-2 border border-[rgba(60,60,67,0.12)] rounded-xl px-3 py-2">
                  <span className="text-[12px] text-[#8E8E93] shrink-0">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={valorLote}
                    onChange={e => setValorLote(e.target.value)}
                    placeholder="0,00"
                    className="flex-1 text-[13px] text-[#1C1C1E] placeholder:text-[rgba(60,60,67,0.3)] bg-transparent focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Por pedido */}
          {modo === "pedido" && (
            <div className="space-y-3">
              {itens.map((it, idx) => (
                <div key={it.cardId} className="rounded-xl border border-[rgba(60,60,67,0.1)] overflow-hidden">
                  <div className="px-3 py-2 bg-[rgba(60,60,67,0.02)] border-b border-[rgba(60,60,67,0.06)] flex items-center gap-2">
                    <span className="text-[9.5px] font-bold text-[#5009c4] bg-[#5009c4]/[0.08] border border-[#5009c4]/20 px-1.5 py-0.5 rounded-full">{it.cardNumero}</span>
                    <span className="text-[11px] text-[rgba(60,60,67,0.6)] truncate flex-1">{it.descricao}</span>
                  </div>
                  <div className="p-3 grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <p className="text-[9px] uppercase tracking-wide text-[#8E8E93] font-semibold">Qtd sobrou</p>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={it.quantidade}
                        onChange={e => updateItem(idx, "quantidade", e.target.value)}
                        placeholder="ex: 1.500"
                        className="w-full border border-[rgba(60,60,67,0.12)] rounded-lg px-2.5 py-1.5 text-[12px] text-[#1C1C1E] placeholder:text-[rgba(60,60,67,0.3)] focus:outline-none focus:ring-1 focus:ring-[#5009c4]/30"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] uppercase tracking-wide text-[#8E8E93] font-semibold">Valor (R$)</p>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={it.valor}
                        onChange={e => updateItem(idx, "valor", e.target.value)}
                        placeholder="0,00"
                        className="w-full border border-[rgba(60,60,67,0.12)] rounded-lg px-2.5 py-1.5 text-[12px] text-[#1C1C1E] placeholder:text-[rgba(60,60,67,0.3)] focus:outline-none focus:ring-1 focus:ring-[#5009c4]/30"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Data + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <p className="text-[9.5px] uppercase tracking-wide font-semibold text-[#8E8E93]">Data</p>
              <input
                type="date"
                value={data}
                onChange={e => setData(e.target.value)}
                className="w-full border border-[rgba(60,60,67,0.12)] rounded-xl px-3 py-2 text-[12.5px] text-[#1C1C1E] focus:outline-none focus:ring-1 focus:ring-[#5009c4]/30"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-[9.5px] uppercase tracking-wide font-semibold text-[#8E8E93]">Status</p>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as "pago" | "pendente")}
                className="w-full border border-[rgba(60,60,67,0.12)] rounded-xl px-3 py-2 text-[12.5px] text-[#1C1C1E] bg-white focus:outline-none focus:ring-1 focus:ring-[#5009c4]/30"
              >
                <option value="pendente">A receber</option>
                <option value="pago">Recebido</option>
              </select>
            </div>
          </div>

          {/* Total preview */}
          {total > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-[#34C759]/[0.06] border border-[#34C759]/20 px-4 py-3">
              <p className="text-[12px] font-semibold text-[rgba(60,60,67,0.6)]">Total sobras</p>
              <p className="text-[15px] font-bold text-[#34C759]">{brl(total)}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-[rgba(60,60,67,0.06)] shrink-0 flex gap-2.5">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-[rgba(60,60,67,0.12)] text-[13px] font-semibold text-[#8E8E93] hover:bg-[rgba(60,60,67,0.03)] transition-colors">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={!podeSalvar || saving}
            className="flex-1 h-10 rounded-xl bg-[#1C1C1E] hover:bg-[#2C2C2E] text-white text-[13px] font-semibold transition-colors disabled:opacity-40"
          >
            {saving ? "Salvando…" : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  )
}
