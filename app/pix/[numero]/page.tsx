import { Suspense } from "react"
import PixClient from "./PixClient"

export default async function PixPage({
  params,
  searchParams,
}: {
  params: Promise<{ numero: string }>
  searchParams: Promise<{ v?: string; c?: string }>
}) {
  const { numero } = await params
  const { v, c } = await searchParams

  const valor = parseFloat(v ?? "0") || 0
  const cliente = c ? decodeURIComponent(c) : ""

  return (
    <Suspense>
      <PixClient numero={numero} valor={valor} cliente={cliente} />
    </Suspense>
  )
}
