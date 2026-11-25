"use client"

// A receber do Digital (Financeiro → Digital / Juntas). Só leitura. "Pago" só conta com confirmação do Asaas (txId asaas:)
// ou lançamento ligado a uma transação do banco; o resto fica "em conferência". Saldo sem vencimento até o "Material pronto".
import { useEffect, useState } from "react"
import { Cartao, Selo } from "./ds"
import type { LinhaReceber } from "@/app/lib/digitalReceber"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const br = (iso: string | null) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—"

export default function ReceberDigital() {
  const [dados, setDados] = useState<{ pedidos: LinhaReceber[]; aReceber: number; pago: number } | null | "erro">(null)
  useEffect(() => { fetch("/api/digital/receber").then(r => r.ok ? r.json() : "erro").then(setDados).catch(() => setDados("erro")) }, [])
  if (dados === null) return <p className="text-[12px] text-[#898892]">Carregando o Digital…</p>
  if (dados === "erro") return <p className="text-[12px] text-[#d33a3c]">Não consegui ler o a receber do Digital.</p>
  return (
    <Cartao>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12.5px] font-semibold text-[#191625]">Digital · a receber</p>
        <p className="text-[12px] text-[#5e5c68] ds-num">{brl(dados.aReceber)} de saldo · {brl(dados.pago)} já confirmado</p>
      </div>
      {!dados.pedidos.length ? <p className="text-[12px] text-[#898892] py-4 text-center">Nenhum pedido Digital com sinal ou saldo em aberto.</p> : (
        <div className="divide-y divide-[rgba(60,60,67,0.08)]">
          {dados.pedidos.map(p => (
            <div key={p.id} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
              <span className="font-semibold text-[#191625] w-24">{p.id}</span>
              <span className="flex-1 min-w-[120px] text-[#5e5c68] truncate">{p.cliente ?? "—"}</span>
              <span className="ds-num">total {brl(p.total)}</span>
              <span className="ds-num">sinal {brl(p.sinal)} {p.parteSinal.estado === "pago" ? <Selo tom="sucesso">pago {br(p.parteSinal.recebidoEm)}</Selo> : p.parteSinal.estado === "em_conferencia" ? <Selo tom="alerta">em conferência</Selo> : null}</span>
              <span className="ds-num">pago {brl(p.pago)}</span>
              <span className="ds-num font-semibold">saldo {brl(p.saldo)} {p.parteRestante.estado === "em_conferencia" && <Selo tom="alerta">em conferência</Selo>}</span>
              <span className="text-[#898892] w-28 text-right">{p.vencimentoSaldo ? `vence ${br(p.vencimentoSaldo)}` : p.parteRestante.estado === "pago" ? `pago ${br(p.parteRestante.recebidoEm)}` : "vence no material pronto"}</span>
            </div>
          ))}
        </div>
      )}
    </Cartao>
  )
}
