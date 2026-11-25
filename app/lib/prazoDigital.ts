// Prazo de produção do Digital (decisão do Felipe, 25/11/2026): conta SÓ a partir da data da arte aprovada.
// Até o limite (200 caixas): mínimo 7 e teto 10 dias úteis. Acima do limite: 15 dias úteis.
// Os números moram em AppConfig (`digital.prazoPadrao`); sem a chave, valem os iniciais abaixo.
import { somarDiasUteis } from "./diasUteis"

export type PrazoPadraoDigital = { limite: number; min: number; max: number; acima: number }
export const PRAZO_PADRAO_DIGITAL: PrazoPadraoDigital = { limite: 200, min: 7, max: 10, acima: 15 }

export const SITUACOES_ARTE = ["sem arte", "enviada", "ajustes pedidos", "aprovada", "prova autorizada"] as const
export type SituacaoArte = (typeof SITUACOES_ARTE)[number]
const ARTE_APROVADA: readonly string[] = ["aprovada", "prova autorizada"]

/** Junta a config gravada (qualquer campo ausente ou inválido) com os valores iniciais. */
export function prazoPadraoDe(cfg?: { digital?: { prazoPadrao?: Partial<PrazoPadraoDigital> | null } } | null): PrazoPadraoDigital {
  const c = cfg?.digital?.prazoPadrao ?? {}
  const n = (v: unknown, padrao: number) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : padrao
  return { limite: n(c.limite, PRAZO_PADRAO_DIGITAL.limite), min: n(c.min, PRAZO_PADRAO_DIGITAL.min), max: n(c.max, PRAZO_PADRAO_DIGITAL.max), acima: n(c.acima, PRAZO_PADRAO_DIGITAL.acima) }
}

// Só devolve o número de dias; a soma com feriados está em diasUteis.ts (somarDiasUteis)
export function prazoDigital(quantidade: number, p: PrazoPadraoDigital = PRAZO_PADRAO_DIGITAL): { min: number; max: number; texto: string } {
  if (quantidade <= p.limite) return { min: p.min, max: p.max, texto: `${p.min} a ${p.max} dias úteis` }
  return { min: p.acima, max: p.acima, texto: `${p.acima} dias úteis` }
}

export type PrazoVisivel = { origem: "a confirmar" | "gravado" | "calculado"; data: string | null; texto: string }
const AConfirmar: PrazoVisivel = { origem: "a confirmar", data: null, texto: "a confirmar" }
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const diaBrasilia = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(s).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

/**
 * Prazo que o cliente vê (link de acompanhamento). Função pura.
 *  1) prazoEntrega gravado (porta ou tela) vale mais que o cálculo;
 *  2) arte não aprovada → "a confirmar";
 *  3) arte aprovada → data da aprovação + o TETO em dias úteis (feriados contam como não úteis), "até dd/mm".
 * Sem data de aprovação não se inventa data.
 */
export function prazoVisivelDigital(
  p: { quantidade: number; situacaoArte?: string | null; prazoEntrega?: string | null; arteAprovadaEm?: string | null },
  cfg?: Parameters<typeof prazoPadraoDe>[0],
): PrazoVisivel {
  if (p.prazoEntrega && /^\d{4}-\d{2}-\d{2}$/.test(p.prazoEntrega)) return { origem: "gravado", data: p.prazoEntrega, texto: `até ${ddmm(p.prazoEntrega)}` }
  const aprovada = ARTE_APROVADA.includes(p.situacaoArte ?? "") || (!p.situacaoArte && !!p.arteAprovadaEm)
  if (!aprovada || !p.arteAprovadaEm) return AConfirmar
  const data = somarDiasUteis(diaBrasilia(p.arteAprovadaEm), prazoDigital(p.quantidade, prazoPadraoDe(cfg)).max)
  return { origem: "calculado", data, texto: `até ${ddmm(data)}` }
}
