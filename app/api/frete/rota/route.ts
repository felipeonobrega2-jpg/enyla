import { NextRequest, NextResponse } from "next/server"

// Traçado da rota pelas ruas (OSRM público) para desenhar no mapa: ?pts=lat,lng;lat,lng;…
// Sem resposta, o mapa liga os pontos em linha reta. (Rota protegida pelo login.)
export async function GET(req: NextRequest) {
  const pts = (req.nextUrl.searchParams.get("pts") ?? "").split(";").map(p => p.split(",").map(Number)).filter(p => p.length === 2 && p.every(Number.isFinite))
  if (pts.length < 2 || pts.length > 17) return NextResponse.json({ linha: null })
  const coords = pts.map(([lat, lng]) => `${lng},${lat}`).join(";")
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`, { headers: { "User-Agent": "ENYLA-sistema/1.0" }, next: { revalidate: 86400 } }).catch(() => null)
  const j = r?.ok ? await r.json().catch(() => null) as { routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[] } | null : null
  const rota = j?.routes?.[0]
  if (!rota) return NextResponse.json({ linha: null })
  return NextResponse.json({ linha: rota.geometry.coordinates.map(([lng, lat]) => [lat, lng]), km: rota.distance / 1000, minutos: Math.round(rota.duration / 60) })
}
