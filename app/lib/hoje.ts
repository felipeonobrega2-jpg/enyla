// Painel → Hoje: o lado do WhatsApp e dos agentes que pede você agora. Bons negócios esperando resposta (quem
// respondeu à retomada primeiro), o que o anúncio trouxe nas últimas 24 h e a ação do relatório de marketing.
// Aqui só as regras puras; a rota /api/hoje busca e monta.

import { aguardandoResposta } from "./funilWhatsapp"
import { qualidadeDoLead } from "./marketing"
import type { Marcos } from "./agenteLeads"
import type { DadosPedido } from "./atendente"

export type ConvHoje = {
  jid: string; nome: string | null; ultima_msg: string | null; ultima_recebida_at: string | null; ultima_enviada_at: string | null
  fechada_em: string | null; status_lead: string | null; etiquetas: string[] | null; campanha: string | null; criado_em: string | null
  proxima_acao?: string | null
}

export type ItemHoje = {
  jid: string; nome: string | null; mensagem: string | null; desde: string; rotulo: string; retomada: boolean
  dados: DadosPedido | null          // o que a IA já tirou da conversa (para o orçamento sair preenchido)
  cliente: string | null             // cliente do cadastro ligado à conversa
  porque?: string                    // o agente segurou a resposta para você (o motivo)
}

// Última leitura da IA guardada na conversa
export function dadosDaConversa(proximaAcao: string | null | undefined): DadosPedido | null {
  try { return (JSON.parse(proximaAcao ?? "") as { r?: { dados?: DadosPedido } }).r?.dados ?? null } catch { return null }
}

export type Hoje = {
  responder: ItemHoje[]                         // bons negócios e conversas que o agente deixou para você (o cliente falou por último)
  outrosEsperando: number                       // demais conversas esperando (não classificadas como bom negócio)
  anuncio: { leads: number; mql: number; semClassificar: number; descartados: number }   // últimas 24 h
  marketing: { dia: string; acao: string; custoMql: number | null } | null
  reativacao: { ligado: boolean; hoje: number; porDia: number; fila: number }
}

const DIAS_RETOMADA = 7

// Qual etiqueta mostra melhor por que é bom negócio
const rotuloDe = (et: string[]) => ["ICP", "Oportunidade", "Lead médio"].find(e => et.includes(e)) ?? "MQL"

// O agente leu a última mensagem e deixou para você (decisão, desconto, valor fora do filtro, falha ao enviar).
// Não contam: "nada a responder" (não pede nada), "chegou mensagem nova" (ele refaz sozinho), lead pequeno já
// orientado, e "foi para MQL" (o selo de MQL já diz).
const NAO_E_PARA_VOCE = /^nada a responder|^chegou mensagem nova|^lead pequeno já foi orientado|^bom negócio: foi para MQL/
export function seguradoParaVoce(marcos: Marcos, jid: string, recebidaEm: string | null): string | null {
  const s = marcos[jid]?.segurou
  if (!s || !recebidaEm || NAO_E_PARA_VOCE.test(s.motivo)) return null
  return new Date(s.em).getTime() >= new Date(recebidaEm).getTime() - 120_000 ? s.motivo : null
}

export function quemResponder(convs: ConvHoje[], marcos: Marcos, agora = Date.now(), vinculos: Record<string, string> = {}): { responder: ItemHoje[]; outros: number } {
  const respondeu = new Set(Object.entries(marcos).filter(([, m]) => m.passos?.["Respondeu"] && agora - new Date(m.passos["Respondeu"]).getTime() < DIAS_RETOMADA * 86_400_000).map(([j]) => j))
  const esperando = convs.filter(c => aguardandoResposta(c, agora))
  const responder: ItemHoje[] = []
  let outros = 0
  for (const c of esperando) {
    const retomada = respondeu.has(c.jid)
    const porque = seguradoParaVoce(marcos, c.jid, c.ultima_recebida_at)
    const q = qualidadeDoLead(c)
    if (!retomada && !porque && q !== "mql") { if (q === "aberto") outros++; continue }
    responder.push({
      jid: c.jid, nome: c.nome, mensagem: c.ultima_msg, desde: c.ultima_recebida_at!, retomada,
      rotulo: retomada ? "Retomada" : q === "mql" ? rotuloDe(c.etiquetas ?? []) : "Para você",
      dados: dadosDaConversa(c.proxima_acao), cliente: vinculos[c.jid] || null, ...(porque ? { porque } : {}),
    })
  }
  // Retomada respondida primeiro (é a chance que você foi buscar); depois o mais recente (lead quente fecha mais)
  responder.sort((a, b) => Number(b.retomada) - Number(a.retomada) || b.desde.localeCompare(a.desde))
  return { responder, outros }
}

// Leads que chegaram do anúncio nas últimas 24 h e como estão
export function doAnuncio(convs: ConvHoje[], agora = Date.now()) {
  const out = { leads: 0, mql: 0, semClassificar: 0, descartados: 0 }
  for (const c of convs) {
    let o: { canal?: string; entrada?: string } = {}
    try { o = JSON.parse(c.campanha ?? "") } catch { continue }
    const entrada = o.entrada ?? c.criado_em
    if (o.canal !== "anuncio" || !entrada || agora - new Date(entrada).getTime() > 86_400_000) continue
    out.leads++
    const q = qualidadeDoLead(c)
    if (q === "mql") out.mql++
    else if (q === "descartado") out.descartados++
    else if (q === "aberto") out.semClassificar++
  }
  return out
}

// "há 25 min", "há 3 h", "há 2 dias"
export function haQuanto(iso: string, agora = Date.now()) {
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60_000))
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  return `há ${d} ${d === 1 ? "dia" : "dias"}`
}
