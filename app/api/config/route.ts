import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

// Campos gravados só pelo servidor (renovação do token da Meta, aprovações online dos clientes). A tela envia a
// configuração inteira que carregou; sem isto, salvar qualquer ajuste regravaria
// um token antigo por cima do renovado.
const CAMPOS_DO_SERVIDOR = ["metaToken", "metaTokenExpiry", "metaTokenTipo", "metaTokenValido", "metaTokenErro", "metaTokenVerificadoEm", "metaContaId", "metaContaEscolhida", "metaContas", "aprovacoesOnline", "avaliacoes", "visitasProposta", "groqKey", "whatsappConexao", "enderecosClientes", "apelidosWhatsapp", "lalamoveCarteira", "lalamoveEventos", "lalamoveServicos", "pluggyStatus", "regrasBanco", "licoesBanco", "exemplosBanco", "agenteLog", "agenteAuto", "agenteFollowupEm", "conhecimentoAgente", "agenteAprendeuEm", "agenteSemCreditoEm", "reativacaoAuto", "reativacaoPulados", "reativacaoProximaEm", "marketingRelatorios", "marketingGerandoEm"] as const

// Campos novos que uma aba aberta antes deles existirem não conhece: se não vierem, mantém o que está salvo
const MANTER_SE_AUSENTE = ["guiaAtendimento", "avisosPedido", "filaDispensados", "filtroLeads"] as const

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>
    const { data: atual } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
    const salvo = (atual?.data as Record<string, unknown> | undefined) ?? {}
    const proximo: Record<string, unknown> = { ...body }
    for (const k of CAMPOS_DO_SERVIDOR) {
      if (k in salvo) proximo[k] = salvo[k]
      else delete proximo[k]
    }
    for (const k of MANTER_SE_AUSENTE) if (!(k in body) && k in salvo) proximo[k] = salvo[k]
    // Vínculos conversa → cliente também nascem no servidor (telefone, conversas juntadas): soma, nunca perde.
    // A tela não apaga vínculo, só marca "" (não é cliente), então a versão dela vence em cada conversa.
    proximo.vinculosWhatsapp = { ...(salvo.vinculosWhatsapp as Record<string, string> ?? {}), ...(body.vinculosWhatsapp as Record<string, string> ?? {}) }
    await supabase.from("AppConfig").upsert({ id: 1, data: proximo }, { onConflict: "id" })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
