import { NextResponse } from "next/server"
import { lerConfigLinha } from "@/app/lib/configAtomica"
import { supabase } from "@/app/lib/supabase"
import { recebiveisDigitais, vinculosDoBanco, type PedidoReceber } from "@/app/lib/digitalReceber"
import { hojeBrasilia } from "@/app/lib/etapasProducao"

// A receber do Digital (aba "A receber" da linha Digital do Financeiro). Rota protegida pelo login. Só leitura.
export async function GET() {
  const { data } = await lerConfigLinha()
  const pedidos = ((data?.data ?? {}) as { pedidosDigitais?: PedidoReceber[] }).pedidosDigitais ?? []
  const { data: txs } = pedidos.length ? await supabase.from("banco_transacoes").select("lancamento_ids, data").not("lancamento_ids", "is", null).limit(5000) : { data: [] }
  const linhas = recebiveisDigitais(pedidos, vinculosDoBanco((txs ?? []) as { lancamento_ids: string[] | null; data?: string | null }[]), hojeBrasilia())
  return NextResponse.json({ linhas })
}
