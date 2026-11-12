// Campanha digital: leads pequenos (ou descartados) que chegaram antes do digital, ou nunca receberam a oferta dele,
// recebem UMA mensagem: com quantidade e tamanho conhecidos, o orçamento pronto com o link; sem, a pergunta do que
// falta. Quem responde é atendido pelo agente do digital até o pagamento. Poucos por dia, um de cada vez, em horário
// comercial (o número já caiu por volume). Aqui só as regras puras; o servidor busca, envia e conta.

import type { DadosPedido } from "./atendente"
import { brl } from "../utils"
import { cotarDigital } from "./digital"

export const POR_DIA_PADRAO = 10
export const MINUTOS_ENTRE = [20, 40] as const        // um de cada vez, intervalo variando
export const DIAS_PARADO_MIN = 3                       // conversou nos últimos 3 dias: não entra (está ativo)
export const DIAS_MAX = 180                            // mais de ~6 meses parado: frio demais
export const DIAS_RESPOSTA = 15                        // respondeu em até 15 dias: o agente atende como conversa nova
export const HORA_INICIO = 9, HORA_FIM = 19            // horário comercial (São Paulo), seg a sáb

export type EstadoCampanha = {
  ligada?: boolean
  porDia?: number
  enviados?: Record<string, { em: string; tipo: "orcamento" | "pergunta"; pedido?: string }>
  pulados?: string[]
  proximaEm?: string                                   // não envia antes disso (intervalo entre envios)
}

export type ConvCampanha = {
  jid: string; nome: string | null; etiquetas: string[] | null; status_lead: string | null; ultima_at: string | null
  dados: DadosPedido | null                            // o que a IA já tirou da conversa
}

export type Candidato = ConvCampanha & { prioridade: number; motivo: string; cotavel: boolean }

const ETIQUETAS_PEQUENO = /pequeno|descart/i
const FORA = /fornecedor|cliente/i

// Entra na campanha? (o servidor já tirou quem tem pedido digital, quem é cliente e quem já recebeu)
export function candidato(c: ConvCampanha, perfilDoLog: string | null, agora = Date.now()): Candidato | null {
  const etq = c.etiquetas ?? []
  const pequeno = etq.some(e => ETIQUETAS_PEQUENO.test(e)) || perfilDoLog === "pequeno"
  if (!pequeno || etq.some(e => FORA.test(e)) || c.status_lead === "mql") return null
  if (/@g\.us$|@broadcast|@newsletter/.test(c.jid)) return null
  const dias = c.ultima_at ? (agora - new Date(c.ultima_at).getTime()) / 86_400_000 : null
  if (dias == null || dias < DIAS_PARADO_MIN || dias > DIAS_MAX) return null
  const q = c.dados?.quantidade ?? null
  if (q != null && q >= 1000) return null               // volume de offset não é campanha digital
  // Orçamento pronto só quando a cotação aceita de verdade (200 ml sem medida, por exemplo, não tem caixa padrão)
  const cotavel = !!q && !!c.dados && cotarDigital(c.dados).ok
  // Mais perto do dinheiro primeiro: orçamento pronto, depois quantidade conhecida; dentro disso, os mais recentes
  const prioridade = (cotavel ? 2000 : q ? 1000 : 0) + Math.max(0, DIAS_MAX - Math.round(dias))
  const motivo = cotavel ? `${q!.toLocaleString("pt-BR")} un${c.dados?.volume_ml ? ` · ${c.dados.volume_ml} ml` : ""}: vai o orçamento pronto`
    : q ? `${q.toLocaleString("pt-BR")} un${c.dados?.volume_ml ? ` · ${c.dados.volume_ml} ml` : ""}, falta a medida` : "sem quantidade: pergunta"
  return { ...c, prioridade, motivo, cotavel }
}

export const ordenar = (xs: Candidato[]) => [...xs].sort((a, b) => b.prioridade - a.prioridade)

// Nome só quando parece nome de gente: começa com maiúscula, 3+ letras, tem vogal ("umds", "Eu", "." ficam sem nome)
export const primeiroNome = (n: string | null) => {
  const x = (n ?? "").trim().split(/\s+/)[0] ?? ""
  return /^[A-ZÀ-Ý][a-zà-ÿ]{2,}$/.test(x) && /[aeiouáéíóúâêôãõ]/i.test(x) ? x : ""
}
const oQue = (d: DadosPedido | null) => d?.volume_ml ? ` para frasco de ${d.volume_ml} ml` : d?.produto ? ` para ${d.produto}` : ""

export function textoComOrcamento(nome: string | null, d: DadosPedido, p: { quantidade: number; total: number; padrao: boolean }, link: string) {
  const n = primeiroNome(nome)
  const pediu = d.quantidade && d.quantidade !== p.quantidade ? ` (pela nossa tabela, até ${p.quantidade.toLocaleString("pt-BR")} sai pelo mesmo valor)` : ""
  return [
    `Oi${n ? `, ${n}` : ""}! Você tinha me perguntado sobre ${d.quantidade?.toLocaleString("pt-BR")} caixinhas${oQue(d)}. Na época a gente só fazia a partir de 1.000, mas agora tem impressão digital, a partir de 20 unidades e com a *arte inclusa*.`,
    `Já montei o seu orçamento: *${p.quantidade.toLocaleString("pt-BR")} caixinhas por ${brl(p.total)}*${pediu}. Veja a caixa e escolha a quantidade aqui:\n${link}`,
    p.padrao ? `Usei a medida padrão para o seu frasco; se for diferente, me manda a altura e a largura que eu ajusto.` : null,
  ].filter(Boolean).join("\n\n")
}

export function textoPergunta(nome: string | null, d: DadosPedido | null) {
  const n = primeiroNome(nome)
  const falta = d?.quantidade ? "Qual o tamanho: o ml do frasco, ou a altura e a largura do produto?" : "Quantas você precisa e qual o tamanho (o ml do frasco, ou a altura e a largura do produto)?"
  return `Oi${n ? `, ${n}` : ""}! Você tinha me perguntado sobre caixinhas personalizadas${oQue(d)}. Na época o mínimo era 1.000, mas agora fazemos em impressão digital a partir de 20 unidades, com a *arte inclusa*.\n\n${falta} Te mando o valor na hora.`
}

// Hora de mandar a próxima? (horário comercial em SP, seg a sáb, intervalo e limite do dia)
export function podeEnviar(e: EstadoCampanha, agora = new Date()): { ok: true } | { ok: false; motivo: string } {
  if (!e.ligada) return { ok: false, motivo: "desligada" }
  const sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  if (sp.getDay() === 0) return { ok: false, motivo: "domingo" }
  if (sp.getHours() < HORA_INICIO || sp.getHours() >= HORA_FIM) return { ok: false, motivo: "fora do horário comercial" }
  if (e.proximaEm && agora.getTime() < new Date(e.proximaEm).getTime()) return { ok: false, motivo: "esperando o intervalo" }
  if (enviadosHoje(e, agora) >= (e.porDia ?? POR_DIA_PADRAO)) return { ok: false, motivo: "limite do dia" }
  return { ok: true }
}

export function enviadosHoje(e: EstadoCampanha, agora = new Date()) {
  const dia = agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
  return Object.values(e.enviados ?? {}).filter(x => new Date(x.em).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) === dia).length
}

export const proximoIntervalo = (agora = Date.now(), r = Math.random()) =>
  new Date(agora + (MINUTOS_ENTRE[0] + r * (MINUTOS_ENTRE[1] - MINUTOS_ENTRE[0])) * 60_000).toISOString()

// Respondeu à campanha há pouco: o agente atende como conversa nova (o digital é todo dele)
export const emCampanha = (e: EstadoCampanha | undefined, jid: string, agora = Date.now()) => {
  const x = e?.enviados?.[jid]
  return !!x && agora - new Date(x.em).getTime() < DIAS_RESPOSTA * 86_400_000
}
