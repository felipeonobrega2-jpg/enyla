// Prazo de produção do digital (Felipe, 25/11/2026): a contagem começa SÓ na data da arte aprovada.
// Até o limite (200 caixas): 7 dias úteis (mínimo) a 10 (teto). Acima do limite: 15 dias úteis.
// Os números moram em AppConfig (`digital.prazoPadrao`); sem valor gravado vale este padrão (nada é gravado em produção).
export type PrazoPadraoDigital = { limite: number; min: number; teto: number; acima: number }
export const PRAZO_PADRAO_DIGITAL: PrazoPadraoDigital = { limite: 200, min: 7, teto: 10, acima: 15 }

const inteiro = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : null
/** Lê `digital.prazoPadrao` do AppConfig; campo ausente ou inválido cai no padrão. */
export function prazoPadraoDaConfig(cfg?: { digital?: { prazoPadrao?: Partial<PrazoPadraoDigital> } } | null): PrazoPadraoDigital {
  const c = cfg?.digital?.prazoPadrao ?? {}
  return { limite: inteiro(c.limite) ?? PRAZO_PADRAO_DIGITAL.limite, min: inteiro(c.min) ?? PRAZO_PADRAO_DIGITAL.min,
    teto: inteiro(c.teto) ?? PRAZO_PADRAO_DIGITAL.teto, acima: inteiro(c.acima) ?? PRAZO_PADRAO_DIGITAL.acima }
}

export function prazoDigital(quantidade: number, regra: PrazoPadraoDigital = PRAZO_PADRAO_DIGITAL): { min: number; max: number; texto: string } {
  if (quantidade <= regra.limite) return { min: regra.min, max: regra.teto, texto: `${regra.min} a ${regra.teto} dias úteis` }
  return { min: regra.acima, max: regra.acima, texto: `${regra.acima} dias úteis` }
}
