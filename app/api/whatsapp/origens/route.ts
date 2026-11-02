import { NextResponse } from "next/server"
import { classificarOrigens } from "@/app/lib/origensWhatsappServidor"

export const maxDuration = 60

// Botão "Atualizar origens" (rota protegida pelo login)
export async function POST() {
  return NextResponse.json(await classificarOrigens())
}
