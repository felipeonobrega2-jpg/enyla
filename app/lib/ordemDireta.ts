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
export const MOTIVO_CONVERSA_DO_FELIPE = "conversa do Felipe: espera o Aprovo"
export const MOTIVO_PROMETIA_ORCAMENTO = "prometia orçamento sem proposta real"

type Lead = { jid: string; nome: string }
export type Recusa = { recusa: true; status: number; saida: string; motivo: string }
export type Fila = { fila: true; motivo: string; texto?: string }

const diaSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

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
export async function enviarAoLead(a: { diretor: string; func: Pick<Funcionario, "id" | "nome">; lead: Lead; texto: string; novoId: () => string }): Promise<{ acao: AcaoConversa } | Fila | Recusa> {
  const { lerCfg, enviar, lerConversa } = await import("./agenteAuto")
  const { ehProspecto } = await import("./prospectorTrava")
  const cfg = await lerCfg()
  // Trava do "segue o orçamento" (#106): sem proposta real o texto vai reescrito para o Aprovo
  const t = travaPromessaDeOrcamento(a.texto, { idsExistentes: (cfg.pedidosDigitais ?? []).map(p => p.id) })
  if (t.reescrita) return { fila: true, motivo: MOTIVO_PROMETIA_ORCAMENTO, texto: t.resposta }
  if (await ehProspecto(a.lead.jid).catch(() => true)) return { fila: true, motivo: "gráfica do Prospector: o Felipe decide" }
  // Conversa do Felipe (escreveu em 24 h, foi o último a falar ou estrela): ordem direta não entra, espera o Aprovo
  const { lerConversaDoFelipe } = await import("./conversaDoFelipe")
  if ((await lerConversaDoFelipe(a.lead.jid, cfg).catch(() => ({ doFelipe: true }))).doFelipe) return { fila: true, motivo: MOTIVO_CONVERSA_DO_FELIPE }
  const conversa = await lerConversa(a.lead.jid)
  if (!conversa) return { recusa: true, status: 404, motivo: "sem conversa", saida: "Conversa não encontrada: nada foi enviado." }

  // Limite de envios diretos por dia e por diretor (reservado antes; devolvido se o envio falhar)
  const dia = diaSP()
  let passou = false
  await mudarConfig((d: { ordemDiretaDia?: Record<string, { dia: string; n: number }> }) => {
    const atual = d.ordemDiretaDia?.[a.diretor]
    const n = atual?.dia === dia ? atual.n : 0
    if (n >= MAX_DIRETOS_DIA) return null
    passou = true
    return { ordemDiretaDia: { ...(d.ordemDiretaDia ?? {}), [a.diretor]: { dia, n: n + 1 } } }
  })
  if (!passou) return { recusa: true, status: 429, motivo: "limite diário", saida: `Já foram ${MAX_DIRETOS_DIA} envios diretos hoje (máximo por diretor por dia). Nada foi enviado.` }

  const r = await enviar(conversa, t.resposta, undefined, { proativo: true }).catch(e => ({ ids: [] as string[], erro: String(e) }))
  if (r.erro) {
    await mudarConfig((d: { ordemDiretaDia?: Record<string, { dia: string; n: number }> }) => {
      const x = d.ordemDiretaDia?.[a.diretor]
      return x?.dia === dia && x.n > 0 ? { ordemDiretaDia: { ...d.ordemDiretaDia, [a.diretor]: { dia, n: x.n - 1 } } } : null
    }).catch(() => null)
    const limite = /limite|cota/i.test(r.erro)
    return { recusa: true, status: limite ? 429 : 503, motivo: r.erro, saida: `Não enviou: ${r.erro}. Nada foi para a fila.` }
  }
  return { acao: { id: a.novoId(), tipo: "mensagem", funcionario: a.func.nome, cliente: a.lead.nome, jid: a.lead.jid, texto: t.resposta, status: "enviado", em: new Date().toISOString(), direto: true } }
}
