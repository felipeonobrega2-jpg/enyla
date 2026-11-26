"use client"
import { useState } from "react"
import { TEXTO_CAIXA_TERMOS, ERRO_TERMOS } from "../../lib/termosParceria"

export default function AceiteTermos({ token, jaAceitou }: { token: string; jaAceitou: boolean }) {
  const [marcado, setMarcado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState(jaAceitou)
  const [enviando, setEnviando] = useState(false)
  async function enviar() {
    if (!marcado) { setErro(ERRO_TERMOS); return }
    setEnviando(true); setErro(null)
    try {
      const r = await fetch("/api/parceiros/termos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, aceito: true }) }).then(x => x.json())
      if (r.ok) setFeito(true); else setErro(r.erro ?? "Não deu certo. Tente de novo.")
    } catch { setErro("Sem conexão. Tente de novo.") }
    setEnviando(false)
  }
  if (feito) return <p className="mt-6 rounded-xl bg-[#eefaf1] text-[#1d6b34] px-4 py-3 text-[14px] font-medium">Aceite registrado. Obrigado!</p>
  return (
    <div className="mt-6 space-y-3">
      <label className="flex gap-3 items-start text-[14px] text-[#4a4658] leading-snug">
        <input type="checkbox" checked={marcado} onChange={e => { setMarcado(e.target.checked); setErro(null) }} className="mt-1 w-5 h-5" />
        <span>{TEXTO_CAIXA_TERMOS}</span>
      </label>
      {erro && <p className="text-[13px] text-[#d33a3c] font-medium">{erro}</p>}
      <button type="button" onClick={enviar} disabled={enviando} className="rounded-xl bg-[#2a1a5e] text-white font-semibold px-5 py-3 disabled:opacity-60">{enviando ? "Enviando…" : "Aceitar os termos"}</button>
    </div>
  )
}
