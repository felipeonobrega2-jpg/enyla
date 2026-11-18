// Vigia do sistema (chamado pelo servidor a cada 5 min): o que faz a operação não parar sem ninguém perceber.
//  1. Respostas que a IA não conseguiu dar (sem crédito): assim que ela volta, o agente responde, pedindo desculpa.
//  2. Rotina: checagem das 13h e fechamento das 18h no seu WhatsApp (a manhã já vai pelo resumo do marketing).
//  3. WhatsApp desconectado há 5+ min: aviso no celular (pelo ntfy, já que o WhatsApp está fora).
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { notificar, LINK_SISTEMA } from "./notificar"

type Pendente = { msgId: string; jid: string; em: string; segurou?: boolean }
type Cfg = Record<string, unknown> & {
  respostasPendentes?: Pendente[]; rotinaEnviada?: Record<string, string>; whatsappConexao?: { estado?: string; em?: string }
  whatsappForaAvisadoEm?: string; agenteAuto?: { avisoNumero?: string; horario?: { dias?: number[] } }
}
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const lerCfg = async () => ((await supabase.from("AppConfig").select("data").eq("id", 1).single()).data?.data ?? {}) as Cfg

export async function vigiar(agora = new Date()): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  const cfg = await lerCfg()

  // 1. Respostas pendentes (até 5 por vez, as mais antigas primeiro; com mais de 24 h, desiste)
  const fila = (cfg.respostasPendentes ?? []).filter(p => agora.getTime() - new Date(p.em).getTime() < 24 * 3600_000)
  if (fila.length) {
    const { responderSozinho } = await import("./agenteAuto")
    const feitos: string[] = []
    for (const p of fila.slice(0, 5)) {
      const antes = agora.toISOString()
      await responderSozinho(p.msgId, { atrasada: true }).catch(() => null)
      const { data: ult } = await supabase.from("whatsapp_mensagens").select("from_me, criado_em, id").eq("jid", p.jid).order("criado_em", { ascending: false }).limit(1).maybeSingle()
      // Saiu resposta, ou a conversa andou (chegou outra mensagem: o agente responde essa pelo caminho normal)
      if ((ult?.from_me && ult.criado_em > antes) || (ult && ult.id !== p.msgId && !ult.from_me)) feitos.push(p.msgId)
      else break   // a IA ainda não voltou: tenta de novo daqui a 5 min
    }
    await mudarConfig((d: Cfg) => ({ respostasPendentes: (d.respostasPendentes ?? []).filter(p => !feitos.includes(p.msgId) && agora.getTime() - new Date(p.em).getTime() < 24 * 3600_000) }))
    out.pendentes = { fila: fila.length, respondidas: feitos.length }
  }

  // 2. Rotina (dias de trabalho do agente): 13h checagem, 18h fechamento
  const sp = new Date(agora.getTime() - 3 * 3600_000)
  const hora = sp.getUTCHours(), dia = sp.toISOString().slice(0, 10), semana = sp.getUTCDay()
  const dias = cfg.agenteAuto?.horario?.dias ?? [1, 2, 3, 4, 5, 6]
  const slot = hora === 13 ? "13" : hora === 18 ? "18" : null
  if (slot && dias.includes(semana) && !cfg.rotinaEnviada?.[`${dia}-${slot}`]) {
    let marcou = false
    await mudarConfig((d: Cfg) => {
      if (d.rotinaEnviada?.[`${dia}-${slot}`]) return null
      marcou = true
      const r = Object.fromEntries(Object.entries(d.rotinaEnviada ?? {}).filter(([k]) => k >= new Date(agora.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)))
      return { rotinaEnviada: { ...r, [`${dia}-${slot}`]: agora.toISOString() } }
    })
    if (marcou) out.rotina = await mandarRotina(slot, cfg).catch(e => String(e))
  }

  // 3. WhatsApp fora há 5+ min: avisa uma vez por queda
  const con = cfg.whatsappConexao
  if (con?.estado && con.estado !== "open" && con.em && agora.getTime() - new Date(con.em).getTime() > 5 * 60_000
    && (!cfg.whatsappForaAvisadoEm || cfg.whatsappForaAvisadoEm < con.em)) {
    await mudarConfig(() => ({ whatsappForaAvisadoEm: agora.toISOString() }))
    await notificar("WhatsApp da Enyla desconectado", "Os leads não estão recebendo resposta. Abra Configurações → WhatsApp e leia o QR.", { prioridade: "alta", tags: ["rotating_light"], link: `${LINK_SISTEMA}/?aba=config` }).catch(() => null)
    out.whatsapp = "avisado"
  }
  return out
}

// Texto da checagem/fechamento: o "Para resolver agora" e o que o Hoje pede, em poucas linhas
export async function textoDaRotina(slot: "13" | "18"): Promise<string> {
  const { montarHoje } = await import("./hojeServidor")
  const h = await montarHoje()
  const res = h.resolver ?? [], orcar = h.orcar?.length ?? 0, responder = h.responder.length, retomar = h.retomar?.length ?? 0
  const emJogo = res.reduce((t, x) => t + (x.valor ?? 0), 0)
  const topo = res.slice(0, 6).map(x => `• ${x.titulo}${x.valor ? ` (${brl(x.valor)})` : ""}: ${x.detalhe}`)
  const linhas = [
    slot === "13" ? "🕐 *Checagem das 13h*" : "🌙 *Fechamento do dia*",
    res.length ? `*${res.length} para resolver*${emJogo ? ` · ${brl(emJogo)} em jogo` : ""}` : "Nada passou do prazo. 👏",
    ...topo,
    [orcar ? `${orcar} orçamento${orcar > 1 ? "s" : ""} para fazer` : "", responder ? `${responder} para responder` : "", retomar ? `${retomar} para retomar` : ""].filter(Boolean).join(" · "),
    slot === "18" && (orcar || responder || res.length) ? "O que ficar vira a primeira coisa da manhã." : "",
    `${LINK_SISTEMA}/?aba=painel`,
  ]
  return linhas.filter(Boolean).join("\n")
}

async function mandarRotina(slot: "13" | "18", cfg: Cfg) {
  const { evo } = await import("./evolution")
  const { seuNumero } = await import("./agenteAuto")
  const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
  if (!destino) return "sem número"
  const text = await textoDaRotina(slot)
  await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text }) })
  return "enviada"
}
