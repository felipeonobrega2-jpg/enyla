import { NextRequest, NextResponse, after } from "next/server"
import { transcreverPendentes } from "@/app/lib/transcricao"
import { registrarConexao, registrarRecibos, registrarContatos } from "@/app/lib/whatsappEventos"
import { gravarLote, WaMessage, deveIgnorar, extractBody } from "@/app/lib/whatsappDados"
import { supabase } from "@/app/lib/supabase"
import { agendarResposta, talvezFollowUps } from "@/app/lib/agenteAuto"

// Espera do modo automático (o lead termina de digitar) + resposta da IA + envio
export const maxDuration = 60

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
    // Follow-ups do agente de leads pegam carona nos eventos (no máximo uma rodada a cada 10 min)
    after(() => talvezFollowUps().catch(e => console.error("[agente follow-up]", e)))

    // ── messages.upsert — mensagem nova em tempo real
    if (event === "messages.upsert") {
      const data = body.data as WaMessage
      const novas = new Set<string>()
      await gravarLote([data], { contarNaoLidas: true, novas })
      // Clique no anúncio (o WhatsApp marca a primeira mensagem): grava a origem na hora, sem esperar a classificação do dia.
      // Só uma dica para o funil e para o agente; nada do payload é usado além disso.
      if (data?.key?.id && novas.has(data.key.id) && !data.key.fromMe && /externalAdReply|conversionSource|"ctwa/i.test(JSON.stringify(data))) {
        const { data: salva } = await supabase.from("whatsapp_mensagens").select("jid").eq("id", data.key.id).maybeSingle()
        if (salva?.jid) await supabase.from("whatsapp_conversas").update({ campanha: JSON.stringify({ canal: "anuncio" }) }).eq("jid", salva.jid).is("campanha", null)
      }
      // Áudio novo: transcreve depois de responder ao Evolution (não atrasa o recebimento)
      if (data?.message?.audioMessage && data.key?.id) after(() => transcreverPendentes({ ids: [data.key.id] }).catch(() => {}))
      // Agente de leads no modo automático (desligado por padrão; ele mesmo confere as travas)
      if (data?.key?.id && novas.has(data.key.id) && !data.key.fromMe && !deveIgnorar(data.key.remoteJid ?? "") && ["text", "audio", "image", "video", "document"].includes(extractBody(data).tipo)) after(() => agendarResposta(data.key.id, req.nextUrl.origin).catch(e => console.error("[agente]", e)))
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

    // ── connection.update — o número conectou ou caiu (Painel avisa)
    if (event === "connection.update") {
      const estado = (body.data?.state ?? body.data?.connection) as string | undefined
      if (estado) await registrarConexao(estado)
      return NextResponse.json({ ok: true })
    }

    // ── messages.update — entregue / lida
    if (event === "messages.update") {
      await registrarRecibos(Array.isArray(body.data) ? body.data : [body.data]).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    // ── contacts.upsert / contacts.update — nomes dos contatos
    if (event === "contacts.upsert" || event === "contacts.update") {
      await registrarContatos(Array.isArray(body.data) ? body.data : [body.data]).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    // Outros eventos ignorados silenciosamente
    return NextResponse.json({ ok: true })

  } catch (e) {
    console.error("[whatsapp/webhook]", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
