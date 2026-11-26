import type { Metadata } from "next"
import { clausulas, TEXTO_CAIXA } from "@/app/lib/termosParceria"
import { lerTermoVigente, tokenConfere } from "@/app/lib/termosServidor"
import AceiteTermos from "./AceiteTermos"

export const metadata: Metadata = { title: "Termos de Parceria ENYLA", robots: { index: false, follow: false } }
export const viewport = { themeColor: "#2a1a5e", colorScheme: "only light" as const }
export const dynamic = "force-dynamic"

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams
  const um = (k: string) => (Array.isArray(q[k]) ? q[k]![0] : q[k]) ?? ""
  const termo = await lerTermoVigente()
  const aceitar = um("aceite") === "1" && tokenConfere(um("c"), um("t"))
  return (
    <main className="min-h-screen bg-white text-[#1d1a2b]">
      <div className="max-w-[680px] mx-auto px-5 py-10">
        <h1 className="text-[26px] font-extrabold">Termos de Parceria ENYLA</h1>
        <p className="mt-1 text-[14px] text-[#6b6780]">Versão {termo.versao} · em vigor desde {new Date(termo.vigenteDesde).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
        {termo.rascunho && <p className="mt-4 rounded-xl bg-[#fff6e0] text-[#7a5a00] text-[13.5px] font-semibold px-4 py-3">RASCUNHO, sujeito a revisão jurídica. O texto final substitui este.</p>}
        <ol className="mt-6 space-y-3 text-[15px] leading-relaxed list-none p-0">{clausulas(termo).map((c, i) => <li key={i}>{c}</li>)}</ol>
        {aceitar && <AceiteTermos c={um("c")} t={um("t")} texto={TEXTO_CAIXA} versao={termo.versao} />}
      </div>
    </main>
  )
}
