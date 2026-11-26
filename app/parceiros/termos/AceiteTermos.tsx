"use client"
import { useState } from "react"
import { TEXTO_CAIXA_ACEITE } from "@/app/lib/termosParceria"

export default function AceiteTermos({ token }: { token: string }) {
  const [marcado, setMarcado] = useState(false)
  const [estado, setEstado] = useState<"livre" | "enviando" | "feito">("livre")
  const [erro, setErro] = useState<string | null>(null)
  async function aceitar() {
    if (!marcado) { setErro("Marque a caixa para aceitar os Termos de Parceria."); return }
    setEstado("enviando"); setErro(null)
    try {
      const r = await fetch("/api/parceiros/termos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).then(x => x.json())
      if (r.ok) setEstado("feito"); else { setErro(r.erro ?? "Não deu certo. Tente de novo."); setEstado("livre") }
    } catch { setErro("Sem conexão. Tente de novo."); setEstado("livre") }
  }
  if (estado === "feito") return <p className="rounded-xl bg-[#eefaf0] text-[#1e7a35] font-semibold px-4 py-3">Aceite registrado. Obrigado!</p>
  return (
    <div className="border-t border-[#efedf5] pt-6 space-y-3">
      <label className="flex gap-3 items-start text-[14px] leading-snug"><input type="checkbox" checked={marcado} onChange={e => setMarcado(e.target.checked)} className="mt-0.5 w-5 h-5 accent-[#7c4ee4] shrink-0" />{TEXTO_CAIXA_ACEITE}</label>
      {erro && <p className="text-[13px] text-[#d33a3c] font-medium">{erro}</p>}
      <button type="button" onClick={aceitar} disabled={estado === "enviando"} className="rounded-2xl text-white font-bold px-6 disabled:opacity-60" style={{ background: "#7c4ee4", height: 48 }}>Aceitar os termos</button>
    </div>
  )
}
