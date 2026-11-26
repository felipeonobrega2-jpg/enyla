import { NextRequest, NextResponse } from "next/server"
import { URL_CADASTRO_PARCEIROS } from "@/app/lib/prospectorEnvio"
import { registrarCliquePorToken } from "@/app/lib/prospectorEventosServidor"

// Link rastreado do primeiro contato por e-mail. Rota fora do login (proxy.ts): o token aleatório do envio é a identificação.
// Marca clique/abriu e encaminha ao formulário de parceiros. Token inválido ou erro: encaminha do mesmo jeito, sem dizer nada.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  await registrarCliquePorToken(token)
  return NextResponse.redirect(URL_CADASTRO_PARCEIROS, 302)
}
