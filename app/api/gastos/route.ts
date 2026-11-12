import { NextRequest, NextResponse } from "next/server"
import { gastosAtuais } from "@/app/lib/gastosServidor"
import { mudarConfig } from "@/app/lib/configAtomica"
import type { CfgGastos } from "@/app/lib/gastosServidor"

export const maxDuration = 30

// Seção Gastos (rota protegida pelo login). GET: IA, anúncios e o que o braço digital cobre (?atualizar=1 relê a Meta).
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await gastosAtuais({ forcarMeta: req.nextUrl.searchParams.get("atualizar") === "1" }))
  } catch (e) {
    return NextResponse.json({ erro: String((e as Error).message ?? e) }, { status: 500 })
  }
}

// POST: { recargaIA: valor em US$ } (saldo que está na Anthropic agora), { alertaDias }, { cotacao } (null = automática)
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { recargaIA?: number | null; alertaDias?: number; cotacao?: number | null; autoRecargaIA?: boolean }
  const mudar: CfgGastos = {}
  if (typeof b.autoRecargaIA === "boolean") mudar.autoRecargaIA = b.autoRecargaIA
  if (b.recargaIA === null) mudar.recargaIA = null
  else if (typeof b.recargaIA === "number" && b.recargaIA >= 0 && b.recargaIA < 100_000) mudar.recargaIA = { valor: b.recargaIA, em: new Date().toISOString() }
  if (typeof b.alertaDias === "number" && b.alertaDias >= 1 && b.alertaDias <= 30) mudar.alertaDias = Math.round(b.alertaDias)
  if (b.cotacao === null) mudar.cotacao = null
  else if (typeof b.cotacao === "number" && b.cotacao > 1 && b.cotacao < 20) mudar.cotacao = b.cotacao
  await mudarConfig((d: Record<string, unknown>) => ({ gastosCfg: { ...((d.gastosCfg as CfgGastos) ?? {}), ...mudar } }))
  return NextResponse.json(await gastosAtuais())
}
