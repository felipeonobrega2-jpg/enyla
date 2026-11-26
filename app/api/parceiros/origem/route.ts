// Correção retroativa da origem dos cadastros de parceiros (só a equipe, atrás do login). Só acrescenta origem e
// prospectoId e anda o funil; não apaga nada. { simular: true } só conta, sem gravar.
import { NextResponse } from "next/server"
import { corrigirOrigemRetroativa } from "@/app/lib/origemCadastroServidor"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { simular?: boolean }
  return NextResponse.json({ ok: true, ...(await corrigirOrigemRetroativa({ simular: b.simular === true })) })
}
