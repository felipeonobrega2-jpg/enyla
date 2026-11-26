// Ordem da diretoria (CCO/CMO) a uma gráfica do Prospector (prospectos_parceiros), pela porta externa.
// Regra do Felipe (26/11/2026, 9h44): gráfica do Prospector NÃO passa pelo Aprovo; sai direto, mesmo sem conversa anterior.
// Continuam valendo: janela das 8h às 20h (seg-sex), lista de exclusão (opt_out ou descartado: 409, nada sai) e espaçamento entre envios.
// Não conta no limite de 20 diretos de lead (ordemDiretaDia); o teto próprio do Prospector é da #238 e não é tocado aqui.
// Cliente A, B, C ou indefinido não chega aqui: segue na fila do Aprovo (ordemComercial).
import { mudarConfig } from "./configAtomica"
import { supabase } from "./supabase"
import { evo } from "./evolution"
import { celularWhatsapp, chaveTelefone, dentroDoHorario } from "./prospectorEnvio"
import type { ProspectoDoJid } from "./prospectorTrava"
import type { AcaoConversa } from "./diretoriaServidor"
import type { Funcionario } from "./rh"

export const ESPACAMENTO_PROSPECTO_MS = 5_000
export const ESPERA_MAXIMA_MS = 20_000
export const MOTIVO_EXCLUIDO = "prospecto na lista de exclusão"
export const MOTIVO_FORA_DA_JANELA = "fora da janela do Prospector (8h às 20h, segunda a sexta)"

export type SaidaProspecto = { saida: string; status?: number; acao?: AcaoConversa; destino?: "enviado_direto"; motivo?: string; nivel?: string }
const dormir = (ms: number) => ms > 0 ? new Promise<void>(r => setTimeout(r, ms)) : Promise.resolve()

export const prospectoExcluido = (p: Pick<ProspectoDoJid, "opt_out" | "etapa">) => p.opt_out || p.etapa === "descartado"

/** Antes de gastar IA: exclusão e janela. Devolve a recusa ou null. */
export function travasDoProspecto(p: ProspectoDoJid, agora: Date = new Date()): SaidaProspecto | null {
  if (prospectoExcluido(p)) return { saida: `Nada foi enviado: ${MOTIVO_EXCLUIDO}.`, status: 409, motivo: MOTIVO_EXCLUIDO, nivel: "lead" }
  if (!dentroDoHorario(agora)) return { saida: `Nada foi enviado nem criado: ${MOTIVO_FORA_DA_JANELA}.`, status: 409, motivo: MOTIVO_FORA_DA_JANELA, nivel: "lead" }
  return null
}

// Reserva a vez de envio: um a cada ESPACAMENTO_PROSPECTO_MS. Devolve quanto esperar, ou null se a fila está longa demais.
async function reservarVez(): Promise<number | null> {
  let espera: number | null = null
  await mudarConfig((d: { prospectorDiretoProx?: number }) => {
    const agora = Date.now()
    const vez = Math.max(agora, d.prospectorDiretoProx ?? 0)
    if (vez - agora > ESPERA_MAXIMA_MS) return null
    espera = vez - agora
    return { prospectorDiretoProx: vez + ESPACAMENTO_PROSPECTO_MS }
  })
  return espera
}

/** Registra no histórico do prospecto, com quem fez. Não usa a chave `envio` (que é da cadência e mexeria nela). */
async function registrar(p: ProspectoDoJid, entrada: Record<string, unknown>, abordar = false): Promise<void> {
  let atual = p
  for (let i = 0; i < 3; i++) {
    const hist = Array.isArray(atual.historico_etapas) ? atual.historico_etapas : []
    const novoEm = new Date().toISOString()
    // Quem recebeu a mensagem foi abordado: encontrado e qualificado andam para abordado (só para frente; as outras etapas ficam)
    const abordou = abordar && (atual.etapa === "encontrado" || atual.etapa === "qualificado")
    const etapa = abordou ? "abordado" : atual.etapa
    const { data } = await supabase.from("prospectos_parceiros").update({ ...(abordou ? { etapa } : {}), historico_etapas: [...hist, { etapa, em: novoEm, ...entrada }], atualizado_em: novoEm })
      .eq("id", atual.id).eq("atualizado_em", atual.atualizado_em).select("id")
    if (Array.isArray(data) && data.length) return
    const { data: l } = await supabase.from("prospectos_parceiros").select("id, razao_social, nome_fantasia, telefone, etapa, opt_out, historico_etapas, atualizado_em").eq("id", p.id).maybeSingle()
    if (!l) return
    atual = l as ProspectoDoJid
  }
}

/** Com o texto já redigido: reserva a vez, confere de novo a exclusão, envia pela Evolution e registra no histórico. */
export async function enviarAoProspecto(a: { diretor: string; func: Pick<Funcionario, "nome">; prospecto: ProspectoDoJid; jid: string; texto: string; novoId: () => string; agora?: Date }): Promise<SaidaProspecto> {
  const trava = travasDoProspecto(a.prospecto, a.agora)
  if (trava) return trava
  const numero = celularWhatsapp(a.prospecto.telefone) ?? (/^\d{10,13}$/.test(a.jid.split("@")[0]) && a.jid.endsWith("@s.whatsapp.net") ? a.jid.split("@")[0] : null)
  if (!numero || chaveTelefone(numero).length < 10) return { saida: "Prospecto sem número de WhatsApp válido: nada foi enviado.", status: 400, motivo: "sem número", nivel: "lead" }
  const espera = await reservarVez()
  if (espera == null) return { saida: "Muitos envios seguidos ao Prospector: espere alguns segundos. Nada foi enviado.", status: 429, motivo: "espaçamento", nivel: "lead" }
  await dormir(espera)
  const r = await evo<{ key?: { id?: string } }>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: numero, text: a.texto }) })
  if (!r.ok || !r.corpo?.key?.id) return { saida: `Não enviou (WhatsApp ${r.status}). Nada foi para a fila.`, status: 503, motivo: `WhatsApp não enviou (${r.status})`, nivel: "lead" }
  const em = new Date().toISOString()
  await registrar(a.prospecto, { motivo: `mensagem enviada por ${a.diretor.toUpperCase()} (${a.func.nome}, ordem pela porta externa)`, mensagem: { direcao: "enviada", canal: "whatsapp", por: a.diretor, funcionario: a.func.nome, texto: a.texto, em } }, true).catch(() => null)
  const nome = a.prospecto.nome_fantasia || a.prospecto.razao_social || a.jid
  return {
    acao: { id: a.novoId(), tipo: "mensagem", funcionario: a.func.nome, cliente: nome, jid: a.jid, texto: a.texto, status: "enviado", em, direto: true },
    saida: `${a.func.nome} enviou direto à gráfica do Prospector (sem Aprovo): "${a.texto}"`, destino: "enviado_direto", motivo: `gráfica do Prospector: enviado pelo ${a.func.nome}`, nivel: "lead",
  }
}
