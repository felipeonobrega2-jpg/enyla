import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { pluggyConfigurada } from "@/app/lib/pluggy"

// Extrato do banco para a aba Banco (sem o JSON bruto). ?estado=pendente|vinculada|criada|ignorada|todas
export async function GET(req: NextRequest) {
  const estado = req.nextUrl.searchParams.get("estado") ?? "pendente"
  let q = supabase.from("banco_transacoes").select("id, conta_id, conta_nome, data, valor, tipo, descricao, contraparte_nome, contraparte_doc, categoria_pluggy, estado, lancamento_ids, sugestao, historico")
  if (estado !== "todas") q = q.eq("estado", estado)
  const { data, error } = await q.order("data", { ascending: false }).limit(400)
  const { count: pendentes } = await supabase.from("banco_transacoes").select("id", { count: "exact", head: true }).eq("estado", "pendente")
  const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  return NextResponse.json({
    configurada: pluggyConfigurada(),
    tabela: !error || !/relation|does not exist/i.test(error.message),
    erro: error?.message ?? null,
    status: (cfgRow?.data as { pluggyStatus?: unknown } | null)?.pluggyStatus ?? null,
    pendentes: pendentes ?? 0,
    transacoes: data ?? [],
  })
}
