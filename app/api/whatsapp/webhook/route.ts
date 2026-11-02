import { NextRequest, NextResponse } from "next/server"
import { gravarLote, WaMessage } from "@/app/lib/whatsappDados"

// ── Handler principal ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Validação de token (query param — Evolution API global webhook não suporta headers customizados)
  const token = req.nextUrl.searchParams.get("token")
  if (!token || token !== process.env.WHATSAPP_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body  = await req.json()
    const event = body.event as string

    // ── messages.upsert — mensagem nova em tempo real
    if (event === "messages.upsert") {
      const data = body.data as WaMessage
      await gravarLote([data], { contarNaoLidas: true })
      return NextResponse.json({ ok: true })
    }

    // ── messages.set — histórico em lote entregue na conexão inicial da instância
    //    O Evolution dispara este evento ao sincronizar chats do dispositivo.
    //    Caveat: o WhatsApp Web entrega tipicamente os últimos 3 meses de histórico,
    //    não o histórico completo de todos os tempos.
    if (event === "messages.set") {
      // A payload pode vir como array direto ou dentro de { messages: [] }
      const rawData = body.data
      const msgs: WaMessage[] = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.messages)
          ? rawData.messages
          : []

      // Em lote (histórico não conta como "não lida")
      const processed = await gravarLote(msgs)
      return NextResponse.json({ ok: true, processed })
    }

    // Outros eventos ignorados silenciosamente
    return NextResponse.json({ ok: true })

  } catch (e) {
    console.error("[whatsapp/webhook]", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
