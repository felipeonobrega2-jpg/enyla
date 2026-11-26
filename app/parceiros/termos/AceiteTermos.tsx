"use client"

import { useState } from "react"

export default function AceiteTermos({ c, t, texto, versao }: { c: string; t: string; texto: string; versao: string }) {
  const [aceito, setAceito] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState(false)
  const [enviando, setEnviando] = useState(false)
  async function enviar() {
    if (!aceito) { setErro("Marque a caixa para aceitar os Termos de Parceria."); return }
    setEnviando(true); setErro(null)
    try {
      const r = await fetch("/api/parceiros/termos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ c, t, aceito }) }).then(x => x.json())
      if (r.ok) setFeito(true); else setErro(r.erro ?? "Não deu certo. Tente de novo.")
    } catch { setErro("Sem conexão. Tente de novo.") } finally { setEnviando(false) }
  }
  if (feito) return <p className="mt-8 rounded-xl bg-[#eaf8ef] text-[#1b6b3a] font-semibold px-4 py-3">Aceite registrado (versão {versao}). Obrigado!</p>
  return (
    <div className="mt-8 border-t border-[#efedf5] pt-6">
      <label className="flex gap-3 items-start text-[14px] leading-snug">
        <input type="checkbox" checked={aceito} onChange={e => { setAceito(e.target.checked); setErro(null) }} className="mt-1 w-5 h-5" />
        <span>{texto}</span>
      </label>
      {erro && <p className="mt-2 text-[13px] text-[#d33a3c] font-medium">{erro}</p>}
      <button type="button" onClick={enviar} disabled={enviando} className="mt-4 rounded-2xl text-white font-bold px-6 disabled:opacity-60" style={{ background: "#7c4ee4", height: 48 }}>{enviando ? "Enviando…" : "Aceitar os termos"}</button>
    </div>
  )
}
