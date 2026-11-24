// Estado manual do lead (perdido com motivo, orçado à mão), uma linha por conversa em dados_sistema (coleção
// "leadEstado"). Nada é apagado: cada mudança vai para o histórico. Regras puras; o servidor lê e grava.

export type TipoLead = "perdido" | "orcado" | "reabrir"
export type EventoLead = { tipo: TipoLead; em: string; por: string; motivo?: string }
export type EstadoLead = { jid: string; atual: EventoLead | null; historico: EventoLead[] }

export const COLECAO_LEAD = "leadEstado"
export const vazio = (jid: string): EstadoLead => ({ jid, atual: null, historico: [] })

// Aplica uma operação sem apagar nada. perdido exige motivo.
export function aplicarOperacao(e: EstadoLead | null, jid: string, tipo: TipoLead, por: string, motivo: string | undefined, em = new Date().toISOString()): { ok: true; estado: EstadoLead } | { ok: false; erro: string } {
  const m = motivo?.trim().slice(0, 300)
  if (tipo === "perdido" && !m) return { ok: false, erro: "perdido exige motivo (ex.: fechou com outra a R$ 0,98)." }
  const ev: EventoLead = { tipo, em, por, ...(m ? { motivo: m } : {}) }
  const base = e ?? vazio(jid)
  return { ok: true, estado: { jid, atual: tipo === "reabrir" ? null : ev, historico: [...base.historico, ev].slice(-50) } }
}

// O estado só vale até o lead escrever de novo (o motivo fica no histórico)
const vale = (ev: EventoLead | null | undefined, tipo: TipoLead, ultimaRecebida: string | null | undefined) =>
  ev?.tipo === tipo && !(ultimaRecebida && ultimaRecebida > ev.em) ? ev : null

export const perdidoAtivo = (e: EstadoLead | null | undefined, ultimaRecebida: string | null | undefined) => vale(e?.atual, "perdido", ultimaRecebida)
export const orcadoManualAtivo = (e: EstadoLead | null | undefined, ultimaRecebida: string | null | undefined) => vale(e?.atual, "orcado", ultimaRecebida)

// Fora das filas de orçar e de esperando (perdido ou orçado à mão) e fora do Atendente (só perdido)
export const foraDasFilas = (e: EstadoLead | null | undefined, ultimaRecebida: string | null | undefined) =>
  !!perdidoAtivo(e, ultimaRecebida) || !!orcadoManualAtivo(e, ultimaRecebida)
