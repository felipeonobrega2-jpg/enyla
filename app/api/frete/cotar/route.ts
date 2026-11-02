import { NextRequest, NextResponse } from "next/server"
import { cotar } from "@/app/lib/lalamove"
import type { ParadaFrete } from "@/app/lib/frete"

// Cota uma corrida com 2 a 16 paradas (a primeira é a retirada). Vale 5 minutos. (Rota protegida pelo login.)
export async function POST(req: NextRequest) {
  const { servico, paradas, prioridade, adicionais } = await req.json().catch(() => ({})) as { servico?: string; paradas?: ParadaFrete[]; prioridade?: boolean; adicionais?: string[] }
  if (!servico || !paradas || paradas.length < 2) return NextResponse.json({ erro: "Escolha o veículo, a retirada e pelo menos uma entrega." }, { status: 400 })
  if (paradas.length > 16) return NextResponse.json({ erro: "No máximo 15 entregas por corrida." }, { status: 400 })
  const r = await cotar(servico, paradas.map(p => ({ coordinates: { lat: String(p.lat), lng: String(p.lng) }, address: p.texto })), { prioridade, adicionais })
  if (!r.ok || !r.dados) return NextResponse.json({ erro: r.erro ?? "Não cotou." }, { status: r.status || 502 })
  const c = r.dados
  return NextResponse.json({
    quotationId: c.quotationId, expiraEm: c.expiresAt, servico: c.serviceType,
    valor: Number(c.priceBreakdown.total), moeda: c.priceBreakdown.currency, prioridade: !!prioridade,
    valorSemPrioridade: c.priceBreakdown.totalExcludePriorityFee ? Number(c.priceBreakdown.totalExcludePriorityFee) : null,
    distanciaKm: c.distance ? (c.distance.unit === "m" ? Number(c.distance.value) / 1000 : Number(c.distance.value)) : null,
    paradas: c.stops.map(s => s.stopId),
  })
}
