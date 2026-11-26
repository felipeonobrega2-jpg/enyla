import { lerConfigLinha } from "../../../lib/configAtomica"
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { pluggyConfigurada } from "@/app/lib/pluggy"
import { openiConfigurada } from "@/app/lib/openi"

// Extrato do banco para a aba Banco (sem o JSON bruto). ?estado=pendente|vinculada|criada|ignorada|todas
export async function GET(req: NextRequest) {
  const estado = req.nextUrl.searchParams.get("estado") ?? "pendente"
  let q = supabase.from("banco_transacoes").select("id, conta_id, conta_nome, data, valor, tipo, descricao, contraparte_nome, contraparte_doc, categoria_pluggy, estado, lancamento_ids, sugestao, historico, hora:bruto->>date")
  if (estado !== "todas") q = q.eq("estado", estado)
  // Para conferir: todas (a lista é o trabalho do dia); nas outras abas, as 400 mais recentes
  const { data, error } = await q.order("data", { ascending: false }).limit(estado === "pendente" ? 3000 : 400)
  const { count: pendentes } = await supabase.from("banco_transacoes").select("id", { count: "exact", head: true }).eq("estado", "pendente")
  const { data: cfgRow } = await lerConfigLinha()
  return NextResponse.json({
    configurada: (cfgRow?.data as { bankFeedSource?: unknown } | null)?.bankFeedSource === "openi" ? openiConfigurada() : pluggyConfigurada(),
    tabela: !error || !/relation|does not exist/i.test(error.message),
    erro: error?.message ?? null,
    status: (cfgRow?.data as { pluggyStatus?: unknown } | null)?.pluggyStatus ?? null,
    pendentes: pendentes ?? 0,
    transacoes: data ?? [],
  })
}
