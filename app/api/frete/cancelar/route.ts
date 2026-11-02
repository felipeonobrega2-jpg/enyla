import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { cancelarPedido } from "@/app/lib/lalamove"

// Cancela a corrida (só enquanto procura motorista ou nos 5 primeiros minutos) e tira os lançamentos dela. (Rota protegida.)
export async function POST(req: NextRequest) {
  const { orderId } = await req.json().catch(() => ({})) as { orderId?: string }
  if (!orderId) return NextResponse.json({ erro: "Corrida não informada." }, { status: 400 })
  const r = await cancelarPedido(orderId)
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status || 502 })
  const { data: f } = await supabase.from("fretes").select("lancamentos").eq("order_id", orderId).maybeSingle()
  const ids = (f?.lancamentos ?? []) as string[]
  if (ids.length) await supabase.from("LancamentoFinanceiro").delete().in("id", ids)
  await supabase.from("fretes").update({ status: "CANCELED", lancamentos: [], atualizado_em: new Date().toISOString() }).eq("order_id", orderId)
  return NextResponse.json({ ok: true, lancamentosRemovidos: ids })
}
