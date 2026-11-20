// Etapa do lead num lugar só. A ETAPA (onde ele está agora) mora no status_lead; a etiqueta "MQL" e a "Descartado"
// são só o reflexo dela no WhatsApp. O PERFIL (ICP, Oportunidade, Lead médio, Lead pequeno) é o quanto ele vale e
// fica como histórico (o marketing conta por ele). Follow-up (F1/F2/F3, Sem resposta, Reativação) é à parte.
// Puro: deriva a etapa e deixa as etiquetas coerentes com ela.

export type EtapaLead = "pedido" | "perdido" | "descartado" | "fornecedor" | "bom" | "digital" | "pequeno" | "novo"
export const PERFIS_BONS = ["ICP", "Oportunidade", "Lead médio"] as const
const REFLEXO: Record<string, string> = { mql: "MQL", descartado: "Descartado" }   // status → etiqueta que o espelha

type Conv = { status_lead?: string | null; etiquetas?: string[] | null }

export function etapaDoLead(c: Conv): EtapaLead {
  const e = c.etiquetas ?? []
  const s = c.status_lead ?? null
  if (s === "pedido") return "pedido"
  if (s === "perdido") return "perdido"
  if (s === "descartado") return "descartado"
  if (e.includes("Fornecedora")) return "fornecedor"
  // Status MQL antigo com a classificação atual de pequeno/digital: vale a classificação atual
  const pequenoAgora = e.includes("Lead pequeno") || e.includes("Digital")
  if (s === "mql" && !pequenoAgora) return "bom"
  if (!s && e.some(x => (PERFIS_BONS as readonly string[]).includes(x)) && !pequenoAgora) return "bom"
  if (e.includes("Digital")) return "digital"
  if (e.includes("Lead pequeno")) return "pequeno"
  return "novo"
}
export const ehBomNegocio = (c: Conv) => etapaDoLead(c) === "bom"
// Perfil (o quanto vale), independente da etapa
export const perfilDoLead = (c: Conv): "icp" | "oportunidade" | "medio" | "pequeno" | null => {
  const e = c.etiquetas ?? []
  return e.includes("ICP") ? "icp" : e.includes("Oportunidade") ? "oportunidade" : e.includes("Lead médio") ? "medio" : e.includes("Lead pequeno") ? "pequeno" : null
}

// Etiquetas coerentes com o status: a de reflexo existe se, e só se, o status é aquele
export function etiquetasCoerentes(status: string | null | undefined, etiquetas: string[] | null | undefined): string[] {
  const deveTer = status ? REFLEXO[status] : undefined
  const semReflexo = (etiquetas ?? []).filter(e => !Object.values(REFLEXO).includes(e) || e === deveTer)
  return deveTer && !semReflexo.includes(deveTer) ? [...semReflexo, deveTer] : semReflexo
}
export const coerente = (c: Conv) => {
  const atual = c.etiquetas ?? [], certa = etiquetasCoerentes(c.status_lead, atual)
  return atual.length === certa.length && atual.every(e => certa.includes(e))
}
