import { NextRequest, NextResponse } from "next/server"
import { assinaturaValida } from "@/app/lib/prospectorInbound"
import { processarEmailRecebido } from "@/app/lib/prospectorInboundServidor"
import { EVENTOS_EMAIL, processarEventoEmail } from "@/app/lib/prospectorEventosServidor"

// Webhook da Resend (email.received, e os eventos email.delivered/bounced/opened/clicked do envio). Rota fora do login (proxy.ts): a assinatura Svix é a autenticação.
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
    const tipo = (evento as { type?: unknown } | null)?.type
    if (typeof tipo === "string" && tipo in EVENTOS_EMAIL) {
      const e = await processarEventoEmail(evento as Parameters<typeof processarEventoEmail>[0])
      return NextResponse.json(e, { status: e.status })
    }
    const r = await processarEmailRecebido((evento ?? {}) as Parameters<typeof processarEmailRecebido>[0])
    return NextResponse.json(r, { status: r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
