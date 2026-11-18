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

  // 1b. Ninguém sem resposta: quem escreveu por último há 20+ min. O agente tenta uma vez por mensagem (se a conversa
  //     não for sua, as travas dele seguram); o que sobra vira aviso no seu WhatsApp (cada conversa no máximo a cada 3 h)
  out.esperando = await cuidarDeQuemEspera(cfg, agora).catch(e => String(e))

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

async function cuidarDeQuemEspera(cfg: Cfg & { vigiaTentou?: string[]; esperaAvisada?: Record<string, string>; esperaAvisoEm?: string; agenteAuto?: { horario?: { dias?: number[]; inicio?: string; fim?: string }; avisoNumero?: string } }, agora: Date) {
  const { dentroDoHorario } = await import("./agenteLeads")
  if (cfg.agenteAuto?.horario && !dentroDoHorario(cfg.agenteAuto.horario as never)) return "fora do horário"
  const { quemEspera, tempoEspera } = await import("./esperando")
  const { data } = await supabase.from("whatsapp_conversas").select("jid, nome, etiquetas, status_lead, ultima_msg, ultima_recebida_at, ultima_enviada_at, proxima_acao")
    .not("jid", "like", "%@g.us").gte("ultima_recebida_at", new Date(agora.getTime() - 3 * 86_400_000).toISOString()).limit(800)
  const lista = quemEspera((data ?? []) as never, agora.getTime())
  if (!lista.length) return "ninguém"
  // O agente tenta (até 3 por rodada; uma vez por mensagem)
  const { responderSozinho } = await import("./agenteAuto")
  const tentou = new Set(cfg.vigiaTentou ?? [])
  const novasTentativas: string[] = []
  const respondidas = new Set<string>()
  for (const e of lista) {
    if (novasTentativas.length >= 3) break
    const { data: ult } = await supabase.from("whatsapp_mensagens").select("id, from_me").eq("jid", e.jid).order("criado_em", { ascending: false }).limit(1).maybeSingle()
    if (!ult || ult.from_me || tentou.has(ult.id)) continue
    novasTentativas.push(ult.id)
    await responderSozinho(ult.id, { atrasada: e.minutos >= 60 }).catch(() => null)
    const { data: depois } = await supabase.from("whatsapp_mensagens").select("from_me").eq("jid", e.jid).order("criado_em", { ascending: false }).limit(1).maybeSingle()
    if (depois?.from_me) respondidas.add(e.jid)
  }
  if (novasTentativas.length) await mudarConfig((d: typeof cfg) => ({ vigiaTentou: [...novasTentativas, ...(d.vigiaTentou ?? [])].slice(0, 400) }))
  // O resto é seu: aviso no WhatsApp (no máximo uma mensagem a cada 30 min; cada conversa a cada 3 h)
  const avisadas = cfg.esperaAvisada ?? {}
  const paraAvisar = lista.filter(e => !respondidas.has(e.jid) && (!avisadas[e.jid] || agora.getTime() - new Date(avisadas[e.jid]).getTime() > 3 * 3600_000) && (e.peso >= 2 || e.minutos >= 120))
  if (!paraAvisar.length || (cfg.esperaAvisoEm && agora.getTime() - new Date(cfg.esperaAvisoEm).getTime() < 30 * 60_000)) return { esperando: lista.length, respondidas: respondidas.size }
  const { evo } = await import("./evolution")
  const { seuNumero } = await import("./agenteAuto")
  const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
  if (destino) {
    const linhas = paraAvisar.slice(0, 8).map(e => `• *${e.nome}* (${e.rotulo}) há ${tempoEspera(e.minutos)}: “${e.mensagem}”`)
    const texto = `⏳ *Esperando resposta sua (${paraAvisar.length})*\n${linhas.join("\n")}${paraAvisar.length > 8 ? `\n… e mais ${paraAvisar.length - 8}` : ""}\n\nO agente não pode responder essas (conversa sua, MQL pronto para orçar ou cliente da casa).\n${LINK_SISTEMA}/?aba=painel`
    await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text: texto }) }).catch(() => null)
  }
  const em = agora.toISOString()
  await mudarConfig((d: typeof cfg) => {
    const m = { ...(d.esperaAvisada ?? {}) }
    for (const e of paraAvisar) m[e.jid] = em
    for (const [k, v] of Object.entries(m)) if (agora.getTime() - new Date(v).getTime() > 4 * 86_400_000) delete m[k]
    return { esperaAvisada: m, esperaAvisoEm: em }
  })
  return { esperando: lista.length, respondidas: respondidas.size, avisadas: paraAvisar.length }
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
