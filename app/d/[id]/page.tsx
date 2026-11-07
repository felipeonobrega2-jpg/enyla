import DigitalClient from "./DigitalClient"

export const metadata = { title: "Seu orçamento · Enyla Embalagens", description: "Escolha a quantidade, pague o sinal e conte como quer a sua arte." }

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; dz?: string }> }) {
  const { id } = await params
  const { t, dz } = await searchParams
  return <DigitalClient id={decodeURIComponent(id)} t={t ?? ""} dz={dz ?? ""} />
}
