import { NextRequest, NextResponse } from "next/server"
import { cotar } from "@/app/lib/lalamove"
import type { Endereco } from "@/app/lib/frete"

// Cota uma corrida (vale 5 minutos). (Rota protegida pelo login.)
export async function POST(req: NextRequest) {
  const { servico, retirada, entrega } = await req.json().catch(() => ({})) as { servico?: string; retirada?: Endereco; entrega?: Endereco }
  if (!servico || !retirada || !entrega) return NextResponse.json({ erro: "Escolha o veículo, a retirada e a entrega." }, { status: 400 })
  const parada = (e: Endereco) => ({ coordinates: { lat: String(e.lat), lng: String(e.lng) }, address: e.texto })
  const r = await cotar(servico, [parada(retirada), parada(entrega)])
  if (!r.ok || !r.dados) return NextResponse.json({ erro: r.erro ?? "Não cotou." }, { status: r.status || 502 })
  const c = r.dados
  return NextResponse.json({
    quotationId: c.quotationId, expiraEm: c.expiresAt, servico: c.serviceType,
    valor: Number(c.priceBreakdown.total), moeda: c.priceBreakdown.currency,
    distanciaKm: c.distance ? (c.distance.unit === "m" ? Number(c.distance.value) / 1000 : Number(c.distance.value)) : null,
    paradas: c.stops.map(s => s.stopId),
  })
}
