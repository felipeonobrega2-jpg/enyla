// Monta o "Hoje" (Painel e resumo da manhã no seu WhatsApp): bons negócios esperando você, o que o anúncio trouxe
// em 24 h, a ação do relatório de marketing e a reativação. Só roda no servidor.

import { supabase } from "./supabase"
import { lerCfg } from "./agenteAuto"
import { candidatos, enviadasHoje, CfgReativacao } from "./reativacaoServidor"
import { POR_DIA_PADRAO } from "./reativacao"
import { DIAS_PERDIDO } from "./funilWhatsapp"
import { total, custoPor, Relatorio } from "./marketing"
import { marcosDoRegistro } from "./agenteLeads"
import { quemResponder, doAnuncio, doDigital, deveOrcamento, orcamentosAtrasados, tempoDeEspera, aguardaOrcamentoMarcado, etapaDaConversa, dadosDaConversa, ConvHoje, Hoje, ItemHoje, Passos } from "./hoje"
import { qualidadeDoLead } from "./marketing"
import { nomeChave } from "./negocio"
import { gastosAtuais } from "./gastosServidor"
import { mudarConfig } from "./configAtomica"
import { notificar, LINK_SISTEMA } from "./notificar"
import { dentroDoHorario } from "./agenteLeads"
import { evo } from "./evolution"
import { estadoDoMql, resumirMeta, DIAS_META, MsgMeta, Momento } from "./metaMql"
import { orcadoPeloFelipe } from "./orcadoPeloFelipe"
import { perdidoAtivo, orcadoManualAtivo, type EstadoLead } from "./leadEstado"
import { lerEstadosLead } from "./leadEstadoServidor"
import { lerIdsAgente } from "./registroAgente"
import { ligarConversasAosOrcamentos, paraResolver } from "./resolverServidor"

// O "momento" da última leitura da IA (de quem é a vez); conversa lida antes disso não tem
const momentoDaConversa = (pa: string | null | undefined): Momento | null => { try { return (JSON.parse(pa ?? "") as { r?: { momento?: Momento } }).r?.momento ?? null } catch { return null } }
import type { ItemMeta } from "./hoje"
import type { PerfilCaixa } from "./caixaEntrada"

// O que sabemos de um lead além das regras de sempre: perdido com motivo (manual) e orçado pelo Felipe (detectado nas
// mensagens ou marcado à mão). Lê as mensagens no máximo uma vez por conversa em cada montagem.
type Marca = { orcadoPeloFelipe?: NonNullable<ItemHoje["orcadoPeloFelipe"]>; perdido?: NonNullable<ItemHoje["perdido"]> }
function criarMarcador(convs: ConvHoje[], estados: Map<string, EstadoLead>, idsAgente: Set<string>) {
  const porJid = new Map(convs.map(c => [c.jid, c]))
  const cache = new Map<string, Promise<Marca>>()
  return (jid: string) => {
    let p = cache.get(jid)
    if (!p) {
      p = (async () => {
        const recebida = porJid.get(jid)?.ultima_recebida_at
        const est = estados.get(jid)
        const perdido = perdidoAtivo(est, recebida)
        if (perdido) return { perdido: { motivo: perdido.motivo ?? "", por: perdido.por, em: perdido.em } }
        const manual = orcadoManualAtivo(est, recebida)
        if (manual) return { orcadoPeloFelipe: { em: manual.em, evidencia: manual.motivo ?? "marcado à mão", manual: true } }
        const { data } = await supabase.from("whatsapp_mensagens").select("id, from_me, tipo, ts, corpo").eq("jid", jid).order("ts", { ascending: false }).limit(120)
        const o = orcadoPeloFelipe((data ?? []) as never, idsAgente)
        return o.orcado && o.em ? { orcadoPeloFelipe: { em: o.em, evidencia: o.evidencia } } : {}
      })().catch(() => ({}))
      cache.set(jid, p)
    }
    return p
  }
}
type Marcador = ReturnType<typeof criarMarcador>

// Sai da fila quem foi perdido, ou foi orçado pelo Felipe e o lead não escreveu depois
const saiDaFila = (m: Marca, recebida: string | null | undefined) => !!m.perdido || (!!m.orcadoPeloFelipe && !(recebida && recebida > m.orcadoPeloFelipe.em))

async function descontar(itens: ItemHoje[], marcar: Marcador, recebidaDe: Map<string, string | null>) {
  const out: ItemHoje[] = []
  for (let i = 0; i < itens.length; i += 10) {
    const lote = await Promise.all(itens.slice(i, i + 10).map(async x => ({ x, m: await marcar(x.jid) })))
    for (const { x, m } of lote) if (!saiDaFila(m, recebidaDe.get(x.jid))) out.push({ ...x, ...m })
  }
  return out
}

export async function montarHoje(): Promise<Hoje> {
  const desde = new Date(Date.now() - DIAS_PERDIDO * 86_400_000).toISOString()
  const [cfg, { data, error }] = await Promise.all([
    lerCfg() as Promise<Awaited<ReturnType<typeof lerCfg>> & CfgReativacao & { marketingRelatorios?: Relatorio[]; proximosPassos?: Passos }>,
    supabase.from("whatsapp_conversas")
      .select("jid, nome, ultima_msg, ultima_recebida_at, ultima_enviada_at, fechada_em, status_lead, etiquetas, campanha, criado_em, proxima_acao")
      .not("jid", "like", "%@g.us").gte("ultima_at", desde).order("ultima_at", { ascending: false }).limit(1500),
  ])
  if (error) throw new Error(error.message)
  const todas = (data ?? []) as ConvHoje[]
  const [estados, idsReg] = await Promise.all([lerEstadosLead().catch(() => new Map<string, EstadoLead>()), lerIdsAgente().catch(() => null)])
  const idsAgente = new Set(idsReg ?? (cfg as { agenteIds?: string[] }).agenteIds ?? [])
  const marcar = criarMarcador(todas, estados, idsAgente)
  const recebidaDe = new Map(todas.map(c => [c.jid, c.ultima_recebida_at]))
  // Perdido com motivo e orçado à mão saem de esperando/orçar/meta (voltam sozinhos quando o lead escreve de novo)
  const convs = todas.filter(c => !perdidoAtivo(estados.get(c.jid), c.ultima_recebida_at) && !orcadoManualAtivo(estados.get(c.jid), c.ultima_recebida_at))
  const q = quemResponder(convs, cfg.agenteMarcos ?? marcosDoRegistro(cfg.agenteLog ?? []), Date.now(), cfg.vinculosWhatsapp, cfg.proximosPassos)
  const outros = q.outros
  const responder = await descontar(q.responder, marcar, recebidaDe), retomar = await descontar(q.retomar, marcar, recebidaDe)
  const orcar = await orcamentosParaFazer(convs, cfg.proximosPassos ?? {}, cfg.vinculosWhatsapp ?? {}, marcar)
  const devendo = new Set(orcar.map(x => x.jid))
  const rel = (cfg.marketingRelatorios ?? [])[0]
  const t = rel ? total(rel.dia1) : null
  const auto = cfg.reativacaoAuto ?? { ligado: false, porDia: POR_DIA_PADRAO }
  const fila = await candidatos(cfg).catch(() => [])
  const foraDoMql = new Set([...devendo, ...convs.length < todas.length ? todas.filter(c => !convs.includes(c)).map(c => c.jid) : []])
  const meta = await metaDoMql(todas.filter(c => !perdidoAtivo(estados.get(c.jid), c.ultima_recebida_at)), cfg.proximosPassos ?? {}, cfg.vinculosWhatsapp ?? {}, foraDoMql).catch(() => undefined)
  const gastos = await gastosAtuais().then(g => ({ alertas: g.alertas, totalDia: g.totalDia })).catch(() => undefined)
  // Liga conversa ↔ orçamento (no máximo a cada 10 min) e monta o "Para resolver agora"
  const c2 = cfg as typeof cfg & { ligacoesEm?: string }
  if (!c2.ligacoesEm || Date.now() - new Date(c2.ligacoesEm).getTime() > 10 * 60_000) {
    await mudarConfig(() => ({ ligacoesEm: new Date().toISOString() })).catch(() => null)
    await ligarConversasAosOrcamentos().catch(e => console.error("[ligar]", e))
  }
  const resolver = await paraResolver(cfg as never).catch(e => { console.error("[resolver]", e); return undefined })
  const perfis = await perfisDasConversas(convs, [...orcar, ...responder, ...retomar, ...(meta?.travados ?? []), ...(resolver ?? [])].map(x => x.jid))
  return {
    leadsMarcados: await marcados(todas, marcar), gastos, meta, resolver, perfis, cards: await conversasDosCards(),
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

// Perfil (ICP, Oportunidade, médio, digital) de cada conversa que aparece na caixa; as que estão fora da janela
// de leitura vêm do banco (só as colunas da etapa)
async function perfisDasConversas(convs: ConvHoje[], jids: (string | null | undefined)[]): Promise<Record<string, PerfilCaixa>> {
  const { perfilCaixa } = await import("./caixaEntrada")
  const porJid = new Map(convs.map(c => [c.jid, c]))
  const faltam = [...new Set(jids.filter((j): j is string => !!j && !porJid.has(j)))]
  if (faltam.length) {
    const { data } = await supabase.from("whatsapp_conversas").select("jid, status_lead, etiquetas").in("jid", faltam.slice(0, 300))
    for (const c of data ?? []) porJid.set(c.jid as string, c as ConvHoje)
  }
  const out: Record<string, PerfilCaixa> = {}
  for (const j of new Set(jids)) { const c = j ? porJid.get(j) : undefined; const p = c ? perfilCaixa(c) : undefined; if (j && p) out[j] = p }
  return out
}

// Card do quadro → a conversa ligada a ele (para o orçamento entrar junto da pessoa e na ordem pelo perfil)
async function conversasDosCards(): Promise<Record<string, { jid: string; perfil?: PerfilCaixa }>> {
  const { perfilCaixa } = await import("./caixaEntrada")
  const { data } = await supabase.from("whatsapp_conversas").select("jid, kanban_card_id, status_lead, etiquetas").not("kanban_card_id", "is", null).limit(3000)
  const out: Record<string, { jid: string; perfil?: PerfilCaixa }> = {}
  for (const c of data ?? []) out[c.kanban_card_id as string] = { jid: c.jid as string, perfil: perfilCaixa(c as { status_lead: string | null; etiquetas: string[] | null }) }
  return out
}

// Quem passou tudo para cotar e ainda não recebeu: sem PDF/documento seu e sem orçamento no sistema depois da última dele
async function marcados(convs: ConvHoje[], marcar: Marcador) {
  const out: NonNullable<Hoje["leadsMarcados"]> = []
  const recentes = convs.filter(c => c.ultima_recebida_at && Date.now() - new Date(c.ultima_recebida_at).getTime() < 7 * 86_400_000).slice(0, 80)
  for (let i = 0; i < recentes.length; i += 10) {
    const lote = await Promise.all(recentes.slice(i, i + 10).map(async c => ({ c, m: await marcar(c.jid) })))
    for (const { c, m } of lote) if (m.perdido || m.orcadoPeloFelipe) out.push({ jid: c.jid, nome: c.nome, ...m })
  }
  return out
}

async function orcamentosParaFazer(convs: ConvHoje[], passos: Passos, vinculos: Record<string, string>, marcar?: Marcador): Promise<ItemHoje[]> {
  const marcados = new Set(Object.entries(passos).filter(([, p]) => p.tipo === "orcar").map(([j]) => j))
  const pre = convs.filter(c => marcados.has(c.jid) || (etapaDaConversa(c.proxima_acao) === "orcamento" && qualidadeDoLead(c) === "mql" && (momentoDaConversa(c.proxima_acao) ?? "agora") === "agora" && c.ultima_recebida_at
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
    if (marcar) { const m = await marcar(c.jid); if (saiDaFila(m, c.ultima_recebida_at)) return }   // perdido ou já orçado pelo Felipe: não é mais seu
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
    const e = estadoDoMql(cacheMeta.porJid.get(c.jid) ?? [], dados, noSistema, agora, momentoDaConversa(c.proxima_acao))
    if (!e) continue
    if (c.status_lead === "perdido" && e.estado !== "orcado") continue      // não vai rolar: sai da meta
    // Você marcou esperando/lembrar ("Não é agora"): a vez é dele, sai do total e da lista
    const p = passos[c.jid]
    if (e.estado !== "orcado" && p && p.tipo !== "orcar" && new Date(p.ate).getTime() > agora) e.momento = p.tipo === "lembrar" ? "sem_pressa" : "com_ele"
    estados.push(e)
    if (e.estado === "orcado" || e.momento !== "agora" || jaNoOrcar.has(c.jid) || c.status_lead === "pedido") continue
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

// Orçamento atrasando: confere no máximo a cada 15 min, no seu horário, quem passou tudo e ainda não recebeu o orçamento.
// Avisa no celular (ntfy) e no seu WhatsApp ("Você"), uma vez por espera.
let rodadaOrcar = 0
export async function talvezAvisarOrcamentoAtrasando() {
  if (Date.now() - rodadaOrcar < 15 * 60_000) return
  rodadaOrcar = Date.now()
  const cfg = await lerCfg() as Awaited<ReturnType<typeof lerCfg>> & { proximosPassos?: Passos; orcarAvisado?: Record<string, string> }
  if (!dentroDoHorario(cfg.agenteAuto?.horario)) return
  const desde = new Date(Date.now() - 8 * 86_400_000).toISOString()
  const { data } = await supabase.from("whatsapp_conversas")
    .select("jid, nome, ultima_msg, ultima_recebida_at, ultima_enviada_at, fechada_em, status_lead, etiquetas, campanha, criado_em, proxima_acao")
    .not("jid", "like", "%@g.us").gte("ultima_at", desde).order("ultima_at", { ascending: false }).limit(400)
  const lista = await orcamentosParaFazer((data ?? []) as ConvHoje[], cfg.proximosPassos ?? {}, cfg.vinculosWhatsapp ?? {})
  const atrasados = orcamentosAtrasados(lista, cfg.orcarAvisado ?? {})
  if (!atrasados.length) return
  // Grava antes de avisar: duas execuções ao mesmo tempo não mandam o aviso duas vezes
  const naLista = new Set(lista.map(x => x.jid))
  await mudarConfig((d: Record<string, unknown> & { orcarAvisado?: Record<string, string> }) => ({
    orcarAvisado: { ...Object.fromEntries(Object.entries(d.orcarAvisado ?? {}).filter(([j]) => naLista.has(j))), ...Object.fromEntries(atrasados.map(x => [x.jid, x.desde])) },
  }))
  const linhas = atrasados.slice(0, 5).map(x => `${x.rotulo} · ${x.nome ?? x.cliente ?? "Lead"} · esperando há ${tempoDeEspera(x.horas)}${x.dados?.resumo ? ` · ${x.dados.resumo.slice(0, 80)}` : ""}`)
  if (atrasados.length > 5) linhas.push(`e mais ${atrasados.length - 5}`)
  const titulo = atrasados.length === 1 ? "Orçamento esperando você" : `${atrasados.length} orçamentos esperando você`
  // (aviso solto desligado: vira item "orçar" da caixa de entrada e sai no resumo das 8h, 13h e 18h)
  void titulo; void linhas
}
