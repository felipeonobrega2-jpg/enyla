// Campos de acompanhamento do pedido Digital (#164) e o prazo que o sistema calcula (o link da #162 lê daqui).
// Funções puras: nada é gravado. Prazo padrão em AppConfig `digital.prazoPadraoDiasUteis`, VAZIO por padrão:
// vazio = "a confirmar" para todos. `prazoDigital.ts` não é prazo visível ao cliente.
import { somarDiasUteis } from "./diasUteis"

export const SITUACOES_ARTE = ["sem arte", "enviada", "ajustes pedidos", "aprovada", "prova autorizada"] as const
export type SituacaoArte = typeof SITUACOES_ARTE[number]
export const A_CONFIRMAR = "a confirmar"

type PedidoPrazo = { situacaoArte?: string | null; prazoEntregaEm?: string | null; arteAprovadaEm?: string | null }
export type PrazoCalculado = { data: string | null; texto: string; origem: "gravado" | "calculado" | "a confirmar" }

const ISO = /^\d{4}-\d{2}-\d{2}$/
export const dataValida = (s: string) => ISO.test(s) && new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s
export const arteAprovada = (s?: string | null) => s === "aprovada" || s === "prova autorizada"
const diaDe = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : new Date(s).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

export function prazoDoPedido(p: PedidoPrazo, prazoPadraoDiasUteis?: number | null): PrazoCalculado {
  const aConfirmar: PrazoCalculado = { data: null, texto: A_CONFIRMAR, origem: "a confirmar" }
  if (p.prazoEntregaEm && dataValida(p.prazoEntregaEm)) return { data: p.prazoEntregaEm, texto: p.prazoEntregaEm, origem: "gravado" }   // gravado na mão vale
  if (!arteAprovada(p.situacaoArte)) return aConfirmar
  if (typeof prazoPadraoDiasUteis !== "number" || !Number.isFinite(prazoPadraoDiasUteis) || prazoPadraoDiasUteis <= 0) return aConfirmar
  if (!p.arteAprovadaEm || isNaN(Date.parse(p.arteAprovadaEm))) return aConfirmar
  const data = somarDiasUteis(diaDe(p.arteAprovadaEm), prazoPadraoDiasUteis)
  return { data, texto: data, origem: "calculado" }
}
