import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

// Histórico de etapas de todos os pedidos, para o prazo médio de produção (rota protegida pelo login)
export async function GET() {
  const { data, error } = await supabase.from("Tracking").select("numero, etapas")
  if (error) return NextResponse.json({ erro: "Falha ao ler o rastreio" }, { status: 500 })
  const rastreios = (data ?? []).map(t => ({
    numero: t.numero as string,
    etapas: ((t.etapas ?? []) as { coluna: number; dataHora: string; tipo?: string }[]).map(e => ({ coluna: e.coluna, dataHora: e.dataHora, tipo: e.tipo })),
  }))
  return NextResponse.json({ rastreios })
}
