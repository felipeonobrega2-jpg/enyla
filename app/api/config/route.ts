import { NextRequest, NextResponse } from "next/server"
import { mudarConfig } from "@/app/lib/configAtomica"
import { CONFIG_PADRAO } from "@/app/config"

// Campos gravados só pelo servidor (renovação do token da Meta, aprovações online dos clientes). A tela envia a
// configuração inteira que carregou; sem isto, salvar qualquer ajuste regravaria
// um token antigo por cima do renovado.
const CAMPOS_DO_SERVIDOR = ["metaToken", "metaTokenExpiry", "metaTokenTipo", "metaTokenValido", "metaTokenErro", "metaTokenVerificadoEm", "metaContaId", "metaContaEscolhida", "metaContas", "aprovacoesOnline", "avaliacoes", "visitasProposta", "groqKey", "whatsappConexao", "enderecosClientes", "apelidosWhatsapp", "lalamoveCarteira", "lalamoveEventos", "lalamoveServicos", "pluggyStatus", "regrasBanco", "licoesBanco", "exemplosBanco", "agenteLog", "agenteMarcos", "proximosPassos", "agenteAuto", "agenteFollowupEm", "conhecimentoAgente", "agenteAprendeuEm", "agenteSemCreditoEm", "reativacaoAuto", "reativacaoPulados", "reativacaoProximaEm", "marketingRelatorios", "marketingGerandoEm", "pedidosDigitais", "digitalConferidoEm", "digitalBancoEm", "agenteRetomadaEm", "agenteRetomadas", "agenteIds", "gastosIA", "gastosCfg", "gastosMeta", "gastosAvisoEm", "cotacaoDolar", "agenteTratadas", "agenteAprendeuVersao", "agenteRevisaoConhecimento", "estiloFelipe", "digitalContatos", "digitalAcertoSemana", "pendenciasDono", "midiaAgente", "ideiasDoSistemaV", "ideiasCorrecaoV", "gastosFixosDoSistemaV", "gastosFixosDoSistemaEm", "aberturaTeste", "aberturaMedida", "agenteEnviosHora", "metaSaldoVistoEm", "metaSaldoAviso", "agenteAprendendoEm", "agenteConhecimentoJuntadoEm", "agenteRelerAte", "propostasProntas", "propostasAjustes", "propostaLidaEm", "ganhosAuto", "digitalCustoV", "digitalAjusteV", "campanhaDigital", "agenteFollowupTentados", "licoesIA", "leadManual", "revisaoLeadsAte", "classificandoEm", "mqlEsperandoAvisado", "classificarErro", "contasDoBanco", "subcategoriasDoSistemaV", "subcategoriasDoSistemaEm", "categoriasMudadasEm", "pagamentosCartao", "ligacoesEm", "respostasPendentes", "rotinaEnviada", "whatsappForaAvisadoEm", "grandesNegocios", "grandesDispensados", "vigiaTentou", "esperaAvisada", "esperaAvisoEm", "fechadasPelaIA", "vigiaRodouEm", "auditoriaDados", "auditoriaIgnorados", "cadastrosParceiros", "captacaoParceiros", "vigiaTentouV2", "vigiaTentouV3", "auditoriaComecouEm", "revisaoLeadsV", "agenteAtrasadas", "promessasEm", "promessasCobradas", "_v"] as const

// Campos novos que uma aba aberta antes deles existirem não conhece: se não vierem, mantém o que está salvo
const MANTER_SE_AUSENTE = ["guiaAtendimento", "avisosPedido", "filaDispensados", "filtroLeads"] as const

// Dado preenchido nunca é trocado por vazio ou pelo padrão de fábrica. 19/11: uma aba que abriu com o banco fora
// ficou com a configuração de fábrica e, no primeiro salvar, apagou ideias, gastos fixos, fornecedores, contas,
// categorias, metas, produção e a chave da IA. Aba nesse estado (2+ campos voltando ao padrão) é recusada inteira.
const vazio = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0)
const igualPadrao = (k: string, v: unknown) => k in CONFIG_PADRAO && JSON.stringify(v) === JSON.stringify((CONFIG_PADRAO as Record<string, unknown>)[k])
const empobrece = (k: string, novo: unknown, salvo: unknown) =>
  !vazio(salvo) && !igualPadrao(k, salvo) && (vazio(novo) || igualPadrao(k, novo))

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>
    let recusada = false
    await mudarConfig(salvo => {
      const perdas = Object.keys(body).filter(k => empobrece(k, body[k], salvo[k]))
      if (perdas.length >= 2) recusada = true
      return null
    })
    if (recusada) return NextResponse.json({ erro: "tela desatualizada: recarregue a página antes de salvar" }, { status: 409 })
    // Lido de novo a cada tentativa: o que o servidor gravou no meio (registro do agente, Pix) não se perde
    await mudarConfig(salvo => {
      const proximo: Record<string, unknown> = { ...body }
      // Campo a campo: vazio/padrão por cima de dado preenchido não passa (fica o salvo)
      for (const k of Object.keys(body)) if (empobrece(k, body[k], salvo[k])) proximo[k] = salvo[k]
      for (const k of CAMPOS_DO_SERVIDOR) {
        if (k in salvo) proximo[k] = salvo[k]
        else delete proximo[k]
      }
      for (const k of MANTER_SE_AUSENTE) if (!(k in body) && k in salvo) proximo[k] = salvo[k]
      // Campo que a tela não mandou nunca é apagado (20/11: o salvar da aba desatualizada sumiu com etiquetas do
      // WhatsApp, locais de retirada, origens dos clientes e outros campos que o sistema grava sozinho)
      for (const k of Object.keys(salvo)) if (!(k in body) && !(k in proximo)) proximo[k] = salvo[k]
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
      // Subcategorias que o sistema cadastrou há menos de 1 dia e a tela aberta antes não conhecia: idem
      // (e categoria/subcategoria criada no lançamento): soma, para uma aba aberta antes não apagar
      const recente = (k: string) => Date.now() - new Date(String(salvo[k] ?? 0)).getTime() < 86_400_000
      if (recente("subcategoriasDoSistemaEm") || recente("categoriasMudadasEm")) {
        for (const k of ["categoriasDespesa", "categoriasReceita"] as const) {
          const tela = body[k] as { id: string; subcategorias?: string[] }[] | undefined, banco = salvo[k] as { id: string; subcategorias?: string[] }[] | undefined
          if (!Array.isArray(tela) || !Array.isArray(banco)) continue
          const juntas = tela.map(c => { const b = banco.find(x => x.id === c.id); return b?.subcategorias?.length ? { ...c, subcategorias: [...new Set([...(c.subcategorias ?? []), ...b.subcategorias])] } : c })
          proximo[k] = recente("categoriasMudadasEm") ? [...juntas, ...banco.filter(b => !tela.some(c => c.id === b.id))] : juntas
        }
      }
      // Quem paga por qual cliente também é aprendido no servidor (aba Banco): soma, a tela vence em cada pagador
      if (salvo.conciliacao || body.conciliacao) {
        const sv = (salvo.conciliacao ?? {}) as { pagadores?: Record<string, string> }, bd = (body.conciliacao ?? {}) as { pagadores?: Record<string, string> }
        proximo.conciliacao = { ...sv, ...bd, pagadores: { ...(sv.pagadores ?? {}), ...(bd.pagadores ?? {}) } }
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
