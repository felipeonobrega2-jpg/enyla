"use client"

// Página só de acompanhamento do pedido Digital (/d/{id}/acompanhar?t=…): cabeçalho do /track, etapas, arte, previsão e pago/saldo.
// O fechamento fica em /d/{id}.
import { useEffect, useState } from "react"
import Image from "next/image"
import { AlertCircle, Loader2 } from "lucide-react"
import type { Acompanhamento } from "@/app/lib/acompanhamentoDigital"
import { AcompanhamentoDigital } from "../AcompanhamentoDigital"

export default function AcompanharClient({ id, t }: { id: string; t: string }) {
  const [a, setA] = useState<Acompanhamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    fetch(`/api/d/${encodeURIComponent(id)}/acompanhar?t=${encodeURIComponent(t)}`).then(async r => {
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.acompanhamento) return setErro(d?.erro ?? "Não consegui abrir o acompanhamento.")
      setA(d.acompanhamento)
    }).catch(() => setErro("Sem conexão. Tente de novo."))
  }, [id, t])
  return (
    <div className="min-h-[100dvh] bg-[#F2F2F7]">
      <div className="bg-white border-b border-[rgba(60,60,67,0.12)] sticky top-0 z-10">
        <div className="max-w-md mx-auto px-5 h-14 flex items-center gap-3">
          <Image src="/brand/enyla-wordmark-dark.png" alt="Enyla" width={1335} height={328} className="h-5 w-auto" priority />
          <span className="ml-auto text-[10px] font-bold text-[#8456e8] bg-[#8456e8]/10 border border-[#8456e8]/20 px-2.5 py-1 rounded-full font-mono">{id}</span>
        </div>
      </div>
      <div className="max-w-md mx-auto px-4 py-5 pb-10 space-y-4">
        {erro ? <div className="flex items-start gap-3 bg-white rounded-2xl p-5 ds-borda" data-testid="erro"><AlertCircle className="w-5 h-5 text-[#d33a3c] shrink-0" /><p className="text-[14px] text-[#191625]">{erro}</p></div>
          : !a ? <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#8456e8]" /></div>
          : <AcompanhamentoDigital a={a} />}
        <p className="text-center text-[11px] text-[#8E8E93] pt-2">Enyla Embalagens · dúvidas, é só responder no WhatsApp</p>
      </div>
    </div>
  )
}
