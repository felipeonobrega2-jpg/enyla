import { NextRequest, NextResponse } from "next/server"
import { enderecoPeloCep } from "@/app/lib/geocodificar"

// CEP + número → endereço e coordenadas. (Rota protegida pelo login.)
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const r = await enderecoPeloCep(p.get("cep") ?? "", p.get("numero") ?? "", p.get("complemento") ?? undefined)
  return "erro" in r ? NextResponse.json(r, { status: 404 }) : NextResponse.json(r)
}
