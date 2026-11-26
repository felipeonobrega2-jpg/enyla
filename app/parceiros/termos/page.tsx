import type { Metadata } from "next"
import { lerTermosVigentes } from "@/app/lib/termosParceriaServidor"
import { renderTermos } from "@/app/lib/termosParceria"
import AceiteTermos from "./AceiteTermos"

export const metadata: Metadata = { title: "Termos de Parceria ENYLA", robots: { index: false, follow: false } }
export const viewport = { themeColor: "#2a1a5e", colorScheme: "only light" as const }
export const dynamic = "force-dynamic"

export default async function Page({ searchParams }: { searchParams: Promise<{ aceite?: string; t?: string }> }) {
  const q = await searchParams
  const termos = await lerTermosVigentes()
  const itens = renderTermos(termos.texto).split("\n")
  return (
    <main className="min-h-screen bg-white text-[#1d1a29]">
      <div className="max-w-[720px] mx-auto px-5 py-10 space-y-4">
        {termos.rascunho && <p className="inline-block rounded-lg bg-[#fff4d6] text-[#8a5a00] text-[12px] font-bold px-3 py-1">RASCUNHO</p>}
        <h1 className="text-[24px] font-extrabold tracking-tight">{termos.titulo}</h1>
        <p className="text-[12px] text-[#7a7688]">Versão {termos.versao}, vigente desde {new Date(termos.vigenteDesde).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
        {itens.map((l, i) => <p key={i} className="text-[15px] leading-relaxed">{l}</p>)}
        {q.aceite === "1" && q.t && <AceiteTermos token={q.t} />}
      </div>
    </main>
  )
}
