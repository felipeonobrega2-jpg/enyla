// Ação lead da porta externa (só CCO e COO): perdido (com motivo), orçado (à mão, quando a detecção falha) e reabrir.
// Grava em dados_sistema (leadEstado), sem apagar nada. Não envia mensagem a ninguém.
import { lerCampos } from "./configAtomica"
import { nomeChave } from "./negocio"
import { aplicarOperacao, type TipoLead } from "./leadEstado"
import { lerEstadoLead, gravarEstadoLead } from "./leadEstadoServidor"

export type Pedido = Record<string, unknown>
export type ResultadoLead = { ok: true; resultado: string; jid: string } | { ok: false; status: 400 | 403 | 404; erro: string }

const OPERACOES: TipoLead[] = ["perdido", "orcado", "reabrir"]
export const DIRETORES_DO_LEAD = ["cco", "coo"]

export async function leadExterno(b: Pedido, diretor: string): Promise<ResultadoLead> {
  if (!DIRETORES_DO_LEAD.includes(diretor)) return { ok: false, status: 403, erro: "lead é só para as chaves do CCO e do COO." }
  const op = b.operacao as TipoLead
  if (!OPERACOES.includes(op)) return { ok: false, status: 400, erro: "operacao: perdido, orcado ou reabrir." }
  const motivo = typeof b.motivo === "string" ? b.motivo.trim() : ""
  if (op === "perdido" && !motivo) return { ok: false, status: 400, erro: "perdido exige motivo." }

  let jid = typeof b.jid === "string" ? b.jid.trim() : ""
  if (!jid) {
    const cliente = typeof b.cliente === "string" ? b.cliente.trim() : ""
    if (!cliente) return { ok: false, status: 400, erro: "mande jid ou cliente." }
    const { vinculosWhatsapp } = await lerCampos<{ vinculosWhatsapp?: Record<string, string> }>(["vinculosWhatsapp"])
    jid = Object.entries(vinculosWhatsapp ?? {}).find(([, nome]) => nomeChave(nome) === nomeChave(cliente))?.[0] ?? ""
    if (!jid) return { ok: false, status: 404, erro: "Cliente sem conversa ligada; mande o jid." }
  }
  const r = aplicarOperacao(await lerEstadoLead(jid), jid, op, diretor, motivo)
  if (!r.ok) return { ok: false, status: 400, erro: r.erro }
  await gravarEstadoLead(r.estado)
  const texto = op === "perdido" ? `Lead ${jid} marcado como perdido: ${motivo}` : op === "orcado" ? `Lead ${jid} marcado como orçado${motivo ? ` (${motivo})` : ""}` : `Lead ${jid} reaberto`
  return { ok: true, resultado: texto, jid }
}
