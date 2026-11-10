// Meta: orçar todo MQL em até 24 h. Para cada MQL novo da semana (primeira mensagem dele nos últimos 7 dias): já
// recebeu orçamento (PDF, preço no texto ou orçamento no sistema)? Em quanto tempo? Se não, o que trava: falta a
// quantidade, falta a medida (mas dá para orçar com a medida padrão do ml) ou já tem tudo. Só regras puras.

import type { DadosPedido } from "./atendente"
import { padraoDoMl, caberFrasco } from "./digital"

// Produto que não fazemos (a IA aprendeu: cigarro não trabalhamos)
export const PRODUTO_RECUSADO = /cigarr|tabaco|\bmaços?\b|palheiro/i

// De quem é a vez (a IA diz em "momento"; conversa lida antes disso cai na leitura das últimas mensagens dele)
export type Momento = "agora" | "com_ele" | "sem_pressa" | "nao_atende"
const COM_ELE = /\b(vou (conversar|falar|ver|ligar|medir|pensar|analisar|mandar|enviar|passar|chegar|viajar)|te (mando|envio|passo|falo|ligo|retorno)|(amanh[ãa]|depois|mais tarde|segunda|semana que vem) (eu )?(te )?(envio|mando|passo|falo|ligo)|assim que (eu )?(tiver|chegar|estiver)|quando (eu )?(chegar|tiver|voltar)|t[ôo] (em viagem|viajando)|fico de|fico no aguardo de)/i
const SEM_PRESSA = /(mais pra frente|mais para frente|ano que vem|pr[óo]ximo ano|daqui (a |uns |umas )?\d+ ?(semanas|meses)|at[ée] (janeiro|fevereiro|mar[çc]o|abril)|futuramente|s[óo] (pesquisando|cotando|pra ter (uma )?no[çc][ãa]o)|iniciar (esse )?contato|(fazer|precisa fazer|preciso fazer) uns testes|sem pressa|n[ãa]o tenho pressa)/i

export function momentoDoLead(ia: Momento | null | undefined, textoDoLead: string[], dados: DadosPedido | null): Momento {
  if (PRODUTO_RECUSADO.test([dados?.produto, dados?.resumo, ...textoDoLead.slice(-6)].filter(Boolean).join(" "))) return "nao_atende"
  if (ia) return ia
  if (SEM_PRESSA.test(textoDoLead.join(" \n "))) return "sem_pressa"
  // Só o que ele disse por último (as duas últimas se a última não traz número): se mandou a medida depois, volta
  const ult = textoDoLead.at(-1) ?? ""
  if (COM_ELE.test(/\d/.test(ult) ? ult : textoDoLead.slice(-2).join(" \n "))) return "com_ele"
  return "agora"
}

export const META_HORAS = 24
export const DIAS_META = 7

export type MsgMeta = { from_me: boolean; tipo: string | null; ts: string; corpo: string | null }
export type EstadoMql = "orcado" | "pronto" | "padrao" | "falta"

const DOC = /document/i
const PRECO = /R\$\s?\d/

export function medidasDe(d: DadosPedido | null | undefined) {
  const c = d?.caixa_cm
  return !!c && c.altura > 0 && c.frente > 0 && c.lateral > 0
}

// Frasco descrito com medida de verdade ("9,6 com a válvula", "3 x 10 cm"); "50ml quadrado" não é medida
const frascoComMedida = (f: string | null | undefined) => /\d/.test((f ?? "").replace(/\d+(?:[.,]\d+)?\s*ml/gi, " "))

// O que ainda falta para cotar (vazio = tem tudo, ou dá para cotar com a medida padrão do ml)
export function faltaParaOrcar(d: DadosPedido | null | undefined): { falta: string[]; padraoMl: number | null } {
  const falta: string[] = []
  if (!d?.quantidade) falta.push("quantidade")
  let padraoMl: number | null = null
  if (!medidasDe(d) && !frascoComMedida(d?.frasco_cm)) {
    const pad = padraoDoMl(d?.volume_ml)
    if (pad) padraoMl = pad.ml
    else falta.push("medida")
  }
  return { falta, padraoMl }
}

// Dados do pedido com a caixa padrão do ml (o cliente confirma depois): o orçamento já sai preenchido
export function comMedidaPadrao(d: DadosPedido): DadosPedido {
  if (medidasDe(d)) return d
  const pad = padraoDoMl(d.volume_ml)
  if (!pad) return d
  const m = caberFrasco(pad, d.frasco_cm, d.caixa_cm?.altura)
  return { ...d, caixa_cm: { frente: m.l, lateral: m.p, altura: m.a } }
}

// Um MQL: quando chegou (primeira mensagem dele), quando recebeu o orçamento, de quem é a vez e o estado agora.
// null = não é lead novo da janela (já falava antes), ainda não escreveu ou é produto que não fazemos.
export function estadoDoMql(msgs: MsgMeta[], dados: DadosPedido | null, orcamentoNoSistemaEm: string[] = [], agora = Date.now(), ia?: Momento | null) {
  // Mensagem com botões sem texto que o WhatsApp Business dispara sozinho não é sua (nem conta como orçamento)
  const ord = [...msgs].filter(m => !(m.from_me && !m.corpo?.trim() && /interactive|template|buttons|list/i.test(m.tipo ?? ""))).sort((a, b) => a.ts.localeCompare(b.ts))
  const primeira = ord.find(m => !m.from_me)?.ts
  if (!primeira || agora - new Date(primeira).getTime() > DIAS_META * 86_400_000) return null
  const porMsg = ord.find(m => m.from_me && m.ts > primeira && (DOC.test(m.tipo ?? "") || PRECO.test(m.corpo ?? "")))?.ts
  const noSistema = orcamentoNoSistemaEm.filter(t => t > primeira).sort()[0]
  const orcadoEm = [porMsg, noSistema].filter(Boolean).sort()[0] ?? null
  const horas = ((orcadoEm ? new Date(orcadoEm).getTime() : agora) - new Date(primeira).getTime()) / 3_600_000
  if (orcadoEm) return { primeira, orcadoEm, horas, estado: "orcado" as EstadoMql, momento: "agora" as Momento, falta: [] as string[], padraoMl: null }
  const momento = momentoDoLead(ia, ord.filter(m => !m.from_me && m.corpo).map(m => m.corpo!), dados)
  if (momento === "nao_atende") return null
  const { falta, padraoMl } = faltaParaOrcar(dados)
  const estado: EstadoMql = falta.length ? "falta" : padraoMl ? "padrao" : "pronto"
  // Falta dado e a última mensagem é sua: você já pediu, a vez é dele (volta para a lista quando ele responder)
  const vez: Momento = momento === "agora" && estado === "falta" && ord.at(-1)?.from_me ? "com_ele" : momento
  return { primeira, orcadoEm: null, horas, estado, momento: vez, falta, padraoMl }
}

// Placar da meta: conta só o que está (ou esteve) na sua mão. Quem ficou de mandar algo ou decidir (com o cliente)
// e quem não tem pressa ficam de fora do total e do atraso, só aparecem contados.
export type ResumoMeta = { total: number; orcados: number; noPrazo: number; atrasados: number; prontos: number; padrao: number; falta: number; comEle: number; semPressa: number }

export function resumirMeta(estados: { estado: EstadoMql; horas: number; momento?: Momento }[]): ResumoMeta {
  const r: ResumoMeta = { total: 0, orcados: 0, noPrazo: 0, atrasados: 0, prontos: 0, padrao: 0, falta: 0, comEle: 0, semPressa: 0 }
  for (const e of estados) {
    if (e.estado === "orcado") { r.total++; r.orcados++; if (e.horas <= META_HORAS) r.noPrazo++; continue }
    if (e.momento === "com_ele") { r.comEle++; continue }
    if (e.momento === "sem_pressa") { r.semPressa++; continue }
    r.total++
    if (e.horas > META_HORAS) r.atrasados++
    if (e.estado === "pronto") r.prontos++
    else if (e.estado === "padrao") r.padrao++
    else r.falta++
  }
  return r
}

// "falta a medida", "falta a quantidade e a medida", "dá para orçar com a caixa padrão de 100 ml"
export function textoDoTravado(x: { estado: EstadoMql; falta: string[]; padraoMl: number | null }) {
  if (x.estado === "padrao") return `Dá para orçar com a caixa padrão de ${x.padraoMl} ml`
  if (x.estado === "pronto") return "Já tem tudo para orçar"
  const f = x.falta.map(n => (n === "quantidade" ? "a quantidade" : "a medida"))
  return `Falta ${f.join(" e ")}`
}
