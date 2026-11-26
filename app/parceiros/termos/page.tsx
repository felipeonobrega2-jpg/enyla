import type { Metadata } from "next"
import { lerTermosVigentes } from "../../lib/termosParceria"

export const metadata: Metadata = { title: "Termos de Parceria ENYLA", robots: { index: false, follow: false } }
export const viewport = { themeColor: "#2a1a5e", colorScheme: "only light" as const }
export const dynamic = "force-dynamic"

export default async function Page() {
  const t = await lerTermosVigentes()
  return (
    <main className="min-h-[100dvh] bg-white text-[#2a2540]">
      <div className="max-w-[720px] mx-auto px-5 py-10">
        <h1 className="text-[24px] font-bold">Termos de Parceria</h1>
        <p className="mt-1 text-[13px] text-[#6b6780]">Versão {t.versao} · vigente desde {new Date(t.vigenteDesde).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
        {t.rascunho && <p className="mt-4 rounded-xl bg-[#fff6e0] text-[#8a5a00] text-[13.5px] font-semibold px-4 py-3">RASCUNHO: texto provisório, ainda sem valor jurídico.</p>}
        <div className="mt-6 text-[15px] leading-relaxed whitespace-pre-line">{t.texto}</div>
      </div>
    </main>
  )
}
