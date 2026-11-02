import { NextRequest, NextResponse } from "next/server"
import { atualizarFrete } from "@/app/lib/freteServidor"

// Aviso da Lalamove (status, motorista, valor). Rota pública: o conteúdo não é confiável (sem assinatura documentada),
// então só usamos o número da corrida e buscamos a situação real na API com as nossas chaves.
function acharOrderId(x: unknown, fundo = 0): string | null {
  if (!x || typeof x !== "object" || fundo > 5) return null
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (k === "orderId" && (typeof v === "string" || typeof v === "number")) return String(v)
    const dentro = acharOrderId(v, fundo + 1)
    if (dentro) return dentro
  }
  return null
}

export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => null)
  const id = acharOrderId(corpo)
  if (id && /^[\w-]{4,64}$/.test(id)) await atualizarFrete(id).catch(() => null)
  return NextResponse.json({ ok: true })   // a Lalamove exige 200
}
// A Lalamove testa a URL ao cadastrar
export const GET = () => NextResponse.json({ ok: true })
