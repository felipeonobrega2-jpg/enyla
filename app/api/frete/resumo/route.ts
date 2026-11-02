import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { mediasDasCorridas } from "@/app/lib/freteServidor"

// Saldo da carteira (último aviso da Lalamove) e médias de tempo das suas corridas. (Rota protegida pelo login.)
export async function GET() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (data?.data ?? {}) as { lalamoveCarteira?: { saldo: number; moeda: string; em: string } }
  return NextResponse.json({ carteira: cfg.lalamoveCarteira ?? null, medias: await mediasDasCorridas() })
}
