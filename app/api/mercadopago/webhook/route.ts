import { NextRequest, NextResponse, after } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { mp, PagamentoMP } from "@/app/lib/mercadoPago"
import { gravarCampos } from "@/app/lib/configAtomica"
import { registrarPagoNoCartao, PagamentoCartao } from "@/app/lib/cartaoAprovacao"
import { notificar } from "@/app/lib/notificar"

// Webhook do Mercado Pago (público). Do corpo só usa o id do pagamento: status, valor e referência vêm da API,
// então um aviso falso não muda nada. Responde 200 rápido.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { type?: string; action?: string; data?: { id?: string | number } } | null
  const id = String(b?.data?.id ?? req.nextUrl.searchParams.get("data.id") ?? req.nextUrl.searchParams.get("id") ?? "")
  const tipo = b?.type ?? req.nextUrl.searchParams.get("type") ?? req.nextUrl.searchParams.get("topic")
  if (!/^\d{5,20}$/.test(id) || (tipo && tipo !== "payment")) return NextResponse.json({ ok: true })
  after(async () => {
    const r = await mp<PagamentoMP>(`/v1/payments/${id}`)
    const pg = r.corpo
    const numero = /^ORC:(.+)$/.exec(pg?.external_reference ?? "")?.[1]
    if (!r.ok || !pg || !numero) return
    const { data: cfg } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
    const todos = ((cfg?.data as Record<string, unknown> | null)?.pagamentosCartao ?? {}) as Record<string, PagamentoCartao>
    const reg = todos[numero]
    if (!reg || reg.id !== String(pg.id) || reg.baixado) return
    if (pg.status === "approved") {
      const novo = { ...reg, status: pg.status, baixado: true }
      await gravarCampos({ pagamentosCartao: { ...todos, [numero]: novo } })
      const { data: card } = await supabase.from("KanbanCard").select("nomeCliente, loteId, loteNumero").eq("numero", numero).maybeSingle()
      if (card) await registrarPagoNoCartao(numero, card, novo)
      await notificar("Cartão aprovado", `${numero} · ${card?.nomeCliente ?? ""} · ${reg.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`, { prioridade: "alta", tags: ["credit_card"] }).catch(() => null)
    } else if (pg.status !== reg.status) {
      await gravarCampos({ pagamentosCartao: { ...todos, [numero]: { ...reg, status: pg.status } } })
      if (pg.status === "rejected" || pg.status === "cancelled") await notificar("Cartão recusado depois da análise", `${numero} · ${pg.status_detail ?? pg.status}`, { tags: ["x"] }).catch(() => null)
    }
  })
  return NextResponse.json({ ok: true })
}
