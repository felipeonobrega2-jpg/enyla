// Pergunta numerada de quantidade (Versão B da CMO) no primeiro contato do lead novo. Só regras puras:
// o texto, quando vale perguntar, a leitura da resposta (1/2/3, número, "não sei") e a métrica.
// A flag nasce desligada (ausente ou diferente de true = desligada): este código não a liga.

import { numerosDo } from "./classificarLead"
import type { PerfilLead } from "./agenteLeads"
import type { Nivel } from "./nivelCliente"

export const CHAVE_PERGUNTA_VB = "pergunta_quantidade_vb_ativo"
export const perguntaVbAtiva = (cfg: { [CHAVE_PERGUNTA_VB]?: unknown } | null | undefined) => cfg?.[CHAVE_PERGUNTA_VB] === true

export const TEXTO_VB = `Oi! Aqui é da ENYLA, embalagens personalizadas para perfumaria. Para eu te passar a melhor opção, quantas caixinhas você precisa? Responda só com o número:
1 - até 999 caixas
2 - de 1.000 a 4.999
3 - 5 mil ou mais
Se ainda não sabe, me conta para qual produto é que eu te ajudo.`

export type Faixa = 1 | 2 | 3
export const PERFIL_DA_FAIXA: Record<Faixa, PerfilLead> = { 1: "pequeno", 2: "medio", 3: "icp" }

// Só lead novo (nunca comprou): cliente A/B/C e "indefinido" seguem o fluxo de sempre
export const deveFazerPerguntaVb = (p: { flag: boolean; nivel: Nivel }) => p.flag && p.nivel === "lead"

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "")

// Esta mensagem nossa é a pergunta da Versão B? (o WhatsApp pode mexer na formatação: compara sem pontuação/caixa)
export function ehPerguntaVb(corpo: string | null | undefined): boolean {
  const t = norm(corpo ?? "")
  return t.length > 0 && t.startsWith(norm(TEXTO_VB).slice(0, 80))
}

export const faixaDaQuantidade = (n: number): Faixa => (n < 1000 ? 1 : n < 5000 ? 2 : 3)

export type RespostaVb = { tipo: "faixa"; faixa: Faixa; quantidade: number | null } | { tipo: "nao_sei" }

// 1/2/3 → a faixa (sem inventar quantidade); número ("300", "2 mil", "5000") → faixa + quantidade;
// "não sei" → nao_sei; qualquer outra coisa → null (a IA segue o atendimento)
export function interpretarRespostaVb(texto: string | null | undefined): RespostaVb | null {
  const base = (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
  if (!base || base.length > 40) return null
  const limpo = base.replace(/^[\s.,!?:;)(\-–]+|[\s.,!?:;)(\-–]+$/g, "")
  if (/^(ainda )?nao sei( ainda)?$/.test(limpo)) return { tipo: "nao_sei" }
  const op = limpo.match(/^(?:opcao |alternativa |letra )?([123])$/)
  if (op) return { tipo: "faixa", faixa: Number(op[1]) as Faixa, quantidade: null }
  const num = limpo.match(/^(?:uns |umas |cerca de |mais ou menos |aproximadamente )?(\d+(?:[.,]\d+)*(?:\s*(?:mil|k))?)(?:\s*(?:caixas|caixinhas|unidades|un))?$/)
  if (!num) return null
  const n = numerosDo(num[1])[0]
  if (!Number.isFinite(n) || n <= 0) return null
  return { tipo: "faixa", faixa: faixaDaQuantidade(n), quantidade: n }
}

// A primeira resposta do lead depois da nossa pergunta (null se a pergunta não foi feita ou ainda não respondeu)
export function respostaDoLeadAoVb(msgs: { from_me: boolean; corpo: string | null; tipo: string }[]): string | null {
  let i = -1
  msgs.forEach((m, k) => { if (m.from_me && ehPerguntaVb(m.corpo)) i = k })
  if (i < 0) return null
  const r = msgs.slice(i + 1).find(m => !m.from_me && m.tipo === "text" && !!m.corpo?.trim())
  return r?.corpo ?? null
}

// Registro por lead (AppConfig.volumeVB, por jid): faixa nula = perguntado e ainda sem volume ("não sei" fica assim)
export type RegistroVb = { perguntouEm: string; faixa: Faixa | null; quantidade: number | null; respondeuEm?: string; avisouIcp?: boolean }

export const registrarPergunta = (atual: RegistroVb | undefined, em: string): RegistroVb => atual ?? { perguntouEm: em, faixa: null, quantidade: null }

// Aplica a resposta; avisarIcp só na primeira vez que a faixa 3 aparece nesta conversa
export function aplicarResposta(atual: RegistroVb | undefined, r: RespostaVb, em: string): { registro: RegistroVb; avisarIcp: boolean } {
  const base = atual ?? { perguntouEm: em, faixa: null, quantidade: null }
  if (r.tipo === "nao_sei") return { registro: { ...base, respondeuEm: em }, avisarIcp: false }
  const avisarIcp = r.faixa === 3 && !base.avisouIcp
  return { registro: { ...base, faixa: r.faixa, quantidade: r.quantidade, respondeuEm: em, avisouIcp: base.avisouIcp || avisarIcp }, avisarIcp }
}

// Métrica: % dos leads novos perguntados que chegaram com volume informado ("não sei" e sem resposta não contam)
export function taxaVolumeInformadoVb(regs: Pick<RegistroVb, "faixa">[]): { perguntados: number; informaram: number; taxa: number } {
  const informaram = regs.filter(r => r.faixa != null).length
  return { perguntados: regs.length, informaram, taxa: regs.length ? informaram / regs.length : 0 }
}
