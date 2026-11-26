// Eventos da Resend sobre o e-mail do Prospector (email.delivered, bounced, opened, clicked) e o clique no link rastreado.
// Casa pelo id da Resend (ou pelo token do link) guardado em `envio` no histórico do prospecto. NUNCA envia nada.
// Sem dado de prospecto em log: nenhuma mensagem aqui carrega e-mail, nome ou telefone.
import { supabase } from "./supabase"
import { podeTransicionar, type EtapaFunil, type MudancaEtapa } from "./prospector"
import { envioDe, type EnvioHistorico } from "./prospectorEnvio"
import { COLUNAS, gravar, historicoDe, reler, type Linha } from "./prospectorEnvioServidor"

export type Sinal = "entregue" | "bounce" | "abriu" | "clique"
export const EVENTOS_EMAIL: Readonly<Record<string, Sinal>> = {
  "email.delivered": "entregue", "email.bounced": "bounce", "email.opened": "abriu", "email.clicked": "clique",
}
export type EventoEmail = { type?: string; data?: { email_id?: string } }
export type ResultadoEvento = { ok: boolean; status: number; motivo?: string; atualizado?: boolean }

/** Etapas em que abrir/clicar leva a `abriu`. Quem já respondeu, abriu ou cadastrou não volta nem muda de lado. */
const ETAPAS_QUE_ABREM: readonly string[] = ["abordado", "encerrado_sem_resposta"]

/** Pura: devolve o envio com o sinal aplicado, ou null se nada muda (evento repetido). */
export function envioComSinal(e: EnvioHistorico, sinal: Sinal, em: string): EnvioHistorico | null {
  if (sinal === "entregue") return e.entrega ? null : { ...e, entrega: "entregue" }
  if (sinal === "bounce") return e.entrega === "bounce" ? null : { ...e, entrega: "bounce" }
  if (sinal === "abriu") return e.abriuEm ? null : { ...e, abriuEm: em }
  if (e.cliqueEm) return null
  return { ...e, cliqueEm: em, ...(e.abriuEm ? {} : { abriuEm: em }) }
}

/** Grava o sinal no envio que `achar` aponta; em abriu/clique, `abordado` (ou encerrado) vira `abriu`. Opt-out e descartado não mudam. */
export async function aplicarSinal(l0: Linha, achar: (e: EnvioHistorico) => boolean, sinal: Sinal, em: string): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    const atual = i === 0 ? l0 : await reler(l0.id)
    if (!atual || atual.opt_out) return false
    const h = [...historicoDe(atual)]
    const idx = h.findIndex(x => { const e = envioDe(x); return !!e && achar(e) })
    if (idx < 0) return false
    const novo = envioComSinal(envioDe(h[idx])!, sinal, em)
    if (!novo) return false   // já registrado: não grava de novo
    h[idx] = { ...h[idx], envio: { ...(h[idx].envio as object), ...novo } }
    const campos: Record<string, unknown> = { historico_etapas: h }
    if ((sinal === "abriu" || sinal === "clique") && ETAPAS_QUE_ABREM.includes(atual.etapa) && podeTransicionar(atual.etapa as EtapaFunil, "abriu", atual.opt_out)) {
      campos.etapa = "abriu"
      h.push({ etapa: "abriu", em, motivo: sinal === "clique" ? "clicou no link do e-mail" : "abriu o e-mail" } as MudancaEtapa)
    }
    if (await gravar(atual, campos)) return true
  }
  return false
}

export async function processarEventoEmail(evento: EventoEmail, agora: Date = new Date()): Promise<ResultadoEvento> {
  const sinal = evento.type ? EVENTOS_EMAIL[evento.type] : undefined
  if (!sinal) return { ok: true, status: 200, motivo: "evento ignorado" }
  const emailId = evento.data?.email_id
  if (!emailId || typeof emailId !== "string") return { ok: false, status: 400, motivo: "sem email_id" }
  const { data, error } = await supabase.from("prospectos_parceiros").select(COLUNAS).contains("historico_etapas", [{ envio: { resendId: emailId } }]).limit(5)
  if (error) return { ok: false, status: 500, motivo: "erro ao consultar" }   // a Resend tenta de novo
  const linhas = (data ?? []) as Linha[]
  // E-mail que não é do Prospector (proposta, aprovação...) também dispara estes eventos: 200 e segue.
  if (!linhas.length) return { ok: true, status: 200, motivo: "sem envio do Prospector com este id" }
  let atualizado = false
  for (const l of linhas) if (await aplicarSinal(l, e => e.resendId === emailId, sinal, agora.toISOString())) atualizado = true
  return { ok: true, status: 200, atualizado }
}

const TOKEN_VALIDO = /^[A-Za-z0-9_-]{8,64}$/

/** Clique no link rastreado: marca clique (e `abriu`). Token inválido, desconhecido ou erro: não faz nada (o redirect acontece do mesmo jeito). */
export async function registrarCliquePorToken(token: string, agora: Date = new Date()): Promise<boolean> {
  if (!TOKEN_VALIDO.test(token)) return false
  try {
    const { data, error } = await supabase.from("prospectos_parceiros").select(COLUNAS).contains("historico_etapas", [{ envio: { token } }]).limit(5)
    if (error) return false
    let ok = false
    for (const l of (data ?? []) as Linha[]) if (await aplicarSinal(l, e => e.token === token, "clique", agora.toISOString())) ok = true
    return ok
  } catch { return false }
}
