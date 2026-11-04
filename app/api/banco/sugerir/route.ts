import { NextResponse } from "next/server"
import { sugerirPendentes } from "@/app/lib/bancoServidor"

export const maxDuration = 60

// Prepara mais um pedaço das sugestões; a tela chama de novo enquanto houver "restantes". (Rota protegida.)
export async function POST() {
  return NextResponse.json(await sugerirPendentes(45_000))
}
