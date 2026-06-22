import { Suspense } from "react"
import PixClient from "./PixClient"

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
