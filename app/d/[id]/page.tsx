import DigitalClient from "./DigitalClient"

// Link do cliente: sempre claro (inclusive no modo escuro automático do Chrome/Samsung, que inverte as cores)
export const viewport = { themeColor: "#ffffff", colorScheme: "only light" as const }

export const metadata = { title: "Seu orçamento · Enyla Embalagens", description: "Escolha a quantidade, pague o sinal e conte como quer a sua arte." }

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; dz?: string }> }) {
  const { id } = await params
  const { t, dz } = await searchParams
  return <DigitalClient id={decodeURIComponent(id)} t={t ?? ""} dz={dz ?? ""} />
}
