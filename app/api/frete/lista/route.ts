import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { atualizarFrete } from "@/app/lib/freteServidor"
import { Frete, statusFinal } from "@/app/lib/frete"

// Corridas recentes (página Entregas). As que estão andando são conferidas na Lalamove, com a posição do motorista.
// (Rota protegida pelo login.)
export async function GET() {
  const { data } = await supabase.from("fretes").select("*").order("criado_em", { ascending: false }).limit(40)
  const lista = (data ?? []) as Frete[]
  return NextResponse.json(await Promise.all(lista.map(f => statusFinal(f.status) ? f : atualizarFrete(f.order_id).then(x => x ?? f))))
}
