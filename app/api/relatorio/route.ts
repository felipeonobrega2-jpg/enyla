// Dados do relatório gerencial que não estão no navegador (digital, leads, anúncios, confiança dos dados).
import { NextResponse } from "next/server"
import { extrasDoRelatorio } from "@/app/lib/relatorioExtras"

export const dynamic = "force-dynamic"
const ok = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

export async function GET(req: Request) {
  const u = new URL(req.url)
  const de = u.searchParams.get("de"), ate = u.searchParams.get("ate"), deAnt = u.searchParams.get("deAnt"), ateAnt = u.searchParams.get("ateAnt")
  if (!ok(de) || !ok(ate) || !ok(deAnt) || !ok(ateAnt)) return NextResponse.json({ erro: "período" }, { status: 400 })
  return NextResponse.json(await extrasDoRelatorio(de!, ate!, deAnt!, ateAnt!))
}
