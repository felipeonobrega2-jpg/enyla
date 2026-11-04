import { NextRequest, NextResponse } from "next/server"
import { aprendizado, mudarAprendizado } from "@/app/lib/bancoServidor"

// O que a IA aprendeu com você: regras (quem pagou/recebeu → o que lançar), lições escritas e correções. (Rota protegida.)
export async function GET() {
  return NextResponse.json(await aprendizado())
}
export async function POST(req: NextRequest) {
  return NextResponse.json(await mudarAprendizado(await req.json().catch(() => ({}))))
}
