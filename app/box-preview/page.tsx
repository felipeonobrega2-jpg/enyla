import { Suspense } from "react"
import BoxPreviewPage from "./BoxPreviewPage"

export const metadata = {
  title: "Visualização 3D — Enyla Embalagens",
  description: "Veja em 3D a estrutura da sua embalagem personalizada.",
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ l?: string; a?: string; p?: string; v?: string }>
}) {
  const { l, a, p, v } = await searchParams
  const largura      = Math.max(0.1, parseFloat(l ?? "10"))
  const altura       = Math.max(0.1, parseFloat(a ?? "15"))
  const profundidade = Math.max(0.1, parseFloat(p ?? "8"))
  const verniz       = v === "1"

  return (
    <Suspense fallback={null}>
      <BoxPreviewPage
        largura={largura}
        altura={altura}
        profundidade={profundidade}
        verniz={verniz}
      />
    </Suspense>
  )
}
