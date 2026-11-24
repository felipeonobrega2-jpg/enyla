"use client"
import { useState } from "react"

// Marcar perdido (motivo obrigatório), orçado à mão ou reabrir. Não envia nada ao cliente.
export async function marcarLead(jid: string, operacao: "perdido" | "orcado" | "reabrir"): Promise<boolean> {
  let motivo: string | undefined
  if (operacao === "perdido") {
    motivo = window.prompt("Por que perdeu? (obrigatório, ex.: fechou com outra a R$ 0,98)")?.trim()
    if (!motivo) return false
  }
  const r = await fetch("/api/whatsapp/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid, operacao, motivo }) })
  if (!r.ok) { window.alert((await r.json().catch(() => ({}))).erro ?? "Não salvou."); return false }
  return true
}

export function MarcarLead({ jid }: { jid: string }) {
  const [ocupado, setOcupado] = useState(false)
  const ir = async (op: "perdido" | "orcado" | "reabrir") => { setOcupado(true); await marcarLead(jid, op); setOcupado(false) }
  const cls = "text-[12.5px] font-semibold px-3 py-2 rounded-xl transition-colors hover:bg-black/5"
  return (
    <>
      <button disabled={ocupado} onClick={() => ir("perdido")} title="Marcar perdido, com o motivo" className={cls} style={{ color: "var(--text-sub)" }}>Marcar perdido</button>
      <button disabled={ocupado} onClick={() => ir("orcado")} title="Já mandei o orçamento (quando o sistema não percebeu)" className={cls} style={{ color: "var(--text-sub)" }}>Orçado</button>
      <button disabled={ocupado} onClick={() => ir("reabrir")} title="Volta ao normal" className={cls} style={{ color: "var(--text-sub)" }}>Reabrir lead</button>
    </>
  )
}
