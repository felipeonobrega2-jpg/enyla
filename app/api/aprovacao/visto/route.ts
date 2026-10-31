import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { AprovacaoOnline } from "@/app/lib/aprovacao"

// Marca aprovações online como vistas no painel (rota protegida pelo login)
export async function POST(req: NextRequest) {
  const { numeros } = await req.json().catch(() => ({ numeros: [] })) as { numeros?: string[] }
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (data?.data ?? {}) as Record<string, unknown>
  const lista = ((cfg.aprovacoesOnline as AprovacaoOnline[] | undefined) ?? []).map(a => numeros?.includes(a.numero) ? { ...a, visto: true } : a)
  await supabase.from("AppConfig").update({ data: { ...cfg, aprovacoesOnline: lista } }).eq("id", 1)
  return NextResponse.json({ ok: true })
}
