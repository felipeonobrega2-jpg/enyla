import { NextRequest, NextResponse } from "next/server"
import { mudarConfig } from "@/app/lib/configAtomica"

// Campos gravados só pelo servidor (renovação do token da Meta, aprovações online dos clientes). A tela envia a
// configuração inteira que carregou; sem isto, salvar qualquer ajuste regravaria
// um token antigo por cima do renovado.
const CAMPOS_DO_SERVIDOR = ["metaToken", "metaTokenExpiry", "metaTokenTipo", "metaTokenValido", "metaTokenErro", "metaTokenVerificadoEm", "metaContaId", "metaContaEscolhida", "metaContas", "aprovacoesOnline", "avaliacoes", "visitasProposta", "groqKey", "whatsappConexao", "enderecosClientes", "apelidosWhatsapp", "lalamoveCarteira", "lalamoveEventos", "lalamoveServicos", "pluggyStatus", "regrasBanco", "licoesBanco", "exemplosBanco", "agenteLog", "agenteMarcos", "proximosPassos", "agenteAuto", "agenteFollowupEm", "conhecimentoAgente", "agenteAprendeuEm", "agenteSemCreditoEm", "reativacaoAuto", "reativacaoPulados", "reativacaoProximaEm", "marketingRelatorios", "marketingGerandoEm", "pedidosDigitais", "digitalConferidoEm", "digitalBancoEm", "agenteRetomadaEm", "agenteRetomadas", "agenteIds", "gastosIA", "gastosCfg", "gastosMeta", "gastosAvisoEm", "cotacaoDolar", "agenteTratadas", "agenteAprendeuVersao", "agenteRevisaoConhecimento", "estiloFelipe", "digitalContatos", "digitalAcertoSemana", "pendenciasDono", "midiaAgente", "ideiasDoSistemaV", "ideiasCorrecaoV", "gastosFixosDoSistemaV", "gastosFixosDoSistemaEm", "aberturaTeste", "aberturaMedida", "agenteEnviosHora", "metaSaldoVistoEm", "metaSaldoAviso", "agenteAprendendoEm", "agenteConhecimentoJuntadoEm", "agenteRelerAte", "propostasProntas", "propostasAjustes", "propostaLidaEm", "ganhosAuto", "digitalCustoV", "_v"] as const

// Campos novos que uma aba aberta antes deles existirem não conhece: se não vierem, mantém o que está salvo
const MANTER_SE_AUSENTE = ["guiaAtendimento", "avisosPedido", "filaDispensados", "filtroLeads"] as const

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>
    // Lido de novo a cada tentativa: o que o servidor gravou no meio (registro do agente, Pix) não se perde
    await mudarConfig(salvo => {
      const proximo: Record<string, unknown> = { ...body }
      for (const k of CAMPOS_DO_SERVIDOR) {
        if (k in salvo) proximo[k] = salvo[k]
        else delete proximo[k]
      }
      for (const k of MANTER_SE_AUSENTE) if (!(k in body) && k in salvo) proximo[k] = salvo[k]
      // Ideia que o sistema pôs há menos de 1 dia e a tela aberta antes ainda não conhecia: não some no salvar
      if (Array.isArray(body.ideias) && Array.isArray(salvo.ideias)) {
        const naTela = new Set((body.ideias as { id: string }[]).map(i => i.id))
        const novas = (salvo.ideias as { id: string; criadaEm?: string }[]).filter(i => i.id.startsWith("sis-") && !naTela.has(i.id) && Date.now() - new Date(i.criadaEm ?? 0).getTime() < 86_400_000)
        if (novas.length) proximo.ideias = [...novas, ...(body.ideias as unknown[])]
      }
      // Gasto fixo que o sistema pôs há menos de 1 dia (Railway) e a tela aberta antes não conhecia: idem
      if (Array.isArray(body.gastosFixos) && Array.isArray(salvo.gastosFixos) && Date.now() - new Date(String(salvo.gastosFixosDoSistemaEm ?? 0)).getTime() < 86_400_000) {
        const naTela = new Set((body.gastosFixos as { id: string }[]).map(g => g.id))
        const novos = (salvo.gastosFixos as { id: string }[]).filter(g => g.id.startsWith("sis-") && !naTela.has(g.id))
        if (novos.length) proximo.gastosFixos = [...(body.gastosFixos as unknown[]), ...novos]
      }
      // Vínculos conversa → cliente também nascem no servidor (telefone, conversas juntadas): soma, nunca perde.
      // A tela não apaga vínculo, só marca "" (não é cliente), então a versão dela vence em cada conversa.
      proximo.vinculosWhatsapp = { ...(salvo.vinculosWhatsapp as Record<string, string> ?? {}), ...(body.vinculosWhatsapp as Record<string, string> ?? {}) }
      // A tela manda o objeto inteiro: o que ela não mandou (e não é do servidor) sai, como antes
      for (const k of Object.keys(salvo)) if (!(k in proximo) && k !== "_v") proximo[k] = undefined
      return proximo
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }
}
