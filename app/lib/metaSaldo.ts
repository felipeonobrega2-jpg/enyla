// Crédito dos anúncios na Meta: conta pré-paga para quando acaba o saldo OU quando bate o limite de gasto da conta
// (o que vier primeiro). Regras puras; a consulta e o aviso ficam em metaSaldoServidor.

export type ContaMeta = {
  account_status?: number            // 1 = ativa
  disable_reason?: number
  is_prepay_account?: boolean
  spend_cap?: string                 // centavos; "0" = sem limite
  amount_spent?: string              // centavos
  funding_source_details?: { display_string?: string }
}

// "Saldo disponível (R$276,38 BRL)" → 276.38
export function saldoDoTexto(t: string | null | undefined): number | null {
  const m = (t ?? "").match(/R\$\s?([\d.]+,\d{2}|[\d.]+)/)
  if (!m) return null
  const n = Number(m[1].replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? n : null
}

export type SituacaoMeta = { restante: number | null; saldo: number | null; limiteRestante: number | null; dias: number | null; ativa: boolean }

export function situacaoMeta(c: ContaMeta, gastoMedioDia: number): SituacaoMeta {
  const saldo = c.is_prepay_account === false ? null : saldoDoTexto(c.funding_source_details?.display_string)
  const cap = Number(c.spend_cap ?? 0), gasto = Number(c.amount_spent ?? 0)
  const limiteRestante = cap > 0 ? Math.max(0, cap - gasto) / 100 : null
  const vals = [saldo, limiteRestante].filter((x): x is number => x != null)
  const restante = vals.length ? Math.min(...vals) : null
  return { restante, saldo, limiteRestante, dias: restante != null && gastoMedioDia > 0 ? restante / gastoMedioDia : null, ativa: (c.account_status ?? 1) === 1 }
}

// Avisa quando sobra para menos de 2 dias de anúncio (ou menos de R$ 100), ou a conta não está ativa
export const DIAS_AVISO = 2
export const MINIMO_REAIS = 100
export function precisaAvisar(s: SituacaoMeta): "parada" | "acabando" | null {
  if (!s.ativa) return "parada"
  if (s.restante == null) return null
  if (s.restante <= 0.5) return "parada"
  if (s.restante < MINIMO_REAIS || (s.dias != null && s.dias < DIAS_AVISO)) return "acabando"
  return null
}

export function textoAvisoMeta(s: SituacaoMeta, tipo: "parada" | "acabando") {
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  if (!s.ativa) return "A conta de anúncios não está ativa: os anúncios pararam. Confira no Gerenciador de Anúncios."
  const qual = s.limiteRestante != null && s.saldo != null && s.limiteRestante < s.saldo ? "o limite de gasto da conta" : "o saldo"
  if (tipo === "parada") return `Os anúncios pararam: acabou ${qual}. ${qual === "o saldo" ? "Adicione saldo" : "Aumente o limite de gasto"} no Gerenciador de Anúncios.`
  return `Sobra ${brl(s.restante!)}${s.dias != null ? `, uns ${s.dias < 1 ? "menos de 1 dia" : `${Math.floor(s.dias)} dia${Math.floor(s.dias) > 1 ? "s" : ""}`} de anúncio` : ""} (${qual === "o saldo" ? "saldo" : "limite de gasto da conta"}). ${qual === "o saldo" ? "Adicione saldo" : "Aumente o limite de gasto"} para não parar.`
}
