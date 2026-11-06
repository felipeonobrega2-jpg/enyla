// Monta o "Hoje" (Painel e resumo da manhã no seu WhatsApp): bons negócios esperando você, o que o anúncio trouxe
// em 24 h, a ação do relatório de marketing e a reativação. Só roda no servidor.

import { supabase } from "./supabase"
import { lerCfg } from "./agenteAuto"
import { candidatos, enviadasHoje, CfgReativacao } from "./reativacaoServidor"
import { POR_DIA_PADRAO } from "./reativacao"
import { DIAS_PERDIDO } from "./funilWhatsapp"
import { total, custoPor, Relatorio } from "./marketing"
import { marcosDoRegistro } from "./agenteLeads"
import { quemResponder, doAnuncio, ConvHoje, Hoje, Passos } from "./hoje"

export async function montarHoje(): Promise<Hoje> {
  const desde = new Date(Date.now() - DIAS_PERDIDO * 86_400_000).toISOString()
  const [cfg, { data, error }] = await Promise.all([
    lerCfg() as Promise<Awaited<ReturnType<typeof lerCfg>> & CfgReativacao & { marketingRelatorios?: Relatorio[]; proximosPassos?: Passos }>,
    supabase.from("whatsapp_conversas")
      .select("jid, nome, ultima_msg, ultima_recebida_at, ultima_enviada_at, fechada_em, status_lead, etiquetas, campanha, criado_em, proxima_acao")
      .not("jid", "like", "%@g.us").gte("ultima_at", desde).order("ultima_at", { ascending: false }).limit(1500),
  ])
  if (error) throw new Error(error.message)
  const convs = (data ?? []) as ConvHoje[]
  const { responder, retomar, outros } = quemResponder(convs, cfg.agenteMarcos ?? marcosDoRegistro(cfg.agenteLog ?? []), Date.now(), cfg.vinculosWhatsapp, cfg.proximosPassos)
  const rel = (cfg.marketingRelatorios ?? [])[0]
  const t = rel ? total(rel.dia1) : null
  const auto = cfg.reativacaoAuto ?? { ligado: false, porDia: POR_DIA_PADRAO }
  const fila = await candidatos(cfg).catch(() => [])
  return {
    responder, retomar, outrosEsperando: outros, anuncio: doAnuncio(convs),
    marketing: rel?.leitura?.acao ? { dia: rel.dia, acao: rel.leitura.acao, custoMql: t ? custoPor(t.gasto, t.mql) : null } : null,
    reativacao: {
      ligado: !!auto.ligado, porDia: auto.porDia ?? POR_DIA_PADRAO, hoje: enviadasHoje(cfg), fila: fila.length,
      orcamentosSemResposta: fila.filter(c => c.motivo === "Orçamento sem resposta").length,
    },
  }
}
