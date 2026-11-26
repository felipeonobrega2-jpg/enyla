import { NextRequest, NextResponse } from "next/server"
import { registrarAberturaPorToken } from "@/app/lib/prospectorEventosServidor"

export const dynamic = "force-dynamic"

// Pixel de abertura do e-mail do primeiro contato. Rota fora do login (proxy.ts): o token aleatório do envio é a identificação.
// Marca `abriu` e devolve um GIF 1x1. Token inválido ou erro: devolve o GIF do mesmo jeito.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  await registrarAberturaPorToken(token)
  return new NextResponse(GIF, { status: 200, headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" } })
}
