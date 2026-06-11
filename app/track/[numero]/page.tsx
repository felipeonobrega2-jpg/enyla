import { supabase } from "@/app/lib/supabase"
import TrackingClient from "./TrackingClient"

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ numero: string }>
}) {
  const { numero } = await params
  const { data } = await supabase
    .from("Tracking")
    .select("*")
    .eq("numero", decodeURIComponent(numero))
    .single()
  return <TrackingClient initialData={data ?? null} numero={decodeURIComponent(numero)} />
}
