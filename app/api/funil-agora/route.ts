import { lerCampos } from "@/app/lib/configAtomica"
import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { montarFunilAgora } from "@/app/lib/funilAgora"
import { quemEspera } from "@/app/lib/esperando"
import type { KanbanCard } from "@/app/types"

// Funil agora (rota protegida pelo login): do lead à entrega, offset e digital, com o que está parado
export async function GET() {
  const desde = new Date(Date.now() - 45 * 86_400_000).toISOString()
  const [conv, cards, cfg] = await Promise.all([
    supabase.from("whatsapp_conversas").select("jid, nome, etiquetas, status_lead, criado_em, ultima_at, fechada_em, ultima_recebida_at, ultima_enviada_at, ultima_msg, proxima_acao, kanban_card_id")
      .not("jid", "like", "%@g.us").gte("ultima_at", desde).limit(2000),
    supabase.from("KanbanCard").select("id, numero, nomeCliente, preco, coluna, createdAt, dataEntregaPrevista, dataEntregaReal, materialNome, quantidade").neq("coluna", 10).limit(3000),
    lerCampos(["pedidosDigitais"]).then(d => ({ data: { data: d } })),
  ])
  const convs = (conv.data ?? []) as never[]
  const esperando = quemEspera(convs as never, Date.now())
  const pedidos = (((cfg.data?.data ?? {}) as { pedidosDigitais?: unknown[] }).pedidosDigitais ?? []) as never[]
  return NextResponse.json(montarFunilAgora({ conversas: convs, cards: (cards.data ?? []) as unknown as KanbanCard[], pedidos, esperando }))
}
