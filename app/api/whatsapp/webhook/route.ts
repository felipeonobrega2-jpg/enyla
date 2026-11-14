import { NextRequest, NextResponse, after } from "next/server"
import { transcreverPendentes } from "@/app/lib/transcricao"
import { registrarConexao, registrarRecibos, registrarContatos } from "@/app/lib/whatsappEventos"
import { gravarLote, WaMessage, deveIgnorar, extractBody } from "@/app/lib/whatsappDados"
import { supabase } from "@/app/lib/supabase"
import { agendarResposta, talvezFollowUps, talvezRetomarParados } from "@/app/lib/agenteAuto"
import { talvezAprender } from "@/app/lib/agenteAprende"
import { talvezReativar } from "@/app/lib/reativacaoServidor"
import { talvezRelatorio } from "@/app/lib/marketingServidor"
import { conferirSinais, talvezAcertoSemanal, talvezCorrigirDigital, talvezAjustePontual } from "@/app/lib/digitalServidor"
import { talvezAdicionarIdeias, talvezAdicionarGastosFixos } from "@/app/lib/ideiasServidor"
import { talvezConferirMeta } from "@/app/lib/metaSaldoServidor"
import { talvezTesteAbertura } from "@/app/lib/aberturaABServidor"
import { marcarOrigemPelaFrase, talvezMarcarOrigens } from "@/app/lib/origensWhatsappServidor"
import { talvezAvisarGastos } from "@/app/lib/gastosServidor"
import { talvezCampanhaDigital } from "@/app/lib/campanhaDigitalServidor"
import { talvezPedirMedida } from "@/app/lib/pedirMedidaServidor"
import { talvezResumoDoDia } from "@/app/lib/animarServidor"
import { talvezMoverRegistroAntigo } from "@/app/lib/agenteAuto"
import { talvezClassificarLeads, talvezAvisarMqlEsperando } from "@/app/lib/classificarLeadServidor"

// Espera do modo automático (o lead termina de digitar) + resposta da IA + envio
export const maxDuration = 60

let ultimaRodada = 0

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
    // Tarefas periódicas pegam carona nos eventos, mas no máximo 1 vez por minuto (por instância) e só em mensagem
    // nova ou mudança de conexão. Antes rodavam em todo evento (inclusive cada "lida"/"entregue"), e cada uma lê a
    // configuração inteira: com muito volume isso sufocava o banco (12/11: leitura simples levando 20-120 s).
    if ((event === "messages.upsert" || event === "connection.update") && Date.now() - ultimaRodada > 60_000) {
      ultimaRodada = Date.now()
      // Follow-ups do agente de leads pegam carona nos eventos (no máximo uma rodada a cada 10 min)
      after(() => talvezFollowUps().catch(e => console.error("[agente follow-up]", e)))
      // Lead que respondeu enquanto você estava na conversa e ficou sem resposta: o agente retoma
      after(() => talvezRetomarParados(req.nextUrl.origin).catch(e => console.error("[agente retoma]", e)))
      after(() => talvezAprender().catch(e => console.error("[agente aprende]", e)))
      after(() => talvezReativar().catch(e => console.error("[reativação]", e)))
      after(() => talvezRelatorio(req.nextUrl.origin).catch(e => console.error("[marketing]", e)))
      // Braço digital: confere no extrato os sinais esperando Pix (no máximo a cada 5 min; só se há pedido esperando)
      after(() => conferirSinais().then(() => undefined).catch(e => console.error("[digital]", e)))
      after(() => talvezAdicionarIdeias().catch(e => console.error("[ideias]", e)))
      after(() => talvezAdicionarGastosFixos().catch(e => console.error("[gastos fixos]", e)))
      // Crédito dos anúncios na Meta (no máximo 1 vez por hora): avisa no celular antes de parar
      after(() => talvezConferirMeta().catch(e => console.error("[meta saldo]", e)))
      after(() => talvezAcertoSemanal().catch(e => console.error("[digital acerto]", e)))
      after(() => talvezCorrigirDigital().catch(e => console.error("[digital custo]", e)))
      after(() => talvezAjustePontual().catch(e => console.error("[digital ajuste]", e)))
      after(() => talvezCampanhaDigital().catch(e => console.error("[campanha digital]", e)))
      after(() => talvezPedirMedida().catch(e => console.error("[pedir medida]", e)))
      after(() => talvezResumoDoDia().catch(e => console.error("[resumo do dia]", e)))
      after(() => talvezMoverRegistroAntigo().catch(e => console.error("[registro do agente]", e)))
      after(() => talvezClassificarLeads().catch(e => console.error("[classificar leads]", e)))
      after(() => talvezAvisarMqlEsperando().catch(e => console.error("[mql esperando]", e)))
      after(() => talvezTesteAbertura().catch(e => console.error("[abertura A/B]", e)))
      // Leads do anúncio: conversas recentes sem origem são marcadas pela frase do anúncio (no máximo a cada 30 min)
      after(() => talvezMarcarOrigens().then(() => undefined).catch(e => console.error("[origens]", e)))
      // Gastos: aviso no seu WhatsApp quando IA ou anúncios estão para acabar (confere no máximo a cada 30 min)
      after(() => talvezAvisarGastos().catch(e => console.error("[gastos]", e)))

    }

    // ── messages.upsert — mensagem nova em tempo real
    if (event === "messages.upsert") {
      const data = body.data as WaMessage
      const novas = new Set<string>()
      await gravarLote([data], { contarNaoLidas: true, novas })
      // Clique no anúncio (o WhatsApp marca a primeira mensagem): grava a origem na hora, sem esperar a classificação do dia.
      // Só uma dica para o funil e para o agente; nada do payload é usado além disso.
      if (data?.key?.id && novas.has(data.key.id) && !data.key.fromMe && /externalAdReply|conversionSource|"ctwa/i.test(JSON.stringify(data))) {
        const { data: salva } = await supabase.from("whatsapp_mensagens").select("jid").eq("id", data.key.id).maybeSingle()
        if (salva?.jid) await supabase.from("whatsapp_conversas").update({ campanha: JSON.stringify({ canal: "anuncio", entrada: new Date().toISOString() }) }).eq("jid", salva.jid).is("campanha", null)
      }
      // Frase pronta do anúncio (o jeito que quase sempre identifica o lead): marca na hora
      else if (data?.key?.id && novas.has(data.key.id) && !data.key.fromMe && !deveIgnorar(data.key.remoteJid ?? "")) {
        const { data: salva } = await supabase.from("whatsapp_mensagens").select("jid, ts").eq("id", data.key.id).maybeSingle()
        if (salva?.jid) await marcarOrigemPelaFrase(salva.jid, extractBody(data).corpo, salva.ts).catch(() => null)
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
      const motivo = Number(body.data?.statusReason ?? body.data?.lastDisconnect?.error?.output?.statusCode ?? 0) || null
      if (estado) await registrarConexao(estado, motivo)
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
