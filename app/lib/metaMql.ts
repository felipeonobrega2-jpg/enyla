// Meta: orçar todo MQL em até 24 h. Para cada MQL novo da semana (primeira mensagem dele nos últimos 7 dias): já
// recebeu orçamento (PDF, preço no texto ou orçamento no sistema)? Em quanto tempo? Se não, o que trava: falta a
// quantidade, falta a medida (mas dá para orçar com a medida padrão do ml) ou já tem tudo. Só regras puras.

import type { DadosPedido } from "./atendente"
import { padraoDoMl, caberFrasco } from "./digital"

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

// Um MQL: quando chegou (primeira mensagem dele), quando recebeu o orçamento e o estado agora.
// null = não é lead novo da janela (já falava antes) ou ainda não escreveu.
export function estadoDoMql(msgs: MsgMeta[], dados: DadosPedido | null, orcamentoNoSistemaEm: string[] = [], agora = Date.now()) {
  const ord = [...msgs].sort((a, b) => a.ts.localeCompare(b.ts))
  const primeira = ord.find(m => !m.from_me)?.ts
  if (!primeira || agora - new Date(primeira).getTime() > DIAS_META * 86_400_000) return null
  const porMsg = ord.find(m => m.from_me && m.ts > primeira && (DOC.test(m.tipo ?? "") || PRECO.test(m.corpo ?? "")))?.ts
  const noSistema = orcamentoNoSistemaEm.filter(t => t > primeira).sort()[0]
  const orcadoEm = [porMsg, noSistema].filter(Boolean).sort()[0] ?? null
  const horas = ((orcadoEm ? new Date(orcadoEm).getTime() : agora) - new Date(primeira).getTime()) / 3_600_000
  if (orcadoEm) return { primeira, orcadoEm, horas, estado: "orcado" as EstadoMql, falta: [] as string[], padraoMl: null }
  const { falta, padraoMl } = faltaParaOrcar(dados)
  const estado: EstadoMql = falta.length ? "falta" : padraoMl ? "padrao" : "pronto"
  return { primeira, orcadoEm: null, horas, estado, falta, padraoMl }
}

export type ResumoMeta = { total: number; orcados: number; noPrazo: number; atrasados: number; prontos: number; padrao: number; falta: number }

export function resumirMeta(estados: { estado: EstadoMql; horas: number }[]): ResumoMeta {
  const r: ResumoMeta = { total: estados.length, orcados: 0, noPrazo: 0, atrasados: 0, prontos: 0, padrao: 0, falta: 0 }
  for (const e of estados) {
    if (e.estado === "orcado") { r.orcados++; if (e.horas <= META_HORAS) r.noPrazo++; continue }
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
