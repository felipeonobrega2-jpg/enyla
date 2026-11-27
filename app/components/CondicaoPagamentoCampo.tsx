"use client"
// Condição de pagamento do orçamento: padrão (sinal + restante na entrega) ou personalizada em parcelas de % com
// prazo em dias, contados da aprovação ou da entrega. Aparece no PDF, na mensagem e na página de aprovação.
import { Plus, X } from "lucide-react"
import { parcelasDa, somaPct, textoCondicao, type CondicaoPagamento, type ParcelaCondicao } from "../lib/condicaoPagamento"

const botao = (ativo: boolean) => `px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${ativo
  ? "bg-[#0b0914] text-white border-slate-900"
  : "border-[rgba(60,60,67,0.12)] text-[#8E8E93] hover:bg-[rgba(116,116,128,0.04)]"}`
const campo = "border border-[rgba(60,60,67,0.12)] rounded-lg px-2 py-1.5 text-xs text-slate-900 text-center focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8]"

// Modelos rápidos para começar a personalizada
const MODELOS: { nome: string; parcelas: ParcelaCondicao[] }[] = [
  { nome: "30/70", parcelas: [{ pct: 30, dias: 0, base: "aprovacao" }, { pct: 70, dias: 0, base: "entrega" }] },
  { nome: "50% + 30 dias", parcelas: [{ pct: 50, dias: 0, base: "aprovacao" }, { pct: 50, dias: 30, base: "entrega" }] },
  { nome: "30/60/90", parcelas: [{ pct: 34, dias: 30, base: "aprovacao" }, { pct: 33, dias: 60, base: "aprovacao" }, { pct: 33, dias: 90, base: "aprovacao" }] },
]

export function CondicaoPagamentoCampo({ valor, sinalPct, onChange }: { valor?: CondicaoPagamento; sinalPct: number; onChange: (c: CondicaoPagamento) => void }) {
  const personalizada = valor?.tipo === "personalizada"
  const parcelas = personalizada ? valor.parcelas : parcelasDa(null, sinalPct)
  const soma = somaPct(parcelas)
  const mudar = (i: number, p: Partial<ParcelaCondicao>) => onChange({ tipo: "personalizada", parcelas: parcelas.map((x, j) => j === i ? { ...x, ...p } : x) })
  const falta = Math.round((100 - soma) * 100) / 100

  return (
    <div className="space-y-2.5">
      <div className="flex gap-1.5 flex-wrap">
        <button type="button" className={botao(!personalizada)} onClick={() => onChange({ tipo: "padrao" })}>Padrão ({sinalPct}/{100 - sinalPct})</button>
        <button type="button" className={botao(personalizada)} onClick={() => onChange({ tipo: "personalizada", parcelas: parcelasDa(null, sinalPct) })}>Outra forma</button>
      </div>

      {personalizada && (
        <div className="space-y-2">
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-[11px] text-[#898892]">Modelos:</span>
            {MODELOS.map(m => <button key={m.nome} type="button" className="px-2 py-1 rounded-lg text-[11px] text-[#5e5c68] border border-[rgba(60,60,67,0.12)] hover:bg-[rgba(116,116,128,0.04)]" onClick={() => onChange({ tipo: "personalizada", parcelas: m.parcelas })}>{m.nome}</button>)}
          </div>
          {parcelas.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5 flex-wrap">
              <input type="number" min={0} max={100} value={p.pct} aria-label={`Parcela ${i + 1}: porcentagem`}
                onChange={e => mudar(i, { pct: Math.min(100, Math.max(0, Number(e.target.value))) })} className={`${campo} w-16`} />
              <span className="text-xs text-[#5e5c68]">%</span>
              <span className="text-xs text-[#5e5c68]">em</span>
              <input type="number" min={0} max={365} value={p.dias} aria-label={`Parcela ${i + 1}: dias`}
                onChange={e => mudar(i, { dias: Math.min(365, Math.max(0, Math.round(Number(e.target.value)))) })} className={`${campo} w-16`} />
              <span className="text-xs text-[#5e5c68]">dias</span>
              <select value={p.base} onChange={e => mudar(i, { base: e.target.value as ParcelaCondicao["base"] })} aria-label={`Parcela ${i + 1}: contados de`}
                className="border border-[rgba(60,60,67,0.12)] rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8]">
                <option value="aprovacao">após a aprovação</option>
                <option value="entrega">após a entrega</option>
              </select>
              {parcelas.length > 1 && (
                <button type="button" aria-label="Tirar parcela" title="Tirar parcela" className="p-1 rounded-lg text-[#898892] hover:text-[#d33a3c] hover:bg-[rgba(116,116,128,0.06)]"
                  onClick={() => onChange({ tipo: "personalizada", parcelas: parcelas.filter((_, j) => j !== i) })}><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ))}
          <button type="button" className="flex items-center gap-1 text-[12px] font-medium text-[#8456e8] hover:text-[#7445d4]"
            onClick={() => onChange({ tipo: "personalizada", parcelas: [...parcelas, { pct: falta > 0 ? falta : 0, dias: 30, base: "aprovacao" }] })}>
            <Plus className="w-3.5 h-3.5" /> Adicionar parcela
          </button>
          {Math.abs(falta) >= 0.01 && (
            <p className="text-[11.5px] text-[#d33a3c]">As parcelas somam {String(soma).replace(".", ",")}%. {falta > 0 ? `Faltam ${String(falta).replace(".", ",")}%.` : `Passou ${String(-falta).replace(".", ",")}%.`} Precisa fechar 100%.</p>
          )}
        </div>
      )}
      <p className="text-[11px] text-[#898892] leading-snug">Para o cliente: <span className="text-[#5e5c68] font-medium">{textoCondicao(valor, sinalPct)}</span>. O que vence na aprovação é o que a página de aprovação cobra no Pix.</p>
    </div>
  )
}
