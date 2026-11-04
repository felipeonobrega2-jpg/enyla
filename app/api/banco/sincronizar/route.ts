import { NextResponse } from "next/server"
import { sincronizar } from "@/app/lib/bancoServidor"

export const maxDuration = 60

// Puxa o extrato da Pluggy agora e prepara as sugestões. (Rota protegida pelo login; também roda todo dia.)
export async function POST() {
  return NextResponse.json(await sincronizar())
}
