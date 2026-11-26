import type { Metadata } from "next"
import AceiteTermos from "./AceiteTermos"

export const metadata: Metadata = { title: "Termos de Parceria ENYLA", robots: { index: false, follow: false } }
export const viewport = { colorScheme: "only light" as const }
export const dynamic = "force-dynamic"

export default async function Page({ searchParams }: { searchParams: Promise<{ aceite?: string; token?: string }> }) {
  const { aceite, token } = await searchParams
  const { termosVigentes, aceitePorToken } = await import("../../lib/termosParceriaServidor")
  const t = await termosVigentes()
  const a = aceite === "1" && token ? await aceitePorToken(token) : null
  return (
    <main className="min-h-[100dvh] bg-[#fbfaff] text-[#1d1a29]">
      <div className="max-w-[720px] mx-auto px-5 py-10">
        <h1 className="text-[24px] font-bold">Termos de Parceria ENYLA</h1>
        <p className="text-[13px] text-[#9a97a5] mt-1">Versão {t.versao}{t.rascunho ? " · RASCUNHO" : ""} · vigente desde {new Date(t.vigente_desde).toLocaleDateString("pt-BR")}</p>
        {t.rascunho && <p className="mt-4 rounded-xl bg-[#fff7e0] text-[#8a5a00] px-4 py-3 text-[13.5px] font-semibold">RASCUNHO: texto provisório, ainda sem valor jurídico.</p>}
        <div className="mt-6 whitespace-pre-line text-[15px] leading-relaxed">{t.texto}</div>
        {aceite === "1" && (a ? <AceiteTermos token={token!} jaAceitou={a.status === "aceito"} /> : <p className="mt-6 text-[14px] text-[#d33a3c]">Link inválido. Peça um novo à ENYLA.</p>)}
      </div>
    </main>
  )
}
