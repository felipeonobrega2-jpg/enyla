import { NextRequest, NextResponse } from "next/server"
import { buscarEndereco } from "@/app/lib/geocodificar"

// Endereço digitado (texto livre ou CEP) → até 5 resultados. Chamado ao apertar Enter, não a cada letra
// (regra de uso do OpenStreetMap). (Rota protegida pelo login.)
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim()
  if (q.length < 4) return NextResponse.json([])
  return NextResponse.json(await buscarEndereco(q))
}
