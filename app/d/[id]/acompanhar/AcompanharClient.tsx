"use client"

// Acompanhamento do pedido Digital em link próprio (separado do link de fechamento /d/[id]).
// Mostra só o que a API entrega: etapa, arte, prazo e pago/saldo. Sem frete, briefing, quantidade nem Pix.
import { useEffect, useState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import type { Acompanhamento } from "@/app/lib/acompanhamentoDigital"
import { AcompanhamentoDigital } from "../AcompanhamentoDigital"
import { Tela } from "../DigitalClient"

export default function AcompanharClient({ id, t }: { id: string; t: string }) {
  const [a, setA] = useState<Acompanhamento | null | undefined>(undefined)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/d/${encodeURIComponent(id)}/acompanhar?t=${encodeURIComponent(t)}`).then(async r => {
      const d = await r.json().catch(() => null)
      if (!r.ok) return setErro(d?.erro ?? "Não consegui abrir o acompanhamento.")
      setA(d?.acompanhamento ?? null)
    }).catch(() => setErro("Sem conexão. Tente de novo."))
  }, [id, t])

  if (erro) return <Tela><div className="flex items-start gap-3 bg-white rounded-2xl p-5 ds-borda"><AlertCircle className="w-5 h-5 text-[#d33a3c] shrink-0" /><p className="text-[14px] text-[#191625]">{erro}</p></div></Tela>
  if (a === undefined) return <Tela><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#8456e8]" /></div></Tela>
  return (
    <Tela numero={id}>
      {a ? <AcompanhamentoDigital a={a} resumo={false} />
        : <div className="bg-white rounded-2xl p-5 ds-borda"><p className="text-[14px] text-[#191625]">O acompanhamento aparece aqui depois que o sinal do pedido for confirmado.</p></div>}
    </Tela>
  )
}
