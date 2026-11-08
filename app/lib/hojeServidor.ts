// Monta o "Hoje" (Painel e resumo da manhã no seu WhatsApp): bons negócios esperando você, o que o anúncio trouxe
// em 24 h, a ação do relatório de marketing e a reativação. Só roda no servidor.

import { supabase } from "./supabase"
import { lerCfg } from "./agenteAuto"
import { candidatos, enviadasHoje, CfgReativacao } from "./reativacaoServidor"
import { POR_DIA_PADRAO } from "./reativacao"
import { DIAS_PERDIDO } from "./funilWhatsapp"
import { total, custoPor, Relatorio } from "./marketing"
import { marcosDoRegistro } from "./agenteLeads"
import { quemResponder, doAnuncio, doDigital, deveOrcamento, aguardaOrcamentoMarcado, etapaDaConversa, dadosDaConversa, ConvHoje, Hoje, ItemHoje, Passos } from "./hoje"
import { qualidadeDoLead } from "./marketing"
import { nomeChave } from "./negocio"
import { gastosAtuais } from "./gastosServidor"
import { estadoDoMql, resumirMeta, DIAS_META, MsgMeta } from "./metaMql"
import type { ItemMeta } from "./hoje"

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
  const meta = await metaDoMql(convs, cfg.proximosPassos ?? {}, cfg.vinculosWhatsapp ?? {}, devendo).catch(() => undefined)
  const gastos = await gastosAtuais().then(g => ({ alertas: g.alertas, totalDia: g.totalDia })).catch(() => undefined)
  return {
    gastos, meta,
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
  const marcados = new Set(Object.entries(passos).filter(([, p]) => p.tipo === "orcar").map(([j]) => j))
  const pre = convs.filter(c => marcados.has(c.jid) || (etapaDaConversa(c.proxima_acao) === "orcamento" && qualidadeDoLead(c) === "mql" && c.ultima_recebida_at
    && Date.now() - new Date(c.ultima_recebida_at).getTime() < 7 * 86_400_000)).slice(0, 60)
  if (!pre.length) return []
  const { data: cards } = await supabase.from("KanbanCard").select("nomeCliente, createdAt")
  const out: ItemHoje[] = []
  await Promise.all(pre.map(async c => {
    // Marcado por você: conta a partir de quando marcou; senão, da última mensagem dele
    const p = passos[c.jid]
    const marcado = p?.tipo === "orcar"
    const desde = marcado ? p.em : c.ultima_recebida_at
    if (!desde) return
    const { count } = await supabase.from("whatsapp_mensagens").select("id", { count: "exact", head: true })
      .eq("jid", c.jid).eq("from_me", true).in("tipo", ["document", "documentMessage", "documentWithCaptionMessage"]).gt("ts", desde)
    const cli = vinculos[c.jid]
    const noSistema = !!cli && (cards ?? []).some(k => nomeChave(k.nomeCliente) === nomeChave(cli) && !!k.createdAt && new Date(k.createdAt) > new Date(desde))
    const depois = { documento: (count ?? 0) > 0, orcamentoNoSistema: noSistema }
    if (marcado) {
      if (!aguardaOrcamentoMarcado(c, p, depois)) return
      out.push({
        jid: c.jid, nome: c.nome, mensagem: p.nota ? `Você marcou: ${p.nota}` : c.ultima_msg, desde: p.em, retomada: false, lista: "orcar",
        rotulo: ["ICP", "Oportunidade", "Lead médio"].find(e => (c.etiquetas ?? []).includes(e)) ?? "Você marcou",
        dados: dadosDaConversa(c.proxima_acao), cliente: cli || null,
      })
      return
    }
    if (!deveOrcamento(c, depois, p)) return
    out.push({
      jid: c.jid, nome: c.nome, mensagem: c.ultima_msg, desde: c.ultima_recebida_at!, retomada: false, lista: "orcar",
      rotulo: ["ICP", "Oportunidade", "Lead médio"].find(e => (c.etiquetas ?? []).includes(e)) ?? "MQL",
      dados: dadosDaConversa(c.proxima_acao), cliente: cli || null,
    })
  }))
  // O mais antigo primeiro: quem está esperando há mais tempo
  return out.sort((a, b) => a.desde.localeCompare(b.desde))
}

// Meta de orçar todo MQL em 24 h: lê as mensagens dos MQLs novos (no máximo a cada 10 min, o Hoje atualiza a cada
// minuto) e devolve o placar da semana e quem está travado (sem orçamento, fora os que já estão em "Orçamento para fazer")
let cacheMeta: { em: number; chave: string; porJid: Map<string, MsgMeta[]> } | null = null
const CACHE_META_MS = 10 * 60_000

async function metaDoMql(convs: ConvHoje[], passos: Passos, vinculos: Record<string, string>, jaNoOrcar: Set<string>): Promise<Hoje["meta"]> {
  const agora = Date.now()
  const corte = agora - (DIAS_META + 1) * 86_400_000
  const cand = convs.filter(c => qualidadeDoLead(c) === "mql" && c.criado_em && new Date(c.criado_em).getTime() > corte).slice(0, 150)
  const chave = cand.map(c => c.jid).sort().join(",")
  if (!cacheMeta || agora - cacheMeta.em > CACHE_META_MS || cacheMeta.chave !== chave) {
    const porJid = new Map<string, MsgMeta[]>()
    for (let i = 0; i < cand.length; i += 10) {
      await Promise.all(cand.slice(i, i + 10).map(async c => {
        const { data } = await supabase.from("whatsapp_mensagens").select("from_me, tipo, ts, corpo").eq("jid", c.jid).order("ts").limit(300)
        porJid.set(c.jid, (data ?? []) as MsgMeta[])
      }))
    }
    cacheMeta = { em: agora, chave, porJid }
  }
  const { data: cards } = await supabase.from("KanbanCard").select("nomeCliente, createdAt")
  const estados: Parameters<typeof resumirMeta>[0] = []
  const travados: ItemMeta[] = []
  for (const c of cand) {
    const dados = dadosDaConversa(c.proxima_acao)
    const cli = vinculos[c.jid]
    const noSistema = cli ? (cards ?? []).filter(k => k.createdAt && nomeChave(k.nomeCliente) === nomeChave(cli)).map(k => new Date(k.createdAt).toISOString()) : []
    const e = estadoDoMql(cacheMeta.porJid.get(c.jid) ?? [], dados, noSistema, agora)
    if (!e) continue
    if (c.status_lead === "perdido" && e.estado !== "orcado") continue      // não vai rolar: sai da meta
    estados.push(e)
    if (e.estado === "orcado" || jaNoOrcar.has(c.jid) || c.status_lead === "pedido") continue
    const p = passos[c.jid]
    if (p && p.tipo !== "orcar" && new Date(p.ate).getTime() > agora) continue   // você marcou esperando/lembrar
    travados.push({
      jid: c.jid, nome: c.nome, mensagem: c.ultima_msg, desde: e.primeira, retomada: false, lista: "orcar",
      rotulo: ["ICP", "Oportunidade", "Lead médio"].find(x => (c.etiquetas ?? []).includes(x)) ?? "MQL",
      dados, cliente: cli || null, estado: e.estado, falta: e.falta, padraoMl: e.padraoMl, horas: e.horas,
    })
  }
  // Primeiro o que dá para orçar já (tem tudo, depois medida padrão); dentro de cada um, quem chegou antes
  const ordem = { pronto: 0, padrao: 1, falta: 2, orcado: 3 }
  travados.sort((a, b) => ordem[a.estado] - ordem[b.estado] || a.desde.localeCompare(b.desde))
  return { resumo: resumirMeta(estados), travados }
}
