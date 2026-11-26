import AcompanharClient from "./AcompanharClient"

export const viewport = { themeColor: "#ffffff", colorScheme: "only light" as const }

export const metadata = { title: "Acompanhe o seu pedido · Enyla Embalagens", description: "Etapa, arte, prazo de entrega e pagamento do seu pedido." }

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params
  const { t } = await searchParams
  return <AcompanharClient id={decodeURIComponent(id)} t={t ?? ""} />
}
