import { NextRequest, NextResponse } from "next/server"
import { assinaturaValida } from "@/app/lib/prospectorInbound"
import { processarEmailRecebido } from "@/app/lib/prospectorInboundServidor"

// Webhook da Resend (evento email.received). Rota fora do login (proxy.ts): a assinatura Svix é a autenticação.
// Sem RESEND_WEBHOOK_SECRET recusa. Só grava a resposta e muda a etapa; não envia nada a ninguém.
export async function POST(req: NextRequest) {
  const segredo = process.env.RESEND_WEBHOOK_SECRET
  if (!segredo) return NextResponse.json({ error: "webhook não configurado" }, { status: 503 })
  const corpo = await req.text()
  const ok = assinaturaValida(corpo, { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), assinatura: req.headers.get("svix-signature") }, segredo)
  if (!ok) return NextResponse.json({ error: "assinatura inválida" }, { status: 401 })
  let evento: unknown
  try { evento = JSON.parse(corpo) } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }
  try {
    const r = await processarEmailRecebido((evento ?? {}) as Parameters<typeof processarEmailRecebido>[0])
    return NextResponse.json(r, { status: r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
