import { supabase } from "@/app/lib/supabase"
import { redirect } from "next/navigation"
import TrackingClient from "./TrackingClient"

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ numero: string }>
}) {
  const { numero } = await params
  const decoded = decodeURIComponent(numero)

  // Redirect to lote tracking if this card belongs to a lote
  const { data: card } = await supabase
    .from("KanbanCard")
    .select("loteNumero")
    .eq("numero", decoded)
    .maybeSingle()

  if (card?.loteNumero) {
    redirect(`/track/lote/${encodeURIComponent(card.loteNumero)}`)
  }

  const { data } = await supabase
    .from("Tracking")
    .select("*")
    .eq("numero", decoded)
    .single()
  return <TrackingClient initialData={data ?? null} numero={decoded} />
}
