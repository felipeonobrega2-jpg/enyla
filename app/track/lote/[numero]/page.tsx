import { supabase } from "@/app/lib/supabase"
import LoteTrackingClient from "./LoteTrackingClient"

export default async function LoteTrackingPage({
  params,
}: {
  params: Promise<{ numero: string }>
}) {
  const { numero } = await params
  const loteNumero = decodeURIComponent(numero)

  const { data: lote } = await supabase
    .from("Lote")
    .select("*")
    .eq("numero", loteNumero)
    .single()

  const { data: cards } = lote
    ? await supabase.from("KanbanCard").select("*").eq("loteId", lote.id)
    : { data: null }

  return (
    <LoteTrackingClient
      initialLote={lote ?? null}
      initialCards={cards ?? []}
      loteNumero={loteNumero}
    />
  )
}
