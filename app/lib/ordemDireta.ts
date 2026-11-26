// Ordem da diretoria a LEAD (nível "lead" em nivelCliente): sai direto pelo agente, sem Aprovo do Felipe.
// Cliente A, B, C ou "indefinido" nunca chega aqui (fica na fila do Aprovo, em ordemComercial).
// O envio é só o do agente: enviar(..., { proativo: true }) de agenteAuto (vez, cota por hora, aquecimento, id do agente).
// Nada de evo() direto e nenhum caminho novo de envio. Só roda no servidor.
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import type { AcaoConversa } from "./diretoriaServidor"
import { travaPromessaDeOrcamento, dentroDoHorario, horarioDeFollowUp } from "./agenteLeads"
import type { Funcionario } from "./rh"

export const MAX_DIRETOS_DIA = 20
export const MOTIVO_FORA_DO_HORARIO = "fora do horário do agente"
export const MOTIVO_PROMETIA_ORCAMENTO = "prometia orçamento sem proposta real"

type Lead = { jid: string; nome: string }
export type Recusa = { recusa: true; status: number; saida: string; motivo: string }
export type Fila = { fila: true; motivo: string; texto?: string }

const diaSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

// Limite diário por diretor: reserva um envio (false = já chegou ao máximo) e devolve se o envio falhar
export async function reservarEnvioDireto(diretor: string): Promise<boolean> {
  const dia = diaSP()
  let passou = false
  await mudarConfig((d: { ordemDiretaDia?: Record<string, { dia: string; n: number }> }) => {
    const atual = d.ordemDiretaDia?.[diretor]
    const n = atual?.dia === dia ? atual.n : 0
    if (n >= MAX_DIRETOS_DIA) return null
    passou = true
    return { ordemDiretaDia: { ...(d.ordemDiretaDia ?? {}), [diretor]: { dia, n: n + 1 } } }
  })
  return passou
}
export async function devolverEnvioDireto(diretor: string, dia = diaSP()): Promise<void> {
  await mudarConfig((d: { ordemDiretaDia?: Record<string, { dia: string; n: number }> }) => {
    const x = d.ordemDiretaDia?.[diretor]
    return x?.dia === dia && x.n > 0 ? { ordemDiretaDia: { ...d.ordemDiretaDia, [diretor]: { dia, n: x.n - 1 } } } : null
  }).catch(() => null)
}

// Antes de gastar IA: agente ligado e no horário, e a conversa é de um lead individual
export async function travasAntesDeRedigir(func: Pick<Funcionario, "id">, lead: Lead): Promise<Recusa | null> {
  const { lerCfg } = await import("./agenteAuto")
  const cfg = await lerCfg()
  if (!cfg.agenteAuto?.ligado || !dentroDoHorario(cfg.agenteAuto.horario) || (func.id === "followup" && !horarioDeFollowUp()))
    return { recusa: true, status: 409, motivo: MOTIVO_FORA_DO_HORARIO, saida: `Nada foi enviado nem criado: ${MOTIVO_FORA_DO_HORARIO}. Tente de novo dentro do horário.` }
  if (lead.jid.endsWith("@g.us")) return { recusa: true, status: 400, motivo: "conversa de grupo", saida: "Conversa de grupo: nada foi enviado." }
  const { data } = await supabase.from("whatsapp_conversas").select("etiquetas, status_lead").eq("jid", lead.jid).maybeSingle()
  const ultimo = (cfg.agenteLog ?? []).find(l => l.jid === lead.jid)
  if (ultimo?.perfil === "nao_lead" || (data?.etiquetas as string[] | null)?.includes("Descartado") || data?.status_lead === "descartado")
    return { recusa: true, status: 400, motivo: "não é lead", saida: "Esse contato não é lead (perfil nao_lead): nada foi enviado." }
  return null
}

// Já com o texto redigido: últimas travas e envio. Devolve a ação "enviado" (direto), a fila ou a recusa.
// aprovoDesligado (chave aprovoObrigatorio=false): o que iria para a fila vira recusa 409 (nada sai, nada fica esperando)
// ou, quando é só falta do Aprovo, sai; o envio e a recusa ficam em aprovoDesligadoLog.
export async function enviarAoLead(a: { diretor: string; func: Pick<Funcionario, "id" | "nome">; lead: Lead; texto: string; novoId: () => string; aprovoDesligado?: boolean; nivel?: string }): Promise<{ acao: AcaoConversa } | Fila | Recusa> {
  const { lerCfg, enviar, voceNaConversa, lerConversa } = await import("./agenteAuto")
  const { ehProspecto } = await import("./prospectorTrava")
  const cfg = await lerCfg()
  // Trava do "segue o orçamento" (#106): sem proposta real o texto vai reescrito para o Aprovo
  const t = travaPromessaDeOrcamento(a.texto, { idsExistentes: (cfg.pedidosDigitais ?? []).map(p => p.id) })
  const barrar = async (status: number, motivo: string, saida: string): Promise<Recusa> => {
    if (a.aprovoDesligado) {
      const { registrarAprovo } = await import("./aprovoDesligado")
      await registrarAprovo({ destino: "recusado", diretor: a.diretor, agente: a.func.nome, cliente: a.lead.nome, jid: a.lead.jid, texto: a.texto, nivel: a.nivel, detalhe: motivo })
    }
    return { recusa: true, status, motivo, saida }
  }
  const aFila = async (motivo: string, texto?: string): Promise<Fila | Recusa> =>
    a.aprovoDesligado ? barrar(409, motivo, `Nada foi enviado nem ficou esperando: ${motivo}.`) : { fila: true, motivo, ...(texto ? { texto } : {}) }
  if (t.reescrita) return aFila(MOTIVO_PROMETIA_ORCAMENTO, t.resposta)
  if (await ehProspecto(a.lead.jid).catch(() => true)) return aFila("gráfica do Prospector: o Felipe decide")
  // O Felipe escreveu há pouco nessa conversa: não entra por cima
  if (await voceNaConversa(a.lead.jid, (cfg.agenteLog ?? []).filter(l => l.jid === a.lead.jid), cfg).catch(() => true)) return aFila("o Felipe escreveu há pouco nessa conversa")
  if (a.aprovoDesligado) {
    // Valor de saldo ao centavo com o a receber do pedido, lido agora (Cobrança, link do Digital e ordens em geral)
    const { conferirValoresAgora } = await import("./aprovoDesligado")
    const v = await conferirValoresAgora(t.resposta, { cliente: a.lead.nome, todosSaoSaldo: /cobran/i.test(`${a.func.id} ${a.func.nome}`) })
    if (!v.ok) return barrar(409, v.motivo, v.saida)
  }
  const conversa = await lerConversa(a.lead.jid)
  if (!conversa) return { recusa: true, status: 404, motivo: "sem conversa", saida: "Conversa não encontrada: nada foi enviado." }

  // Limite de envios diretos por dia e por diretor (reservado antes; devolvido se o envio falhar)
  if (!await reservarEnvioDireto(a.diretor)) return { recusa: true, status: 429, motivo: "limite diário", saida: `Já foram ${MAX_DIRETOS_DIA} envios diretos hoje (máximo por diretor por dia). Nada foi enviado.` }
  const dia = diaSP()

  const r = await enviar(conversa, t.resposta, undefined, { proativo: true }).catch(e => ({ ids: [] as string[], erro: String(e) }))
  if (r.erro) {
    await devolverEnvioDireto(a.diretor, dia)
    const limite = /limite|cota/i.test(r.erro)
    return { recusa: true, status: limite ? 429 : 503, motivo: r.erro, saida: `Não enviou: ${r.erro}. Nada foi para a fila.` }
  }
  const em = new Date().toISOString()
  if (a.aprovoDesligado) {
    const { registrarAprovo, MOTIVO_APROVO_DESLIGADO } = await import("./aprovoDesligado")
    const motivo = a.nivel === "lead" ? "lead_sem_compra" : MOTIVO_APROVO_DESLIGADO   // lead já saía direto antes da chave
    await registrarAprovo({ destino: "enviado_direto", motivo, diretor: a.diretor, agente: a.func.nome, cliente: a.lead.nome, jid: a.lead.jid, texto: t.resposta, nivel: a.nivel, em })
    return { acao: { id: a.novoId(), tipo: "mensagem", funcionario: a.func.nome, cliente: a.lead.nome, jid: a.lead.jid, texto: t.resposta, status: "enviado", em, direto: true, destino: "enviado_direto", motivo, diretor: a.diretor } }
  }
  return { acao: { id: a.novoId(), tipo: "mensagem", funcionario: a.func.nome, cliente: a.lead.nome, jid: a.lead.jid, texto: t.resposta, status: "enviado", em, direto: true } }
}
