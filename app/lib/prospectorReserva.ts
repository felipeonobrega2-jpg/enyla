// Reserva atômica de envio do Prospector (trava de idempotência), compartilhada pelos canais.
// A garantia vem do banco: unique (prospecto_id, canal, campanha) em prospector_reservas_envio. Quem insere primeiro envia;
// qualquer outro (segunda execução do cron ao mesmo tempo, chamada repetida) bate na constraint, é barrado e fica registrado
// em prospector_envios_barrados. Falha ao falar com o banco também barra (falha fechada): na dúvida, não envia.
// A #249 (WhatsApp) usa as mesmas funções: reservarEnvio({ prospectoId, canal: "whatsapp", campanha }) antes de enviar.
import { supabase } from "./supabase"

export type CanalReserva = "whatsapp" | "email"
export type PedidoReserva = { prospectoId: number; canal: CanalReserva; campanha: string }
export type ResultadoReserva = { reservado: true } | { reservado: false; motivo: "duplicado" | "erro"; erro?: string }

const RESERVAS = "prospector_reservas_envio"
const BARRADOS = "prospector_envios_barrados"
const DUPLICADO = "23505"   // unique_violation do Postgres

/** A campanha é o passo do funil; o assunto A/B não entra: versões diferentes da mesma campanha contam como uma só. */
export const campanhaDoPasso = (passo: string) => passo

async function registrarBarrada(p: PedidoReserva, motivo: string) {
  try { await supabase.from(BARRADOS).insert({ prospecto_id: p.prospectoId, canal: p.canal, campanha: p.campanha, motivo }) } catch { /* o registro não pode derrubar o envio */ }
}

/** Reserva o envio. Só quem recebe `reservado: true` pode enviar. */
export async function reservarEnvio(p: PedidoReserva): Promise<ResultadoReserva> {
  try {
    const { error } = await supabase.from(RESERVAS).insert({ prospecto_id: p.prospectoId, canal: p.canal, campanha: p.campanha })
    if (!error) return { reservado: true }
    if ((error as { code?: string }).code === DUPLICADO) { await registrarBarrada(p, "duplicado"); return { reservado: false, motivo: "duplicado" } }
    await registrarBarrada(p, "erro ao reservar"); return { reservado: false, motivo: "erro", erro: error.message }
  } catch (e) {
    await registrarBarrada(p, "erro ao reservar"); return { reservado: false, motivo: "erro", erro: String(e) }
  }
}

/** Libera a reserva quando o envio falhou de vez (nada saiu), para a próxima execução tentar de novo. Reserva sem desfecho fica: conta como enviado. */
export async function liberarReserva(p: PedidoReserva): Promise<void> {
  try { await supabase.from(RESERVAS).delete().eq("prospecto_id", p.prospectoId).eq("canal", p.canal).eq("campanha", p.campanha) } catch { /* fica reservado: nunca reenvia por engano */ }
}
