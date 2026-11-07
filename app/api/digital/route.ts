import { NextRequest, NextResponse } from "next/server"
import { lerPedido, gravarPedido, linkPedido } from "@/app/lib/digitalServidor"
import { supabase } from "@/app/lib/supabase"
import { mudarStatus, PedidoComBriefing, StatusDigital, DIAS_VALIDADE_DIGITAL } from "@/app/lib/digital"

// Painel do braço digital (rota protegida pelo login): os pedidos dos últimos 45 dias com o link e o que o cliente fez
export async function GET() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const todos = ((data?.data as { pedidosDigitais?: PedidoComBriefing[] } | undefined)?.pedidosDigitais ?? [])
  const desde = Date.now() - 45 * 86_400_000
  const pedidos = todos.filter(p => new Date(p.em).getTime() >= desde).map(p => ({
    id: p.id, jid: p.jid, nome: p.nome, em: p.em, ml: p.ml, medidas: p.medidas, padrao: p.padrao, folha: p.folha,
    quantidade: p.quantidade, total: p.total, sinal: p.sinal, custo: p.custo, arte: p.arte, margem: p.margem,
    status: p.status, sinalPagoEm: p.sinalPagoEm ?? null, statusEm: p.statusEm ?? null,
    vistoEm: p.vistoEm ?? null, ultimaVista: p.ultimaVista ?? null, vistas: p.vistas ?? 0, lembretes: p.lembretes ?? [],
    briefing: p.briefing ? { marca: p.briefing.marca ?? "", cores: p.briefing.cores ?? "", referencias: p.briefing.referencias ?? "", arquivos: (p.briefing.arquivos ?? []).length } : null,
    vence: new Date(new Date(p.em).getTime() + DIAS_VALIDADE_DIGITAL * 86_400_000).toISOString(),
    link: linkPedido(p.id),
  }))
  return NextResponse.json({ pedidos })
}

// POST { id, status }: avança (sinal pago → arte → produção → enviado) ou cancela
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { id?: string; status?: StatusDigital }
  if (!b.id || !b.status) return NextResponse.json({ erro: "Faltou o pedido ou o status." }, { status: 400 })
  const { pedido } = await lerPedido(b.id)
  if (!pedido) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 })
  const novo = await gravarPedido(b.id, p => mudarStatus(p, b.status!) as PedidoComBriefing | null)
  if (!novo) return NextResponse.json({ erro: "Esse status não vem agora." }, { status: 400 })
  return NextResponse.json({ ok: true, status: novo.status })
}
