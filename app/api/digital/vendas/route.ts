import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

// Vendas do digital (sinal pago) para a meta do mês e os marcos de faturamento: offset e digital somam juntos.
// Rota protegida pelo login. O valor é o total do pedido, no dia em que o sinal caiu.
export async function GET() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const ped = ((data?.data ?? {}) as { pedidosDigitais?: { id: string; total: number; sinalPagoEm?: string; teste?: boolean; status: string }[] }).pedidosDigitais ?? []
  const vendas = ped.filter(p => p.sinalPagoEm && !p.teste && p.status !== "cancelado")
    .map(p => ({ id: p.id, total: p.total, dia: new Date(p.sinalPagoEm!).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) }))
  return NextResponse.json({ vendas })
}
