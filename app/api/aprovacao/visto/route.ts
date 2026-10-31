import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { AprovacaoOnline } from "@/app/lib/aprovacao"

// Marca aprovações online como vistas no painel, ou como desfeitas quando o pedido
// volta para orçamento (rota protegida pelo login)
export async function POST(req: NextRequest) {
  const { numeros, desfeita } = await req.json().catch(() => ({ numeros: [] })) as { numeros?: string[]; desfeita?: boolean }
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (data?.data ?? {}) as Record<string, unknown>
  const lista = ((cfg.aprovacoesOnline as AprovacaoOnline[] | undefined) ?? []).map(a => numeros?.includes(a.numero) ? { ...a, visto: true, ...(desfeita ? { desfeita: true } : {}) } : a)
  await supabase.from("AppConfig").update({ data: { ...cfg, aprovacoesOnline: lista } }).eq("id", 1)
  return NextResponse.json({ ok: true })
}
