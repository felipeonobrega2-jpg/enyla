"use client"

// Acompanhamento do pedido Digital, no visual do /track da Offset (hero da etapa, previsão de entrega, pagamento, linha do tempo).
// Só mostra o que a API entrega (lista fechada, sem dado sensível). O pagamento vem do "a receber"; fora dele, "em conferência".
import type { Acompanhamento } from "@/app/lib/acompanhamentoDigital"
import { formatarData } from "@/app/lib/formato"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const dataBR = (iso: string | null) => iso ? formatarData(iso, "completo") : null
const cm = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
const ARTE = { aprovada: "Arte aprovada", ajustes_pedidos: "Ajustes na arte em andamento", esperando_cliente: "Arte esperando a sua aprovação", nao_enviada: "Arte ainda não enviada" } as const

export function AcompanhamentoDigital({ a, resumo = true }: { a: Acompanhamento; resumo?: boolean }) {
  const fim = a.etapaAtual.chave === "enviado"
  const pg = a.pagamento
  const pagoPct = pg.situacao === "ok" && a.valorTotal > 0 ? Math.min(100, Math.round(pg.pago / a.valorTotal * 100)) : 0
  return (
    <div className="space-y-3" data-testid="acompanhamento">
      <div className="rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.08)]" style={{ background: fim ? "#009351" : "#8456e8" }}>
        <div className="px-5 pt-4 pb-1 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wide text-white/70">{fim ? "Concluído" : "Em andamento"}</p>
          <p className="text-[11px] font-bold text-white/80">{a.numero}{a.primeiroNome ? ` · ${a.primeiroNome}` : ""}</p>
        </div>
        <div className="px-5 py-4">
          <p className="font-bold text-white text-[17px] leading-snug">{a.etapaAtual.rotulo}</p>
          {a.etapaAtual.em && <p className="text-white/75 text-[12.5px] mt-1">desde {dataBR(a.etapaAtual.em)}</p>}
          <p className="text-white/75 text-[12.5px] mt-1">{ARTE[a.arte]}</p>
        </div>
        <div className="mx-4 mb-3 rounded-xl px-4 py-3 bg-white/10">
          <p className="text-[10px] font-bold uppercase tracking-wide text-white/60">Previsão de entrega</p>
          <p className="text-white font-semibold text-[13px] mt-0.5 leading-snug">{a.prazoEntrega.texto}</p>
        </div>
        <div className="mx-4 mb-4 rounded-xl px-4 py-3 bg-white/10">
          {pg.situacao === "ok" ? (<>
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide text-white/50 mb-0.5">Pago{pg.pagoEm ? ` em ${dataBR(pg.pagoEm)}` : ""}</p>
                <p className="text-[16px] font-semibold text-emerald-300 tabular-nums leading-none">{brl(pg.pago)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-wide text-white/50 mb-0.5">Saldo{pg.saldo > 0 ? (pg.vencimento ? ` · vence ${dataBR(pg.vencimento)}` : " · vence quando ficar pronto") : ""}</p>
                <p className={`text-[16px] font-semibold tabular-nums leading-none ${pg.saldo <= 0 ? "text-emerald-300" : "text-white/80"}`}>{brl(pg.saldo)}</p>
              </div>
            </div>
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pagoPct}%`, background: "#009351" }} /></div>
          </>) : (
            <p className="text-white/80 text-[12.5px] leading-snug">{pg.mensagem}</p>
          )}
        </div>
      </div>

      {resumo && <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] p-5">
        <p className="text-[10.5px] uppercase tracking-wide font-bold text-[#8E8E93] mb-2">Resumo do pedido</p>
        <p className="text-[13px] text-[#191625]">{a.quantidade.toLocaleString("pt-BR")} caixinhas · {cm(a.medida.altura)} × {cm(a.medida.largura)} × {cm(a.medida.profundidade)} cm</p>
        <p className="text-[12.5px] text-[#8E8E93] mt-0.5">{a.tipo}</p>
        <p className="text-[12.5px] text-[#8E8E93] mt-2">Valor total <strong className="text-[#191625]">{brl(a.valorTotal)}</strong> · sinal de 50% <strong className="text-[#191625]">{brl(a.sinal)}</strong></p>
      </div>}

      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[rgba(60,60,67,0.06)]">
          <p className="text-[10.5px] uppercase tracking-wide font-bold text-[#8E8E93]">Detalhes do progresso</p>
        </div>
        <ol className="px-5 py-4">
          {a.historico.map((e, i) => {
            const atual = i === a.historico.length - 1 && !fim
            const ultimo = i === a.historico.length - 1
            return (
              <li key={e.chave} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] shrink-0 shadow-sm" style={{ background: atual ? "#8456e8" : "#009351" }}>{atual ? "•" : "✓"}</span>
                  {!ultimo && <span className="w-0.5 flex-1 my-1 min-h-[16px] rounded-full" style={{ background: "rgba(52,199,89,0.5)" }} />}
                </div>
                <div className={`flex-1 min-w-0 flex items-start justify-between gap-2 min-h-[24px] ${ultimo ? "" : "pb-3.5"}`}>
                  <span className={`text-[13px] leading-tight pt-1 ${atual ? "font-semibold text-[#1C1C1E]" : "font-semibold text-[#009351]"}`}>{e.rotulo}</span>
                  {e.em && <span className="text-[10px] text-[#8E8E93] tabular-nums shrink-0 pt-1.5">{dataBR(e.em)}</span>}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
