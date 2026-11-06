// Monta o "Hoje" (Painel e resumo da manhã no seu WhatsApp): bons negócios esperando você, o que o anúncio trouxe
// em 24 h, a ação do relatório de marketing e a reativação. Só roda no servidor.

import { supabase } from "./supabase"
import { lerCfg } from "./agenteAuto"
import { candidatos, enviadasHoje, CfgReativacao } from "./reativacaoServidor"
import { POR_DIA_PADRAO } from "./reativacao"
import { DIAS_PERDIDO } from "./funilWhatsapp"
import { total, custoPor, Relatorio } from "./marketing"
import { marcosDoRegistro } from "./agenteLeads"
import { quemResponder, doAnuncio, doDigital, deveOrcamento, etapaDaConversa, dadosDaConversa, ConvHoje, Hoje, ItemHoje, Passos } from "./hoje"
import { qualidadeDoLead } from "./marketing"
import { nomeChave } from "./negocio"

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
  const orcar = await orcamentosParaFazer(convs, cfg.proximosPassos ?? {}, cfg.vinculosWhatsapp ?? {})
  const devendo = new Set(orcar.map(x => x.jid))
  const rel = (cfg.marketingRelatorios ?? [])[0]
  const t = rel ? total(rel.dia1) : null
  const auto = cfg.reativacaoAuto ?? { ligado: false, porDia: POR_DIA_PADRAO }
  const fila = await candidatos(cfg).catch(() => [])
  return {
    orcar, responder: responder.filter(x => !devendo.has(x.jid)), retomar: retomar.filter(x => !devendo.has(x.jid)), outrosEsperando: outros, anuncio: doAnuncio(convs),
    marketing: rel?.leitura?.acao ? { dia: rel.dia, acao: rel.leitura.acao, custoMql: t ? custoPor(t.gasto, t.mql) : null } : null,
    reativacao: {
      ligado: !!auto.ligado, porDia: auto.porDia ?? POR_DIA_PADRAO, hoje: enviadasHoje(cfg), fila: fila.length,
      orcamentosSemResposta: fila.filter(c => c.motivo === "Orçamento sem resposta").length,
    },
    digital: (() => {
      const c = cfg as { agenteAuto?: { pequenoParceiro?: boolean }; pedidosDigitais?: { status: string; em: string }[] }
      const ped = (c.pedidosDigitais ?? []).filter(p => Date.now() - new Date(p.em).getTime() < 30 * 86_400_000)
      return { ligado: c.agenteAuto?.pequenoParceiro === false, ...doDigital(convs),
        aguardandoSinal: ped.filter(p => p.status === "aguardando_sinal").length, pagos: ped.filter(p => p.status === "sinal_pago").length }
    })(),
  }
}

// Quem passou tudo para cotar e ainda não recebeu: sem PDF/documento seu e sem orçamento no sistema depois da última dele
async function orcamentosParaFazer(convs: ConvHoje[], passos: Passos, vinculos: Record<string, string>): Promise<ItemHoje[]> {
  const pre = convs.filter(c => etapaDaConversa(c.proxima_acao) === "orcamento" && qualidadeDoLead(c) === "mql" && c.ultima_recebida_at
    && Date.now() - new Date(c.ultima_recebida_at).getTime() < 7 * 86_400_000).slice(0, 40)
  if (!pre.length) return []
  const { data: cards } = await supabase.from("KanbanCard").select("nomeCliente, createdAt")
  const out: ItemHoje[] = []
  await Promise.all(pre.map(async c => {
    const { count } = await supabase.from("whatsapp_mensagens").select("id", { count: "exact", head: true })
      .eq("jid", c.jid).eq("from_me", true).in("tipo", ["document", "documentMessage", "documentWithCaptionMessage"]).gt("ts", c.ultima_recebida_at!)
    const cli = vinculos[c.jid]
    const noSistema = !!cli && (cards ?? []).some(k => nomeChave(k.nomeCliente) === nomeChave(cli) && !!k.createdAt && new Date(k.createdAt) > new Date(c.ultima_recebida_at!))
    if (!deveOrcamento(c, { documento: (count ?? 0) > 0, orcamentoNoSistema: noSistema }, passos[c.jid])) return
    out.push({
      jid: c.jid, nome: c.nome, mensagem: c.ultima_msg, desde: c.ultima_recebida_at!, retomada: false, lista: "orcar",
      rotulo: ["ICP", "Oportunidade", "Lead médio"].find(e => (c.etiquetas ?? []).includes(e)) ?? "MQL",
      dados: dadosDaConversa(c.proxima_acao), cliente: cli || null,
    })
  }))
  // O mais antigo primeiro: quem está esperando há mais tempo
  return out.sort((a, b) => a.desde.localeCompare(b.desde))
}
