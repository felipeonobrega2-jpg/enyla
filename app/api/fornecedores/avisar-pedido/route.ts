// Envio registrado em Fornecedores: avisa o fornecedor por e-mail com os dados do pedido (só a equipe chama)
import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { emailDoPedido } from "@/app/lib/emailsServidor"
import type { FornecedorProducao, Servico } from "@/app/lib/producao"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { fornecedorId?: string; pedidoKey?: string; servicos?: Servico[]; enviadoEm?: string; prazoPrevisto?: string; obs?: string }
  if (!b.fornecedorId || !b.pedidoKey || !b.enviadoEm) return NextResponse.json({ ok: false, erro: "dados" }, { status: 400 })
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const forn = (((data?.data ?? {}) as { producao?: { fornecedores?: FornecedorProducao[] } }).producao?.fornecedores ?? []).find(f => f.id === b.fornecedorId)
  if (!forn) return NextResponse.json({ ok: false, erro: "fornecedor não encontrado" }, { status: 404 })
  const r = await emailDoPedido({ fornecedor: forn, pedidoKey: b.pedidoKey, servicos: b.servicos ?? [], enviadoEm: b.enviadoEm, prazoPrevisto: b.prazoPrevisto ?? null, obs: b.obs ?? null })
  return NextResponse.json(r)
}
