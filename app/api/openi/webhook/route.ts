import { NextRequest, NextResponse, after } from "next/server"
import { segredoValido, fonteDoExtrato } from "@/app/lib/openi"
import { sincronizarOpeni } from "@/app/lib/bancoServidor"
import { lerConfigLinha } from "@/app/lib/configAtomica"

export const maxDuration = 60

// Webhook da Openi (público, protegido por OPENI_WEBHOOK_SECRET no cabeçalho x-webhook-secret, Authorization: Bearer ou ?secret=).
// Responde 200 na hora (a Openi espera no máximo 5 s) e sincroniza depois. Do corpo não lê nada: os dados vêm da API.
export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null
  const recebido = req.headers.get("x-webhook-secret") ?? bearer ?? req.nextUrl.searchParams.get("secret")
  if (!segredoValido(recebido)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
  after(async () => {
    const { data } = await lerConfigLinha()
    if (fonteDoExtrato((data?.data as { bankFeedSource?: unknown } | null)?.bankFeedSource) !== "openi") return   // chave desligada: ignora
    await sincronizarOpeni().catch(() => console.error("[openi] falha ao sincronizar"))
  })
  return NextResponse.json({ ok: true })
}
