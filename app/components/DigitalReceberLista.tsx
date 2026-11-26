"use client"

// "A receber" do Digital (aba da linha Digital e de "Juntas" no Financeiro). Só leitura.
// Pago = confirmado pelo Asaas ou ligado a uma transação do banco; o resto fica "em conferência".
import { useEffect, useState } from "react"
import { Cartao, Selo, Vazio } from "./ds"
import { brl } from "../utils"
import type { LinhaDigitalReceber } from "../lib/digitalReceber"

const data = (s: string | null) => s ? s.split("-").reverse().join("/") : "—"

export function DigitalReceberLista() {
  const [linhas, setLinhas] = useState<LinhaDigitalReceber[] | null>(null)
  useEffect(() => { fetch("/api/digital/receber").then(r => r.json()).then(j => setLinhas(j.linhas ?? [])).catch(() => setLinhas([])) }, [])
  if (!linhas) return <p className="text-[12px] text-[#8E8E93]">Carregando o Digital…</p>
  if (!linhas.length) return <Vazio icone={null} titulo="Nenhum pedido Digital a receber" />
  return (
    <div className="space-y-2">
      <p className="text-[11.5px] text-[#8E8E93]">Digital: pedidos com sinal pago ou saldo em aberto. O valor só conta como pago com confirmação do Asaas ou vínculo com o banco; senão fica em conferência.</p>
      {linhas.map(l => (
        <Cartao key={l.id}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#191625]">{l.id} · {l.cliente} <Selo tom="info">Digital</Selo></p>
              <p className="text-[12px] text-[#6c6a77]">Total {brl(l.total)} · sinal {brl(l.sinal)} · pago {brl(l.pago)}{l.emConferencia > 0 && <> · <span className="text-[#c57800] font-medium">{brl(l.emConferencia)} em conferência</span></>}</p>
            </div>
            <div className="text-right">
              <p className="text-[13px] font-semibold text-[#191625]">Saldo {brl(l.saldo)}</p>
              <p className="text-[11.5px]" style={{ color: l.atrasado ? "#c0392b" : "#8E8E93" }}>{l.saldo > 0 ? `Vence ${l.vencimentoSaldo ? data(l.vencimentoSaldo) : "quando o material ficar pronto"}${l.atrasado ? " · atrasado" : ""}` : "Quitado"}</p>
            </div>
          </div>
        </Cartao>
      ))}
    </div>
  )
}
