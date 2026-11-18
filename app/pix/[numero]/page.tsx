import { Suspense } from "react"
import PixClient from "./PixClient"

// Link do cliente: sempre claro (inclusive no modo escuro automático do Chrome/Samsung, que inverte as cores)
export const viewport = { themeColor: "#ffffff", colorScheme: "only light" as const }

export default async function PixPage({
  params,
}: {
  params: Promise<{ numero: string }>
}) {
  const { numero } = await params
  return (
    <Suspense>
      <PixClient numero={numero} />
    </Suspense>
  )
}
