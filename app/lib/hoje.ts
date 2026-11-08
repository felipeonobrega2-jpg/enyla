// Painel → Hoje: o lado do WhatsApp e dos agentes que pede você agora. Bons negócios para responder (quem
// respondeu à retomada primeiro) e para retomar hoje, o que o anúncio trouxe nas últimas 24 h e a ação do relatório.
// Quem falou por último não basta: você marca o próximo passo (esperando o cliente, lembrar em tal dia, fechou,
// não vai rolar) e um "ok"/"👍" do cliente não conta como mensagem nova. Aqui só as regras puras.

import { estaFechada, DIAS_PERDIDO, ehSoConfirmacao } from "./funilWhatsapp"
export { ehSoConfirmacao }
import { qualidadeDoLead } from "./marketing"
import type { Marcos } from "./agenteLeads"
import type { DadosPedido } from "./atendente"
import type { EstadoMql, ResumoMeta } from "./metaMql"

export type ConvHoje = {
  jid: string; nome: string | null; ultima_msg: string | null; ultima_recebida_at: string | null; ultima_enviada_at: string | null
  fechada_em: string | null; status_lead: string | null; etiquetas: string[] | null; campanha: string | null; criado_em: string | null
  proxima_acao?: string | null
}

// O próximo passo que você marcou na conversa
export type ProximoPasso = {
  tipo: "esperando" | "lembrar" | "orcar"   // esperando o cliente (volta em 3 dias) · lembrar em tal dia · orçamento meu (você marcou)
  em: string                      // quando você marcou
  ate: string                     // quando volta para o Hoje se nada acontecer
  nota?: string                   // "vai mandar a arte"
}
export type Passos = Record<string, ProximoPasso>
export const DIAS_ESPERANDO = 3
export const RETOMAR_DE = 3      // você falou por último há 3 dias: volta para retomar
export const RETOMAR_ATE = 10    // depois disso o bom negócio já entra na Reativação
export const RETOMAR_GRANDE = 1  // ICP/Oportunidade (milhares de peças) não pode esfriar 3 dias: volta no dia seguinte
const ehGrande = (c: ConvHoje) => (c.etiquetas ?? []).some(e => e === "ICP" || e === "Oportunidade")

export type ItemHoje = {
  jid: string; nome: string | null; mensagem: string | null; desde: string; rotulo: string; retomada: boolean
  lista: "responder" | "retomar" | "orcar"   // responder: ele escreveu; retomar: lembrete venceu ou você falou por último há 3+ dias; orcar: ele passou tudo e o orçamento está com você
  nota?: string                      // a nota do lembrete
  dados: DadosPedido | null          // o que a IA já tirou da conversa (para o orçamento sair preenchido)
  cliente: string | null             // cliente do cadastro ligado à conversa
}

// MQL da semana ainda sem orçamento: o que trava e há quantas horas ele chegou
export type ItemMeta = ItemHoje & { estado: EstadoMql; falta: string[]; padraoMl: number | null; horas: number }

// Etapa da conversa na última leitura da IA ("orcamento" = o cliente já passou o que precisa para cotar)
export function etapaDaConversa(proximaAcao: string | null | undefined): string | null {
  try { return (JSON.parse(proximaAcao ?? "") as { r?: { etapa?: string } }).r?.etapa ?? null } catch { return null }
}

export const DIAS_ORCAR = 7

// O orçamento está com você: ele passou tudo (etapa "orcamento"), é bom negócio, falou nos últimos 7 dias e, depois
// da última mensagem dele, você não mandou PDF/documento, não criou orçamento no sistema e não marcou próximo passo
export function deveOrcamento(c: ConvHoje, depois: { documento: boolean; orcamentoNoSistema: boolean }, passo: ProximoPasso | undefined, agora = Date.now()) {
  const recebida = c.ultima_recebida_at
  if (!recebida || c.jid.endsWith("@g.us") || ["pedido", "perdido", "descartado"].includes(c.status_lead ?? "")) return false
  if (etapaDaConversa(c.proxima_acao) !== "orcamento" || qualidadeDoLead(c) !== "mql") return false
  if (agora - new Date(recebida).getTime() > DIAS_ORCAR * 86_400_000) return false
  if (passo && passo.em > recebida) return false
  return !depois.documento && !depois.orcamentoNoSistema
}

// Você marcou "esperando meu orçamento": fica em "Orçamento para fazer" até você mandar PDF/documento ou criar o
// orçamento no sistema (depois de marcar), fechar/perder a conversa, ou passar o prazo (14 dias)
export const DIAS_ORCAR_MANUAL = 14
export function aguardaOrcamentoMarcado(c: Pick<ConvHoje, "status_lead">, passo: ProximoPasso | undefined, depois: { documento: boolean; orcamentoNoSistema: boolean }, agora = Date.now()) {
  if (passo?.tipo !== "orcar" || agora > new Date(passo.ate).getTime()) return false
  if (["pedido", "perdido"].includes(c.status_lead ?? "")) return false
  return !depois.documento && !depois.orcamentoNoSistema
}

// Última leitura da IA guardada na conversa
export function dadosDaConversa(proximaAcao: string | null | undefined): DadosPedido | null {
  try { return (JSON.parse(proximaAcao ?? "") as { r?: { dados?: DadosPedido } }).r?.dados ?? null } catch { return null }
}

export type Hoje = {
  responder: ItemHoje[]                         // bons negócios esperando você (o cliente falou por último)
  retomar?: ItemHoje[]                          // bons negócios para retomar hoje (lembrete ou silêncio de 3+ dias)
  orcar?: ItemHoje[]                            // bons negócios que já passaram tudo e esperam o seu orçamento
  outrosEsperando: number                       // demais conversas esperando (não classificadas como bom negócio)
  anuncio: { leads: number; mql: number; semClassificar: number; descartados: number }   // últimas 24 h
  marketing: { dia: string; acao: string; custoMql: number | null } | null
  reativacao: { ligado: boolean; hoje: number; porDia: number; fila: number; orcamentosSemResposta?: number }
  gastos?: { alertas: { tipo: "ia" | "meta"; nivel: "alerta" | "perigo"; texto: string }[]; totalDia: number }   // saldo de IA/anúncios acabando
  meta?: { resumo: ResumoMeta; travados: ItemMeta[] }   // meta de orçar todo MQL em 24 h (7 dias) e quem está travado
  digital?: { ligado: boolean; ativos: number; paraOrcar: number; esperando: number; aguardandoSinal?: number; pagos?: number }   // leads pequenos que você vende em digital (7 dias)
}

// Leads pequenos vendidos em impressão digital (etiqueta Digital), separados dos bons negócios: quantos falaram nos
// últimos 7 dias, quantos já passaram tudo para orçar e quantos escreveram por último
export function doDigital(convs: ConvHoje[], agora = Date.now()) {
  const out = { ativos: 0, paraOrcar: 0, esperando: 0 }
  for (const c of convs) {
    if (!(c.etiquetas ?? []).includes("Digital") || ["pedido", "perdido"].includes(c.status_lead ?? "")) continue
    const recebida = c.ultima_recebida_at
    if (!recebida || agora - new Date(recebida).getTime() > DIAS_ORCAR * 86_400_000) continue
    out.ativos++
    if (etapaDaConversa(c.proxima_acao) === "orcamento") out.paraOrcar++
    else if ((!c.ultima_enviada_at || recebida > c.ultima_enviada_at) && !ehSoConfirmacao(c.ultima_msg)) out.esperando++
  }
  return out
}

const DIAS_RETOMADA = 7

// Qual etiqueta mostra melhor por que é bom negócio
const rotuloDe = (et: string[]) => ["ICP", "Oportunidade", "Lead médio"].find(e => et.includes(e)) ?? "MQL"

// Em qual lista do Hoje a conversa cai (ou em nenhuma)
export function listaDoHoje(c: ConvHoje, passo: ProximoPasso | undefined, agora = Date.now()): { lista: "responder" | "retomar"; desde: string; nota?: string } | null {
  if (c.jid.endsWith("@g.us") || ["pedido", "perdido", "descartado"].includes(c.status_lead ?? "")) return null
  const recebida = c.ultima_recebida_at, enviada = c.ultima_enviada_at
  const dias = (iso: string) => (agora - new Date(iso).getTime()) / 86_400_000
  const eleFalouPorUltimo = !!recebida && (!enviada || recebida > enviada)
  // Ele escreveu algo de verdade (não só "ok") e é a última mensagem
  const escreveu = eleFalouPorUltimo && !ehSoConfirmacao(c.ultima_msg) && dias(recebida!) < DIAS_PERDIDO
  if (passo?.tipo === "orcar") return null   // está em "Orçamento para fazer"
  if (passo) {
    if (escreveu && recebida! > passo.em) return { lista: "responder", desde: recebida! }
    // O dia chegou e você não falou com ele depois disso
    if (agora >= new Date(passo.ate).getTime() && !(enviada && enviada > passo.ate)) return { lista: "retomar", desde: passo.em, nota: passo.nota }
    return null
  }
  if (estaFechada(c) && !(escreveu && c.fechada_em && recebida! > c.fechada_em)) return null
  if (escreveu) return { lista: "responder", desde: recebida! }
  // Você falou por último (ou ele só confirmou) há 3 a 10 dias (1 dia, se é negócio grande): retomar
  const ultima = [enviada, recebida].filter(Boolean).sort().pop()
  if (enviada && ultima && dias(ultima) >= (ehGrande(c) ? RETOMAR_GRANDE : RETOMAR_DE) && dias(ultima) < RETOMAR_ATE) return { lista: "retomar", desde: ultima }
  return null
}

export function quemResponder(convs: ConvHoje[], marcos: Marcos, agora = Date.now(), vinculos: Record<string, string> = {}, passos: Passos = {}): { responder: ItemHoje[]; retomar: ItemHoje[]; outros: number } {
  const respondeu = new Set(Object.entries(marcos).filter(([, m]) => m.passos?.["Respondeu"] && agora - new Date(m.passos["Respondeu"]).getTime() < DIAS_RETOMADA * 86_400_000).map(([j]) => j))
  const responder: ItemHoje[] = [], retomar: ItemHoje[] = []
  let outros = 0
  for (const c of convs) {
    const onde = listaDoHoje(c, passos[c.jid], agora)
    if (!onde) continue
    const retomada = onde.lista === "responder" && respondeu.has(c.jid)
    const q = qualidadeDoLead(c)
    if (!retomada && q !== "mql") { if (q === "aberto" && onde.lista === "responder") outros++; continue }
    ;(onde.lista === "responder" ? responder : retomar).push({
      jid: c.jid, nome: c.nome, mensagem: c.ultima_msg, desde: onde.desde, retomada, lista: onde.lista, ...(onde.nota ? { nota: onde.nota } : {}),
      rotulo: retomada ? "Retomada" : rotuloDe(c.etiquetas ?? []),
      dados: dadosDaConversa(c.proxima_acao), cliente: vinculos[c.jid] || null,
    })
  }
  // Retomada respondida primeiro (é a chance que você foi buscar); depois o mais recente (lead quente fecha mais)
  responder.sort((a, b) => Number(b.retomada) - Number(a.retomada) || b.desde.localeCompare(a.desde))
  // Retomar: lembrete com nota primeiro, depois quem está parado há mais tempo
  retomar.sort((a, b) => Number(!!b.nota) - Number(!!a.nota) || a.desde.localeCompare(b.desde))
  return { responder, retomar, outros }
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
