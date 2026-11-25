// Prazo de entrega do pedido Digital que o cliente vê (link da #162). Função pura: nada é lido nem gravado aqui.
// Regras (Felipe, 25/11/2026):
//  · `prazoEntrega` gravado na mão (porta gravar_digital ou tela) vale mais que o cálculo;
//  · arte não aprovada (situacaoArte fora de "aprovada" e "prova autorizada") → "a confirmar";
//  · aprovada: data da aprovação + dias úteis (teto: 10 até 200 caixas, 15 acima), com feriados de diasUteis.ts;
//  · sem data de aprovação, nunca inventa data.
import { somarDiasUteis } from "./diasUteis"
import { prazoDigital, PRAZO_PADRAO_DIGITAL, type PrazoPadraoDigital } from "./prazoDigital"

export const SITUACOES_ARTE = ["sem arte", "enviada", "ajustes pedidos", "aprovada", "prova autorizada"] as const
export type SituacaoArte = (typeof SITUACOES_ARTE)[number]
export const ehSituacaoArte = (v: unknown): v is SituacaoArte => typeof v === "string" && (SITUACOES_ARTE as readonly string[]).includes(v)
export const ehDataIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + "T12:00:00Z")) && new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v

export type PedidoPrazo = { quantidade?: number; situacaoArte?: string | null; prazoEntrega?: string | null; arteAprovadaEm?: string | null }
export type PrazoVisivel = { data: string | null; texto: "a confirmar" | string; origem: "gravado" | "calculado" | "a_confirmar" }

const AMBAS = ["aprovada", "prova autorizada"]
const diaBrasilia = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(s).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const aConfirmar: PrazoVisivel = { data: null, texto: "a confirmar", origem: "a_confirmar" }

export function prazoVisivel(p: PedidoPrazo, regra: PrazoPadraoDigital = PRAZO_PADRAO_DIGITAL): PrazoVisivel {
  if (p.prazoEntrega && ehDataIso(p.prazoEntrega)) return { data: p.prazoEntrega, texto: `até ${p.prazoEntrega.slice(8, 10)}/${p.prazoEntrega.slice(5, 7)}`, origem: "gravado" }
  if (!p.situacaoArte || !AMBAS.includes(p.situacaoArte)) return aConfirmar
  if (!p.arteAprovadaEm || isNaN(Date.parse(p.arteAprovadaEm)) || !p.quantidade) return aConfirmar
  const data = somarDiasUteis(diaBrasilia(p.arteAprovadaEm), prazoDigital(p.quantidade, regra).max)
  return { data, texto: `até ${data.slice(8, 10)}/${data.slice(5, 7)}`, origem: "calculado" }
}
